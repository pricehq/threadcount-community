import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { prisma } from "./db";
import { approvedLines } from "./staffreq";
import { fmtDate } from "./compute";

/* Telling somebody's phone, without telling the ward.
 *
 * Every sender here is fire-and-forget: it takes ids, reads what it needs itself, never throws and
 * never blocks the op that called it. An op that succeeded must not fail because a notification
 * could not be sent — the request is the record, and this is a courtesy on top of it.
 *
 * ⛔ Three rules the text obeys, stated once in notifyText() so they cannot drift apart:
 *   · no counts — the same rule as every staff screen: a ward is told words;
 *   · no money, ever, anywhere near a wearer;
 *   · NO COLLECTION CODE. A notification body is drawn on a lock screen, and the code is what a
 *     bag is handed over against, so printing it there hands the bag to whoever walks past the
 *     phone on the desk. The code stays behind the sign-in, on the order and on the full-screen
 *     card. This is a deliberate difference from the approved mockup, documented in the manual.
 *
 * Preferences are honoured HERE rather than by the callers: a trigger should say what happened,
 * not work out who wants to hear about it. Somebody with no preference row wants everything, which
 * is what a new account has.
 *
 * Nothing about the credential is in this repository. The path to a service-account key file comes
 * from TC_FCM_KEY_FILE and the project id is read out of that file; with the variable unset every
 * send returns at once, nothing is logged beyond a single line, and the app tells the person
 * notifications are not set up on this server.
 */

type Key = { client_email: string; private_key: string; project_id: string; token_uri?: string };

let key: Key | null | undefined; // undefined = not looked at yet; null = nothing configured
let said = false;

function saidOnce() {
  if (said) return;
  said = true;
  // One line, once, with no path and no payload in it — the same shape as mail's.
  console.info("[push] no notification sender configured — nothing is sent");
}

function loadKey(): Key | null {
  if (key !== undefined) return key;
  const path = process.env.TC_FCM_KEY_FILE;
  if (!path) { key = null; saidOnce(); return key; }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<Key>;
    if (!raw.client_email || !raw.private_key || !raw.project_id) throw new Error("incomplete");
    key = { client_email: raw.client_email, private_key: raw.private_key, project_id: raw.project_id, token_uri: raw.token_uri };
  } catch {
    // Never the path, and never the reason in detail: this line is read in a log somebody else may
    // hold, and which file it is is exactly the part that is nobody's business.
    console.warn("[push] the notification key could not be read — nothing is sent");
    key = null;
  }
  return key;
}

/** Is a sender configured on this server at all? The Account screen asks through `push.register`,
 *  so a facility with no key says so plainly rather than offering a switch that does nothing. */
export function pushConfigured(): boolean {
  return !!loadKey();
}

/* ---------------------------------------------------------------- the transport ----
 *
 * FCM HTTP v1, and no new dependency: a service-account JWT signed with node:crypto, exchanged for
 * an access token, then one POST per device. The alternative was the Firebase Admin SDK — a large
 * dependency in every self-hosted image for two HTTP calls.
 */

