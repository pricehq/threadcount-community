import { cookies } from "next/headers";
import { createHash, createHmac, randomInt, timingSafeEqual } from "crypto";
import { prisma } from "./db";

/* Sessions for staff members looking at their own record.
 *
 * A wearer is not a coordinator, and this file is where that stops being a matter of remembering to
 * check. Their session lives in its own cookie, signed with a key derived separately from the
 * coordinator one, and its payload carries `sid` where a coordinator token carries `uid`. So a
 * staff cookie pasted into `tc_session` fails signature verification; and even if it somehow
 * didn't, readSessionToken() rejects a payload with no `uid`. There is no arrangement of a staff
 * token that produces a coordinator session — not because a condition says no, but because the two
 * are not the same shape.
 *
 * The reverse holds too: a coordinator's cookie is not a staff session, so /my shows a coordinator
 * nothing until they activate their own staff record like anyone else.
 */

export const STAFF_COOKIE = "tc_staff";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days: read-only, and re-typing a password on a ward is a chore

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET not set");
  // Domain separation. The same master secret signs both kinds of token, and without this a
  // signature valid for one would be valid for the other.
  return createHash("sha256").update("threadcount:staff:v1:" + s).digest();
}

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function staffPwVersion(passwordHash: string) {
  return createHash("sha256").update(passwordHash).digest("base64url").slice(0, 12);
}

/** `sso` marks a session the facility's identity provider signed in — see lib/session.ts. */
export function signStaffSession(sid: string, passwordHash: string, maxAge = MAX_AGE, sso = false) {
  const payload = b64url(Buffer.from(JSON.stringify({ sid, pv: staffPwVersion(passwordHash), exp: Date.now() + maxAge * 1000, ...(sso ? { sso: true } : {}) })));
  const sig = b64url(createHmac("sha256", secret()).update(payload).digest());
  return `${payload}.${sig}`;
}

export function readStaffToken(raw: string | undefined): { sid: string; pv: string } | null {
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expect = b64url(createHmac("sha256", secret()).update(payload).digest());
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    if (!data.sid || !data.exp || data.exp < Date.now()) return null;
    return { sid: data.sid, pv: String(data.pv || "") };
  } catch {
    return null;
  }
}

export async function setStaffCookie(sid: string, passwordHash: string, sso = false) {
  const jar = await cookies();
  jar.set(STAFF_COOKIE, signStaffSession(sid, passwordHash, MAX_AGE, sso), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearStaffCookie() {
  const jar = await cookies();
  jar.set(STAFF_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export type StaffSession = {
  accountId: string;
  staffId: string;
  facilityId: string;
  email: string;
  first: string;
  last: string;
  num: string;
};

export async function currentStaff(): Promise<StaffSession | null> {
  const jar = await cookies();
  const tok = readStaffToken(jar.get(STAFF_COOKIE)?.value);
  if (!tok) return null;
  const acc = await prisma.staffAccount.findUnique({
    where: { id: tok.sid },
    select: {
      id: true, facilityId: true, email: true, passwordHash: true,
      staff: { select: { id: true, first: true, last: true, num: true, inactive: true } },
    },
  });
  if (!acc || acc.staff.inactive) return null; // a person taken off the register loses the view with it
  if (tok.pv !== staffPwVersion(acc.passwordHash)) return null;
  return {
    accountId: acc.id,
    staffId: acc.staff.id,
    facilityId: acc.facilityId,
    email: acc.email,
    first: acc.staff.first,
    last: acc.staff.last,
    num: acc.staff.num,
  };
}

/* ---------- activation codes ---------- */

// No I, L, O, U, 0 or 1: these get printed on a slip, read off it and typed by someone who is not
// looking closely, and every removed character is one fewer support call.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Twelve characters in three groups — about 58 bits, and the throttle on /api/staff/activate does
 *  the rest. Grouped because people type grouped codes more accurately than a run of twelve. */
export function newActivateCode(): string {
  const g = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${g()}-${g()}-${g()}`;
}

/** Accept it however it was typed: lower case, spaces, missing or extra dashes. */
export function normaliseCode(raw: string): string {
  const clean = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  return clean.length === 12 ? `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}` : "";
}
