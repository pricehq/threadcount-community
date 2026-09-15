/* Shared shaping for the counter phone's Work tab and the screens it opens (pick a request, receive a
 * delivery, sign a ward round). No rules of its own: membership comes from lib/today.ts and
 * lib/portalcounts.ts, so the Work badge, the segments and Today agree. */
import {
  ccOf, daysBetween, isPlacedOpen, label, locTrail, sizeIndexOf,
  type Item, type LocationRec, type OrderRec, type Snapshot, type StaffRec,
} from "@/lib/compute";
import { weekdayDayMonth, type RoundSheetRow } from "@/lib/today";

/** "Scrub top, navy M": the garment and its size as the Work rows print them. */
export const garmentSize = (it: Item | undefined, fallbackName: string, size: string | number) =>
  `${it ? label(it) : fallbackName} ${size}`;

/** "Theatres · 2291 · Theatres · CC 4200", blank parts dropped. */
export function personMeta(s: Snapshot, st: StaffRec | undefined, ward?: string): string {
  if (!st) return ward || "";
  const cc = ccOf(s, st);
  return [st.group, st.num, st.dept, cc ? `CC ${cc}` : ""].filter((x) => x && String(x).trim()).join(" · ");
}

export const locMap = (s: Snapshot): Record<string, LocationRec> => Object.fromEntries(s.locations.map((l) => [l.id, l]));

/** Where a variant lives on the shelves, or "". */
export const shelfOf = (s: Snapshot, locs: Record<string, LocationRec>, itemId: string, si: number) =>
  locTrail(locs, s.placed[`${itemId}:${si}`], 0);

/** Orders a delivery can be received against: placed with the supplier and not closed. */
export const RECEIVABLE = ["Ordered", "Shipped", "Back Order"];

export type OutLine = { id: string; itemId: string; size: string; si: number; ordered: number; outstanding: number };
/** Each line still owed on an order after earlier part deliveries. */
export function outstandingLines(o: OrderRec, byId: Record<string, Item>): OutLine[] {
  return o.lines.map((l) => {
    const already = o.receipts.reduce((t, r) => t + r.lines.filter((x) => x.itemId === l.itemId && x.size === l.size).reduce((a, x) => a + x.qty, 0), 0);
    return { id: l.id, itemId: l.itemId, size: l.size, si: sizeIndexOf(byId[l.itemId], l.size), ordered: l.qty, outstanding: Math.max(0, l.qty - already) };
  }).filter((l) => l.outstanding > 0);
}

export const outstandingTotal = (o: OrderRec, byId: Record<string, Item>) =>
  outstandingLines(o, byId).reduce((t, l) => t + l.outstanding, 0);

/** Every open placed order that still has something to come. */
export function openReceivable(s: Snapshot, byId: Record<string, Item>): OrderRec[] {
  return s.orders.filter((o) => isPlacedOpen(o) && RECEIVABLE.includes(o.status) && outstandingLines(o, byId).length > 0);
}

/** "Due today", "3d overdue", "Due Thu 18 Sep", or the order's status when nobody gave a date. */
export function orderWhen(s: Snapshot, o: OrderRec): string {
  if (!o.expected) return o.status;
  if (o.expected < s.today) return `${daysBetween(o.expected, s.today)}d overdue`;
  if (o.expected === s.today) return "Due today";
  return `Due ${weekdayDayMonth(o.expected, s.tz)}`;
}

export type RoundLine = { key: string; itemId: string; size: string; name: string; qty: number };
/** A ward's waiting bags summed by garment and size, for the round's Handing over list. */
export function roundLines(rows: RoundSheetRow[], byId: Record<string, Item>): RoundLine[] {
  const m = new Map<string, RoundLine>();
  for (const r of rows) for (const l of r.p.lines) {
    const k = `${l.itemId}|${l.size}`;
    const cur = m.get(k);
    if (cur) cur.qty += l.qty;
    else m.set(k, { key: k, itemId: l.itemId, size: l.size, name: garmentSize(byId[l.itemId], "Garment", l.size), qty: l.qty });
  }
  return [...m.values()];
}

/** A route segment, decoded once whether or not the router already decoded it. */
export function segment(v: string | string[] | undefined): string {
  const raw = Array.isArray(v) ? v[0] : v || "";
  try { return decodeURIComponent(raw); } catch { return raw; }
}
