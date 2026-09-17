"use client";
import { useEffect, useMemo, useState } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { PageHead, Empty, LiveRegion } from "@/components/ui";
import { Panel, QueueRow, Seg } from "@/components/portal";
import { DeliverDialog } from "@/components/dialogs";
import type { PickupRec } from "@/lib/compute";
import { plural, roundSheet } from "@/lib/today";
import { Lines } from "@/components/today/Lines";

// Delivery rounds: every uncollected pickup by ward, handed over on the floor with an on-screen
// signature and a handover photo (DeliverDialog).

const ALL = "__all__";

export default function RoundsPage() {
  const { s } = useSnap();
  const { byId, staffById } = useDerived();
  const [deliver, setDeliver] = useState<PickupRec | null>(null);
  const [msg, setMsg] = useState("");
  const [ward, setWard] = useState<string>(ALL);
  useEffect(() => { const w = new URLSearchParams(window.location.search).get("ward"); if (w) setWard(w); }, []);

  const sheet = useMemo(() => roundSheet(s, byId, staffById), [s, byId, staffById]);
  const bags = sheet.reduce((t, w) => t + w.rows.length, 0);
  const garments = sheet.reduce((t, w) => t + w.garments, 0);
  const current = ward !== ALL && sheet.some((w) => w.ward === ward) ? ward : ALL;
  const shown = current === ALL ? sheet : sheet.filter((w) => w.ward === current);

  function choose(w: string) {
    setWard(w);
    const u = new URL(window.location.href);
    if (w === ALL) u.searchParams.delete("ward"); else u.searchParams.set("ward", w);
    window.history.replaceState(null, "", u.pathname + u.search);
  }

  const opts = [ALL, ...sheet.map((w) => w.ward)];
  const labels: Record<string, string> = { [ALL]: "All" };
  const counts: Record<string, number> = { [ALL]: bags };
  for (const w of sheet) counts[w.ward] = w.rows.length;

  return (
    <section>
      <PageHead title="Delivery rounds" sub={<span className="tc-mono">{plural(bags, "bag")} · {plural(sheet.length, "ward")} · {plural(garments, "garment")}</span>} />
      <LiveRegion msg={msg} style={{ marginTop: 16, fontSize: 13, fontWeight: 600 }} />
      {sheet.length > 1 && (
        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <Seg label="Ward" opts={opts} value={current} onChange={choose} labels={labels} counts={counts} />
        </div>
      )}
      {bags === 0 && <Empty>Nothing waiting for delivery.</Empty>}
      <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 18 }}>
        {shown.map((w) => (
          <Panel key={w.ward} title={w.ward} aside={<span className="tc-mono">{w.cc || "—"} · {w.rows.length} to deliver</span>}>
            {w.rows.map((r) => (
              <QueueRow
                key={r.p.id}
                age={`${r.days}d`}
                ageLabel="waiting"
                urgent={r.late}
                title={r.name}
                titleMeta={r.phone ? (r.tel ? <a href={r.tel} style={{ color: "inherit" }}>{r.phone}</a> : r.phone) : undefined}
                meta={<><Lines lines={r.lines} /> · {r.p.orderCode}</>}
                actions={<button type="button" className="btn btn-primary" aria-label={`Sign for the delivery to ${r.name}`} onClick={() => setDeliver(r.p)}>Delivered — sign</button>}
              />
            ))}
          </Panel>
        ))}
      </div>
      {deliver && <DeliverDialog pickup={deliver} onClose={() => setDeliver(null)} onDone={(m) => setMsg(m)} />}
    </section>
  );
}
