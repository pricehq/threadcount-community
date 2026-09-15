import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentStaff } from "@/lib/staffsession";
import { homeData } from "@/lib/staffdata";
import { fmtDate } from "@/lib/compute";
import { ROUTED_TO_ROUND, dueOnWard } from "@/lib/staffreq";
import HomeScreen from "@/components/screens/Home";

export const dynamic = "force-dynamic";

export default async function MyHome() {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");

  const data = await homeData(sess);
  // A manager's queue and a clerk's trolley are counts here, not lists: Home answers "is anything
  // waiting for me?" and then gets out of the way. Both are skipped entirely for the people the
  // flags don't apply to, which is nearly everyone.
  const [approvals, reports, roundBags, cycle] = await Promise.all([
    prisma.request.count({ where: { managerId: sess.staffId, status: "awaiting" } }),
    /* Whether anybody reports to them, which is the same question /my/raise answers with a 404.
     * Not the same as having approvals waiting: a manager whose team has asked for nothing this
     * month still needs the door, and this is the only way in to it. */
    prisma.staff.count({ where: { managerId: sess.staffId, inactive: false } }),
    data.wardDesk && data.ward
      // The ward the trolley left the bag on, off the timeline — the same fence /my/round and
      // round.sign use (see roundWard() in lib/staffreq.ts). Counting on the wearer's current ward
      // made this badge disagree with the screen it opens the moment anybody transferred wards
      // mid-round: a bag counted here and missing from the round, or the other way about.
      ? prisma.request.count({
          where: {
            facilityId: sess.facilityId, status: "round",
            events: { some: { label: ROUTED_TO_ROUND, meta: dueOnWard(data.ward) } },
          },
        })
      : Promise.resolve(0),
    prisma.kitCheck.findFirst({
      where: { facilityId: sess.facilityId, closedAt: null },
      orderBy: { openedAt: "desc" },
      select: { id: true, dueBy: true },
    }),
  ]);

  // Only prompt for a cycle they still owe answers to — someone who finished last week should not
  // be nagged for the rest of the month.
  let kitCheckDue: string | null = null;
  if (cycle) {
    const [held, answered] = await Promise.all([
      // handedIn as well as returnedDate: a garment handed back at the counter never gets marked
      // returned, so counting on returnedDate alone nags somebody for a kit check about uniform
      // they gave back months ago. Every equivalent query in lib/ reads both.
      prisma.issue.count({ where: { staffId: sess.staffId, returnedDate: null, handedIn: null } }),
      prisma.kitCheckAnswer.count({ where: { kitCheckId: cycle.id, staffId: sess.staffId } }),
    ]);
    if (held > 0 && answered === 0) kitCheckDue = fmtDate(cycle.dueBy);
  }

  return (
    <HomeScreen
      data={data}
      approvals={approvals}
      roundBags={roundBags}
      kitCheckDue={kitCheckDue}
      canRaiseForTeam={reports > 0}
    />
  );
}
