import { NextRequest, NextResponse } from "next/server";
import { currentStaff } from "@/lib/staffsession";
import { StaffOpError, runStaffOp } from "@/lib/staffops";
import { sameOriginJson } from "@/lib/csrf";
import { allow, clientIp } from "@/lib/ratelimit";
import { recordStaffAudit } from "@/lib/audit";
import { bumpRev } from "@/lib/ops";
import { report } from "@/lib/glitchtip";
import { prisma } from "@/lib/db";
import { resolveTerms } from "@/lib/terms";

export const dynamic = "force-dynamic";

/* The one door for everything a wearer, manager or ward clerk changes.
 *
 * Separate from /api/mutate, and reached only with a staff session. The two never share a handler:
 * a single endpoint that accepted either kind of caller would put the whole coordinator op table
 * one authorisation slip away from a wearer's phone.
 */
export async function POST(req: NextRequest) {
  const sess = await currentStaff();
  if (!sess) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const csrf = sameOriginJson(req);
  if (csrf) return NextResponse.json({ error: csrf }, { status: 403 });

  let body: { op?: string; payload?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const op = String(body.op || "");

  if (!allow("staff-mutate:" + sess.accountId, 120, 60 * 1000)) {
    return NextResponse.json({ error: "Slow down — too many changes in a minute." }, { status: 429 });
  }
  // Requests are the expensive ones: each sends an email to a manager. A tighter budget stops a
  // stuck retry loop turning into a mailbox full of the same approval.
  // damage.report and waitlist.accept raise a request (and mail the manager) through the same
  // path, so they draw on the same budget — otherwise the loop just picks a different door.
  if (["request.create", "damage.report", "waitlist.accept"].includes(op) && !allow("staff-request:" + sess.staffId, 12, 60 * 60 * 1000)) {
    const fac = await prisma.facility.findUnique({ where: { id: sess.facilityId }, select: { terms: true } });
    return NextResponse.json({ error: `That's a lot of requests in an hour — talk to the ${resolveTerms(fac?.terms).store}.` }, { status: 429 });
  }

  const ip = clientIp(req.headers);
  try {
    const payload = (body.payload || {}) as Record<string, unknown>;
    const result = await runStaffOp(sess, op, payload);
    // The same discipline as /api/mutate, and for the same reason: a uniform issued to a ward is
    // authorised here as often as it is in the linen room, and "who approved this" is the question
    // the trail exists to answer. Recorded only after the op actually succeeded.
    recordStaffAudit(sess, op, payload, ip, result);
    // Handed back so the screen that made this change does not bounce again when it next polls.
    const rev = await bumpRev(sess.facilityId);
    return NextResponse.json({ ok: true, result, rev });
  } catch (e) {
    if (e instanceof StaffOpError) return NextResponse.json({ error: e.message }, { status: e.status });
    report({ error: e, where: "server", url: "/api/staff/mutate", tags: { op } });
    console.error(`[staff mutate ${op}]`, e, "ip=", ip);
    return NextResponse.json({ error: "Something went wrong — nothing was saved." }, { status: 500 });
  }
}
