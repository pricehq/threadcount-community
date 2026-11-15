/* The outbound mail queue.
 *
 * Every email the app sends becomes a MailJob row before anything talks to the mail server, so a
 * mail outage delays mail instead of losing it, and an outage that outlasts the retries is reported
 * instead of disappearing into a log line. It lives in the app's own database and runs inside the
 * app's own process: nothing to install, nothing extra for a self-hosted server to run.
 *
 * Two lanes.
 *   urgent  password resets. Tried at once, in the request, so the screen can say truthfully
 *           whether it went. A temporary failure is retried at +1, +3 and +10 minutes and then
 *           given up: a reset link that turns up half an hour late is no use to anyone, and the
 *           person will have asked again.
 *   normal  everything else (welcome, staff and request notices, supplier orders, the contact
 *           form). Queued and sent by the worker within seconds; a temporary failure is retried
 *           with backoff for about a day.
 *
 * What counts as temporary: any 4xx reply, a connection/timeout/TLS/DNS failure, a rejected login
 * (a configuration outage: once it is fixed the queue flushes), and a hosting provider's "too many
 * emails per hour" reply even when it arrives as a 5xx. Everything else 5xx, and an address that is
 * not an address, stops at once.
 *
 * Rate cap. Shared mail hosting caps an account at so many messages an hour and discards the rest.
 * EMAIL_RATE_PER_HOUR (default 80) counts what was sent in the last rolling hour plus what is in
 * flight; normal mail stops EMAIL_URGENT_RESERVE (default 10) short of it, so a password reset
 * always has room. The count and the claim happen together under one advisory lock, so two copies
 * of the app running side by side for a moment during a restart cannot jointly overshoot it.
 *
 * Delivery is at-least-once. A process killed between the server accepting a message and the row
 * being marked sent leaves the row "sending"; after EMAIL_LOCK_STALE_SEC it is sent again. Every
 * attempt carries the same Message-ID (<job id@sender domain>), so a receiving system that
 * de-duplicates on it shows one message. Each job also has a dedupe key: the same message to the
 * same person inside ten minutes (a double click, a retried request) is one job, not two.
 *
 * Privacy. The row holds the message only until it is sent (and, for urgent mail, until it fails):
 * then `payload` is cleared. Sent rows are deleted after 7 days, failed rows after 30. Nothing here
 * logs a subject, a body or a link; errors are recorded as the server's reply code and first line,
 * with any address in it blanked.
 *
 * Alerts (throttled to one per EMAIL_ALERT_THROTTLE_MIN, default 30, across every process): a job
 * that finally fails, or a backlog (more than 20 waiting for over 15 minutes, or anything waiting
 * over 30 minutes; a backlog alert repeats at most every EMAIL_BACKLOG_REPEAT_MIN, default 180).
 * They go to the log always, to EMAIL_ALERT_WEBHOOK (a chat incoming webhook) when set, and to the
 * error tracker when one is configured. An alert names the kind of mail and the recipient's domain,
 * never the address or the content.
 */
import nodemailer from "nodemailer";
import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { report } from "./glitchtip";

export type Lane = "urgent" | "normal";
export type MailInput = { to: string; subject: string; text: string; html?: string; replyTo?: string };
export type MailOptions = {
  /** A label for the kind of mail ("reset", "welcome"...). Stored and shown in alerts; never content. */
  kind: string;
  lane?: Lane;
  /** Try it now, in the caller, and report whether it went. Defaults to true for urgent mail. */
  inline?: boolean;
  /** Urgent mail: give up after this many minutes (default 15). */
  expiresInMin?: number;
  dedupeKey?: string;
};
export type MailOutcome = {
  /** The mail server accepted it. */
  sent: boolean;
  /** It is waiting in the queue (for the worker, a retry, or room under the hourly cap). */
  queued: boolean;
  /** Why it will not be sent: not-configured | invalid-address | permanent | expired | attempts */
  failed?: string;
  duplicate?: boolean;
  id?: string;
};

