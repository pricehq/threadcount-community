"use client";
/* The manager's ward view: who on their team holds what.
 *
 * A list, not a dashboard. The only computed thing on it is each person's set count, and the
 * footnote exists because the first question a manager asks about "3 of 6 sets" is whether
 * something has to come back before the next set can. Nothing does — the owner's rule is six held
 * at any time, reached without handing anything in.
 */
import { MBody, MRule, MTop } from "@/components/m";
import { INK, N600, N700 } from "@/components/staffui";
import ManagerNav from "./ManagerNav";
import { fmtDate } from "@/lib/compute";

type Row = { id: string; name: string; group: string; held: number; lastIssued: string; capped: boolean; setsLabel: string; isNewStarter: boolean };

export default function WardScreen({ ward, rows, anyCapped }: { ward: string; rows: Row[]; anyCapped: boolean }) {
  return (
    <>
      <MTop
        title={ward || "Your team"}
        back
        right={<span style={{ fontSize: 12, color: "var(--color-neutral-400)" }}>{rows.length} staff</span>}
      />
      <MRule />
      <MBody>
        {rows.length === 0 ? (
          <div style={{ padding: "28px 16px", fontSize: 14, color: N600, lineHeight: 1.6 }}>
            Nobody is recorded as reporting to you. The linen room sets who approves each staff
            member on their record.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", padding: "12px 16px", borderBottom: "2px solid " + INK, background: "var(--color-bg)" }}>
              <span style={{ flex: 1, fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: N600 }}>{ward || "Your team"}</span>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: N600 }}>Items held</span>
            </div>
            {rows.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "14px 16px", background: "#fff", borderTop: "1px solid var(--color-divider)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3 }}>{r.name}</div>
                  <div style={{ fontSize: 12.5, color: N600, marginTop: 4, lineHeight: 1.4 }}>
                    {[
                      r.group,
                      r.capped ? r.setsLabel : "",
                      r.isNewStarter && r.lastIssued ? `set issued ${fmtDate(r.lastIssued)}` : "",
                    ].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{r.held}</div>
              </div>
            ))}
          </>
        )}

        {anyCapped && (
          <p style={{ fontSize: 14, lineHeight: 1.6, color: N700, padding: 16, margin: 0, background: "var(--color-bg)" }}>
            The figure against each person is how many sets they hold, out of the most anyone may
            hold at once. Nothing has to be handed back before the next set is issued.
          </p>
        )}
        <div style={{ height: 12 }} />
      </MBody>
      <ManagerNav />
    </>
  );
}
