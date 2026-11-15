/* Figures the Stock tab and a stock line's page both read, so the two never disagree. Pure. */
import { UNPLACED, bcBound, daysBetween, isOpen, key, locSubtree, locTree, onhand, touched, type Item, type Ledger, type Snapshot, type Variant } from "@/lib/compute";

export type CountRow = { id: string; name: string; depth: number; lines: number; units: number; last: string | undefined };
/** The shelves Count a shelf lists: every location holding placed garments, then the unplaced bucket
 *  (the same test the counting and variance screens use for it). */
export function countRows(s: Snapshot, L: Ledger, variants: Variant[]): CountRow[] {
  const lastAt: Record<string, string> = {};
  for (const t of s.stocktakes) if (t.mode !== "preloved" && t.locationId && (!lastAt[t.locationId] || t.date > lastAt[t.locationId])) lastAt[t.locationId] = t.date;
  const out: CountRow[] = locTree(s).map(({ loc, depth }) => {
    const sub = locSubtree(s, loc.id);
    const mine = variants.filter((v) => sub.has(s.placed[v.key] || ""));
    return { id: loc.id, name: loc.name, depth, lines: mine.length, units: mine.reduce((t, v) => t + onhand(s, L, v.key), 0), last: lastAt[loc.id] };
  }).filter((r) => r.lines > 0);
  const loose = variants.filter((v) => !s.placed[v.key] && (touched(s, L, v.key) || !!bcBound(s, v.item, v.si)));
  if (loose.length) out.push({ id: UNPLACED, name: "Not on a shelf yet", depth: 0, lines: loose.length, units: loose.reduce((t, v) => t + onhand(s, L, v.key), 0), last: undefined });
  return out;
}

/** Outstanding units per variant key on open orders placed with a supplier (drafts excluded) —
 *  the same set onOrderText() reads for one size. */
export function placedOnOrder(s: Snapshot, byId: Record<string, Item>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of s.orders) {
    if (!isOpen(o) || o.status === "Draft") continue;
    const got: Record<string, number> = {};
    for (const rc of o.receipts) for (const l of rc.lines) got[l.itemId + "|" + l.size] = (got[l.itemId + "|" + l.size] || 0) + l.qty;
    for (const l of o.lines) {
      const g = l.itemId + "|" + l.size;
      const done = Math.min(l.qty, got[g] || 0);
      got[g] = (got[g] || 0) - done;
      if (l.qty <= done) continue;
      const it = byId[l.itemId];
      if (!it) continue;
      const si = it.sizes.findIndex((z) => String(z) === l.size);
      if (si < 0) continue;
      const k = key(it.id, si);
      out[k] = (out[k] || 0) + l.qty - done;
    }
  }
  return out;
}

/** "Today", "Yesterday", "n days ago" or "Never", from the newest shelf count holding this line. */
export function lastCountedText(s: Snapshot, itemId: string, si: number): string {
  let last = "";
  for (const t of s.stocktakes) {
    if (t.mode === "preloved" || (last && t.date <= last)) continue;
    if (t.lines.some((l) => l.itemId === itemId && l.si === si)) last = t.date;
  }
  if (!last) return "Never";
  const n = daysBetween(last, s.today);
  return n <= 0 ? "Today" : n === 1 ? "Yesterday" : `${n} days ago`;
}

/** Units of one size out in staff hands now: issued, not returned, not handed in. */
export function heldByStaff(s: Snapshot, itemId: string, si: number): number {
  let n = 0;
  for (const i of s.issues) if (i.itemId === itemId && i.si === si && !i.returned && !i.handedIn) n += i.qty;
  return n;
}

type Ranked = { oh: number; par: number; name: string };
/** Worst first: on hand as a share of par, par 0 last. */
export function byShortfall(a: Ranked, b: Ranked): number {
  const ra = a.par > 0 ? a.oh / a.par : Infinity, rb = b.par > 0 ? b.oh / b.par : Infinity;
  if (ra !== rb) return ra < rb ? -1 : 1;
  return a.oh - b.oh || a.name.localeCompare(b.name);
}

/** Rows drawn per page on the long lists; the rest arrive with "Show more", never silently cut. */
export const PAGE = 200;
