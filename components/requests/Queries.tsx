"use client";
/* Record queries: somebody says their staff record is wrong. */
import Link from "next/link";
import { useSnap } from "@/lib/client";
import { Empty } from "@/components/ui";
import { MonoNum, Panel } from "@/components/portal";
import { formatInZone } from "@/lib/compute";
import type { DisputeRow } from "./RequestList";

export default function Queries({ rows, act }: { rows: DisputeRow[]; act: (op: "dispute.resolve", payload: Record<string, unknown>) => Promise<boolean> }) {
  const { s } = useSnap();
  // A query carries the staff number, not the record id, so the link is found on the register.
  const idByNum = new Map(s.staff.map((st) => [st.num, st.id]));
  return (
    <Panel title="Record queries" count={rows.length}>
      {rows.length === 0 ? (
        <div style={{ padding: "0 16px" }}><Empty pad={3}>Nobody has queried their record.</Empty></div>
      ) : rows.map((d) => {
        const sid = idByNum.get(d.staffNum);
        return (
          <div key={d.id} className="tc-req-row">
            <div className="tc-req-head">
              <span style={{ flex: 1, minWidth: 180 }}>
                <b>{d.staffName}</b> <MonoNum size={12} tone="muted">{d.staffNum}</MonoNum>
                <span className="tc-meta-line">{d.ward ? ` · ${d.ward}` : ""} · {formatInZone(d.at, s.tz)}</span>
              </span>
              <div className="tc-req-actions">
                <button type="button" className="btn btn-secondary" onClick={() => void act("dispute.resolve", { id: d.id })}>Mark sorted</button>
                {sid && <Link className="btn btn-ghost" href={`/app/staff/${sid}`}>Open record</Link>}
              </div>
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.5, margin: "6px 0 0", maxWidth: "70ch" }}>{d.body}</p>
          </div>
        );
      })}
    </Panel>
  );
}