const b64url = (b: Buffer | string) =>
  (typeof b === "string" ? Buffer.from(b) : b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let bearer: { value: string; until: number } | null = null;

async function accessToken(): Promise<string | null> {
  const k = loadKey();
  if (!k) return null;
  if (bearer && bearer.until > Date.now()) return bearer.value;
  try {
    const now = Math.floor(Date.now() / 1000);
    const aud = k.token_uri || "https://oauth2.googleapis.com/token";
    const claims = { iss: k.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud, iat: now, exp: now + 3600 };
    const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}`;
    const sig = createSign("RSA-SHA256").update(unsigned).sign(k.private_key);
    const assertion = `${unsigned}.${b64url(sig)}`;
    const r = await fetch(aud, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    });
    if (!r.ok) { console.warn("[push] token exchange refused", r.status); return null; }
    const j = (await r.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) return null;
    // Five minutes early, so a token never expires between minting it and using it.
    bearer = { value: j.access_token, until: Date.now() + Math.max(60, (j.expires_in || 3600) - 300) * 1000 };
    return bearer.value;
  } catch (e) {
    console.warn("[push] could not mint an access token:", (e as Error).message);
    return null;
  }
}

export type Msg = { title: string; body: string; url: string; tag: string };

/** Write to every device given, and say how many were accepted — which is the number a test can
 *  assert on. With no devices it does nothing at all, and on a server where nobody has turned
 *  notifications on that is the expected answer, not a failure. */
async function push(devices: readonly { id: string; token: string }[], msg: Msg): Promise<number> {
  if (!devices.length) return 0;
  const k = loadKey();
  if (!k) return 0;
  const auth = await accessToken();
  if (!auth) return 0;
  let sent = 0;
  for (const d of devices) {
    try {
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(k.project_id)}/messages:send`, {
        method: "POST",
        headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            token: d.token,
            notification: { title: msg.title, body: msg.body },
            android: { priority: "HIGH", notification: { channel_id: "threadcount", tag: msg.tag } },
            data: { url: msg.url },
          },
        }),
      });
      if (r.ok) { sent++; continue; }
      const text = await r.text().catch(() => "");
      /* A token that is gone is a row that should be gone with it: a phone wiped, an app removed, a
       * registration rotated. Left behind, it is a write attempted on every send for ever.
       *
       * ⛔ But only when the complaint is about the TOKEN. FCM answers 400 INVALID_ARGUMENT for any
       * malformed message — a field it no longer accepts, a bad enum, an oversize payload — so the
       * bare word made a single mistake in the message shape delete every registered phone it was
       * sent to. The kit-check fan-out writes to every holder in the facility at once, which is the
       * send that would have done it, silently, to everybody. Anything else is this server's fault
       * and is logged, not paid for by somebody's phone. */
      const aboutTheToken = /UNREGISTERED/.test(text)
        || (/INVALID_ARGUMENT/.test(text) && /message\.token|registration token/i.test(text));
      if (r.status === 404 || r.status === 410 || aboutTheToken) {
        await prisma.staffDevice.deleteMany({ where: { id: d.id } }).catch(() => {});
        // Never the token and never a name: which phone it was is nobody's business in a log.
        console.info("[push] a registration is gone; its device was forgotten", r.status);
        continue;
      }
      console.warn("[push] FCM refused a message", r.status);
    } catch (e) {
      console.warn("[push] could not send:", (e as Error).message);
    }
  }
  return sent;
}

/* ---------------------------------------------------------------- who gets it ---- */

type Switch = "approved" | "ready" | "round" | "kitcheck" | "waiting";

/** The devices to write to: this person's phones, provided they still have an account, are still
 *  on the register, and have not turned this particular switch off. A missing preference row is
 *  every default, so nobody has to be written a row to be told. */
async function devicesFor(staffIds: readonly string[], which: Switch): Promise<{ id: string; token: string }[]> {
  const ids = [...new Set(staffIds.filter(Boolean))];
  if (!ids.length) return [];
  const [prefs, devices] = await Promise.all([
    prisma.staffNotifyPref.findMany({ where: { staffId: { in: ids } } }),
    prisma.staffDevice.findMany({
      // Somebody who cannot act on it is not told: off the register, or with no account to open.
      where: { staffId: { in: ids }, staff: { inactive: false, account: { isNot: null } } },
      select: { id: true, token: true, staffId: true },
    }),
  ]);
  const off = new Set(prefs.filter((p) => p[which] === false).map((p) => p.staffId));
  return devices.filter((d) => !off.has(d.staffId)).map((d) => ({ id: d.id, token: d.token }));
}

/* ---------------------------------------------------------------- the words ---- */

/** Garment names, deduplicated, at most three. No sizes, no quantities, no money, no code. */
function names(lines: readonly { item: { item: string } }[]): string {
  const seen: string[] = [];
  for (const l of lines) if (!seen.includes(l.item.item)) seen.push(l.item.item);
  return seen.slice(0, 3).join(", ") + (seen.length > 3 ? " …" : "");
}

export type Kind = "approved" | "partly" | "declined" | "ready" | "round" | "kitcheck" | "waiting";

/** Every notification's text, in one function, so the three rules above are obeyed once rather
 *  than in seven call sites. */
export function notifyText(
  kind: Kind,
  f: { id?: string; code?: string; garments?: string; ward?: string; who?: string; dueBy?: string },
): Msg {
  const order = `/my/orders/${f.id || ""}`;
  const tag = f.id || "";
  switch (kind) {
    case "approved": return { title: "Approved", body: `${f.code} · ${f.garments}`, url: order, tag };
    case "partly": return { title: "Partly approved", body: `${f.code} · ${f.garments}`, url: order, tag };
    case "declined": return { title: "Declined", body: `${f.code} · ${f.garments}`, url: order, tag };
    case "ready": return { title: "Ready to collect", body: `${f.code} · ${f.garments}`, url: order, tag };
    case "round": return { title: "On the ward round", body: `${f.code} · ${f.ward ? `arriving on ${f.ward}` : "arriving on your ward"}`, url: order, tag };
    case "kitcheck": return { title: "Kit check is open", body: `Confirm what you still have by ${f.dueBy}`, url: "/my/kitcheck", tag: "kitcheck" };
    case "waiting": return { title: "Waiting on you", body: `${f.who} · ${f.garments}`, url: `/my/approvals/${f.id || ""}`, tag };
  }
}

