"use client";
/* Draft order: what fell below par, at quantities that bring each line back up. Raising it makes a
   draft on Ordering; nothing reaches a supplier until someone approves it there. */
import { useMemo, useState } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { flaggedNeeds, label, onhand, reorderAt, touched } from "@/lib/compute";
import { MBar, MBody, MButton, MDone, MEmpty, MError, MRow, MRule, MSection, MStepper, MTop, MTopCount } from "@/components/m";

export default function MReorder() {
  const { s, mutate, busy } = useSnap();
  const { L, byId, variants } = useDerived();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [err, setErr] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const needs = useMemo(() => flaggedNeeds(s, L, byId).map((n) => {
    const k = `${n.itemId}:${n.si}`;
    return { ...n, key: k, name: `${label(byId[n.itemId])} ${n.size}`, oh: onhand(s, L, k), par: reorderAt(s, k) };
  }), [s, L, byId]);

  // Stock's "short" counts every line at or under par; flaggedNeeds drops the ones open orders cover.
  const belowPar = useMemo(
    () => variants.filter((v) => touched(s, L, v.key) && onhand(s, L, v.key) <= reorderAt(s, v.key)).length,
    [s, L, variants],
  );
  const covered = Math.max(0, belowPar - needs.length);

  const q = (k: string, fallback: number) => qty[k] ?? fallback;
  const total = needs.reduce((t, n) => t + q(n.key, n.qty), 0);
  const suppliers = [...new Set(needs.map((n) => n.supplier))];

  const raise = async () => {
    const bySup: Record<string, typeof needs> = {};
    for (const n of needs) if (q(n.key, n.qty) > 0) (bySup[n.supplier] ||= []).push(n);
    const codes: string[] = [];
    for (const sup of Object.keys(bySup)) {
      const r = await mutate<{ code: string }>("order.create", {
        orderFor: "Stock", supplier: sup, replenish: false, notes: "Raised from a stocktake on the app",
        lines: bySup[sup].map((n) => ({ itemId: n.itemId, size: n.size, qty: q(n.key, n.qty) })),
      });
      if (!r.ok) { setErr(r.error); return; }
      codes.push(r.result.code);
    }
    setDone(codes.join(" · "));
  };

  if (done) return (
    <>
      <MTop title="Done" />
      <MRule />
      <MBody pad>
        <MDone head={`Draft ${done} raised`} sub="Waiting on Ordering" />
        <MButton label="Back to Stock" href="/m/stock" />
      </MBody>
    </>
  );

  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

  return (
    <>
      <MTop title="Draft order" back right={<MTopCount>{plural(needs.length, "line")}</MTopCount>} />
      <MRule />
      <MError msg={err} onDismiss={() => setErr("")} />
      <MBody pad>
        {needs.length === 0 ? (
          <MEmpty title={belowPar ? "Already on order" : "Nothing to reorder"}
            sub={belowPar ? `${plural(belowPar, "line")} short, all on open orders` : "Every line is above par"} />
        ) : (
          <>
            <MSection label="To order" right={suppliers.length === 1 ? suppliers[0] : plural(suppliers.length, "supplier")} />
            {needs.map((n) => (
              <MRow key={n.key} mark={n.oh <= 0 ? "accent" : "ink"} title={n.name}
                sub={`${n.oh}/${n.par} · ${n.supplier}`}
                right={<MStepper n={q(n.key, n.qty)} onChange={(v) => setQty((x) => ({ ...x, [n.key]: v }))} label={n.name} />} />
            ))}
          </>
        )}
        {covered > 0 && needs.length > 0 && (
          <>
            <MSection label="Already on order" right={covered} />
            <MRow mark="mute" chev href="/m/stock?seg=order" title="On order" right={covered} />
          </>
        )}
      </MBody>
      {needs.length > 0 && (
        <MBar label={busy ? "Raising…" : "Raise the draft"} small={plural(total, "item")} onClick={raise}
          disabled={busy || total === 0} offReason={total === 0 ? "Set a quantity on at least one line" : undefined} />
      )}
    </>
  );
}
