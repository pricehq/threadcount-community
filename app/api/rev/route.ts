import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { currentStaff } from "@/lib/staffsession";

export const dynamic = "force-dynamic";

/* "Has anything changed?", answered in one integer.
 *
 * Every screen in the product already knows how to reload itself — a mutation ends in
 * router.refresh(). What it could not know was that somebody ELSE had changed something, so a
 * phone left open on a ward showed whatever the catalogue looked like when it was opened, and a
 * coordinator adding a garment at the desk had to tell the counter to pull down to refresh.
 *
 * The obvious fix — poll the snapshot and diff it — is the expensive one: that is the facility's
 * catalogue, staff register, stock and history, re-read on a timer by every open device to learn,
 * almost always, that nothing happened. This returns the counter that the three mutating routes
 * bump, so the cost of asking is a primary-key lookup, and the cost of the real reload is paid only
 * when the number has actually moved.
 *
 * Both session kinds answer here. A coordinator at the desk and a wearer on a ward are watching the
 * same facility, and there is nothing in a bare revision number to keep apart — it says that
 * something changed, never what. Anyone with no session at all gets 401 rather than a number,
 * because even "this facility is busy" is not ours to hand out.
 */
export async function GET(_req: NextRequest) {
  const user = await currentUser();
  const facilityId = user?.facilityId || (await currentStaff())?.facilityId;
  if (!facilityId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const f = await prisma.facility.findUnique({ where: { id: facilityId }, select: { rev: true } });
  if (!f) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Never from a cache: a stale revision is indistinguishable from nothing having happened, which
  // is the one wrong answer this endpoint can give.
  return NextResponse.json({ rev: f.rev }, { headers: { "cache-control": "no-store" } });
}
