import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { REMEMBER_MAX_AGE, pwVersion, setSessionCookie } from "@/lib/session";
import { sameOriginJson } from "@/lib/csrf";
import { allow, clientIp } from "@/lib/ratelimit";
import { decryptSecret, hashRecoveryCode, totpVerify } from "@/lib/totp";
import { TRUST_COOKIE, TRUST_TTL_MS, mintTrust, readTicket } from "@/lib/twofactor";
import { recordAuthEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

/* Second step of sign-in: the code from the authenticator, or one recovery code.
 *
 * Rate limited hard. A six-digit code is one in a million per guess, which is only meaningful if
 * guessing is expensive — unthrottled, a million tries is minutes of work. */
export async function POST(req: NextRequest) {
  const csrf = sameOriginJson(req);
  if (csrf) return NextResponse.json({ error: csrf }, { status: 403 });

  const ip = clientIp(req.headers);
  let body: { ticket?: unknown; code?: unknown; trust?: unknown; remember?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const t = readTicket(String(body.ticket ?? ""));
  if (!t) return NextResponse.json({ error: "That sign-in has expired. Start again." }, { status: 400 });

  // Per account and per address: one stolen ticket can't be brute-forced, and one machine can't
  // work through several accounts at once.
  if (!allow("2fa-user:" + t.uid, 10, 15 * 60 * 1000) || !allow("2fa-ip:" + ip, 300, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts — try again in a few minutes." }, { status: 429 });
  }

  const u = await prisma.user.findUnique({
    where: { id: t.uid },
    select: { id: true, facilityId: true, email: true, first: true, last: true, role: true, inactive: true, passwordHash: true, totpSecret: true, totpEnabledAt: true },
  });
  if (!u || u.inactive || !u.totpEnabledAt) {
    return NextResponse.json({ error: "That sign-in has expired. Start again." }, { status: 400 });
  }
  // The password changed between the two steps — the ticket is stale for the same reason a session
  // would be.
  if (pwVersion(u.passwordHash) !== t.pv) {
    return NextResponse.json({ error: "That sign-in has expired. Start again." }, { status: 400 });
  }

  const raw = String(body.code ?? "").trim();
  const secret = decryptSecret(u.totpSecret);
  let good = !!secret && totpVerify(secret, raw);
  let usedRecovery = false;

  if (!good && raw.replace(/[^A-Za-z0-9]/g, "").length >= 10) {
    // A recovery code. Single use: consumed in the same conditional update that finds it, so two
    // simultaneous attempts can't both spend it.
    const hash = hashRecoveryCode(raw);
    const hit = await prisma.recoveryCode.findFirst({ where: { userId: u.id, codeHash: hash, usedAt: null }, select: { id: true } });
    if (hit) {
      const consumed = await prisma.recoveryCode.updateMany({ where: { id: hit.id, usedAt: null }, data: { usedAt: new Date() } });
      good = consumed.count === 1;
      usedRecovery = good;
    }
  }

  if (!good) return NextResponse.json({ error: "That code isn't right. Try the current one from your app." }, { status: 401 });

  await setSessionCookie(u.id, u.passwordHash, false, body.remember === true ? REMEMBER_MAX_AGE : undefined);
  // "Trust this computer": only ever set here, after a real code, never from the password step.
  if (body.trust === true) {
    const jar = await cookies();
    jar.set(TRUST_COOKIE, mintTrust(u.id, pwVersion(u.passwordHash)), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth", maxAge: Math.floor(TRUST_TTL_MS / 1000) });
  }
  // How they got in matters more here than anywhere else: a recovery code means the phone is gone,
  // and a run of them means something else is going on.
  recordAuthEvent(
    { facilityId: u.facilityId, userId: u.id, userName: `${u.first} ${u.last}`.trim() || u.email },
    "auth:signin", ip, usedRecovery ? "recovery" : "totp",
  );
  const left = await prisma.recoveryCode.count({ where: { userId: u.id, usedAt: null } });
  return NextResponse.json({ ok: true, name: `${u.first} ${u.last}`, role: u.role, usedRecovery, recoveryLeft: left });
}
