import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const PAGE = 100;

/* The audit trail, read back.
 *
 * Admin only, and scoped to the caller's own facility by the query rather than by a filter the
 * client sends — the client never gets to say which facility it wants. Paged by cursor rather
 * than offset so a busy room's log doesn't shift under you as new rows land while you read.
 *
 * The cursor is (timestamp, id), not timestamp alone. Prisma stores DateTime at millisecond
 * precision, and two events sharing a millisecond is ordinary rather than exotic — two coordinators
 * saving at once, or two ops committed inside one transaction. A strict `at < cursor` dropped every
 * row that shared the last one's millisecond, so the log looked complete with an event missing from
 * it, which is the one failure an audit trail cannot have.
 */

/** `<iso>|<id>` — one opaque string, because the client only ever hands it straight back. */
function readCursor(raw: string | null): { at: Date; id: string } | null {
  if (!raw) return null;
  const cut = raw.lastIndexOf("|");
  const iso = cut === -1 ? raw : raw.slice(0, cut);
  const id = cut === -1 ? "" : raw.slice(cut + 1);
  if (Number.isNaN(Date.parse(iso))) return null;
  return { at: new Date(iso), id: id.slice(0, 40) };
}

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // SessionUser.role is the database enum ("ADMIN"), not the snapshot's display form ("Admin").
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const cursor = readCursor(req.nextUrl.searchParams.get("before"));

  const rows = await prisma.auditEvent.findMany({
    where: {
      facilityId: user.facilityId,
      // Everything strictly older, plus the rest of the millisecond we stopped in the middle of.
      ...(cursor ? { OR: [{ at: { lt: cursor.at } }, { at: cursor.at, id: { lt: cursor.id } }] } : {}),
    },
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: PAGE + 1,
    select: { id: true, at: true, userName: true, op: true, target: true },
  });

  const more = rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  const last = page[page.length - 1];
  return NextResponse.json({
    events: page.map((r) => ({ id: r.id, at: r.at.toISOString(), who: r.userName, op: r.op, target: r.target })),
    nextBefore: more && last ? `${last.at.toISOString()}|${last.id}` : null,
  });
}
