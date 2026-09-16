"use client";
/* Team ▸ Approvals — the queue, and the decision, on one screen.
 *
 * Oldest first, deliberately. The queue's job is to surface the person who has been waiting
 * longest, and a newest-first list quietly buries them — which is the failure mode this whole
 * flow exists to fix.
 *
 * Approving now happens in the list: the commonest decision by far is "yes, all of it", and making
 * somebody open a screen to say so cost a tap on every request and taught them to open and approve
 * without reading either. Open is still there for the decision that needs looking at — a single
 * garment knocked back, which only the review screen can do.
 *
 * A request the manager is the wearer of can reach this queue. Whoever a request names is who
 * decides it, and the server has been allowed to let that be the wearer themselves in the one case
 * the owner named. The server owns that decision and this screen never re-tests it. What the screen
 * owns is the honesty: an approval somebody gives themselves is set apart from the ones they give
 * on other people's behalf, and says what the record will call it afterwards.
 *
 * This queue also reaches people who manage nobody — the linen room re-addresses a request that
 * arrived without an approver, or somebody's last report moves away while their own request is
 * still waiting. They have a queue, so they have a Team tab (lib/staffreq.ts teamTabs).
 */
import { useState } from "react";
import { MEmpty, MError } from "@/components/m";
import { EdgeRow, N600, N700 } from "@/components/staffui";
import Team, { Band, ChipAction, ChipRow } from "./Team";
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

export default function ApprovalsScreen({ rows, ownIds = [] }: { rows: QueueRow[]; ownIds?: string[] }) {
  const { me, mutate, busy } = useStaff();
  const [err, setErr] = useState("");
  /* What just happened, for the person who pressed the button. The row itself leaves the list on
   * the refresh, and a list that silently gets shorter is not an answer. There is no toast in this
   * app — components/m.tsx's useToast is a documented no-op outside the counter's provider — so it
   * is said here, in a live region. */
  const [done, setDone] = useState("");

  /* Which of these are the manager's own is settled on the server, from the request's own subject.
     Working it out here by matching a name would start calling a stranger's request yours the day
     two people on the register share one — and the thing being labelled is an audit fact. */
  const own = new Set(ownIds);
  const mine = rows.filter((r) => own.has(r.id));
  const theirs = rows.filter((r) => !own.has(r.id));

  async function approveAll(r: QueueRow) {
    setErr("");
    setDone("");
    // The op decides garment by garment and wants a call for every line by id — approving from the
    // queue is approving all of them, said explicitly rather than by omission.
    const res = await mutate("request.approve", {
      id: r.id,
      lines: r.lines.map((l) => ({ id: l.id, decision: "approved", reason: "" })),
    });
    if (!res.ok) { setErr(res.error); return; }
    setDone(`Approved · ${r.subjectName.split(" ")[0]} has been told`);
  }

  function Row({ r, own: isOwn }: { r: QueueRow; own: boolean }) {
    return (
      /* An ink edge rather than the accent one every other row carries. Accent means somebody else
         is waiting on you; your own uniform is not that, and it must not be able to pass for it at
         a glance on a phone held in one hand halfway down a ward. */
      <EdgeRow tone={isOwn ? "ink" : "accent"}>
        {/* The person, and nothing beside them. The code belongs to the request rather than to the
            decision, and it is on the review screen's own title where somebody who has come from
            the approval e-mail will look for it. */}
        <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3 }}>{r.subjectName}</div>
        {/* The whole ask in one line — "3 garments · Tunic, Trousers". The garments themselves are
            on the review screen, which is where a line is refused; a queue that listed every one
            would bury the person who has been waiting longest under somebody else's four. */}
        <div style={{ fontSize: 14.5, color: N600, marginTop: 5, lineHeight: 1.4 }}>{r.summary}</div>
        <div style={{ fontSize: 13, color: N600, marginTop: 3, lineHeight: 1.4 }}>
          {[r.reason, r.subjectGroup, waited(r.createdAt, me.tz)].filter(Boolean).join(" · ")}
          {r.raisedByName ? ` · raised by ${r.raisedByName}` : ""}
        </div>
        <ChipRow>
          <ChipAction
            label={`Approve ${r.garments}`}
            disabled={busy}
            onClick={() => void approveAll(r)}
          />
          <ChipAction label="Open" href={`/my/approvals/${r.id}`} />
        </ChipRow>
      </EdgeRow>
    );
  }

  return (
    <Team active="/my/approvals">
      <div role="status" aria-live="polite">
        {done && (
          <div style={{ padding: "12px 16px", background: "#fff", borderBottom: "1px solid var(--color-divider)", fontSize: 14, fontWeight: 800 }}>
            {done}
          </div>
        )}
      </div>
      <MError msg={err} onDismiss={() => setErr("")} />

      {rows.length === 0 ? (
        <div style={{ padding: "0 16px" }}>
          <MEmpty
            title="Nothing waiting on you"
            sub="Requests from your team arrive by notification and email, and land here."
          />
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gap: 2, padding: "12px 0" }}>
            {theirs.map((r) => <Row key={r.id} r={r} own={false} />)}
          </div>

          {/* The manager's own go last, whatever date they were raised. Oldest first is a promise to
              the colleague who has been waiting longest, and a request for your own uniform does not
              step in front of her — and a group at the foot, under its own heading, is not somewhere
              a thumb arrives by accident on the way down the list of your team's. */}
          {mine.length > 0 && (
            <>
              <Band tone="attention" label={mine.length === 1 ? "Your own request" : "Your own requests"} />
              <p style={{ fontSize: 13, lineHeight: 1.6, color: N700, padding: "12px 16px 0", margin: 0 }}>
                Approving {mine.length === 1 ? "it" : "them"} is recorded as your own approval.
              </p>
              <div style={{ display: "grid", gap: 2, padding: "12px 0" }}>
                {mine.map((r) => <Row key={r.id} r={r} own />)}
              </div>
            </>
          )}

          <p style={{ fontSize: 13, lineHeight: 1.6, color: N700, padding: 16, margin: 0 }}>
            Nothing reaches the linen room until you approve it.
          </p>
        </>
      )}
      <div style={{ height: 12 }} />
    </Team>
  );
}
