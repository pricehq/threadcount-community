import { NextRequest, NextResponse } from "next/server";
import { sameOriginJson } from "@/lib/csrf";
import { clientIp } from "@/lib/ratelimit";
import { signInStaff, staffThrottled } from "@/lib/staffauth";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

/* The staff app's own door: the printed slip, the Play app's welcome, and /my/signin.
 *
 * The Log in box on the website reaches the same register through lib/staffauth.ts, so what counts
 * as a match, what a deactivated record is told, and what lands in the audit trail are decided in
 * one place for both. This route is the HTTP shape of it: the origin check, the security check, and
 * the throttle asked in that order. */
export async function POST(req: NextRequest) {
  const csrf = sameOriginJson(req);
  if (csrf) return NextResponse.json({ error: csrf }, { status: 403 });

  let body: { email?: unknown; password?: unknown; cfToken?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 160);
  const password = String(body.password ?? "").slice(0, 200);

  const ip = clientIp(req.headers);
  // Asked before the security check, because a Turnstile token is good for one use and somebody who
  // is already throttled should not spend theirs to be told so.
  if (staffThrottled(email, ip)) {
    return NextResponse.json({ error: "Too many attempts — try again in 15 minutes." }, { status: 429 });
  }
  if (!email || !password) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });

  // The same bot check the coordinator door has. A ward account opens one person's uniform record,
  // and a manager's opens the approvals queue, so leaving this to the in-memory throttles alone
  // meant a list of hospital addresses and enough patience was the whole attack.
  const cfErr = await verifyTurnstile(body.cfToken, ip);
  if (cfErr) return NextResponse.json({ error: cfErr }, { status: 400 });

  // `true`: this is the register's own door, so an address with no account here is a plain wrong
  // answer and is counted as one.
  const r = await signInStaff(email, password, ip, true);
  if (r.kind === "ok") return NextResponse.json({ ok: true, name: r.name });
  if (r.kind === "error") return NextResponse.json({ error: r.error }, { status: r.status });
  // Unreachable at this door: `none` is only returned when the caller asked not to be counted.
  return NextResponse.json({ error: "Email or password doesn’t match." }, { status: 401 });
}
