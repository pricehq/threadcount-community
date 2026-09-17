"use client";
/* 1C — Orders. Every request, newest first.
 *
 * The status *word* leads each row and the left border only reinforces it. Nothing here is
 * distinguishable by colour alone, which matters on a ward phone in bad light as much as it does
 * for anyone who can't tell the red from the grey.
 *
 * Three lists, not two. What somebody raised for another person — a manager for one of their team,
 * plus anything still open from the desk route that used to exist — is deliberately kept out of
 * Open and Done: what a wearer does with their own order (collect it, chase it, say they picked it
 * up) is not what the person who typed it in does with it, and one mixed list is how somebody walks
 * off with a bag that isn't theirs. Before this tab existed those requests appeared on no screen
 * the raiser could reach at all.
 */
import { useState } from "react";
import { MBar, MBody, MEmpty, MRule, MTop, NOT_DOCKED } from "@/components/m";
import { DIVIDER, EdgeRow, INK, N600, Tabs } from "@/components/staffui";
import StaffNav from "@/components/staffnav";
import { useStaff } from "@/lib/staffclient";
import { NEEDS_STAFF, statusText } from "@/lib/staffreq";
import { formatInZone } from "@/lib/compute";
import type { ReqRow } from "@/lib/staffdata";

type Tab = "open" | "done" | "raised";

export default function OrdersScreen({ open, done, raised, initialTab }: {
  open: ReqRow[]; done: ReqRow[]; raised: { open: ReqRow[]; done: ReqRow[] }; initialTab: Tab;
}) {
  const { me } = useStaff();
  // Open first with the ones still moving, then whatever has finished, so the tab reads top-down
  // like the two it sits beside.
  const forOthers = [...raised.open, ...raised.done];
  const [tab, setTab] = useState<Tab>(initialTab === "raised" && !forOthers.length ? "open" : initialTab);
  const rows = tab === "open" ? open : tab === "done" ? done : forOthers;

  const tabs = [
    { key: "open" as const, label: "Open", count: open.length },
    { key: "done" as const, label: "Done", count: done.length },
    ...(forOthers.length ? [{ key: "raised" as const, label: "Raised", count: forOthers.length }] : []),
  ];

  const empty = tab === "open"
    ? {
        title: "Nothing open",
        sub: forOthers.length
          ? "Anything you raise for somebody else is under Raised."
          : "Anything you ask for shows here until you have it.",
      }
    : tab === "done"
      ? { title: "Nothing finished yet", sub: "Collected and declined orders stay here." }
      : { title: "Nothing you raised for somebody else", sub: "What you type in for somebody else shows here." };

  return (
    <>
      <MTop title="Orders" />
      <MRule />
      <MBody>
        <Tabs label="Which orders" value={tab} onPick={setTab} options={tabs} />

        {rows.length === 0 ? (
          <div style={{ padding: "0 16px" }}><MEmpty title={empty.title} sub={empty.sub} /></div>
        ) : (
          // The 1px rules between rows are the gap, not a border on each row: the last row then has
          // no rule hanging under it, and every left edge still starts at the edge of the screen.
          <div style={{ display: "grid", gap: 1, background: DIVIDER, borderBottom: `1px solid ${DIVIDER}` }}>
            {rows.map((r) => {
              const st = statusText(r, { mine: r.mine, first: r.subjectName.split(" ")[0] });
              // The accent edge marks what is waiting on the wearer. An order somebody raised for
              // a colleague is never waiting on the reader — they typed it in, they don't collect
              // it — so it keeps the quiet edge whatever its status.
              const attention = !r.mine ? false : NEEDS_STAFF.has(r.status as never);
              return (
                <EdgeRow key={r.id} tone={attention ? "accent" : "divider"} href={`/my/orders/${r.id}`}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3 }}>{st.label}</div>
                      <div style={{ fontSize: 13, color: N600, marginTop: 2, lineHeight: 1.4 }}>{r.summary}</div>
                      <div style={{ fontSize: 13, color: N600, marginTop: 1, lineHeight: 1.4 }}>
                        {/* createdAt is a UTC instant; slicing its first ten characters dated every
                            request raised before 10:00 to the previous day. */}
                        {[
                          r.mine ? "" : `for ${r.subjectName}`,
                          // Only worth saying when the manager didn't approve the lot — otherwise
                          // the status word above has already said it.
                          r.decision && r.lineCount > 1 ? r.decision : "",
                          `${r.code} · raised ${formatInZone(r.createdAt, me.tz)}`,
                        ].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <span aria-hidden="true" style={{ fontSize: 18, color: N600, flex: "0 0 auto" }}>›</span>
                  </div>
                </EdgeRow>
              );
            })}
          </div>
        )}
        <div style={{ height: 12 }} />
      </MBody>
      {/* The nav below is what the phone's gesture handle sits on, and it pads itself for it. The
          bar is not at the foot of anything, so it says so: otherwise it reserves the home-indicator
          band a second time and "New request" floats above an accent gap mid-screen. */}
      <div style={{ ...NOT_DOCKED, borderTop: "2px solid " + INK }}>
        <MBar label="New request" href="/my/request" />
      </div>
      <StaffNav />
    </>
  );
}