/* ---------------------------------------------------------------- the senders ---- */

const REQ = {
  lines: { include: { item: { select: { item: true } } }, orderBy: { sort: "asc" } },
  subject: { select: { id: true, first: true, last: true, dept: true } },
} as const;

async function decided(requestId: string): Promise<number> {
  if (!pushConfigured()) return 0;
  const r = await prisma.request.findUnique({ where: { id: requestId }, include: REQ });
  if (!r || r.status === "awaiting") return 0;
  const yes = approvedLines(r.lines);
  const kind: Kind = yes.length === 0 ? "declined" : yes.length === r.lines.length ? "approved" : "partly";
  // What survived the decision is the bag; a refusal is described by what was asked for, because
  // there is no bag.
  const about = yes.length ? yes : r.lines;
  return push(await devicesFor([r.subjectId], "approved"), notifyText(kind, { id: r.id, code: r.code, garments: names(about) }));
}

async function waiting(requestId: string): Promise<number> {
  if (!pushConfigured()) return 0;
  const r = await prisma.request.findUnique({ where: { id: requestId }, include: REQ });
  /* Addressed to somebody, and still theirs to answer. Deliberately never gated on "is a manager":
   * a request reaches somebody who manages nobody two ordinary ways — the linen room re-addresses
   * one that arrived without an approver, or a manager's last report moves away — and that person
   * has no team screen they visit out of habit, so this is the only thing that tells them. */
  if (!r || !r.managerId || r.status !== "awaiting") return 0;
  const who = `${r.subject.first} ${r.subject.last}`.trim();
  return push(await devicesFor([r.managerId], "waiting"), notifyText("waiting", { id: r.id, who, garments: names(r.lines) }));
}

async function ready(requestId: string): Promise<number> {
  if (!pushConfigured()) return 0;
  const r = await prisma.request.findUnique({ where: { id: requestId }, include: REQ });
  if (!r) return 0;
  // ⛔ The collection code is deliberately not in this body. See the header.
  return push(await devicesFor([r.subjectId], "ready"), notifyText("ready", { id: r.id, code: r.code, garments: names(approvedLines(r.lines)) }));
}

async function onRound(requestId: string): Promise<number> {
  if (!pushConfigured()) return 0;
  const r = await prisma.request.findUnique({ where: { id: requestId }, include: REQ });
  if (!r) return 0;
  return push(await devicesFor([r.subjectId], "round"), notifyText("round", { id: r.id, code: r.code, ward: r.subject.dept }));
}

async function kitCheck(facilityId: string, dueBy: string): Promise<number> {
  if (!pushConfigured()) return 0;
  // The one send addressed to a room rather than to a person, so it is the one that has to be
  // careful: only people actually holding something, and a count in the log — never a name and
  // never a ward.
  const holders = await prisma.issue.findMany({
    where: { facilityId, returnedDate: null, handedIn: null },
    select: { staffId: true },
    distinct: ["staffId"],
  });
  const devices = await devicesFor(holders.map((h) => h.staffId), "kitcheck");
  const n = await push(devices, notifyText("kitcheck", { dueBy: fmtDate(dueBy) }));
  if (n) console.info(`[push] kit check: ${n} device${n === 1 ? "" : "s"} told`);
  return n;
}

/* The fire-and-forget faces the ops call. Nothing waits on one, and nothing fails because of one. */
const fire = (p: Promise<number>) => { void p.catch((e) => console.warn("[push]", (e as Error).message)); };

/** Approved, partly approved or declined → the person it is for. */
export function notifyDecided(requestId: string): void { fire(decided(requestId)); }
/** A request landing on whoever it is addressed to. */
export function notifyWaiting(requestId: string): void { fire(waiting(requestId)); }
/** Held at the counter → the person it is for. No code in the text. */
export function notifyReady(requestId: string): void { fire(ready(requestId)); }
/** Out on the ward round → the person it is for. */
export function notifyOnRound(requestId: string): void { fire(onRound(requestId)); }
/** A kit check opened → everybody in the facility who is holding something. */
export function notifyKitCheck(facilityId: string, dueBy: string): void { fire(kitCheck(facilityId, dueBy)); }

/** The awaited forms, which answer with how many devices were written to. For tests and tooling
 *  only: an op that waited on a send would be an op that fails when Google is slow. */
export const pushSenders = { decided, waiting, ready, onRound, kitCheck };
