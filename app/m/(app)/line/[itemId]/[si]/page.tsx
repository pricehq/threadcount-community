"use client";
/* One stock line: a garment in one size. On hand against par, where it lives, what is coming, and the
   three things done about it: print a label, count its shelf, put it on the draft order. */
import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { useDerived, useSnap } from "@/lib/client";
import { bcBound, key, label, locMap, locTrail, money, onOrderText, onhand, reorderAt } from "@/lib/compute";
import { INK, MBody, MButton, MEmpty, MKick, MONO, MPill, MRow, MRule, MTop, useToast } from "@/components/m";
import PrintSheet from "@/components/m/stock/PrintSheet";
import { heldByStaff, lastCountedText } from "@/components/m/stock/stockdata";

const dt: React.CSSProperties = { margin: 0, padding: "11px 14px 11px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-600)" };
const dd: React.CSSProperties = { margin: 0, padding: "11px 0", borderBottom: "1px solid var(--color-divider)", textAlign: "right", fontWeight: 700 };

export default function MLinePage() {
  const params = useParams<{ itemId: string; si: string }>();
  const { s, isAdmin, mutate, busy } = useSnap();
  const { L } = useDerived();
  const toast = useToast();
  const [printing, setPrinting] = useState(false);
  // Stable, because MSheet re-runs its focus handling whenever onClose changes.
  const closePrint = useCallback(() => setPrinting(false), []);

  const itemId = decodeURIComponent(String(params.itemId || ""));
  const si = /^\d+$/.test(String(params.si || "")) ? Number(params.si) : -1;
  const it = s.catalog.find((x) => x.id === itemId);

  if (!it || it.archived || si < 0 || si >= it.sizes.length) {
    return (
      <>
        <MTop title="Stock line" back />
        <MRule />
        <MBody pad><MEmpty title="No such line" sub="It may have been archived." /></MBody>
      </>
    );
  }

  const k = key(it.id, si);
  const size = String(it.sizes[si]);
  const oh = onhand(s, L, k), par = reorderAt(s, k);
  const code = bcBound(s, it, si);
  const locs = locMap(s);
  const placedId = s.placed[k];
  const placed = placedId ? locs[placedId] : undefined;
  const shelf = placed ? (locTrail(locs, placed.id, 0) || placed.name) : "";
  const onOrder = onOrderText(s, it.id, si);
  const short = Math.max(0, par - oh);

  const addToDraft = async () => {
    const r = await mutate<{ added: number; qty: number }>("stock.orderLine", { itemId: it.id, si });
    if (!r.ok) { toast(r.error); return; }
    toast(r.result.added > 0 ? `Added ${r.result.added} to the draft order` : "Already on the draft order");
  };

  return (
    <>
      <MTop title={`${it.item} ${size}`} back />
      <MRule />
      <MBody pad>
        <MKick mono>{code || (it.sku ? `SKU ${it.sku}` : "No barcode")}</MKick>
        <h2 style={{ fontSize: 24, fontWeight: 900, margin: "2px 0 0", lineHeight: 1.1 }}>{label(it)} · {size}</h2>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: 14, borderBottom: "2px solid " + INK, paddingBottom: 12 }}>
          <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 0.95, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>
            {oh}<small style={{ fontSize: 22, fontWeight: 700, color: "var(--color-neutral-600)", letterSpacing: 0 }}> / {par} par</small>
          </div>
          {short > 0
            ? <MPill tone={oh <= 0 ? "accent" : "ink"}>{short} short</MPill>
            : <MPill tone="ok">At par</MPill>}
        </div>

        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", margin: "8px 0 0" }}>
          <dt style={dt}>Shelf</dt><dd style={dd}>{shelf || "Not on a shelf"}</dd>
          <dt style={dt}>On order</dt><dd style={dd}>{onOrder || "None"}</dd>
          <dt style={dt}>Last counted</dt><dd style={dd}>{lastCountedText(s, it.id, si)}</dd>
          <dt style={dt}>Held by staff</dt><dd style={{ ...dd, fontFamily: MONO }}>{heldByStaff(s, it.id, si)}</dd>
          <dt style={dt}>Unit cost</dt><dd style={{ ...dd, fontFamily: MONO }}>{money(it.cost)}</dd>
        </dl>

        <div style={{ marginTop: 4 }}>
          <MButton tone="ink" icon="print" label="Print a label" disabled={!code} onClick={() => setPrinting(true)} />
          {!code && <div style={{ fontSize: 13, color: "var(--color-neutral-600)", marginTop: 6 }}>No barcode bound</div>}
          {!code && isAdmin && <MButton label="Bind a barcode" href={`/m/catalogue/${encodeURIComponent(it.id)}`} />}
          {placed && <MButton label={`Count ${shelf}`} href={`/m/count/${encodeURIComponent(placed.id)}?line=${encodeURIComponent(k)}`} />}
          <MButton label={busy ? "Adding…" : "Add to the draft order"} onClick={addToDraft} disabled={busy} />
        </div>

        {isAdmin && (
          <div style={{ marginTop: 14 }}>
            <MRow chev href={`/m/catalogue/${encodeURIComponent(it.id)}`} title="Product card" />
          </div>
        )}
      </MBody>

      {code && <PrintSheet open={printing} onClose={closePrint} code={code} title={`${label(it)} ${size}`} />}
    </>
  );
}
