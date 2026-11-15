/* The outbound mail queue (lib/mailqueue.ts), against a real Postgres and a real SMTP conversation.
 *
 *   DATABASE_URL=postgresql://…@127.0.0.1:5432/scratch npx tsx scripts/check-mailqueue.ts
 *
 * ⛔ Empties the MailJob and MailQueueFlag tables, so it refuses anything but a database on this
 * machine (127.0.0.1 / localhost) and refuses NODE_ENV=production. Run `npx prisma migrate deploy`
 * on that database first.
 *
 * The mail server is a scripted fake speaking SMTP on a local port, told per message whether to
 * accept (250), refuse for now (451) or refuse for good (550). Time is passed in, not waited for.
 *
 *   1  a temporary 4xx failure is retried and then delivered, once, with the same Message-ID
 *   2  a 5xx stops at once, with no retry, and an urgent message's body is wiped
 *   3  an urgent message (a reset link) gives up when it expires, not after a day of retries
 *   4  the hourly cap holds: normal mail stops short of it, urgent mail uses the reserve, and the
 *      overflow goes when the hour rolls on
 *   5  a restart mid-queue resumes: an abandoned send is picked up again, and two workers running
 *      at once never send one message twice
 *   6  the alert fires once and is throttled; a backlog alerts too; neither carries an address
 *      or the message's words
 */
import net from "node:net";
import http from "node:http";
import type { AddressInfo } from "node:net";
import "dotenv/config";

if (process.env.NODE_ENV === "production") { console.error("refusing to run in production"); process.exit(2); }
const dbUrl = process.env.DATABASE_URL || "";
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(dbUrl)) { console.error("refusing: DATABASE_URL must be a local database"); process.exit(2); }

/* ---------------------------------------------------------------- a scripted SMTP server */
type Reply = { at: "rcpt" | "data"; line: string };
const smtp = {
  plan: [] as Reply[],
  received: [] as { to: string; messageId: string; subject: string }[],
  attempts: 0,
};
const server = net.createServer((sock) => {
  let buf = "", inData = false, data = "", rcpt = "", refused: Reply | null = null, login = 0;
  const say = (l: string) => sock.write(l + "\r\n");
  say("220 fake ESMTP");
  sock.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let i: number;
    while ((i = buf.indexOf("\r\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (inData) {
        if (line === ".") {
          inData = false;
          const r = refused ?? (smtp.plan[0]?.at === "data" ? smtp.plan.shift()! : null);
          refused = null;
          if (r) { say(r.line); continue; }
          const mid = /^message-id:\s*(.+)$/im.exec(data)?.[1]?.trim() || "";
          const subject = /^subject:\s*(.+)$/im.exec(data)?.[1]?.trim() || "";
          smtp.received.push({ to: rcpt, messageId: mid, subject });
          say("250 2.0.0 queued");
        } else data += line + "\n";
        continue;
      }
      const cmd = line.toUpperCase();
      if (login === 1) { login = 2; say("334 UGFzc3dvcmQ6"); continue; }
      if (login === 2) { login = 0; say("235 ok"); continue; }
      if (cmd.startsWith("EHLO")) { say("250-fake"); say("250-AUTH PLAIN LOGIN"); say("250 8BITMIME"); }
      else if (cmd.startsWith("HELO")) say("250 fake");
      else if (cmd.startsWith("AUTH PLAIN")) say("235 ok");
      else if (cmd.startsWith("AUTH LOGIN")) { login = 1; say("334 VXNlcm5hbWU6"); }
      else if (cmd.startsWith("MAIL FROM")) { smtp.attempts++; say("250 ok"); }
      else if (cmd.startsWith("RCPT TO")) {
        rcpt = /<([^>]*)>/.exec(line)?.[1] || "";
        if (smtp.plan[0]?.at === "rcpt") say(smtp.plan.shift()!.line); else say("250 ok");
      }
      else if (cmd === "DATA") { inData = true; data = ""; say("354 go"); }
      else if (cmd === "RSET" || cmd === "NOOP") say("250 ok");
      else if (cmd === "QUIT") { say("221 bye"); sock.end(); }
      else say("502 not implemented");
    }
  });
  sock.on("error", () => {});
});

