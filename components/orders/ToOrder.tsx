"use client";
/* The left column of /app/orders for admins: "To order", one panel per supplier. It replaces Order
 * flagged, the Suggested order panel and the separate order list. */
import { useMemo, useState } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { onOrderByKey, supplierMeta, toOrderGroups, type SupplierGroup } from "./toOrder";
import { SupplierPanel, type Raised } from "./SupplierPanel";
import { plural } from "./bits";

export default function ToOrder() {
  const { s } = useSnap();
  const { L, byId } = useDerived();
  const groups = useMemo(() => toOrderGroups(s, L, byId), [s, L, byId]);
  const oo = useMemo(() => onOrderByKey(s, byId), [s, byId]);
  // Results stay on screen after raising even when the supplier no longer has anything to order.
  const [raised, setRaised] = useState<Record<string, { orders: Raised[]; mail: Record<string, string> }>>({});

  const panels: SupplierGroup[] = [...groups];
  for (const sup of Object.keys(raised)) {
    if (!panels.some((g) => g.supplier === sup)) panels.push({ supplier: sup, ...supplierMeta(s, sup), lines: [], drafts: [] });
  }
  panels.sort((a, b) => a.supplier.localeCompare(b.supplier));

  const lineCount = groups.reduce((t, g) => t + g.lines.length + g.drafts.reduce((u, o) => u + o.lines.length, 0), 0);
  const supplierCount = groups.filter((g) => g.lines.length + g.drafts.length > 0).length;

  return (
    <>
      <div className="tc-orders-title">
        <h2>To order</h2>
        <span className="tc-mono" style={{ fontSize: 12, color: "#57534f" }}>{plural(lineCount, "line")} · {plural(supplierCount, "supplier")}</span>
      </div>
      {panels.length === 0 && <div className="tc-orders-rowmeta">Nothing to order.</div>}
      {panels.map((g) => {
        const full = groups.find((x) => x.supplier === g.supplier) || g;
        return (
          <SupplierPanel key={g.supplier} group={full} oo={oo} raised={raised[g.supplier]}
            onRaised={(orders, mail) => setRaised((r) => ({ ...r, [g.supplier]: { orders, mail } }))}
            onDone={() => setRaised((r) => { const n = { ...r }; delete n[g.supplier]; return n; })} />
        );
      })}
    </>
  );
}
