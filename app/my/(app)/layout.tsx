import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { addDays, facilityDate, facilityToday } from "@/lib/compute";
import { currentStaff } from "@/lib/staffsession";
import { ROUTED_TO_ROUND, dueOnWard } from "@/lib/staffreq";
import { resolveTerms } from "@/lib/terms";
import { DECLINE_HEADLINE_DAYS } from "@/lib/staffdata";
import { StaffProvider, type StaffCounts, type StaffMe } from "@/lib/staffclient";
import { OfflineBar } from "@/components/staffui";
import { MToastProvider } from "@/components/m";

export const dynamic = "force-dynamic";

/* Everything that needs a signed-in staff member.
 *
 * The role flags are resolved here, once, from the database rather than trusted from the client:
 * "am I a manager" is the answer to "does anybody name me as theirs", and a screen that asked the
 * browser that question would be asking the wrong party.
 *
 * The two badge counts are resolved here too, for the same reason and one more: they are read by
 * the tab bar, which is drawn on five screens, and a count per screen is five queries and five
 * chances to disagree with the list it opens.
 */
export default async function StaffAppLayout({ children }: { children: React.ReactNode }) {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");

  const staff = await prisma.staff.findUniqueOrThrow({
    where: { id: sess.staffId },
    select: { first: true, last: true, num: true, dept: true, wardDesk: true, managerId: true, facility: { select: { name: true, timezone: true, terms: true } } },
  });
  const today = facilityToday(staff.facility.timezone);
  const declinedFrom = addDays(today, -DECLINE_HEADLINE_DAYS);

  const [reports, needing, declined, approvals, roundBags] = await Promise.all([
    prisma.staff.count({ where: { managerId: sess.staffId, inactive: false } }),
    /* The Orders badge: their own requests that need them.
     *
     * ⛔ Deliberately NOT `NEEDS_STAFF` from lib/staffreq.ts, which also contains `declined`.
     * `declined` is terminal — nothing the person does clears it — so a badge built on that set
     * never goes back to nothing: one refusal in March and the tab wears a number for ever, with
     * no way to put it down. NEEDS_STAFF keeps its own job (the accent edge on a row, where a
     * decline genuinely is something to look at); it is the wrong set for a badge. */
    prisma.request.count({ where: { subjectId: sess.staffId, status: { in: ["awaiting", "ready", "round"] } } }),
    // A decline is news for a week, exactly as long as Home's live card keeps it — the same window
    // from the same constant, so the badge and the card cannot tell two stories.
    prisma.request.findMany({
      where: { subjectId: sess.staffId, status: "declined" },
      orderBy: { decidedAt: "desc" }, take: 10,
      select: { decidedAt: true, createdAt: true },
    }),
    /* The Team badge, half one: requests ADDRESSED to this person, whether or not anybody reports
     * to them. The same predicate approvalQueue() uses, so the badge and the list cannot drift.
     *
     * ⛔ Never gated on "is a manager". A request reaches somebody who manages nobody two ordinary
     * ways — the linen room re-addresses one that arrived without an approver, or a manager's last
     * report moves away while their request is still awaiting — and gating here would take away
     * their badge, their tab and their banner at once, leaving a colleague blocked behind a screen
     * nobody can reach. app/my/(app)/approvals/page.tsx carries the same note. */
    prisma.request.count({ where: { managerId: sess.staffId, status: "awaiting" } }),
    // Half two, for a ward desk: the bags sitting on their ward waiting to be signed for. The ward
    // the trolley left them on, off the timeline — the same fence /my/round and round.sign use.
    staff.wardDesk && staff.dept
      ? prisma.request.count({
          where: {
            facilityId: sess.facilityId, status: "round",
            events: { some: { label: ROUTED_TO_ROUND, meta: dueOnWard(staff.dept) } },
          },
        })
      : Promise.resolve(0),
  ]);

  const freshDeclines = declined.filter((r) => facilityDate(r.decidedAt ?? r.createdAt, staff.facility.timezone) >= declinedFrom).length;

  const me: StaffMe = {
    staffId: sess.staffId,
    name: `${staff.first} ${staff.last}`.trim(),
    first: staff.first,
    num: staff.num,
    ward: staff.dept,
    facility: staff.facility.name,
    terms: resolveTerms(staff.facility.terms),
    // Resolved here for the same reason the role flags are: it is the facility's answer, not the
    // phone's, and a device set to the wrong zone must not change what a ward round is told.
    tz: staff.facility.timezone,
    isManager: reports > 0,
    wardDesk: staff.wardDesk,
    hasManager: !!staff.managerId,
  };

  const counts: StaffCounts = {
    orders: needing + freshDeclines,
    team: approvals + roundBags,
    approvals,
    round: roundBags,
  };

  return (
    <StaffProvider me={me} counts={counts}>
      {/* Drawn once, above every screen's own app bar. The mockup puts it under the bar; doing
          that would mean threading it through sixteen screens that each compose their own. */}
      <OfflineBar />
      {/* The toast host. `useToast()` falls back to a no-op with no provider above it, which is
          what /my had: a disabled 64px bar carries `offReason` — "Pick an item, a size and a
          reason" — and tapping it said nothing at all. The counter app mounts the same provider
          for the same purpose; this is a read-only use of components/m.tsx. */}
      <MToastProvider>{children}</MToastProvider>
    </StaffProvider>
  );
}
