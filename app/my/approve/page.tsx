import { prisma } from "@/lib/db";
import { readApprovalToken } from "@/lib/approvallink";
import { linesSummary, reqLines } from "@/lib/staffdata";
import ApproveByLink from "@/components/screens/ApproveByLink";
import { MyShell, h1, kicker, lead } from "@/components/my";

export const dynamic = "force-dynamic";
export const metadata = { title: "Approve a uniform request", robots: { index: false, follow: false } };

/* The page an emailed approve/decline link opens.
 *
 * Deliberately outside (app): a manager standing in a corridor with an email open should not have
 * to sign in to unblock somebody. The token is the authorisation, and rendering the request is all
 * this page does — the decision is a POST from here, never from the link itself.
 */
export default async function ApprovePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const claim = readApprovalToken(t);

  if (!claim) {
    return (
      <MyShell>
        <div style={kicker}>ThreadCount</div>
        <h1 style={h1}>That link has expired.</h1>
        <p style={lead}>
          Approval links last a fortnight and stop working once a request has been decided. Open the
          app and use your approvals queue instead.
        </p>
      </MyShell>
    );
  }

  const r = await prisma.request.findFirst({
    where: { id: claim.rid, managerId: claim.mid },
    include: {
      lines: { include: { item: { select: { item: true, gender: true, sizes: true } } }, orderBy: { sort: "asc" } },
      subject: { select: { first: true, last: true, group: true, num: true, dept: true, inactive: true } },
      facility: { select: { name: true } },
    },
  });

  if (!r) {
    return (
      <MyShell>
        <div style={kicker}>ThreadCount</div>
        <h1 style={h1}>That request is gone.</h1>
        <p style={lead}>It may have been withdrawn, or the staff member removed from the register.</p>
      </MyShell>
    );
  }

  /* The same re-check the POST does, and for the same reason — but this page has its own thing to
   * protect. It renders somebody's name, staff number, ward and role, and a token lives for a
   * fortnight in a mailbox that may since have been closed or handed on. Refusing the decision but
   * still showing the personal details behind it would be a refusal in name only. */
  const mgr = await prisma.staff.findFirst({
    where: { id: claim.mid, facilityId: r.facilityId, inactive: false },
    select: { id: true },
  });
  if (!mgr || r.subject.inactive) {
    return (
      <MyShell>
        <div style={kicker}>ThreadCount</div>
        <h1 style={h1}>That link has expired.</h1>
        <p style={lead}>
          You&rsquo;re no longer on the register at this facility, or the person who asked isn&rsquo;t.
          Ask the linen room.
        </p>
      </MyShell>
    );
  }

  /* Whose uniform this is.
   *
   * A manager may now decide a request they are the subject of. The approvals queue sets those
   * apart under their own heading, and this page is the one door that never goes through it: a
   * link from a mailbox is the only way a manager can approve their own uniform with nothing on
   * the screen telling them that is what they are doing. Whether a self-approval is allowed at
   * all is the server's call and is not re-tested here — this only asks who the request is for,
   * by its own subject, which is the fact the timeline row is written from.
   *
   * It rides on the line under the heading because that line is the only copy on this screen the
   * page itself writes, and the heading above it — a person's own name, needing their approval —
   * is precisely what needs answering. The queue says it twice, the second time in the record's
   * words; saying that here as well needs the screen, not this file. */
  const own = r.subjectId === claim.mid;

  /* The whole ask, in the order it was entered, shaped exactly as every other screen shapes it.
   *
   * A request covers as many garments as the person needed, and this page is now the only place a
   * manager might meet one without the app in front of them. It shows all of them, declines
   * included when they come back to a settled one — the link itself can only settle the request in
   * one direction, which is a limit the screen has to state rather than hide. */
  const lines = reqLines(r.lines);

  return (
    <ApproveByLink
      token={t!}
      decided={r.status !== "awaiting"}
      status={r.status}
      declineReason={r.declineReason}
      data={{
        code: r.code,
        subjectName: `${r.subject.first} ${r.subject.last}`.trim(),
        subjectMeta: [own ? "Your own uniform" : "", r.subject.dept, r.subject.num, r.subject.group]
          .filter(Boolean).join(" · "),
        lines,
        summary: linesSummary(lines),
        reason: r.reason,
        note: r.note,
        raisedByName: r.raisedByName,
        facility: r.facility.name,
      }}
    />
  );
}
