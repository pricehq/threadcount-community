"use client";
/* The approvals queue.
 *
 * Oldest first, deliberately. The queue's job is to surface the person who has been waiting
 * longest, and a newest-first list quietly buries them — which is the failure mode this whole
 * flow exists to fix.
 *
 * A request the manager is the wearer of can reach this queue now. Whoever a request names is who
 * decides it, and the server has been allowed to let that be the wearer themselves in the one case
 * the owner named. The server owns that decision and this screen never re-tests it. What the screen
 * owns is the honesty: an approval somebody gives themselves is set apart from the ones they are
 * giving on other people's behalf, says whose uniform it is, and says what the record will call it
 * afterwards — so it is never something that happens to a manager mid-scroll and has to be
 * explained to an auditor months later.
 *
 * This queue also reaches people who manage nobody — the linen room re-addresses a request that
 * arrived without an approver, or somebody's last report is moved away while their own request is
 * still waiting. The server takes their self-approval too (lib/staffops.ts decideRequest dropped
 * the reports test), so the copy below no longer tells them the bar will refuse: for a while it
 * did, and the bar approved. The only difference `me.isManager` makes here is the wording.
 */
import { MBody, MRule, MTop } from "@/components/m";
import { EdgeRow, GROUND, INK, Kicker, N600, N700, SecondaryBar } from "@/components/staffui";
import ManagerNav from "./ManagerNav";
import { useStaff } from "@/lib/staffclient";
import { daysBetween, facilityDate, facilityToday } from "@/lib/compute";
import type { QueueRow } from "@/lib/managerdata";

/* Calendar days on the ward, not elapsed 24-hour blocks.
 *
 * Dividing the milliseconds understated every overnight wait: a request raised at 18:00 on Monday
 * still read "today" at 09:00 on Tuesday and only became "since yesterday" that evening, by which
 * point it had spanned two working days. This queue exists to surface the person who has been
 * waiting longest, so the label counts the way they do, in the facility's own zone. */
function waited(iso: string, tz: string) {
  const raised = facilityDate(iso, tz);
  if (!raised) return ""; // the row's meta line filters empties out
  const days = daysBetween(raised, facilityToday(tz));
  if (days <= 0) return "today";
  if (days === 1) return "since yesterday";
  return `waiting ${days} days`;
}

/** The heading over a group, in the ward-round style: a band the list hangs off. */
function Band({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "18px 16px 8px", borderBottom: "2px solid " + INK, background: GROUND }}>
      {children}
    </div>
  );
}

function Row({ r, tz, mine, mayApproveOwn }: { r: QueueRow; tz: string; mine: boolean; mayApproveOwn: boolean }) {
  return (
    /* An ink edge rather than the accent one every other row carries. Accent means somebody else is
       waiting on you; your own uniform is not that, and it must not be able to pass for it at a
       glance on a phone held in one hand halfway down a ward. */
    <EdgeRow tone={mine ? "ink" : "accent"} href={`/my/approvals/${r.id}`}>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 800 }}>{r.subjectName}</span>
        <span style={{ fontSize: 12, color: N600 }}>{r.code}</span>
      </div>
      {/* The group heading above says this too, but it scrolls away and the row is the thing that
          gets tapped — so the row carries the fact on its own. */}
      {mine && <div style={{ marginTop: 6 }}><Kicker tone="attention">Your own uniform</Kicker></div>}
      {/* The summary is the whole ask in one line — "5 garments · Tunic, Trousers,
          Fleece". The garments themselves are on the review screen, which is where the
          decision is made; a queue that listed every line would bury the person who has
          been waiting longest under somebody else's four-garment request. */}
      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 6, lineHeight: 1.35 }}>
        {r.summary}
      </div>
      <div style={{ fontSize: 12.5, color: N600, marginTop: 5, lineHeight: 1.45 }}>
        {[r.reason, r.subjectGroup, waited(r.createdAt, tz)].filter(Boolean).join(" · ")}
        {r.raisedByName ? ` · raised by ${r.raisedByName}` : ""}
      </div>
      {mine && (
        <div style={{ fontSize: 12.5, color: N700, marginTop: 5, lineHeight: 1.45 }}>
          {mayApproveOwn
            ? "Approving it is recorded as your own approval."
            : "Not yours to approve — it needs another manager."}
        </div>
      )}
    </EdgeRow>
  );
}

