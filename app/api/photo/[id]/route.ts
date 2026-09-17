import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { parseDataUrl, readPhoto } from "@/lib/photostore";

export const dynamic = "force-dynamic";

/* Serves a stored capture or signature to a signed-in user of the same facility.
 *
 * Images live on disk now; rows written before that move still carry a base64 data URL, so both
 * are handled and old records keep working without a flag day. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;

  // Scoped by facility in the query: a photo id from another room is simply not found.
  const ph = await prisma.photo.findFirst({
    where: { id, facilityId: user.facilityId },
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
