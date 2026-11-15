import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { bagLines, linesSummary, reqLines } from "@/lib/staffdata";
import { decisionSummary, garmentCount } from "@/lib/staffreq";

export const dynamic = "force-dynamic";

/* The linen room's view of staff requests.
 *
 * Its own endpoint rather than part of the snapshot, for the same reason the audit trail is: this
 * grows without limit, and putting it in the snapshot would make every page in the app heavier
 * forever to serve one screen.
 */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  /* One person's requests, or the whole facility's.
   *
   * `?staff=` is how a staff record asks for its own order-form history. Without it that screen
   * pulled the facility's last 400 requests — every line, message and event on each — and kept the
   * handful belonging to one person, which is a large answer to a small question on a busy
   * register. Worse, that person's older requests fell off the end of the 400 and simply were not
   * on their record any more. Scoped, the ceiling is per person, and either way it is reported
   * back so a screen can say it has been reached rather than ending a history without a word.
   */
  const staffId = (req.nextUrl.searchParams.get("staff") || "").trim().slice(0, 64);
  const requestLimit = staffId ? 200 : 400;

  // One more row than is returned, so "there are older ones than these" is something we know
  // rather than something guessed from a full page.
  const found = await prisma.request.findMany({
    where: { facilityId: user.facilityId, ...(staffId ? { subjectId: staffId } : {}) },
    orderBy: { createdAt: "desc" },
    take: requestLimit + 1,
    include: {
      lines: { include: { item: { select: { item: true, gender: true, sizes: true } } }, orderBy: { sort: "asc" } },
      subject: { select: { first: true, last: true, num: true, dept: true } },
      messages: { orderBy: { createdAt: "asc" }, select: { id: true, fromStaff: true, authorName: true, body: true, createdAt: true } },
      events: { orderBy: { at: "asc" }, select: { id: true, label: true, meta: true, actorName: true, at: true } },
    },
  });
  const requests = found.slice(0, requestLimit);
  const moreRequests = found.length > requestLimit;

  const mapped = requests.map((r) => {
    /* Every line, and separately the ones that are actually a pick.
     *
     * The linen room needs both. `lines` is the record — a declined fleece still belongs on the
     * order the wearer will read — while `bag` is the work: what to take off the shelf, put in
     * the bag and hand across the counter. Picking from `lines` would put a garment the manager
     * refused into somebody's hands, so the two are never the same field. */
    const lines = reqLines(r.lines);
    const bag = bagLines(lines);
    return {
      id: r.id, code: r.code, status: r.status,
      staffId: r.subjectId,
      staffName: `${r.subject.first} ${r.subject.last}`.trim(),
      staffNum: r.subject.num, ward: r.subject.dept,
      lines, bag,
      summary: linesSummary(lines), garments: garmentCount(bag), lineCount: lines.length,
      decision: decisionSummary(lines),
      reason: r.reason, note: r.note,
      managerName: r.managerName,
      /* Who the approver is, not just how their name is spelled. A manager may now approve a
       * request raised for herself, and the only thing that can show that happened is this id
       * beside the subject's — the name on its own would have any screen comparing two spellings
       * of the same person, which is precisely how a self-approval goes unnoticed. */
      managerId: r.managerId,
      declineReason: r.declineReason,
      route: r.route, collectCode: r.collectCode, holdUntil: r.holdUntil,
      signerName: r.signerName, signerRole: r.signerRole,
      signedAt: r.signedAt?.toISOString() ?? null,
      claimedAt: r.claimedAt?.toISOString() ?? null,
      /* Who raised it, and which person on the register that is.
       *
       * The name alone is not enough for the queue screen: it builds the list of people a stranded
       * request can be handed to, and the one name certain to be refused is the person who raised
       * it — a manager asking for one of her own reports' garments is exactly why the request
       * escalated with nobody to approve it. Told only her name, the screen would have to match
       * her by spelling against a ward where two people share one, which is how the wrong person
       * drops out of a dropdown.
       *
       * Only the staff column, because only it can ever name somebody who could approve anything.
       * A raise at the counter is stamped with the coordinator's own account instead, and a
       * coordinator is not on the ward register at all; a wearer raising for herself is stamped
       * with neither. Both arrive here as null, which is right — neither is a name this queue
       * could offer. */
      raisedById: r.raisedByStaffId,
      raisedByName: r.raisedByName,
      createdAt: r.createdAt.toISOString(),
      decidedAt: r.decidedAt?.toISOString() ?? null,
      messages: r.messages.map((m) => ({ id: m.id, fromStaff: m.fromStaff, authorName: m.authorName, body: m.body, at: m.createdAt.toISOString() })),
      events: r.events.map((e) => ({ id: e.id, label: e.label, meta: e.meta, actorName: e.actorName, at: e.at.toISOString() })),
    };
  });

  /* Everything below is the linen room's queue screen — open disputes, the kit check, the
   * waitlist, damage nobody has handed back. A staff record asks for one person's order forms and
   * reads none of it, so a scoped ask stops here instead of running four more facility-wide
   * queries whose answers are thrown away. Those keys are absent from a scoped reply rather than
   * empty: an empty list would read as "there are none", which nobody asked and nobody knows. */
  if (staffId) return NextResponse.json({ requests: mapped, requestLimit, moreRequests });

  const [disputes, cycle, waiting, damage] = await Promise.all([
    prisma.recordDispute.findMany({
      where: { facilityId: user.facilityId, resolvedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { staff: { select: { first: true, last: true, num: true, dept: true } } },
    }),
    prisma.kitCheck.findFirst({
      where: { facilityId: user.facilityId, closedAt: null },
      orderBy: { openedAt: "desc" },
      select: { id: true, dueBy: true, openedAt: true, openedBy: true, _count: { select: { answers: true } } },
    }),
    prisma.waitlistEntry.findMany({
      where: { facilityId: user.facilityId, leftAt: null, acceptedAt: null },
      orderBy: { createdAt: "asc" },
      include: {
        staff: { select: { first: true, last: true, num: true, dept: true } },
        item: { select: { item: true, sizes: true } },
      },
    }),
    // Damage reports the counter has not yet taken the garment back for. Reporting damage and
    // asking for a replacement are two separate acts in the staff app, so a report can arrive with
    // no request behind it — and until this list existed nothing in the product ever showed one to
    // anybody, which made the Damage screen's promise ("it comes off your record when you hand it
    // in at the counter") a promise no screen could keep.
    prisma.damageReport.findMany({
      where: { facilityId: user.facilityId, handedInAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        staff: { select: { first: true, last: true, num: true, dept: true } },
        issue: { select: { sizeIndex: true, item: { select: { item: true, sizes: true } } } },
      },
    }),
  ]);

  /* What the open kit check has actually turned up.
   *
   * The cycle used to be reported to the linen room as a bare count of answers, which is the one
   * thing about it that doesn't matter: nobody opens a kit check to find out how many people
   * replied. The answers are the point — every one where somebody could not account for what the
   * record says they hold — and until this query existed no screen, export or report in the
   * product read them, so the whole cycle collected evidence into a table nothing looked at.
   *
   * Only the shortfalls, and only for the cycle still open. An answer that matches the record is
   * the record agreeing with itself; a closed cycle is history and belongs with the rest of it.
   */
  const answers = cycle
    ? await prisma.kitCheckAnswer.findMany({
        where: { kitCheckId: cycle.id, confirmed: { lt: prisma.kitCheckAnswer.fields.onRecord } },
        orderBy: { answeredAt: "desc" },
        take: 400,
        include: {
          staff: { select: { id: true, first: true, last: true, num: true, dept: true } },
          item: { select: { item: true, sizes: true } },
        },
      })
    : [];

  // DamageReport.requestId is a plain column rather than a relation, so the replacement's code is
  // looked up here. It is what the linen room actually needs: "torn, and she has asked for R-0042"
  // is a different job from "torn, and she has not".
  const replacementCodes = new Map<string, string>();
  const replacementIds = damage.map((d) => d.requestId).filter((x): x is string => !!x);
  if (replacementIds.length) {
    const reps = await prisma.request.findMany({
      where: { facilityId: user.facilityId, id: { in: replacementIds } },
      select: { id: true, code: true },
    });
    for (const r of reps) replacementCodes.set(r.id, r.code);
  }

  return NextResponse.json({
    requests: mapped, requestLimit, moreRequests,
    disputes: disputes.map((d) => ({
      id: d.id, body: d.body,
      staffName: `${d.staff.first} ${d.staff.last}`.trim(),
      staffNum: d.staff.num, ward: d.staff.dept,
      at: d.createdAt.toISOString(),
    })),
    cycle: cycle && {
      id: cycle.id, dueBy: cycle.dueBy, openedBy: cycle.openedBy,
      openedAt: cycle.openedAt.toISOString(), answers: cycle._count.answers,
    },
    shortfalls: answers.map((a) => ({
      id: a.id,
      staffId: a.staff.id,
      staffName: `${a.staff.first} ${a.staff.last}`.trim(),
      staffNum: a.staff.num, ward: a.staff.dept,
      item: a.item.item, size: String(a.item.sizes[a.sizeIndex] ?? a.sizeIndex),
      onRecord: a.onRecord, confirmed: a.confirmed, short: a.onRecord - a.confirmed,
      at: a.answeredAt.toISOString(),
    })),
    waiting: waiting.map((w) => ({
      id: w.id,
      staffName: `${w.staff.first} ${w.staff.last}`.trim(),
      staffNum: w.staff.num, ward: w.staff.dept,
      item: w.item.item, size: String(w.item.sizes[w.sizeIndex] ?? w.sizeIndex),
      since: w.createdAt.toISOString(),
      offeredAt: w.offeredAt?.toISOString() ?? null,
    })),
    damage: damage.map((d) => ({
      id: d.id, kind: d.kind, note: d.note, photoId: d.photoId,
      staffId: d.staffId,
      staffName: `${d.staff.first} ${d.staff.last}`.trim(),
      staffNum: d.staff.num, ward: d.staff.dept,
      // The garment comes off the Issue the report was raised against. That issue can be deleted
      // (a wipe, a correction) and the column is SetNull, so an older report may name no garment.
      item: d.issue ? d.issue.item.item : "",
      size: d.issue ? String(d.issue.item.sizes[d.issue.sizeIndex] ?? d.issue.sizeIndex) : "",
      requestCode: d.requestId ? replacementCodes.get(d.requestId) ?? "" : "",
      at: d.createdAt.toISOString(),
    })),
  });
}
