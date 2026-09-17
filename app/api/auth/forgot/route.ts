import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { allow, clientIp, fail, over } from "@/lib/ratelimit";
import { sameOriginJson } from "@/lib/csrf";
import { verifyTurnstile } from "@/lib/turnstile";
import { sendTo, transactionalConfigured } from "@/lib/mail";
import { RESET_TTL_MS, newResetToken, resetEmail, resetUrl } from "@/lib/reset";

export const dynamic = "force-dynamic";

/* Request a password reset.
 *
 * Before this existed a facility whose only admin forgot their password was locked out for good —
 * the sign-in screen told them to ask an admin, and they were the admin. Deleting the last admin
 * deletes the whole facility, so there was no way back in at all.
 *
 * The response is identical whether or not the address has an account. Anything else turns this
 * into a way to ask "does this hospital use ThreadCount, and is this person a coordinator there?"
 */
export async function POST(req: NextRequest) {
  const csrf = sameOriginJson(req);
  if (csrf) return NextResponse.json({ error: csrf }, { status: 403 });

  const ip = clientIp(req.headers);
  let body: { email?: unknown; cfToken?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 160);

  // A slow ceiling per IP, so one machine can't walk a staff list to find out which addresses exist
  // by watching how long each request takes. The per-address ceiling deliberately lives further
  // down, past the bot check — see the note beside it.
  if (!allow("forgot-ip:" + ip, 60, 60 * 60 * 1000)) {
    return NextResponse.json({ ok: true });
  }

  const cfErr = await verifyTurnstile(body.cfToken, ip);
  if (cfErr) return NextResponse.json({ error: cfErr }, { status: 400 });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ ok: true });

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, first: true, inactive: true, ssoBreakGlass: true, facility: { select: { ssoRequired: true } } } });
  // A facility that requires single sign-on has no password door for most of its people, so a
  // reset link would be a way round its identity provider. Break-glass admins keep theirs. The
  // answer to the caller is the same either way.
  const ssoOnly = !!user && user.facility.ssoRequired && !user.ssoBreakGlass;
  if (user && !user.inactive && !ssoOnly) {
    // The per-address ceiling counts mail actually sent, not requests received, and it is only
    // consulted once the bot check has passed. Spent on requests, it handed a stranger a way to
    // hold a facility's only coordinator out of their own account: four anonymous posts with no
    // Turnstile token filled the bucket, and every later attempt by the coordinator was answered
    // with "a reset link is on its way" and no mail. Counted this way the only way to exhaust the
    // budget is to have four reset mails delivered to that same inbox, so whoever forgot their
    // password always has a working link waiting for them.
    const mailKey = "forgot-email:" + email;
    if (over(mailKey, 4, 60 * 60 * 1000)) {
      console.warn("[forgot] four reset mails already sent this hour — suppressing another for user", user.id);
    } else {
      const { token, tokenHash } = newResetToken();
      await prisma.$transaction(async (tx) => {
        // Asking again supersedes anything outstanding, so a forwarded older email goes dead.
        await tx.passwordReset.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        await tx.passwordReset.create({
          data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + RESET_TTL_MS), requestIp: ip },
        });
      });
      const { subject, text, html } = resetEmail(user.first, resetUrl(token));
      const sent = await sendTo(email, subject, text, html);
      // Only a mail that left the building counts. A send that failed gave the coordinator nothing,
      // so charging them for it would shut them out for an hour over a mail outage.
      if (sent) fail(mailKey, 60 * 60 * 1000);
      else console.error("[forgot] reset requested but mail could not be sent for user", user.id);
    }
  }

  // Told to the caller regardless, so the answer carries no information about the address.
  return NextResponse.json({ ok: true, mail: transactionalConfigured() });
}
