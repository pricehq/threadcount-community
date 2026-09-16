"use client";
/* Kit check (a round asking everyone to confirm what they hold), its shortfalls, and the size
 * waitlist. Starting and closing a round is admin only on the server, so it is hidden here too. */
import { useState } from "react";
import Link from "next/link";
import { useSnap } from "@/lib/client";
import { Empty, Field } from "@/components/ui";
import { MonoNum, Panel, Tag } from "@/components/portal";
import { fmtDate, formatInZone } from "@/lib/compute";
import { WAITLIST_HOLD_HOURS, holdEndsAt, holdExpired } from "@/lib/staffreq";
import type { CycleRow, ShortfallRow, WaitingRow } from "./RequestList";

type Op = "kitcheck.open" | "kitcheck.close" | "waitlist.offer";

export default function KitCheck({ cycle, shortfalls, waiting, act }: {
  cycle: CycleRow | null; shortfalls: ShortfallRow[]; waiting: WaitingRow[];
  act: (op: Op, payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const { s, isAdmin } = useSnap();
  const [dueBy, setDueBy] = useState("");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Panel title="Kit check" aside={cycle ? "Running" : undefined}>
        <div style={{ padding: "12px 16px" }}>
          {cycle ? (
            <div className="tc-req-actions" style={{ justifyContent: "space-between" }}>
              <span style={{ fontSize: 13.5 }}>
                Due by <b>{fmtDate(cycle.dueBy)}</b>
                <span className="tc-meta-line"> · <MonoNum size={12}>{cycle.answers}</MonoNum> answer{cycle.answers === 1 ? "" : "s"} in · opened by {cycle.openedBy || "—"}</span>
              </span>
              {isAdmin && <button type="button" className="btn btn-secondary" onClick={() => void act("kitcheck.close", { id: cycle.id })}>Close the round</button>}
            </div>
          ) : isAdmin ? (
            <div className="tc-req-actions" style={{ alignItems: "flex-end" }}>
              <Field label="Due by" style={{ width: 200 }}>{(c) => <input {...c} className="input" type="date" value={dueBy} onChange={(e) => setDueBy(e.target.value)} />}</Field>
              <button type="button" className="btn btn-primary" onClick={async () => { if (await act("kitcheck.open", { dueBy })) setDueBy(""); }}>Start a kit check</button>
            </div>
          ) : (
            <span className="tc-meta-line">No kit check running.</span>
          )}
        </div>
      </Panel>

      <Panel title="Couldn’t account for" count={cycle ? shortfalls.length : undefined}>
        {!cycle ? (
          <div style={{ padding: "0 16px" }}><Empty pad={3}>No kit check is running.</Empty></div>
        ) : shortfalls.length === 0 ? (
          <div style={{ padding: "0 16px" }}>
            <Empty pad={3}>{cycle.answers === 0 ? "Nobody has answered yet." : "Every answer so far matched the record."}</Empty>
          </div>
        ) : (
          <div className="tc-req-scroll">
            <table className="tc-table">
              <thead><tr>
                <th>Who</th><th>Garment</th><th>Size</th>
                <th className="num">On record</th><th className="num">Confirmed</th><th className="num">Short</th>
                <th>Answered</th><th><span className="sr-only">Record</span></th>
              </tr></thead>
              <tbody>
                {shortfalls.map((f) => (
                  <tr key={f.id}>
                    <td>{f.staffName} <MonoNum size={12} tone="muted">{f.staffNum}</MonoNum>{f.ward && <span className="tc-meta-line"> · {f.ward}</span>}</td>
                    <td>{f.item}</td>
                    <td className="tc-mono">{f.size}</td>
                    <td className="num">{f.onRecord}</td>
                    <td className="num">{f.confirmed}</td>
                    <td className="num" style={{ color: "var(--color-accent-700)", fontWeight: 600, whiteSpace: "nowrap" }}><span className="tc-mark" aria-hidden="true" />{f.short}</td>
                    <td className="tc-mono" style={{ whiteSpace: "nowrap", fontSize: 12 }}>{formatInZone(f.at, s.tz)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}><Link href={`/app/staff/${f.staffId}`}>Open record</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Waiting for a size" count={waiting.length}>
        {waiting.length === 0 ? (
          <div style={{ padding: "0 16px" }}><Empty pad={3}>Nobody is waiting on a size.</Empty></div>
        ) : waiting.map((w) => {
          const ends = holdEndsAt(w.offeredAt);
          return (
            <div key={w.id} className="tc-req-row">
              <div className="tc-req-head">
                <span style={{ flex: 1, minWidth: 180 }}>
                  <b>{w.item}</b> — <MonoNum>{w.size}</MonoNum>
                  <span style={{ color: "var(--color-neutral-700)" }}> · {w.staffName}{w.ward ? ` (${w.ward})` : ""}</span>
                  <span className="tc-meta-line"> · since {formatInZone(w.since, s.tz)}</span>
                </span>
                {!w.offeredAt
                  ? <button type="button" className="btn btn-secondary" title={`Tells them and holds it for ${WAITLIST_HOLD_HOURS} hours`} onClick={() => void act("waitlist.offer", { id: w.id })}>It’s in — offer it</button>
                  : holdExpired(w.offeredAt)
                    ? <Tag tone="quiet">Hold lapsed — offer to the next person</Tag>
                    : <Tag tone="accent">Held until {ends ? formatInZone(ends, s.tz, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—"}</Tag>}
              </div>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}
