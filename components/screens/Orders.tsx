"use client";
/* 1C — Orders. Every request, newest first.
 *
 * The status *word* is the signal; the left border only reinforces it. Nothing here is
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
import { MBar, MBody, MRule, MTop, NOT_DOCKED } from "@/components/m";
import { EdgeRow, INK, N600, N700, Tabs } from "@/components/staffui";
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

  return (
    <>
      <MTop title="Orders" />
      <MRule />
      <MBody>
        <Tabs label="Which orders" value={tab} onPick={setTab} options={tabs} />

        {rows.length === 0 ? (
          <div style={{ padding: "28px 16px", fontSize: 14, color: N600, lineHeight: 1.6 }}>
            {tab === "open"
              ? `Nothing open. Requests for you appear here with their progress${forOthers.length ? " — anything you raise for somebody else is under Raised." : "."}`
              : tab === "done" ? "Nothing closed yet."
              : "Nothing you raised for somebody else."}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 2, padding: "12px 0" }}>
            {rows.map((r) => {
              const st = statusText(r, { mine: r.mine, first: r.subjectName.split(" ")[0] });
              const attention = !r.mine ? false : NEEDS_STAFF.has(r.status as never);
              return (
                <EdgeRow key={r.id} tone={attention ? "accent" : "divider"} href={`/my/orders/${r.id}`}>
                  <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: st.ink === "attention" ? "var(--color-accent-700)" : N700 }}>
                      {st.label}
                    </span>
                    <span style={{ fontSize: 12, color: N600 }}>{r.code}</span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em", marginTop: 6, lineHeight: 1.25 }}>
                    {r.summary}
                  </div>
                  <div style={{ fontSize: 13, color: N600, marginTop: 5, lineHeight: 1.45 }}>
                    {/* createdAt is a UTC instant; slicing its first ten characters dated every
                        request raised before 10:00 to the previous day. */}
                    {[
                      r.mine ? "" : `for ${r.subjectName}`,
                      // Only worth saying when the manager didn't approve the lot — otherwise the
                      // status word above has already said it.
                      r.decision && r.lineCount > 1 ? r.decision : "",
                      st.note,
                      formatInZone(r.createdAt, me.tz),
                    ].filter(Boolean).join(" · ")}
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
