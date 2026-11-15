"use client";
/* Team ▸ Ward — who on this manager's team holds what.
 *
 * A list, not a dashboard. The only computed thing on it is each person's set count, and the
 * footnote exists because the first question a manager asks about "3 of 6 sets" is whether
 * something has to come back before the next one can. Nothing does — the rule is six held at any
 * time, reached without handing anything in — so the line is there only when somebody is capped.
 */
import { MRow } from "@/components/m";
import { N700 } from "@/components/staffui";
import Team, { Band } from "./Team";

type Row = { id: string; name: string; group: string; held: number; lastIssued: string; capped: boolean; setsLabel: string; isNewStarter: boolean };

export default function WardScreen({ ward, rows, anyCapped }: { ward: string; rows: Row[]; anyCapped: boolean }) {
  return (
    <Team active="/my/ward">
      {/* The head-count and the column the numbers on the right belong to, on one line. */}
      <Band label={ward || "Your team"} right={`${rows.length} · Items held`} />
      <div style={{ padding: "0 16px" }}>
        {rows.map((r) => (
          <MRow
            key={r.id}
            title={r.name}
            sub={[r.group, r.capped ? r.setsLabel : ""].filter(Boolean).join(" · ")}
            right={`${r.held} item${r.held === 1 ? "" : "s"}`}
          />
        ))}
      </div>
      {anyCapped && (
        <p style={{ fontSize: 13, lineHeight: 1.6, color: N700, padding: 16, margin: 0 }}>
          Nothing has to be handed back before the next set is issued.
        </p>
      )}
      <div style={{ height: 12 }} />
    </Team>
  );
}
