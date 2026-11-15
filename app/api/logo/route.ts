import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Serves the signed-in user's facility logo (stored as a data URL). */
export async function GET() {
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const fac = await prisma.facility.findUnique({ where: { id: user.facilityId }, select: { logoData: true } });
  const m = /^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(fac?.logoData || "");
  if (!m) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(m[2], "base64"), { headers: { "content-type": m[1], "cache-control": "private, no-cache", "x-content-type-options": "nosniff", "content-security-policy": "sandbox" } });
}
