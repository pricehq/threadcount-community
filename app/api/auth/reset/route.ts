import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { allow, clientIp } from "@/lib/ratelimit";
import { sameOriginJson } from "@/lib/csrf";
import { pwVersion, setSessionCookie } from "@/lib/session";
import { mintTicket } from "@/lib/twofactor";
import { hashResetToken } from "@/lib/reset";
import { recordAuthEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

const MIN_PASSWORD = 8;

/* Complete a password reset.
 *
 * Changing the hash invalidates every existing session for that user on its own — the session
 * cookie carries a version derived from the password hash — so a reset also kicks out whoever
 * prompted it, which is the behaviour you want if the reason was a shared or stolen password. */
export async function POST(req: NextRequest) {
  const csrf = sameOriginJson(req);
  if (csrf) return NextResponse.json({ error: csrf }, { status: 403 });

  const ip = clientIp(req.headers);
  if (!allow("reset-ip:" + ip, 100, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts — try again later." }, { status: 429 });
  }

  let body: { token?: unknown; password?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const token = String(body.token ?? "").trim().slice(0, 400);
  const password = String(body.password ?? "");

  if (!token) return NextResponse.json({ error: "That link is incomplete. Ask for a new one." }, { status: 400 });
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json({ error: `Use at least ${MIN_PASSWORD} characters.` }, { status: 400 });
  }

  // Looked up by hash, so the raw token never has to be compared against stored material.
  const row = await prisma.passwordReset.findUnique({
    where: { tokenHash: hashResetToken(token) },
    select: {
      id: true, userId: true, expiresAt: true, usedAt: true,
      user: { select: { inactive: true, passwordHash: true, totpEnabledAt: true, facilityId: true, first: true, last: true, email: true } },
    },
  });

  const dead = !row || row.usedAt || row.expiresAt.getTime() < Date.now() || row.user.inactive;
  if (dead) {
    return NextResponse.json({ error: "That link has expired or has already been used. Ask for a new one." }, { status: 400 });
  }

  const hash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (tx) => {
    // Consume the token in the same write as the password change, so a double submit can't set the
    // password twice or leave a live token behind.
    const consumed = await tx.passwordReset.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) throw new Error("token already consumed");
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash: hash } });
    // Any other outstanding requests for this account die with it.
    await tx.passwordReset.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: new Date() } });
  }).catch(() => null);

  const fresh = await prisma.user.findUnique({ where: { id: row.userId }, select: { passwordHash: true } });
  if (!fresh || fresh.passwordHash !== hash) {
    return NextResponse.json({ error: "That link has expired or has already been used. Ask for a new one." }, { status: 400 });
  }

  const actor = {
    facilityId: row.user.facilityId,
    userId: row.userId,
    userName: [row.user.first, row.user.last].filter(Boolean).join(" ").trim() || row.user.email,
  };

  // A second factor is a second factor here too. Control of the mailbox is one proof, and on an
  // account with TOTP the front door refuses to open on one proof — so this door must not either,
  // or resetting the password would be the supported way around the authenticator, and the new
  // password would then be enough to turn it off for good.
  //
  // The same five-minute ticket the sign-in screen uses, accepted by the same endpoint: nothing new
  // to keep, nothing new to get wrong.
  if (row.user.totpEnabledAt) {
    recordAuthEvent(actor, "auth:password.reset", ip, "email-link");
    return NextResponse.json({ need2fa: true, ticket: mintTicket(row.userId, pwVersion(hash)) });
  }

  // Otherwise sign them straight in: they have just proven control of the mailbox and chosen a
  // password, and making them type it again immediately is friction with no security value.
  await setSessionCookie(row.userId, hash);
  recordAuthEvent(actor, "auth:password.reset", ip, "email-link");
  recordAuthEvent(actor, "auth:signin", ip, "reset");
  return NextResponse.json({ ok: true });
}
