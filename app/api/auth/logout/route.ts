import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, currentUser } from "@/lib/session";
import { sameOriginJson } from "@/lib/csrf";
import { clientIp } from "@/lib/ratelimit";
import { recordAuthEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const csrf = sameOriginJson(req, false); if (csrf) return NextResponse.json({ error: csrf }, { status: 403 });
  // Read the session before dropping it, so the trail can say who left. An unauthenticated call
  // still clears the cookie and still answers ok — signing out must never fail.
  const user = await currentUser();
  await clearSessionCookie();
  if (user) {
    recordAuthEvent(
      { facilityId: user.facilityId, userId: user.id, userName: `${user.first} ${user.last}`.trim() || user.email },
      "auth:signout", clientIp(req.headers),
    );
  }
  return NextResponse.json({ ok: true });
}
