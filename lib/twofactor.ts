import { createHmac, timingSafeEqual } from "crypto";

/* The short-lived ticket that carries "this password was correct" from the first step of sign-in
 * to the second.
 *
 * It is emphatically not a session: it grants nothing on its own, is only accepted by the
 * second-factor endpoint, and dies in five minutes. Keeping it stateless means a half-finished
 * sign-in leaves nothing behind to clean up, and there is no table for an attacker to fill.
 *
 * It carries the password version, so a password changed between the two steps invalidates the
 * ticket for exactly the same reason it invalidates a session.
 */

const TICKET_TTL_MS = 5 * 60 * 1000;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is required");
  return s;
}

const b64 = (b: Buffer) => b.toString("base64url");
const sign = (payload: string) => b64(createHmac("sha256", secret()).update(`2fa.${payload}`).digest());

export function mintTicket(userId: string, pv: string): string {
  const payload = b64(Buffer.from(JSON.stringify({ uid: userId, pv, exp: Date.now() + TICKET_TTL_MS })));
  return `${payload}.${sign(payload)}`;
}

export function readTicket(ticket: string): { uid: string; pv: string } | null {
  const [payload, mac] = String(ticket || "").split(".");
  if (!payload || !mac) return null;
  const expect = sign(payload);
  const a = Buffer.from(mac, "utf8");
  const b = Buffer.from(expect, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const t = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { uid?: string; pv?: string; exp?: number };
    if (!t.uid || !t.pv || !t.exp || t.exp < Date.now()) return null;
    return { uid: t.uid, pv: t.pv };
  } catch {
    return null;
  }
}

/* "Trust this computer for 30 days" — a second cookie beside the session, set only after a second
 * factor was actually entered on this browser. It carries the user id and the password version,
 * signed like the ticket, so a password change ends every trusted browser at once. Sign-in reads it
 * before asking for a code; a browser without it, or with somebody else's, is asked as before. */
export const TRUST_COOKIE = "tc_trust";
export const TRUST_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const signTrust = (payload: string) => b64(createHmac("sha256", secret()).update(`trust.${payload}`).digest());
export function mintTrust(userId: string, pv: string): string {
  const payload = b64(Buffer.from(JSON.stringify({ uid: userId, pv, exp: Date.now() + TRUST_TTL_MS })));
  return `${payload}.${signTrust(payload)}`;
}
export function readTrust(token: string | undefined, userId: string, pv: string): boolean {
  const [payload, mac] = String(token || "").split(".");
  if (!payload || !mac) return false;
  const a = Buffer.from(mac, "utf8"), b = Buffer.from(signTrust(payload), "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const t = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { uid?: string; pv?: string; exp?: number };
    return t.uid === userId && t.pv === pv && !!t.exp && t.exp > Date.now();
  } catch { return false; }
}
