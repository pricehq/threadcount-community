import { NextRequest, NextResponse } from "next/server";
import { sameOriginJson } from "@/lib/csrf";
import { allow, clientIp } from "@/lib/ratelimit";
import { readApprovalToken } from "@/lib/approvallink";
import { StaffOpError, decideRequest } from "@/lib/staffops";
import { recordFor } from "@/lib/audit";
import { bumpRev } from "@/lib/ops";

export const dynamic = "force-dynamic";

/* Deciding a request from the emailed link, without signing in.
 *
 * This is a POST and only a POST. The link in the email is a GET that renders /my/approve, and the
 * decision is made from that page — because corporate mail scanners and link-preview crawlers
 * fetch every URL in every message, and a GET that approved a uniform request would be approved by
 * the mail gateway before the manager ever saw it.
 *
 * The decision itself is decideRequest()'s, not this route's. A request now carries a line per
 * garment, and settling it means settling every line and then rolling the request up from them;
 * an approval made here that moved only the request would leave every line `awaiting`, so the
 * linen room's bag would come out empty and the wearer's order would show no decision at all.
 * There is no room on this page for a garment-by-garment answer — there is no signed-in person to
 * check one against — so it takes the whole-request shorthand, `approveAll`, which is the reason
 * that argument exists.
 *
 * Single use falls out of the state machine rather than a table of spent tokens: decideRequest's
 * update is conditional on the request still being `awaiting`, so the approve link and the decline
 * link in the same email both stop working the moment either is used.
 */
export async function POST(req: NextRequest) {
  const csrf = sameOriginJson(req);
  if (csrf) return NextResponse.json({ error: csrf }, { status: 403 });

  const ip = clientIp(req.headers);
  if (!allow("staff-decide:" + ip, 200, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts — try again in a few minutes." }, { status: 429 });
  }

  let body: { token?: unknown; action?: unknown; reason?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const claim = readApprovalToken(String(body.token ?? ""));
  if (!claim) return NextResponse.json({ error: "That link has expired. Open the app and use the approvals queue." }, { status: 400 });

  const action = String(body.action ?? "");
  if (action !== "approve" && action !== "decline") return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  let done: Awaited<ReturnType<typeof decideRequest>>;
  try {
    done = await decideRequest({
      requestId: claim.rid,
      managerId: claim.mid,
      approveAll: action === "approve",
      reason: body.reason,
    });
  } catch (e) {
    if (!(e instanceof StaffOpError)) throw e;
    /* The refusals are worded for somebody standing in their mail client, not in the app.
     *
     * A 403 here is decideRequest re-reading the register and finding the manager off it, or the
     * wearer off it — the check that makes a fortnight-old token in a mailbox that has since been
     * closed or handed on safe. Neither the sacked manager nor a stranger reading their mail is
     * told which of the two it was; "ask the linen room" is where that conversation belongs.
     *
     * A 409 is the link already spent, and keeps the `already` flag the page reads to show the
     * decision that was made rather than an error. */
    if (e.status === 403) return NextResponse.json({ error: "That link is no longer valid — ask the linen room." }, { status: 403 });
    if (e.status === 404) return NextResponse.json({ error: "That request is no longer there." }, { status: 404 });
    if (e.status === 409) return NextResponse.json({ error: "That request has already been decided.", already: true }, { status: 409 });
    return NextResponse.json({ error: e.message }, { status: e.status });
  }

  // Filed under the manager's own Staff id, exactly as the in-app approval is, so the log names
  // the same person either way; the op says which door the decision came through, because "an
  // email link, from an address we can't see" is part of the answer to who authorised this.
  recordFor(
    { facilityId: done.facilityId, userId: claim.mid, userName: done.managerName },
    done.status === "accepted" ? "staff:request.approve.email" : "staff:request.decline.email",
    { id: claim.rid }, ip,
  );

  // The third door into the facility's data, so the third place the revision has to move: a manager
  // approving from their mail is exactly the change the linen room's screen is waiting to see.
  await bumpRev(done.facilityId);

  return NextResponse.json({ ok: true, status: done.status, notified: done.notified });
}
