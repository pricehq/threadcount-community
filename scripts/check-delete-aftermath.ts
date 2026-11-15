/* What happens after a mutation that deleted the whole facility (me.deleteAccount, last admin).
 *
 *   DATABASE_URL=postgresql://…@127.0.0.1:5432/scratch npx tsx scripts/check-delete-aftermath.ts
 *
 * ⛔ Creates and deletes rows, so it refuses anything but a database on this machine and refuses
 * NODE_ENV=production. Run `npx prisma migrate deploy` on that database first.
 *
 * The mutate route writes the audit trail and bumps the facility's change number after every op.
 * When the op has just deleted the facility, both writes point at a row that no longer exists, and
 * production logged a Prisma P2025 plus an AuditEvent foreign-key violation on every deletion (the
 * nightly journey check deletes one every night). Neither write can mean anything once the facility
 * is gone — its audit trail went with it in the cascade — so neither should be attempted.
 *
 *   1  a facility deletion: no "[rev] could not bump" and no "[audit] could not record", rev = null
 *   2  an ordinary op on a live facility still writes one audit row and bumps rev by one
 *   3  a person-only deletion (the facility stays) still records and bumps
 */
import "dotenv/config";

if (process.env.NODE_ENV === "production") { console.error("refusing to run in production"); process.exit(2); }
const dbUrl = process.env.DATABASE_URL || "";
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(dbUrl)) { console.error("refusing: DATABASE_URL must be a local database"); process.exit(2); }

let pass = 0, fail = 0;
const ok = (n: string) => { pass++; console.log("  ✓ " + n); };
const bad = (n: string, got: unknown, want: unknown) => { fail++; console.log(`  ✗ ${n} :: got ${got}, want ${want}`); };
const eq = (n: string, got: unknown, want: unknown) => (String(got) === String(want) ? ok(n) : bad(n, got, want));

const errors: string[] = [];
const realError = console.error;
console.error = (...a: unknown[]) => { errors.push(a.map(String).join(" ")); };
const settle = () => new Promise((r) => setTimeout(r, 400)); // the audit write is fire-and-forget

async function main() {
  const { prisma } = await import("../lib/db");
  const { afterMutation } = await import("../lib/rev");
  const tag = "aftermath-" + Date.now();

  async function makeFacility() {
    const f = await prisma.facility.create({ data: { name: tag } });
    const u = await prisma.user.create({ data: { facilityId: f.id, email: `${tag}-${Math.random().toString(36).slice(2)}@example.org`, passwordHash: "x", first: "Ada", last: "Check", role: "ADMIN" } });
    const user = { id: u.id, facilityId: f.id, first: "Ada", last: "Check", email: u.email, role: "ADMIN" } as unknown as Parameters<typeof afterMutation>[0];
    return { f, u, user };
  }

  console.log("1  facility deleted by the op");
  {
    const { f, user } = await makeFacility();
    await prisma.facility.delete({ where: { id: f.id } });
    errors.length = 0;
    const rev = await afterMutation(user, "me.deleteAccount", { password: "x", confirm: tag }, "127.0.0.1", { deleted: "facility", facility: tag });
    await settle();
    eq("no rev-bump error", errors.filter((e) => e.includes("[rev]")).length, 0);
    eq("no audit error", errors.filter((e) => e.includes("[audit]")).length, 0);
    eq("rev is null", rev, null);
  }

  console.log("2  ordinary op on a live facility");
  {
    const { f, user } = await makeFacility();
    errors.length = 0;
    const rev = await afterMutation(user, "items.update", { id: "abc" }, "127.0.0.1", { ok: true });
    await settle();
    eq("rev bumped to 1", rev, 1);
    eq("one audit row", await prisma.auditEvent.count({ where: { facilityId: f.id, op: "items.update" } }), 1);
    eq("no errors", errors.length, 0);
    await prisma.facility.delete({ where: { id: f.id } });
  }

  console.log("3  person-only deletion, facility stays");
  {
    const { f, u, user } = await makeFacility();
    await prisma.user.delete({ where: { id: u.id } });
    errors.length = 0;
    const rev = await afterMutation(user, "me.deleteAccount", { password: "x" }, "127.0.0.1", { deleted: "user" });
    await settle();
    eq("rev bumped to 1", rev, 1);
    eq("audit row kept", await prisma.auditEvent.count({ where: { facilityId: f.id, op: "me.deleteAccount" } }), 1);
    eq("no errors", errors.length, 0);
    await prisma.facility.delete({ where: { id: f.id } });
  }

  await prisma.$disconnect();
}

main()
  .catch((e) => { fail++; realError(e); })
  .finally(() => {
    console.error = realError;
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  });
