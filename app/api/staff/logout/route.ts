import { NextRequest, NextResponse } from "next/server";
import { sameOriginJson } from "@/lib/csrf";
import { clearStaffCookie, currentStaff } from "@/lib/staffsession";
import { clientIp } from "@/lib/ratelimit";
import { recordAuthEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const csrf = sameOriginJson(req);
  if (csrf) return NextResponse.json({ error: csrf }, { status: 403 });
  // Read the session before dropping it, so the trail can say who left. Signing out still succeeds
  // when there was nothing to sign out of.
  const sess = await currentStaff();
  await clearStaffCookie();
  if (sess) {
    recordAuthEvent(
      { facilityId: sess.facilityId, userId: sess.staffId, userName: `${sess.first} ${sess.last}`.trim() || sess.email },
      "staff:signout", clientIp(req.headers),
    );
  }
  return NextResponse.json({ ok: true });
}