type Payload = { subject: string; text: string; html?: string; replyTo?: string };
type Job = {
  id: string; kind: string; lane: Lane; to: string; payload: Payload | null;
  attempts: number; maxAttempts: number; expiresAt: Date;
};

/* ------------------------------------------------------------------ configuration */

const envNum = (name: string, dflt: number) => {
  const v = process.env[name];
  const n = v === undefined || v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
};
export function mailQueueConfig() {
  return {
    perHour: envNum("EMAIL_RATE_PER_HOUR", 80),
    urgentReserve: envNum("EMAIL_URGENT_RESERVE", 10),
    staleSec: envNum("EMAIL_LOCK_STALE_SEC", 300),
    intervalMs: Math.max(1000, envNum("EMAIL_WORKER_INTERVAL_MS", 15_000)),
    alertEveryMin: envNum("EMAIL_ALERT_THROTTLE_MIN", 30),
    backlogEveryMin: envNum("EMAIL_BACKLOG_REPEAT_MIN", 180),
    sentDays: envNum("EMAIL_SENT_RETENTION_DAYS", 7),
    failedDays: envNum("EMAIL_FAILED_RETENTION_DAYS", 30),
    webhook: (process.env.EMAIL_ALERT_WEBHOOK || "").trim(),
  };
}

/** Is there a mail server to send through? Without one nothing is queued at all. */
export function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** Minutes to wait after the Nth failed attempt (index 0 = after the first). */
export const RETRY_DELAYS_MIN: Record<Lane, number[]> = {
  urgent: [1, 3, 10],
  normal: [1, 5, 15, 30, 60, 120, 240, 480, 480], // ~24h in all
};
const NORMAL_WINDOW_MIN = 26 * 60;
const URGENT_WINDOW_MIN = 15;

const MIN = 60_000;
const addMin = (d: Date, m: number) => new Date(d.getTime() + m * MIN);
/* Timestamps go to SQL as ISO text cast to `timestamp`, the same UTC wall-clock Prisma writes, so
   the comparison is right whatever the database session's time zone is. */
const ts = (d: Date) => d.toISOString();

/* ------------------------------------------------------------------ classification */

export type Verdict = { temporary: boolean; reason: string };

const TEMPORARY_CODES = new Set([
  "ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNREFUSED", "ECONNRESET", "ECONNABORTED", "EPIPE",
  "EHOSTUNREACH", "ENETUNREACH", "ENOTFOUND", "EAI_AGAIN", "EPROTOCOL", "ETLS", "EAUTH", "EPERM",
]);
/* A hosting provider's hourly cap, which some servers send as a 5xx although waiting cures it. */
const RATE_LIMITED = /max(imum)?\s+(emails|defers|messages|recipients|failures)[^\n]*per\s+hour|rate[ -]?limit|too many (messages|connections|emails|recipients)|try again later/i;

/** The server's reply code and first line, with addresses and anything token-like blanked. */
export function tidyReason(raw: string): string {
  return raw.split(/\r?\n/)[0]
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[address]")
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[id]")
    .trim().slice(0, 160);
}

export function classify(err: unknown): Verdict {
  const e = (err && typeof err === "object" ? err : { message: String(err) }) as {
    responseCode?: unknown; code?: unknown; response?: unknown; message?: unknown;
  };
  const rc = typeof e.responseCode === "number" ? e.responseCode : undefined;
  const code = typeof e.code === "string" ? e.code : "";
  const text = String(e.response || e.message || "");
  const head = rc !== undefined ? (text.startsWith(String(rc)) ? "" : `${rc} `) : code ? `${code} ` : "";
  const reason = tidyReason(`${head}${text}`.trim()) || "unknown";
  if (code === "EAUTH") return { temporary: true, reason };
  if (rc !== undefined && rc >= 400 && rc < 500) return { temporary: true, reason };
  if (rc !== undefined && rc >= 500) return { temporary: RATE_LIMITED.test(text), reason };
  if (code === "EENVELOPE" || code === "EMESSAGE") return { temporary: false, reason };
  // Connection, timeout, TLS and DNS failures, and anything unrecognised: bounded by the attempts
  // and the expiry, so an unknown error cannot retry forever.
  return { temporary: true, reason };
}