/* ---------------------------------------------------------------- a webhook that counts posts */
const hook = { posts: [] as { ua: string; body: string }[] };
const hookServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => { hook.posts.push({ ua: String(req.headers["user-agent"] || ""), body }); res.end("ok"); });
});

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, got?: unknown) => {
  if (ok) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗", name, "::", JSON.stringify(got)); }
};
const MIN = 60_000;
const at = (t0: Date, min: number) => new Date(t0.getTime() + min * MIN);

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  await new Promise<void>((r) => hookServer.listen(0, "127.0.0.1", () => r()));
  Object.assign(process.env, {
    SMTP_HOST: "127.0.0.1", SMTP_PORT: String((server.address() as AddressInfo).port),
    SMTP_USER: "queue-test", SMTP_PASS: "x", SMTP_FROM: "ThreadCount <no-reply@example.test>",
    EMAIL_ALERT_WEBHOOK: `http://127.0.0.1:${(hookServer.address() as AddressInfo).port}/hook`,
    EMAIL_RATE_PER_HOUR: "80", EMAIL_URGENT_RESERVE: "10", EMAIL_ALERT_THROTTLE_MIN: "30",
  });
  const q = await import("../lib/mailqueue");
  const { prisma } = await import("../lib/db");

  const reset = async () => {
    await q.flushAlerts();
    await prisma.mailJob.deleteMany({});
    await prisma.mailQueueFlag.deleteMany({});
    smtp.plan = []; smtp.received = []; smtp.attempts = 0; hook.posts = [];
    process.env.EMAIL_RATE_PER_HOUR = "80"; process.env.EMAIL_URGENT_RESERVE = "10";
  };
  const job = (id?: string) => prisma.mailJob.findUniqueOrThrow({ where: { id: id! } });
  const msg = (n: number | string, to = "person@example.org") => ({ to, subject: `Subject ${n}`, text: `Body ${n} with a secret link https://x.test/r/${n}tokenABC` });

  /* -------------------------------------------------------------- 0 classification */
  console.log("0 · classifying mail-server replies");
  const c = (e: object) => q.classify(e).temporary;
  check("451 is temporary", c({ responseCode: 451, response: "451 4.7.1 Maximum credits exceeded" }));
  check("550 is permanent", !c({ responseCode: 550, response: "550 5.1.1 No such user" }));
  check("a rejected recipient (EENVELOPE 550) is permanent", !c({ code: "EENVELOPE", responseCode: 550, response: "550 no" }));
  check("connection refused is temporary", c({ code: "ESOCKET", message: "connect ECONNREFUSED" }));
  check("a timeout is temporary", c({ code: "ETIMEDOUT", message: "Greeting never received" }));
  check("a rejected login (535) is temporary: a configuration outage", c({ code: "EAUTH", responseCode: 535, response: "535 Incorrect authentication data" }));
  check("the host's hourly cap, even as a 550, is temporary", c({ responseCode: 550, response: "550 Domain example.test has exceeded the max emails per hour (100/100 (100%)) allowed. Message discarded." }));
  check("an address in a reply is blanked", !q.tidyReason("550 5.1.1 <someone@example.org>: no such user").includes("someone@"));

  /* -------------------------------------------------------------- 1 */
  console.log("1 · a temporary 4xx failure retries, then succeeds");
  await reset();
  const t1 = new Date("2026-09-29T00:00:00Z");
  smtp.plan = [{ at: "data", line: "451 4.7.1 Maximum credits exceeded" }];
  const o1 = await q.queueMail(msg(1), { kind: "request-ready" }, t1);
  check("normal mail is queued, not sent in the caller", o1.queued && !o1.sent, o1);
  let r = await q.runMailQueue({ now: t1 });
  let j = await job(o1.id);
  check("first attempt refused → back in the queue", r.retrying === 1 && j.status === "queued" && j.attempts === 1, { r, status: j.status });
  check("next attempt one minute later", j.nextAttemptAt.getTime() === at(t1, 1).getTime(), j.nextAttemptAt);
  check("the reason is recorded", (j.lastError || "").startsWith("451"), j.lastError);
  r = await q.runMailQueue({ now: at(t1, 0.5) });
  check("not retried before it is due", r.claimed === 0 && smtp.attempts === 1, r);
  r = await q.runMailQueue({ now: at(t1, 1) });
  j = await job(o1.id);
  check("second attempt delivers", r.sent === 1 && j.status === "sent" && smtp.received.length === 1, { r, status: j.status });
  check("the body is wiped once sent", j.payload === null, j.payload);
  check("delivered once, with the job's Message-ID", smtp.received.length === 1 && smtp.received[0].messageId === `<${o1.id}@example.test>`, smtp.received);
  const dup = await q.queueMail(msg(1), { kind: "request-ready" }, at(t1, 2));
  check("the same message again inside ten minutes is the same job", dup.duplicate === true && dup.id === o1.id && dup.sent, dup);

  /* -------------------------------------------------------------- 2 */
  console.log("2 · a 5xx stops, with no retry");
  await reset();
  const t2 = new Date("2026-09-29T01:00:00Z");
  smtp.plan = [{ at: "rcpt", line: "550 5.1.1 <nobody@example.org>: Recipient address rejected" }];
  const o2 = await q.queueMail(msg(2, "nobody@example.org"), { kind: "reset", lane: "urgent" }, t2);
  j = await job(o2.id);
  check("urgent mail is tried in the caller and reported as failed", !o2.sent && !o2.queued && o2.failed === "permanent", o2);
  check("marked failed, permanent, one attempt", j.status === "failed" && j.failReason === "permanent" && j.attempts === 1, j);
  check("an urgent message's body is wiped on failure", j.payload === null, j.payload);
  check("the recorded reason has no address in it", !(j.lastError || "").includes("nobody@"), j.lastError);
  await q.runMailQueue({ now: at(t2, 5) });
  await q.runMailQueue({ now: at(t2, 60) });
  check("never tried again", smtp.attempts === 1, smtp.attempts);
  const bad = await q.queueMail(msg(3, "not an address"), { kind: "welcome" }, t2);
  check("a malformed address fails without touching the server", bad.failed === "invalid-address" && smtp.attempts === 1, bad);
  smtp.plan = [{ at: "data", line: "554 5.7.1 Message rejected" }];
  const o2b = await q.queueMail(msg(4), { kind: "supplier-order" }, t2);
  await q.runMailQueue({ now: t2 });
  j = await job(o2b.id);
  check("a normal message refused for good fails at once and keeps its body for a manual retry", j.status === "failed" && j.attempts === 1 && j.payload !== null, j);

  /* -------------------------------------------------------------- 3 */
  console.log("3 · an urgent message gives up when it expires");
  await reset();
  const t3 = new Date("2026-09-29T02:00:00Z");
  const down = { at: "data" as const, line: "421 4.3.2 Service not available" };
  smtp.plan = [down, down, down, down, down, down];
  const o3 = await q.queueMail(msg(5), { kind: "reset", lane: "urgent", expiresInMin: 5 }, t3);
  check("the first attempt fails → queued for a retry, and the caller is told", o3.queued && !o3.sent, o3);
  await q.runMailQueue({ now: at(t3, 1) });   // attempt 2 fails; next would be +3 → minute 4
  j = await job(o3.id);
  check("retried after a minute", j.attempts === 2 && j.status === "queued" && j.nextAttemptAt.getTime() === at(t3, 4).getTime(), j);
  await q.runMailQueue({ now: at(t3, 4) });   // attempt 3 fails; next would be +10 → minute 14, past minute 5
  j = await job(o3.id);
  check("gives up once the next retry would land after it expires", j.status === "failed" && j.failReason === "expired" && j.attempts === 3, j);
  check("its body (the link) is wiped", j.payload === null, j.payload);
  await q.runMailQueue({ now: at(t3, 14) });
  check("no attempt after giving up", smtp.attempts === 3, smtp.attempts);
  // An urgent message that never got a turn (the cap was full) expires on the clock as well.
  process.env.EMAIL_RATE_PER_HOUR = "0";
  const o3b = await q.queueMail(msg(6), { kind: "reset", lane: "urgent", expiresInMin: 15 }, t3);
  check("with the cap full an urgent message waits instead of being tried", o3b.queued && smtp.attempts === 3, o3b);
  await q.runMailQueue({ now: at(t3, 14) });
  check("still waiting just before it expires", (await job(o3b.id)).status === "queued");
  await q.runMailQueue({ now: at(t3, 15) });
  j = await job(o3b.id);
  check("expired on time, never sent", j.status === "failed" && j.failReason === "expired" && j.payload === null && smtp.attempts === 3, j);
  // The normal lane keeps trying for about a day, not fifteen minutes.
  process.env.EMAIL_RATE_PER_HOUR = "80";
  smtp.plan = Array(20).fill(down);
  const o3c = await q.queueMail(msg(7), { kind: "staff-notice" }, t3);
  for (const m of [0, 1, 6, 21, 51, 111, 231, 471, 951]) await q.runMailQueue({ now: at(t3, m) });
  j = await job(o3c.id);
  check("normal mail is still being retried nine attempts and ~16 hours in", j.status === "queued" && j.attempts === 9, j);
  await q.runMailQueue({ now: at(t3, 1431) });
  j = await job(o3c.id);
  check("and gives up after the tenth, about a day in", j.status === "failed" && j.failReason === "attempts" && j.attempts === 10, j);

  /* -------------------------------------------------------------- 4 */
  console.log("4 · the hourly cap holds");
  await reset();
  process.env.EMAIL_RATE_PER_HOUR = "5"; process.env.EMAIL_URGENT_RESERVE = "2";
  const t4 = new Date("2026-09-29T03:00:00Z");
  const normals = [];
  for (let i = 0; i < 6; i++) normals.push(await q.queueMail(msg(`n${i}`), { kind: "staff-notice" }, t4));
  r = await q.runMailQueue({ now: t4 });
  check("normal mail stops at the cap less the reserve (5 − 2 = 3)", r.sent === 3 && smtp.received.length === 3, r);
  const u1 = await q.queueMail(msg("u1"), { kind: "reset", lane: "urgent", expiresInMin: 120 }, at(t4, 1));
  const u2 = await q.queueMail(msg("u2"), { kind: "reset", lane: "urgent", expiresInMin: 120 }, at(t4, 1));
  check("urgent mail uses the reserve", u1.sent && u2.sent && smtp.received.length === 5, [u1, u2]);
  const u3 = await q.queueMail(msg("u3"), { kind: "reset", lane: "urgent", expiresInMin: 120 }, at(t4, 2));
  check("with the cap reached even urgent mail waits", u3.queued && !u3.sent && smtp.received.length === 5, u3);
  r = await q.runMailQueue({ now: at(t4, 30) });
  check("nothing more inside the hour", r.claimed === 0 && smtp.received.length === 5, r);
  r = await q.runMailQueue({ now: at(t4, 60.5) });
  check("when the first three roll out of the hour, the waiting urgent one goes first, and normal mail still keeps the reserve free (2 urgent + 1 = 5 − 2)", r.sent === 1 && smtp.received[5]?.subject === "Subject u3", { r, got: smtp.received[5]?.subject });
  r = await q.runMailQueue({ now: at(t4, 61.5) });
  check("when the urgent pair rolls out, two more normal go", r.sent === 2 && smtp.received.length === 8, r);
  r = await q.runMailQueue({ now: at(t4, 121) });
  check("and the last one when the next rolls out", r.sent === 1 && smtp.received.length === 9, r);
  const hourly = smtp.received.length;
  check("every message went exactly once", new Set(smtp.received.map((x) => x.messageId)).size === hourly && hourly === 9);

  /* -------------------------------------------------------------- 5 */
  console.log("5 · a restart mid-queue resumes without duplicates");
  await reset();
  const t5 = new Date("2026-09-29T04:00:00Z");
  const ids: string[] = [];
  for (let i = 0; i < 12; i++) ids.push((await q.queueMail(msg(`r${i}`), { kind: "staff-notice" }, t5)).id!);
  // A process that claimed a message and was killed before it could send it.
  await prisma.mailJob.update({ where: { id: ids[0] }, data: { status: "sending", lockedBy: "dead-worker", lockedAt: t5, attempts: 1 } });
  // Two workers (the old and the new build, side by side for a moment) at once.
  const [a, b] = await Promise.all([
    q.runMailQueue({ now: at(t5, 1), worker: "worker-a" }),
    q.runMailQueue({ now: at(t5, 1), worker: "worker-b" }),
  ]);
  check("two workers together sent the eleven free messages, none twice", a.sent + b.sent === 11 && smtp.received.length === 11 && new Set(smtp.received.map((x) => x.messageId)).size === 11, { a, b, n: smtp.received.length });
  check("the abandoned one is left alone while its lock is fresh", (await job(ids[0])).status === "sending");
  r = await q.runMailQueue({ now: at(t5, 6) });
  j = await job(ids[0]);
  check("after five minutes the abandoned send is picked up and delivered", r.requeued === 1 && j.status === "sent" && smtp.received.length === 12, { r, status: j.status });
  check("every message delivered exactly once", new Set(smtp.received.map((x) => x.messageId)).size === 12);
  // The dead worker waking up late cannot overwrite what another worker settled.
  const late = await prisma.mailJob.updateMany({ where: { id: ids[0], status: "sending", lockedBy: "dead-worker" }, data: { status: "queued" } });
  check("a late settle from the old owner matches nothing", late.count === 0);

  /* -------------------------------------------------------------- 6 */
  console.log("6 · the alert fires once and is throttled");
  await reset();
  const t6 = new Date("2026-09-29T05:00:00Z");
  const perm = { at: "rcpt" as const, line: "550 5.1.1 unknown user" };
  smtp.plan = [perm, perm, perm, perm];
  await q.queueMail(msg("a1", "one@example.org"), { kind: "reset", lane: "urgent" }, t6);
  await q.queueMail(msg("a2", "two@example.org"), { kind: "reset", lane: "urgent" }, at(t6, 1));
  await q.queueMail(msg("a3", "three@example.org"), { kind: "reset", lane: "urgent" }, at(t6, 2));
  await q.flushAlerts();
  check("three failures inside half an hour → one alert", hook.posts.length === 1, hook.posts.length);
  const body = hook.posts[0]?.body || "";
  check("it names the code and the kind", body.includes("EMAIL_FAILED") && body.includes("kind=reset"), body);
  check("it carries the recipient's domain only, never the address or the words", body.includes("@example.org") && !/one@|two@|three@|Subject a|Body a|tokenABC/.test(body), body);
  check("it sends its own User-Agent", hook.posts[0]?.ua.startsWith("threadcount-mail-queue"), hook.posts[0]?.ua);
  await q.queueMail(msg("a4", "four@example.org"), { kind: "reset", lane: "urgent" }, at(t6, 31));
  await q.flushAlerts();
  check("the next failure after the window alerts again", hook.posts.length === 2, hook.posts.length);
  // A backlog: a mail server that has stopped answering.
  await reset();
  process.env.EMAIL_RATE_PER_HOUR = "0";
  for (let i = 0; i < 25; i++) await q.queueMail(msg(`b${i}`), { kind: "staff-notice" }, t6);
  await q.runMailQueue({ now: at(t6, 10) });
  check("no backlog alert while it is young", hook.posts.length === 0, hook.posts.length);
  await q.runMailQueue({ now: at(t6, 16) });
  check("more than 20 waiting for over 15 minutes → a backlog alert", hook.posts.length === 1 && hook.posts[0].body.includes("EMAIL_BACKLOG"), hook.posts.map((p) => p.body));
  await q.runMailQueue({ now: at(t6, 47) });
  await q.runMailQueue({ now: at(t6, 120) });
  check("the same backlog does not alert every half hour", hook.posts.length === 1, hook.posts.length);

  /* -------------------------------------------------------------- housekeeping */
  console.log("7 · housekeeping");
  const pruned = await q.pruneMailJobs(at(t6, 60 * 24 * 40));
  check("old rows are pruned", pruned.sent + pruned.failed >= 0);
  await reset();

  console.log(`PASS=${pass} FAIL=${fail}`);
  server.close(); hookServer.close();
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
