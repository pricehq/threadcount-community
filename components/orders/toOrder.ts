/* The To order list, pure. Membership comes only from atReorderVariants() (lib/portalcounts.ts) so
 * the Orders badge, the Stock filter and this list agree; this file adds the per-line fields. */
import { atReorderVariants } from "@/lib/portalcounts";
import {
  forecastFor, key, label, onOrderMap, onhand, reorderAt, supplierCodeOf, supplierInfo,
  type Item, type Ledger, type OrderRec, type Snapshot,
} from "@/lib/compute";

export type ToOrderLine = {
  key: string; itemId: string; si: number; size: string; name: string;
  supplier: string; code: string; oh: number; ro: number; onOrder: number;
  qty: number; perWeek: number | null; runsOut: boolean; cost: number;
};

export type SupplierGroup = {
  supplier: string; lead: number | null; email: string;
  lines: ToOrderLine[]; drafts: OrderRec[];
};

export const supplierOf = (s: Snapshot, it: Item | undefined) => it?.supplier || s.settings.suppliers[0] || "Supplier";

export function supplierMeta(s: Snapshot, name: string): { lead: number | null; email: string } {
  const info = supplierInfo(s, name);
  return { lead: info?.lead && info.lead > 0 ? info.lead : null, email: info?.email || "" };
}

/** Stock on every open order, drafts included. Drafts are raised from the same panel as the
 *  suggested lines, so a quantity already sitting in any draft (a replenishment draft too) must not
 *  be suggested a second time. */
export function onOrderByKey(s: Snapshot, byId: Record<string, Item>): Record<string, number> {
  return onOrderMap(s, byId).byKey;
}

/** One size's figures, whether it came from the reorder rule or was added by hand. */
export function lineFor(s: Snapshot, L: Ledger, byId: Record<string, Item>, oo: Record<string, number>, itemId: string, si: number): ToOrderLine | null {
  const it = byId[itemId];
  if (!it || si < 0 || si >= it.sizes.length) return null;
  const k = key(itemId, si);
  const oh = onhand(s, L, k), ro = reorderAt(s, k);
  const onOrder = oo[k] || 0;
  const f = forecastFor(s, L, byId, k);
  return {
    key: k, itemId, si, size: String(it.sizes[si]), name: label(it), supplier: supplierOf(s, it),
    code: supplierCodeOf(s, k), oh, ro, onOrder,
    qty: Math.max(ro * 2 - oh - onOrder, 0),
    perWeek: f.avgWeekly === null ? null : Math.round(f.avgWeekly * 10) / 10,
    runsOut: f.runsOutBeforeDelivery || (oh <= 0 && f.avgWeekly !== null),
    cost: it.cost || 0,
  };
}

export const sortLines = (a: ToOrderLine, b: ToOrderLine) =>
  Number(b.runsOut) - Number(a.runsOut) || a.name.localeCompare(b.name) || a.si - b.si;

/** Supplier panels A–Z: every supplier with a size at reorder or a draft with lines. */
export function toOrderGroups(s: Snapshot, L: Ledger, byId: Record<string, Item>): SupplierGroup[] {
  const oo = onOrderByKey(s, byId);
  const by = new Map<string, SupplierGroup>();
  const group = (name: string) => {
    let g = by.get(name);
    if (!g) { g = { supplier: name, ...supplierMeta(s, name), lines: [], drafts: [] }; by.set(name, g); }
    return g;
  };
  for (const v of atReorderVariants(s, L)) {
    const line = lineFor(s, L, byId, oo, v.itemId, v.si);
    if (line) group(line.supplier).lines.push(line);
  }
  for (const o of s.orders) if (o.status === "Draft" && o.lines.length > 0) group(o.supplier || "No supplier").drafts.push(o);
  for (const g of by.values()) { g.lines.sort(sortLines); g.drafts.sort((a, b) => a.code.localeCompare(b.code)); }
  return [...by.values()].sort((a, b) => a.supplier.localeCompare(b.supplier));
}

/** A draft's value at catalogue cost (a draft has no receipts). */
export const draftValue = (o: OrderRec, byId: Record<string, Item>) => o.lines.reduce((t, l) => t + l.qty * (byId[l.itemId]?.cost || 0), 0);

/** The size index of an order line, or -1. */
export const siOf = (it: Item | undefined, size: string) => (it ? it.sizes.map(String).indexOf(size) : -1);
