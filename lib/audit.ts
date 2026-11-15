import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import type { StaffSession } from "@/lib/staffsession";

/* The audit trail.
 *
 * One rule shapes this file: **record what was touched, never what it said.** A trail that quoted
 * payloads would become a second copy of the staff register — names, phone numbers, payroll
 * numbers — growing forever, outside every retention rule that governs the first copy, and dumped
 * into every backup. So only record identifiers get through, and only ones from a fixed list.
 *
 * That still answers the question people actually ask, which is "who changed this record, and
 * when", because the id points at the record whose current state you can go and look at.
 *
 * Three kinds of thing are recorded, and the op name says which:
 *   `issue.create`        a coordinator's change, through /api/mutate
 *   `staff:damage.report` something a wearer, ward manager or ward desk did, through the staff app
 *   `auth:signin`         getting in or out, and changes to a second factor
 * The prefixes matter because the ids in the two columns come from different tables: `userId` on a
 * `staff:` row is a Staff id, not a User id, and reading one as the other would name the wrong
 * person in the one place that exists to name the right one.
 */

/** Payload keys allowed into `target`. Everything else — names, notes, reasons, barcodes, emails,
 *  quantities that could reconstruct a person's holdings — is dropped. */
const ID_KEYS = new Set([
  "id", "itemId", "staffId", "orderId", "lineId", "locationId", "supplierId",
  "deptId", "userId", "issueId", "pickupId", "stocktakeId", "si",
  // Staff-app payloads name their own records too.
  "subjectId", "photoId",
]);

/** Ops not worth a row. Everything else is recorded, because an audit trail with a curated view of
 *  what counts as important is one that has already lost the argument. */
const SKIP = new Set(["photo.put"]);

function safeTarget(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (!ID_KEYS.has(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    // Ids are cuids; anything longer is not an id and has no business here.
    else if (typeof v === "string" && v.length <= 40) out[k] = v;
  }
  const s = JSON.stringify(out);
  return s === "{}" ? "" : s.slice(0, 500);
}

export type Actor = { facilityId: string; userId: string; userName: string };

/**
 * The one writer.
 *
 * Never throws and never blocks the caller's response: a failure to write history must not undo
 * work that already succeeded, and a person shouldn't see an error because the log was busy.
 */
function write(actor: Actor, op: string, target: string, ip: string): void {
  void prisma.auditEvent
    .create({
      data: {
        facilityId: actor.facilityId,
        userId: actor.userId,
        // Denormalised on purpose: the trail has to still name the person after their account is
        // deleted, and deleting an account is precisely the kind of event you look back at.
        userName: actor.userName.slice(0, 120),
        op: op.slice(0, 60),
        target,
        ip: ip.slice(0, 60),
      },
    })
    .catch((e) => console.error("[audit] could not record", op, (e as Error).message));
}

/** Record one successful coordinator change. */
export function recordAudit(user: SessionUser, op: string, payload: unknown, ip: string): void {
  if (SKIP.has(op)) return;
  const name = [user.first, user.last].filter(Boolean).join(" ").trim() || user.email;
  write({ facilityId: user.facilityId, userId: user.id, userName: name }, op, safeTarget(payload), ip);
}

/**
 * Record one successful change made from the staff app — a wearer, a ward manager or the desk.
 *
 * `result` is folded in because most of these ops create something: the request, the damage report
 * or the dispute exists only once the op has run, so its id is in the answer rather than in what
 * was sent, and an id is the whole reason to have the row. Anything the payload already named wins,
 * and only an id is taken from the result.
 */
export function recordStaffAudit(sess: StaffSession, op: string, payload: unknown, ip: string, result?: unknown): void {
  const name = [sess.first, sess.last].filter(Boolean).join(" ").trim() || sess.email;
  const made = result && typeof result === "object" ? (result as { id?: unknown }).id : undefined;
  const sent = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const target = typeof sent.id === "string" || typeof made !== "string" ? sent : { ...sent, id: made };
  write({ facilityId: sess.facilityId, userId: sess.staffId, userName: name }, `staff:${op}`, safeTarget(target), ip);
}

/**
 * Record a change by someone the session machinery cannot name — the ward manager deciding from an
 * emailed link has no session at all, only a signed token, and the person is looked up by hand.
 */
export function recordFor(actor: Actor, op: string, payload: unknown, ip: string): void {
  write(actor, op, safeTarget(payload), ip);
}

/**
 * Record something that happened to an account rather than to a record: a sign-in, a sign-out, a
 * second factor turned on or off, a password set from a reset link.
 *
 * `detail` is a fixed word written in our own source — "recovery", "email-link" — never anything a
 * caller typed, and it is filtered to letters, digits and dashes so that stays true even if someone
 * later wires it to something they shouldn't.
 */
export function recordAuthEvent(actor: Actor, op: string, ip: string, detail = ""): void {
  const d = detail.replace(/[^a-z0-9.-]/gi, "").slice(0, 24);
  write(actor, op, d ? JSON.stringify({ how: d }) : "", ip);
}
