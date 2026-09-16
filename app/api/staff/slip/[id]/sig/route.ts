import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentStaff } from "@/lib/staffsession";
import { parseDataUrl, readPhoto } from "@/lib/photostore";

export const dynamic = "force-dynamic";

/* The signature on one of a staff member's own signed slips, for the staff app.
 *
 * Only the caller's own slip, and only one the counter sent to their app (toStaff). Any other id is
 * simply not found, whoever's it is. Served with the same headers as /api/photo/[id]. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const sess = await currentStaff();
  if (!sess) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;

  const slip = await prisma.slip.findFirst({
    where: { id: String(id || "").slice(0, 40), staffId: sess.staffId, facilityId: sess.facilityId, toStaff: true },
    select: { sigId: true, facilityId: true },
  });
  if (!slip?.sigId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ph = await prisma.photo.findFirst({
    where: { id: slip.sigId, facilityId: slip.facilityId },
    select: { data: true, path: true, mime: true },
  });
  if (!ph) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let mime = ph.mime;
  let bytes: Buffer | null = null;
  if (ph.path) {
    bytes = await readPhoto(ph.path);
  } else if (ph.data) {
    const parsed = parseDataUrl(ph.data);
    if (parsed) { mime = parsed.mime; bytes = parsed.bytes; }
  }
  if (!bytes) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!/^image\/(jpeg|png)$/.test(mime)) return NextResponse.json({ error: "Bad photo" }, { status: 500 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": mime,
      "cache-control": "private, max-age=3600",
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
    },
  });
}