const ADDRESS = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
const domainOf = (addr: string) => addr.slice(addr.lastIndexOf("@") + 1).toLowerCase();

/* ------------------------------------------------------------------ transport */

function senderDomain(from: string): string {
  const m = from.match(/@([A-Za-z0-9.-]+)/);
  return m ? m[1].toLowerCase() : "localhost";
}

async function deliver(job: Job): Promise<{ ok: true; providerId: string | null } | { ok: false; verdict: Verdict }> {
  const p = job.payload;
  if (!p) return { ok: false, verdict: { temporary: false, reason: "no message body left to send" } };
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "";
  // Short timeouts: an urgent send runs inside someone's request, and nodemailer's defaults
  // (minutes) would hold the screen for as long as the server takes to not answer.
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    connectionTimeout: envNum("EMAIL_CONNECT_TIMEOUT_MS", 10_000),
    greetingTimeout: envNum("EMAIL_CONNECT_TIMEOUT_MS", 10_000),
    socketTimeout: envNum("EMAIL_SOCKET_TIMEOUT_MS", 30_000),
  });
  try {
    const info = await t.sendMail({
      from, to: job.to, subject: p.subject, text: p.text,
      ...(p.html ? { html: p.html } : {}),
      ...(p.replyTo ? { replyTo: p.replyTo } : {}),
      messageId: `<${job.id}@${senderDomain(from)}>`,
    });
    return { ok: true, providerId: (info as { messageId?: string }).messageId ?? null };
  } catch (e) {
    return { ok: false, verdict: classify(e) };
  } finally {
    t.close();
  }
}

/* ------------------------------------------------------------------ claiming */

const WORKER_ID = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

type Row = {
  id: string; kind: string; lane: string; to: string; payload: unknown;
  attempts: number; maxAttempts: number; expiresAt: Date;
};
const toJob = (r: Row): Job => ({
  id: r.id, kind: r.kind, lane: r.lane === "urgent" ? "urgent" : "normal", to: r.to,
  payload: (r.payload as Payload | null) ?? null, attempts: Number(r.attempts), maxAttempts: Number(r.maxAttempts),
  expiresAt: r.expiresAt instanceof Date ? r.expiresAt : new Date(r.expiresAt),
});

/** How many more may go this hour, for each lane. Call only inside the locked transaction. */
async function budget(tx: Prisma.TransactionClient, now: Date) {
  const cfg = mailQueueConfig();
  const rows = await tx.$queryRaw<{ used: number }[]>`
    SELECT count(*)::int AS used FROM "MailJob"
    WHERE status = 'sending' OR "sentAt" > ${ts(addMin(now, -60))}::timestamp`;
  const used = Number(rows[0]?.used ?? 0);
  return { urgent: Math.max(0, cfg.perHour - used), normal: Math.max(0, cfg.perHour - cfg.urgentReserve - used) };
}

/* Take due jobs for sending: status flips to "sending" and attempts counts this one, in the same
   statement that picks them, under a database-wide advisory lock that also serialises the cap. */
