import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentStaff } from "@/lib/staffsession";
import { approvalQueue } from "@/lib/managerdata";
import ApprovalsScreen from "@/components/screens/Approvals";

export const dynamic = "force-dynamic";

export default async function MyApprovals() {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");
  // Whoever a request names decides it, team or no team. A request reaches somebody who manages
  // nobody more than one way: the linen room re-addresses one that arrived without an approver
  // (request.reassign only checks the person is on the register, not that anybody reports to
  // them), or a manager's last report is moved to somebody else while their request is still
  // awaiting. This is the same query Home counts for its "waiting on you" banner, and the banner
  // is the only door — the staff nav has no approvals tab — so turning these people away left a
  // colleague blocked behind a 404 nobody could clear.
  const rows = await approvalQueue(sess);
  if (!rows.length) {
    /* Nothing waiting. Two questions, not one.
     *
     * Does anybody active report to them — filtered exactly as the layout, teamTabs() and
     * wardData() filter it, so the screen and the tab cannot disagree — and has anything ever been
     * addressed to them. The second question is what keeps somebody on the screen they are
     * standing on: approving from the queue refreshes this page, so an approver with no reports
     * who cleared their last request was thrown onto "That page isn't here." by the very tap that
     * emptied it. Having once been an approver, an empty queue is a state for them.
     *
     * Somebody who is neither still gets nothing rather than an empty queue: an empty approvals
     * screen implies they might one day have a team, which is a question for the linen room and
     * not something this app should imply an answer to. */
    const [reports, everAddressed] = await Promise.all([
      prisma.staff.count({ where: { facilityId: sess.facilityId, managerId: sess.staffId, inactive: false } }),
      prisma.request.count({ where: { facilityId: sess.facilityId, managerId: sess.staffId } }),
    ]);
    if (!reports && !everAddressed) notFound();
  }
  // Which of the waiting requests are for the manager themselves. Some of these now are — the
  // rule against approving your own uniform has been relaxed for the case the owner named — and
  // the screen sets those apart so nobody approves their own by accident and works out later that
  // they did. Whether a self-approval is allowed at all is the server's call and is not re-tested
  // here; this only asks the database which of the rows it already let through are the reader's
  // own, by the request's subject, which is the same fact the record is written from. The rows are
  // scoped to this manager and to `awaiting` already, so the lookup is over a handful of ids.
  const ownIds = rows.length
    ? (
        await prisma.request.findMany({
          where: { id: { in: rows.map((r) => r.id) }, subjectId: sess.staffId },
          select: { id: true },
        })
      ).map((r) => r.id)
    : [];
  return <ApprovalsScreen rows={rows} ownIds={ownIds} />;
}
