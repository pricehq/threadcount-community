import { cookies } from "next/headers";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { prisma } from "./db";

export const COOKIE_NAME = "tc_session";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET not set");
  return s;
}

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Short fingerprint of the password hash: a password change (or admin reset) invalidates every older token. */
export function pwVersion(passwordHash: string) { return createHash("sha256").update(passwordHash).digest("base64url").slice(0, 12); }

/** `sso` marks a session the facility's own identity provider signed in — no password crossed here. */
export function signSession(uid: string, passwordHash: string, maxAge = MAX_AGE, sso = false) {
  const payload = b64url(Buffer.from(JSON.stringify({ uid, pv: pwVersion(passwordHash), exp: Date.now() + maxAge * 1000, ...(sso ? { sso: true } : {}) })));
  const sig = b64url(createHmac("sha256", secret()).update(payload).digest());
  return `${payload}.${sig}`;
}

export function readSessionToken(raw: string | undefined): { uid: string; pv: string; sso: boolean } | null {
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expect = b64url(createHmac("sha256", secret()).update(payload).digest());
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    if (!data.uid || !data.exp || data.exp < Date.now()) return null;
    return { uid: data.uid, pv: String(data.pv || ""), sso: data.sso === true };
  } catch {
    return null;
  }
}

/** "Keep me signed in on this computer": the longer life a person asks for on the sign-in screen. */
export const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function setSessionCookie(uid: string, passwordHash: string, sso = false, maxAge = MAX_AGE) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, signSession(uid, passwordHash, maxAge, sso), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export type SessionUser = {
  id: string;
  facilityId: string;
  email: string;
  first: string;
  last: string;
  title: string;
  role: "ADMIN" | "ISSUER";
  isDemo: boolean;
  /** Signed in through the facility's identity provider rather than a password. */
  viaSso: boolean;
};

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const tok = readSessionToken(jar.get(COOKIE_NAME)?.value);
  if (!tok) return null;
  const u = await prisma.user.findUnique({
    where: { id: tok.uid },
    select: { id: true, facilityId: true, email: true, first: true, last: true, title: true, role: true, inactive: true, passwordHash: true, facility: { select: { isDemo: true } } },
  });
  if (!u || u.inactive) return null;
  if (tok.pv !== pwVersion(u.passwordHash)) return null; // password changed since this token was minted
  const { inactive: _i, passwordHash: _p, facility, ...rest } = u; void _i; void _p;
  return { ...rest, isDemo: facility.isDemo, viaSso: tok.sso };
}

export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}
