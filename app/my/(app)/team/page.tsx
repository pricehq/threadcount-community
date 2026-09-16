import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentStaff } from "@/lib/staffsession";
import { ROUTED_TO_ROUND, dueOnWard, teamTabs } from "@/lib/staffreq";

export const dynamic = "force-dynamic";

/* The Team tab's own address. It has no screen: it works out which tab this reader has and sends
 * them to the first one, so the tab bar can point at one URL for a manager, a ward desk, and
 * somebody who is both.
 *
 * The three facts are read here rather than passed from the client for the same reason the layout
 * reads them: "am I a manager" is the answer to "does anybody name me as theirs", and the browser
 * is the wrong party to ask. They are the same three the layout counts, through the same
 * teamTabs() the shell draws its tabs with — a tab that appeared here and was refused by its own
 * route would be worse than no tab at all.
 *
 * A refusal, not an explanation, for somebody who is none of the three: a dead end that says why
 * confirms the screen exists.
 */
export default async function MyTeam() {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");

  const staff = await prisma.staff.findUniqueOrThrow({
    where: { id: sess.staffId },
    select: { dept: true, wardDesk: true },
  });

  const [reports, approvals, roundBags] = await Promise.all([
    prisma.staff.count({ where: { managerId: sess.staffId, inactive: false } }),
    // Requests ADDRESSED to them, whether or not anybody reports to them: the linen room can
    // re-address one to somebody who manages nobody, and that person has a queue and so has a tab.
    // Same predicate as approvalQueue() and as the layout's badge.
    prisma.request.count({ where: { managerId: sess.staffId, status: "awaiting" } }),
    // A blank ward is not a ward — the round and round.sign are fenced the same way.
    staff.wardDesk && staff.dept
      ? prisma.request.count({
          where: {
            facilityId: sess.facilityId, status: "round",
            events: { some: { label: ROUTED_TO_ROUND, meta: dueOnWard(staff.dept) } },
          },
        })
      : Promise.resolve(0),
  ]);

  const tabs = teamTabs(
    // The ward travels with the desk flag, because the round is one ward's bags and a blank ward is
    // not a ward — the same fence roundData() and round.sign apply.
    { isManager: reports > 0, wardDesk: staff.wardDesk, ward: staff.dept },
    { approvals, round: roundBags },
  );
  if (!tabs.length) notFound();
  redirect(tabs[0].href);
}
