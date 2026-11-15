"use client";
/* Damage reported from the staff app that has not come back to the counter yet. */
import Link from "next/link";
import { useSnap } from "@/lib/client";
import { Empty } from "@/components/ui";
import { MonoNum, Panel, Tag } from "@/components/portal";
import { formatInZone } from "@/lib/compute";
import type { DamageRow } from "./RequestList";

export default function Damage({ rows, act }: { rows: DamageRow[]; act: (op: "damage.handedIn", payload: Record<string, unknown>) => Promise<boolean> }) {
  const { s } = useSnap();
  return (
    <Panel title="Damage" count={rows.length}>
      {rows.length === 0 ? (
        <div style={{ padding: "0 16px" }}><Empty pad={3}>Nothing reported damaged that hasn&apos;t come back yet.</Empty></div>
      ) : rows.map((d) => (
        <div key={d.id} className="tc-req-row">
          <div className="tc-req-head" style={{ alignItems: "flex-start" }}>
            {d.photoId && (
              <a href={`/api/photo/${d.photoId}`} target="_blank" rel="noopener" style={{ flex: "none" }} aria-label={`Photo of the damage to ${d.staffName}’s ${d.item || "garment"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/photo/${d.photoId}`} alt="" width={56} height={56} style={{ width: 56, height: 56, objectFit: "cover", border: "2px solid var(--color-text)", display: "block" }} />
              </a>
            )}
            <div style={{ flex: 1, minWidth: 180 }}>
              <div>
                <b>{d.item ? d.item : "Garment no longer on file"}</b>
                {d.item && d.size && <> — <MonoNum>{d.size}</MonoNum></>}
                <span style={{ color: "var(--color-neutral-700)" }}> · {d.staffName}{d.ward ? ` (${d.ward})` : ""}</span>
                {" "}<Tag tone="accent">{d.kind}</Tag>
              </div>
              <div className="tc-meta-line" style={{ marginTop: 3 }}>
                {formatInZone(d.at, s.tz)}
                {" · "}{d.requestCode ? <>replacement <MonoNum size={12}>{d.requestCode}</MonoNum></> : "no replacement asked for"}
              </div>
              {d.note && <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: "6px 0 0", maxWidth: "70ch" }}>&ldquo;{d.note}&rdquo;</p>}
            </div>
            <div className="tc-req-actions">
              <button type="button" className="btn btn-secondary" onClick={() => void act("damage.handedIn", { id: d.id })}>Handed in at the counter</button>
              <Link className="btn btn-ghost" href={`/app/staff/${d.staffId}`}>Open record</Link>
            </div>
          </div>
        </div>
      ))}
    </Panel>
  );
}
