/* Look at the outbound mail queue, and send failed mail again.
 *
 *   npx tsx scripts/mail-queue.ts status          counts by status, and the oldest waiting
 *   npx tsx scripts/mail-queue.ts failed [n]      the latest n failed (default 20)
 *   npx tsx scripts/mail-queue.ts retry <id>...   put these failed messages back in the queue
 *   npx tsx scripts/mail-queue.ts retry --all     every failed message that can still be sent
 *   npx tsx scripts/mail-queue.ts run             one pass of the worker now
 *
 * With Docker Compose: `docker compose exec app npx tsx scripts/mail-queue.ts status`.
 *
 * Shows the kind of mail, the recipient's domain, the reason and the times; never an address or
 * a message. A failed password reset cannot be sent again (its link is wiped when it fails, and it
 * would be stale anyway): the person asks for a new one. See lib/mailqueue.ts.
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { flushAlerts, mailQueueCounts, retryFailed, runMailQueue } from "../lib/mailqueue";

const [cmd, ...args] = process.argv.slice(2);
const domain = (to: string) => "@" + to.slice(to.lastIndexOf("@") + 1);
const when = (d: Date | null) => (d ? d.toISOString().replace("T", " ").slice(0, 16) + "Z" : "-");

async function main() {
  if (cmd === "status") {
    const counts = await mailQueueCounts();
    const oldest = await prisma.mailJob.findFirst({ where: { status: { in: ["queued", "sending"] } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
    const hour = await prisma.mailJob.count({ where: { sentAt: { gt: new Date(Date.now() - 3600_000) } } });
    console.log(JSON.stringify({ ...counts, sentLastHour: hour, oldestWaiting: oldest ? when(oldest.createdAt) : null }));
  } else if (cmd === "failed") {
    const n = Math.min(500, parseInt(args[0] || "20", 10) || 20);
    const rows = await prisma.mailJob.findMany({ where: { status: "failed" }, orderBy: { updatedAt: "desc" }, take: n });
    for (const r of rows) {
      console.log([r.id, when(r.updatedAt), r.kind, r.lane, r.failReason, `tries=${r.attempts}`, domain(r.to), r.payload === null ? "no-body" : "retryable", r.lastError || ""].join("\t"));
    }
    if (!rows.length) console.log("no failed mail");
  } else if (cmd === "retry" && args.length) {
    const res = await retryFailed(args[0] === "--all" ? "all" : args);
    console.log(JSON.stringify(res));
  } else if (cmd === "run") {
    console.log(JSON.stringify(await runMailQueue()));
    await flushAlerts();
  } else {
    console.error("usage: mail-queue.ts status | failed [n] | retry <id>... | retry --all | run");
    process.exitCode = 2;
  }
}
main().finally(() => prisma.$disconnect());
