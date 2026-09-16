import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sameOriginJson } from "@/lib/csrf";
import { allow, clientIp } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/* Which door does this address belong at?
 *
 * The sign-in screen asks for the address first and only then shows a password box, a single
 * sign-on button or a pointer to the staff app. This answers the last of those: an address that
 * has no coordinator account but does have a staff-app account belongs in the staff app, and
 * telling the person so beats a "wrong password" they can never get past. It answers nothing about
 * coordinator accounts — a coordinator address and an unknown address get the same reply, so the
 * box cannot be used to test which addresses have one. Throttled per connection like the SSO lookup. */
export async function POST(req: NextRequest) {
  const csrf = sameOriginJson(req);
  if (csrf) return NextResponse.json({ error: csrf }, { status: 403 });
  if (!allow("lookup:" + clientIp(req.headers), 60, 15 * 60 * 1000)) return NextResponse.json({ staff: false });
  let body: { email?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 160);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ staff: false });
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (user) return NextResponse.json({ staff: false });
  const acc = await prisma.staffAccount.findUnique({ where: { email }, select: { id: true } });
  return NextResponse.json({ staff: !!acc });
}
