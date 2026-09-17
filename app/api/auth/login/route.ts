import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { REMEMBER_MAX_AGE, pwVersion, setSessionCookie } from "@/lib/session";
import { TRUST_COOKIE, mintTicket, readTrust } from "@/lib/twofactor";
import { sameOriginJson } from "@/lib/csrf";
import { clientIp, fail, over } from "@/lib/ratelimit";
import { signInStaff } from "@/lib/staffauth";
import { verifyTurnstile } from "@/lib/turnstile";
import { recordAuthEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Simple in-memory throttle per IP+email (per process).
const attempts = new Map<string, { n: number; t: number }>();

/** The trail names the person, not the address they typed — see lib/audit.ts. */
const actorFor = (u: { id: string; facilityId: string; first: string; last: string; email: string }) =>
  ({ facilityId: u.facilityId, userId: u.id, userName: `${u.first} ${u.last}`.trim() || u.email });

export async function POST(req: NextRequest) {
  const csrf = sameOriginJson(req); if (csrf) return NextResponse.json({ error: csrf }, { status: 403 });
  let body: { email?: string; password?: string; cfToken?: string; remember?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const email = String(body.email || "").trim().toLowerCase().slice(0, 160);
  const password = String(body.password || "").slice(0, 200);
  // Spray protection independent of the per-(ip,email) counter below. Both buckets count only the
  // attempts that FAILED — a whole hospital signs in from one NAT address at shift change, and a
  // ceiling on attempts would have to lock that ward out to be worth anything against an attacker.
  const ipKey = clientIp(req.headers);
  if (over("login-ip:" + ipKey, 40, 15 * 60 * 1000) || (email && over("login-email:" + email, 25, 15 * 60 * 1000))) return NextResponse.json({ error: "Too many attempts — try again in 15 minutes." }, { status: 429 });
  if (!email || !password) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });

  // nginx appends the real client IP last; earlier entries are client-supplied and spoofable.
  const xff = req.headers.get("x-forwarded-for")?.split(",").map((x) => x.trim()).filter(Boolean) || [];
  const ip = xff[xff.length - 1] || "local";
  if (attempts.size > 5000) for (const [kk, v] of attempts) if (Date.now() - v.t > 15 * 60 * 1000) attempts.delete(kk);
  const k = `${ip}|${email}`;
  const a = attempts.get(k);
  if (a && a.n >= 8 && Date.now() - a.t < 15 * 60 * 1000) return NextResponse.json({ error: "Too many attempts — try again in 15 minutes." }, { status: 429 });

  const cfErr = await verifyTurnstile(body.cfToken, ipKey); if (cfErr) return NextResponse.json({ error: cfErr }, { status: 400 });
  const u = await prisma.user.findUnique({ where: { email } });
  /* One box, both kinds of account.
   *
   * A wearer reaches the product the way anyone else does — the home page, then Log in — and types
   * the details they set up in the staff app. So when this address has no coordinator account, the
   * register is asked before the answer is called wrong.
   *
   * A coordinator account always wins: it is the one with the counter, the orders and the register
   * behind it, and a coordinator who also wears a uniform can open their own record from inside the
   * app. One address therefore has one destination, every time.
   *
   * This is a lookup, not a second attempt. "Try the coordinator, and if that fails try the staff
   * one" would score a failure against every single staff sign-in, and these ceilings count
   * failures — behind one hospital's NAT address at shift change that is a locked-out ward.
   */
  if (!u) {
    const s = await signInStaff(email, password, ipKey, false);
    if (s.kind === "ok") return NextResponse.json({ ok: true, name: s.name, staff: true });
    if (s.kind === "error") return NextResponse.json({ error: s.error }, { status: s.status });
    // `none`: no staff account either, so this falls through to the answer below, which counts the
    // failure once and says the same thing it has always said.
  }
  const ok = u ? await bcrypt.compare(password, u.passwordHash) : await bcrypt.compare(password, "$2b$12$C6UzMDM.H6dfI/f/IKcEeO5x3FvDS3kqB6r0Jt3g7Lz0vX4o0JZ1u");
  if (!u || !ok) {
    attempts.set(k, { n: (a && Date.now() - a.t < 15 * 60 * 1000 ? a.n : 0) + 1, t: Date.now() });
    fail("login-ip:" + ipKey, 15 * 60 * 1000);
    if (email) fail("login-email:" + email, 15 * 60 * 1000);
    // An address with no account here is recorded nowhere: there is no facility to file it under,
    // and a log of attempts on addresses that don't exist would be a list of other people's email
    // addresses that nobody asked us to keep.
    if (u) recordAuthEvent(actorFor(u), "auth:signin.failed", ipKey);
    return NextResponse.json({ error: "Email or password doesn’t match." }, { status: 401 });
  }
  attempts.delete(k);
  if (u.inactive) {
    // The right password on an account that has been taken away is worth knowing about.
    recordAuthEvent(actorFor(u), "auth:signin.refused", ipKey, "inactive");
    return NextResponse.json({ error: "This account has been deactivated. Ask an admin at your facility to reactivate it." }, { status: 403 });
  }
  const fac = await prisma.facility.findUnique({ where: { id: u.facilityId }, select: { isDemo: true, ssoEnabled: true, ssoRequired: true } });
  if (fac?.isDemo) return NextResponse.json({ error: "Demo accounts can’t log in here — open the demo from the home page." }, { status: 403 });
  // The facility has decided its people sign in through its own identity provider. The password
  // was right, and it is still refused — except for the admin the facility keeps as its fire
  // escape. The box sends them on to single sign-on rather than reporting a failure.
  if (fac?.ssoEnabled && fac.ssoRequired && !u.ssoBreakGlass) {
    recordAuthEvent(actorFor(u), "auth:signin.refused", ipKey, "sso required");
    return NextResponse.json({ error: "Your facility signs in with single sign-on.", ssoRequired: true }, { status: 403 });
  }
  // With a second factor on the account the password alone opens nothing. The ticket says only
  // "this password was correct", is accepted by no other endpoint, and expires in five minutes.
  // A browser that entered a code within the last thirty days and asked to be trusted skips it;
  // the trust token is bound to the password version, so a changed password asks again.
  const trusted = !!u.totpEnabledAt && readTrust(req.cookies.get(TRUST_COOKIE)?.value, u.id, pwVersion(u.passwordHash));
  if (u.totpEnabledAt && !trusted) {
    return NextResponse.json({ need2fa: true, ticket: mintTicket(u.id, pwVersion(u.passwordHash)) });
  }

  await setSessionCookie(u.id, u.passwordHash, false, body.remember === true ? REMEMBER_MAX_AGE : undefined);
  recordAuthEvent(actorFor(u), "auth:signin", ipKey, trusted ? "password+trusted" : "password");
  return NextResponse.json({ ok: true, name: `${u.first} ${u.last}`, role: u.role });
}