export default function ApprovalsScreen({ rows, ownIds = [] }: { rows: QueueRow[]; ownIds?: string[] }) {
  const { me } = useStaff();
  /* Which of these are the manager's own is settled on the server, from the request's own subject.
     Working it out here by matching a name would start calling a stranger's request yours the day
     two people on the register share one — and the thing being labelled is an audit fact. */
  const own = new Set(ownIds);
  const mine = rows.filter((r) => own.has(r.id));
  const theirs = rows.filter((r) => !own.has(r.id));
  return (
    <>
      <MTop
        title="Approvals"
        back
        right={rows.length ? <span style={{ fontSize: 12, color: "var(--color-neutral-400)" }}>{rows.length} waiting</span> : undefined}
      />
      <MRule />
      <MBody>
        {rows.length === 0 ? (
          <div style={{ padding: "28px 16px", fontSize: 14, color: N600, lineHeight: 1.6 }}>
            Nothing waiting on you. Requests from your team arrive by email, and land here too.
          </div>
        ) : (
          <>
            {theirs.length > 0 && (
              <>
                {/* Headed only when there is something to tell it apart from. With nothing of the
                    manager's own waiting, this is simply the queue, and a band over the whole of
                    it would be furniture. */}
                {mine.length > 0 && <Band><Kicker>Everyone else</Kicker></Band>}
                <div style={{ display: "grid", gap: 2, padding: "12px 0" }}>
                  {theirs.map((r) => <Row key={r.id} r={r} tz={me.tz} mine={false} mayApproveOwn />)}
                </div>
              </>
            )}

            {/* The manager's own go last, whatever date they were raised. Oldest first is a promise
                to the colleague who has been waiting longest, and a request for your own uniform
                does not step in front of her — and a group at the foot of the screen, under its own
                heading, is not somewhere a thumb arrives by accident on the way down the list of
                your team's. */}
            {mine.length > 0 && (
              <>
                <Band>
                  <Kicker tone="attention">{mine.length === 1 ? "Your own request" : "Your own requests"}</Kicker>
                </Band>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: N700, padding: "12px 16px 0", margin: 0 }}>
                  {me.isManager ? (
                    <>
                      {mine.length === 1
                        ? "These garments are for you. You may approve them yourself, and it is recorded as a manager’s approval you gave yourself"
                        : "These are for you. You may approve them yourself, and each one is recorded as a manager’s approval you gave yourself"}
                      {" — the request says so on its own history, and so does the record anybody reads afterwards."}
                    </>
                  ) : (
                    /* The server takes a self-approval from anybody the request is addressed to — the
                       reports test was dropped (lib/staffops.ts decideRequest) — so this can't go on
                       promising a refusal that never comes. */
                    <>
                      {mine.length === 1
                        ? "These garments are for you. Nobody reports to you at the moment, but this one was addressed to you, so it is yours to decide — and it is recorded as an approval you gave yourself"
                        : "These are for you. Nobody reports to you at the moment, but they were addressed to you, so they are yours to decide — and each one is recorded as an approval you gave yourself"}
                      {" — the request says so on its own history, and so does the record anybody reads afterwards."}
                    </>
                  )}
                </p>
                <div style={{ display: "grid", gap: 2, padding: "12px 0" }}>
                  {mine.map((r) => <Row key={r.id} r={r} tz={me.tz} mine mayApproveOwn />)}
                </div>
              </>
            )}
          </>
        )}
        {/* The only route left for putting a request in somebody else's name: a manager, for the
            people who report to them. The server sends a raise of theirs up a level, to their own
            manager, so nobody ever decides what they typed themselves.

            Offered only to somebody who actually has a team. This queue also reaches people who
            manage nobody — the linen room re-addresses a request that arrived without an approver,
            or a manager's last report is moved away while their request is still waiting — and
            /my/raise turns exactly those people away with a 404. Inviting them to a screen that
            refuses them is worse than not mentioning it, so the invitation and the sentence
            explaining it appear together or not at all. */}
        {me.isManager && (
          <>
            <div style={{ padding: "16px 16px 0" }}>
              <SecondaryBar label="Raise for someone on your team" href="/my/raise" />
            </div>

            {/* The second sentence would read as a bug to the one person it is wrong for: a manager
                looking straight at a request of her own on a screen telling her such a thing always
                goes somewhere else. So when one is on the screen it says what is actually there. */}
            <p style={{ fontSize: 13, lineHeight: 1.6, color: N700, padding: 16, margin: 0 }}>
              Nothing reaches the linen room until you approve it.{" "}
              {mine.length === 0
                ? "Anything you raise yourself goes to your own manager instead."
                : mine.length === 1
                  ? "One of these is your own, and it is yours to decide — the record will show you were the one who approved it."
                  : "Some of these are your own, and they are yours to decide — the record will show you were the one who approved them."}
            </p>
          </>
        )}
        {!me.isManager && (
          <p style={{ fontSize: 13, lineHeight: 1.6, color: N700, padding: 16, margin: 0 }}>
            Nothing reaches the linen room until you approve it.
          </p>
        )}
        <div style={{ height: 12 }} />
      </MBody>
      <ManagerNav />
    </>
  );
}