async function claim(now: Date, worker: string, opts: { id?: string; limit?: number } = {}): Promise<Job[]> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext('threadcount:mail-queue'))`;
    const left = await budget(tx, now);
    const take = async (lane: Lane, n: number) => {
      if (n <= 0) return [] as Row[];
      return tx.$queryRaw<Row[]>`
        UPDATE "MailJob" SET status = 'sending', "lockedAt" = ${ts(now)}::timestamp, "lockedBy" = ${worker},
               attempts = attempts + 1, "updatedAt" = ${ts(now)}::timestamp
        WHERE id IN (
          SELECT id FROM "MailJob"
          WHERE status = 'queued' AND lane = ${lane}
            AND "nextAttemptAt" <= ${ts(now)}::timestamp AND "expiresAt" > ${ts(now)}::timestamp
            ${opts.id ? Prisma.sql`AND id = ${opts.id}` : Prisma.empty}
          ORDER BY "nextAttemptAt", "createdAt"
          LIMIT ${n}
          FOR UPDATE SKIP LOCKED)
        RETURNING id, kind, lane, "to", payload, attempts, "maxAttempts", "expiresAt"`;
    };
    const limit = opts.limit ?? 25;
    const urgent = await take("urgent", Math.min(limit, left.urgent));
    const normal = await take("normal", Math.min(limit - urgent.length, left.normal - urgent.length));
    return [...urgent, ...normal].map(toJob);
  });
}

/* ------------------------------------------------------------------ settling */

type Settled = { status: "sent" | "queued" | "failed"; failReason?: string };

async function fail(job: Job, failReason: string, lastError: string, now: Date, worker: string | null) {
  const n = await prisma.mailJob.updateMany({
    where: { id: job.id, ...(worker ? { status: "sending", lockedBy: worker } : { status: "queued" }) },
    data: {
      status: "failed", failReason, lastError, lockedAt: null, lockedBy: null, updatedAt: now,
      // An urgent mail's body is the link it carried; once it can no longer be sent it is only a risk.
      ...(job.lane === "urgent" ? { payload: Prisma.DbNull } : {}),
    },
  });
  if (n.count && failReason !== "invalid-address") {
    // Not awaited: an urgent send runs inside someone's request, and the webhook can be slow.
    track(raiseAlert("EMAIL_FAILED", `kind=${job.kind} lane=${job.lane} reason=${failReason} to=@${domainOf(job.to)} last="${lastError}"`, now));
  }
}

const pendingAlerts = new Set<Promise<unknown>>();
function track(p: Promise<unknown>) {
  const q = p.catch(() => {}).finally(() => pendingAlerts.delete(q));
  pendingAlerts.add(q);
}
/** Wait for alerts still being posted (tests, and the CLI before it exits). */
export async function flushAlerts() {
  while (pendingAlerts.size) await Promise.all([...pendingAlerts]);
}

async function settle(job: Job, res: Awaited<ReturnType<typeof deliver>>, now: Date, worker: string): Promise<Settled> {
  const mine = { id: job.id, status: "sending", lockedBy: worker };
  if (res.ok) {
    await prisma.mailJob.updateMany({
      where: mine,
      data: { status: "sent", sentAt: now, payload: Prisma.DbNull, providerId: res.providerId, lastError: null, lockedAt: null, lockedBy: null, updatedAt: now },
    });
    return { status: "sent" };
  }
  const { verdict } = res;
  if (!verdict.temporary) {
    await fail(job, "permanent", verdict.reason, now, worker);
    return { status: "failed", failReason: "permanent" };
  }
  const delay = RETRY_DELAYS_MIN[job.lane][job.attempts - 1];
  const next = delay === undefined ? null : addMin(now, delay);
  if (job.attempts >= job.maxAttempts || !next || next >= job.expiresAt) {
    const why = next && next >= job.expiresAt ? "expired" : "attempts";
    await fail(job, why, verdict.reason, now, worker);
    return { status: "failed", failReason: why };
  }
  await prisma.mailJob.updateMany({
    where: mine,
    data: { status: "queued", nextAttemptAt: next, lastError: verdict.reason, lockedAt: null, lockedBy: null, updatedAt: now },
  });
  return { status: "queued" };
}

/* ------------------------------------------------------------------ enqueueing */

/** The dedupe key when the caller gives none: same kind, recipient and words within ten minutes. */
function defaultKey(kind: string, m: MailInput, now: Date) {
  const h = createHash("sha256").update([kind, m.to.toLowerCase(), m.subject, m.text, m.html || ""].join("\u0000")).digest("hex").slice(0, 32);
  return `${kind}:${h}:${Math.floor(now.getTime() / (10 * MIN))}`;
}

function outcomeOf(status: string, failReason: string | null, id: string, duplicate = false): MailOutcome {
  if (status === "sent") return { sent: true, queued: false, id, duplicate };
  if (status === "failed") return { sent: false, queued: false, failed: failReason || "failed", id, duplicate };
  return { sent: false, queued: true, id, duplicate };
}

/** Put a message on the queue; for inline sends, also try it now. Never throws for a mail problem. */
export async function queueMail(m: MailInput, o: MailOptions, now: Date = new Date()): Promise<MailOutcome> {
  if (!smtpConfigured()) {
    console.warn("[mail] no SMTP configured — not sending:", o.kind);
    return { sent: false, queued: false, failed: "not-configured" };
  }
  const lane: Lane = o.lane ?? "normal";
  const inline = o.inline ?? lane === "urgent";
  const to = m.to.trim();
  const dedupeKey = o.dedupeKey ?? defaultKey(o.kind, m, now);
  const id = randomUUID();
  const valid = ADDRESS.test(to);
  const windowMin = lane === "urgent" ? (o.expiresInMin ?? URGENT_WINDOW_MIN) : NORMAL_WINDOW_MIN;
  const payload: Payload = { subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}), ...(m.replyTo ? { replyTo: m.replyTo } : {}) };

  await prisma.mailJob.createMany({
    data: [{
      id, kind: o.kind, lane, dedupeKey, to,
      status: valid ? "queued" : "failed",
      failReason: valid ? null : "invalid-address",
      payload: valid ? payload : Prisma.DbNull,
      maxAttempts: RETRY_DELAYS_MIN[lane].length + 1,
      nextAttemptAt: now, expiresAt: addMin(now, windowMin), createdAt: now, updatedAt: now,
    }],
    skipDuplicates: true,
  });
  const row = await prisma.mailJob.findUnique({ where: { dedupeKey }, select: { id: true, status: true, failReason: true } });
  if (!row) return { sent: false, queued: false, failed: "not-recorded" };
  if (row.id !== id) return outcomeOf(row.status, row.failReason, row.id, true);
  if (!valid) return { sent: false, queued: false, failed: "invalid-address", id };

  if (!inline) {
    void W.kick?.();
    return { sent: false, queued: true, id };
  }
  const [job] = await claim(now, WORKER_ID, { id });
  if (!job) return { sent: false, queued: true, id }; // no room under the hourly cap: the worker sends it when there is
  const settled = await settle(job, await deliver(job), now, WORKER_ID);
  return outcomeOf(settled.status, settled.failReason ?? null, id);
}

/* ------------------------------------------------------------------ the worker */

export type TickResult = { claimed: number; sent: number; retrying: number; failed: number; expired: number; requeued: number };

/** One pass: recover abandoned sends, expire what is too late, send what is due, check the backlog. */
export async function runMailQueue(opts: { now?: Date; worker?: string; limit?: number } = {}): Promise<TickResult> {
  const now = opts.now ?? new Date();
  const worker = opts.worker ?? WORKER_ID;
  const cfg = mailQueueConfig();

  // A send whose process died mid-flight: back in the queue. Its attempt has already been counted.
  const requeued = await prisma.mailJob.updateMany({
    where: { status: "sending", lockedAt: { lt: new Date(now.getTime() - cfg.staleSec * 1000) } },
    data: { status: "queued", lockedAt: null, lockedBy: null, updatedAt: now },
  });

  // Too late to be worth sending (an urgent mail held up by the cap, or a retry past its window).
  const late = await prisma.mailJob.findMany({
    where: { status: "queued", expiresAt: { lte: now } },
    select: { id: true, kind: true, lane: true, to: true, attempts: true, maxAttempts: true, expiresAt: true, lastError: true },
    take: 200,
  });
  for (const r of late) {
    await fail({ ...r, lane: r.lane === "urgent" ? "urgent" : "normal", payload: null }, "expired", r.lastError || "not sent before it expired", now, null);
  }

  const res: TickResult = { claimed: 0, sent: 0, retrying: 0, failed: 0, expired: late.length, requeued: requeued.count };
  if (!W.stopping) {
    const jobs = await claim(now, worker, { limit: opts.limit });
    res.claimed = jobs.length;
    for (const job of jobs) {
      const s = await settle(job, await deliver(job), opts.now ?? new Date(), worker);
      if (s.status === "sent") res.sent++;
      else if (s.status === "queued") res.retrying++;
      else res.failed++;
    }
  }

  await checkBacklog(now);
  if (!opts.now && Date.now() - W.lastPrune > 10 * MIN) {
    W.lastPrune = Date.now();
    await pruneMailJobs(now);
  }
  return res;
}

/** Delete sent rows after EMAIL_SENT_RETENTION_DAYS (7) and failed ones after EMAIL_FAILED_RETENTION_DAYS (30). */
export async function pruneMailJobs(now: Date = new Date()) {
  const cfg = mailQueueConfig();
  const sent = await prisma.mailJob.deleteMany({ where: { status: "sent", sentAt: { lt: addMin(now, -cfg.sentDays * 24 * 60) } } });
  const failed = await prisma.mailJob.deleteMany({ where: { status: "failed", updatedAt: { lt: addMin(now, -cfg.failedDays * 24 * 60) } } });
  return { sent: sent.count, failed: failed.count };
}

async function checkBacklog(now: Date) {
  const rows = await prisma.$queryRaw<{ n: number; oldest: Date | null }[]>`
    SELECT count(*)::int AS n, min("createdAt") AS oldest FROM "MailJob" WHERE status IN ('queued', 'sending')`;
  const n = Number(rows[0]?.n ?? 0);
  const oldest = rows[0]?.oldest ? new Date(rows[0].oldest) : null;
  if (!n || !oldest) return;
  const ageMin = (now.getTime() - oldest.getTime()) / MIN;
  if ((n > 20 && ageMin > 15) || ageMin > 30) {
    await raiseAlert("EMAIL_BACKLOG", `${n} waiting, oldest ${Math.round(ageMin)} min`, now);
  }
}

/* Worker state lives on globalThis: Next bundles instrumentation.ts and the route handlers
   separately, so each gets its own copy of this module, and a flag kept in one copy is invisible
   to the other. The worker started by instrumentation registers its kick() here, and a route
   that queues mail calls it, so normal mail goes in seconds rather than at the next tick. */
type WorkerState = { started: boolean; running: boolean; again: boolean; stopping: boolean; lastPrune: number; kick?: () => Promise<void> };
const W: WorkerState = ((globalThis as { __threadcountMailWorker?: WorkerState }).__threadcountMailWorker ??=
  { started: false, running: false, again: false, stopping: false, lastPrune: 0 });

/** Run a pass now unless one is already running (then run another straight after it). */
export async function kick(): Promise<void> {
  if (W.running) { W.again = true; return; }
  W.running = true;
  try {
    do {
      W.again = false;
      await runMailQueue();
    } while (W.again && !W.stopping);
  } catch (e) {
    console.error("[mail-queue] pass failed:", tidyReason((e as Error).message || String(e)));
  } finally {
    W.running = false;
  }
}

/** Start the in-process worker (instrumentation.ts). Off with EMAIL_WORKER=off, or with no SMTP. */
export function startMailWorker(): boolean {
  if (W.started || process.env.EMAIL_WORKER === "off" || !smtpConfigured()) return false;
  W.started = true;
  W.kick = kick;
  const { intervalMs } = mailQueueConfig();
  setInterval(() => void kick(), intervalMs).unref();
  setTimeout(() => void kick(), 2000).unref();
  // Stop taking new work when the service is asked to stop; what is in flight finishes or, if the
  // process is killed first, is picked up again after EMAIL_LOCK_STALE_SEC.
  process.once("SIGTERM", () => { W.stopping = true; });
  return true;
}

/* ------------------------------------------------------------------ alerts */

/* Take a throttle flag: true if it was free (not taken within the last `everyMin`). */
async function takeFlag(tx: Prisma.TransactionClient, key: string, everyMin: number, now: Date) {
  const rows = await tx.$queryRaw<{ key: string }[]>`
    INSERT INTO "MailQueueFlag" (key, at) VALUES (${key}, ${ts(now)}::timestamp)
    ON CONFLICT (key) DO UPDATE SET at = EXCLUDED.at
      WHERE "MailQueueFlag".at <= ${ts(addMin(now, -everyMin))}::timestamp
    RETURNING key`;
  return rows.length > 0;
}

/** Log always; post to the webhook and the error tracker at most once per throttle window. */
export async function raiseAlert(code: "EMAIL_FAILED" | "EMAIL_BACKLOG", detail: string, now: Date = new Date()): Promise<boolean> {
  console.error(`[mail-queue] ${code} ${detail}`);
  const cfg = mailQueueConfig();
  let go = false;
  try {
    go = await prisma.$transaction(async (tx) => {
      if (!(await takeFlag(tx, "alert", cfg.alertEveryMin, now))) return false;
      if (code === "EMAIL_BACKLOG" && !(await takeFlag(tx, "backlog", cfg.backlogEveryMin, now))) {
        throw new Rollback();
      }
      return true;
    });
  } catch (e) {
    if (!(e instanceof Rollback)) console.error("[mail-queue] alert throttle failed:", tidyReason(String((e as Error).message)));
    return false;
  }
  if (!go) return false;

  const [counts] = await prisma.$queryRaw<{ waiting: number; failed: number }[]>`
    SELECT count(*) FILTER (WHERE status IN ('queued', 'sending'))::int AS waiting,
           count(*) FILTER (WHERE status = 'failed' AND "updatedAt" > ${ts(addMin(now, -60))}::timestamp)::int AS failed
    FROM "MailJob"`;
  const text = `:warning: ThreadCount email ${code}: ${detail} · waiting ${counts?.waiting ?? 0} · failed in the last hour ${counts?.failed ?? 0}`;
  report({ error: new Error(`${code}: ${detail}`), where: "mail-queue", tags: { code } });
  if (cfg.webhook) {
    try {
      const r = await fetch(cfg.webhook, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "threadcount-mail-queue/1.0" },
        body: JSON.stringify({ username: "email-queue", text }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) console.error(`[mail-queue] alert webhook answered ${r.status}`);
    } catch (e) {
      console.error("[mail-queue] alert webhook failed:", tidyReason(String((e as Error).message)));
    }
  }
  return true;
}
class Rollback extends Error {}

/* ------------------------------------------------------------------ inspection (scripts/mail-queue.ts) */

export async function mailQueueCounts() {
  const rows = await prisma.mailJob.groupBy({ by: ["status"], _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Record<string, number>;
}

/** Put failed jobs back in the queue. Only jobs that still hold their message can go again. */
export async function retryFailed(ids: string[] | "all", now: Date = new Date()) {
  const rows = await prisma.mailJob.findMany({
    where: { status: "failed", ...(ids === "all" ? {} : { id: { in: ids } }) },
    select: { id: true, lane: true, payload: true },
  });
  let retried = 0, skipped = 0;
  for (const r of rows) {
    if (r.payload === null) { skipped++; continue; }
    const lane: Lane = r.lane === "urgent" ? "urgent" : "normal";
    const u = await prisma.mailJob.updateMany({
      where: { id: r.id, status: "failed" },
      data: { status: "queued", attempts: 0, failReason: null, nextAttemptAt: now, expiresAt: addMin(now, lane === "urgent" ? URGENT_WINDOW_MIN : NORMAL_WINDOW_MIN), updatedAt: now },
    });
    retried += u.count;
  }
  return { retried, skipped };
}
