import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { sameOriginJson } from "@/lib/csrf";
import { allow, clientIp } from "@/lib/ratelimit";
import {
  decryptSecret, encryptSecret, hashRecoveryCode, newRecoveryCodes, newTotpSecret, otpauthUrl, totpVerify,
} from "@/lib/totp";
import { recordAuthEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

/* Turning a second factor on and off, for your own account only.
 *
 * Three steps rather than one, because a secret that is stored the moment it is generated leaves
 * an account half-enrolled if the person never finishes — and then their next sign-in asks for
 * codes from an app they never set up.
 *
 *   setup   — generate a secret and show the QR. Stored, but not yet in force.
 *   enable  — prove a code from it works, then switch it on and hand back recovery codes.
 *   disable — password required, because turning a factor off is a privileged act.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { totpEnabledAt: true } });
  const left = await prisma.recoveryCode.count({ where: { userId: user.id, usedAt: null } });
  return NextResponse.json({ enabled: !!u?.totpEnabledAt, enabledAt: u?.totpEnabledAt ?? null, recoveryLeft: left });
}

export async function POST(req: NextRequest) {
  const csrf = sameOriginJson(req);
  if (csrf) return NextResponse.json({ error: csrf }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const ip = clientIp(req.headers);
  if (!allow("2fa-manage:" + user.id, 30, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts — try again in a few minutes." }, { status: 429 });
  }

  // Turning a second factor on or off is one of the few changes to an account that leaves no trace
  // in the records themselves, so it is one of the few worth recording on its own.
  const actor = {
    facilityId: user.facilityId, userId: user.id,
    userName: `${user.first} ${user.last}`.trim() || user.email,
  };

  let body: { action?: unknown; code?: unknown; password?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const action = String(body.action ?? "");

  const u = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, passwordHash: true, totpSecret: true, totpEnabledAt: true },
  });
  if (!u) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (action === "setup") {
    if (u.totpEnabledAt) return NextResponse.json({ error: "Two-factor is already on for this account." }, { status: 400 });
    const secret = newTotpSecret();
    await prisma.user.update({ where: { id: u.id }, data: { totpSecret: encryptSecret(secret) } });
    const url = otpauthUrl(secret, u.email);
    // SVG, generated here rather than in the browser: it keeps a QR library out of the bundle that
    // ward phones download, and the secret never has to be handed to client-side code to render.
    const qr = await QRCode.toString(url, { type: "svg", margin: 1, width: 220, errorCorrectionLevel: "M" });
    recordAuthEvent(actor, "2fa:setup", ip);
    return NextResponse.json({ ok: true, secret, url, qr });
  }

  if (action === "enable") {
    if (u.totpEnabledAt) return NextResponse.json({ error: "Two-factor is already on." }, { status: 400 });
    const secret = decryptSecret(u.totpSecret);
    if (!secret) return NextResponse.json({ error: "Start the setup again." }, { status: 400 });
    if (!totpVerify(secret, String(body.code ?? ""))) {
      return NextResponse.json({ error: "That code isn't right. Use the current one from your app." }, { status: 400 });
    }
    const codes = newRecoveryCodes();
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: u.id }, data: { totpEnabledAt: new Date() } });
      await tx.recoveryCode.deleteMany({ where: { userId: u.id } });
      await tx.recoveryCode.createMany({ data: codes.map((c) => ({ userId: u.id, codeHash: hashRecoveryCode(c) })) });
    });
    recordAuthEvent(actor, "2fa:enable", ip);
    // The only time these are ever readable. They are stored hashed, so there is no second chance.
    return NextResponse.json({ ok: true, codes });
  }

  if (action === "disable") {
    if (!u.totpEnabledAt) return NextResponse.json({ ok: true });
    const pw = String(body.password ?? "");
    if (!pw || !(await bcrypt.compare(pw, u.passwordHash))) {
      return NextResponse.json({ error: "That password isn't right." }, { status: 401 });
    }
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: u.id }, data: { totpEnabledAt: null, totpSecret: "" } });
      await tx.recoveryCode.deleteMany({ where: { userId: u.id } });
    });
    recordAuthEvent(actor, "2fa:disable", ip);
    return NextResponse.json({ ok: true });
  }

  if (action === "regenerate") {
    if (!u.totpEnabledAt) return NextResponse.json({ error: "Two-factor isn't on." }, { status: 400 });
    const pw = String(body.password ?? "");
    if (!pw || !(await bcrypt.compare(pw, u.passwordHash))) {
      return NextResponse.json({ error: "That password isn't right." }, { status: 401 });
    }
    const codes = newRecoveryCodes();
    await prisma.$transaction(async (tx) => {
      await tx.recoveryCode.deleteMany({ where: { userId: u.id } });
      await tx.recoveryCode.createMany({ data: codes.map((c) => ({ userId: u.id, codeHash: hashRecoveryCode(c) })) });
    });
    recordAuthEvent(actor, "2fa:regenerate", ip);
    return NextResponse.json({ ok: true, codes });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
