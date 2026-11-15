/* Small shared pieces for the person-first counter (/app/counter). */
import { isOpen, type IssueRec, type Item, type Snapshot, type StaffRec } from "@/lib/compute";

export type Source = "stock" | "preloved" | "order";
/** src null = both shelf and pre-loved stock exist, so the coordinator must pick one. */
export type CartLine = { itemId: string; si: number; qty: number; src: Source | null };

export type Mode = "issue" | "return" | "handin" | "swap";
export const MODES: readonly Mode[] = ["issue", "return", "handin", "swap"];
export const MODE_LABELS: Record<Mode, string> = { issue: "Issue", return: "Return", handin: "Hand in", swap: "Swap a size" };

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "2 Sep": the counter's short date. */
export function dayMonth(iso: string): string {
  if (!iso || iso.length < 10) return "—";
  const d = new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }).replace("Sept", "Sep");
}

/** Words for the person, from the cut their record is set to. */
export function pronoun(st: StaffRec | undefined) {
  if (st?.uniformStyle === "Women's") return { poss: "Her", subj: "she", holds: "holds" } as const;
  if (st?.uniformStyle === "Men's") return { poss: "His", subj: "he", holds: "holds" } as const;
  return { poss: "Their", subj: "they", holds: "hold" } as const;
}

/** Garments out with this person now: issued, not returned, not handed in. Newest first. */
export function openIssuesOf(s: Snapshot, staffId: string): IssueRec[] {
  return s.issues
    .filter((i) => i.staffId === staffId && !i.returned && !i.handedIn)
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
}

export type HoldGroup = { itemId: string; si: number; qty: number; last: string; latest: IssueRec };
/** Open issues grouped by garment and size, quantities summed, most recent first. */
export function holdingGroups(open: IssueRec[]): HoldGroup[] {
  const m = new Map<string, HoldGroup>();
  for (const i of open) {
    const k = i.itemId + ":" + i.si;
    const g = m.get(k);
    if (!g) m.set(k, { itemId: i.itemId, si: i.si, qty: i.qty, last: i.date, latest: i });
    else { g.qty += i.qty; if (i.date > g.last) { g.last = i.date; g.latest = i; } }
  }
  return [...m.values()].sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0));
}

export type OwedLine = { key: string; itemId: string; size: string; qty: number; where: string };
/** What is committed to this person and not handed over yet, line by line: open orders (less what
 *  has arrived), pickups waiting, approved request lines. The same three things capCheck counts. */
export function owedLinesOf(s: Snapshot, staffId: string): OwedLine[] {
  const out: OwedLine[] = [];
  for (const o of s.orders) {
    if (o.staffId !== staffId || !isOpen(o)) continue;
    const got: Record<string, number> = {};
    for (const rc of o.receipts) for (const l of rc.lines) got[l.itemId + "|" + l.size] = (got[l.itemId + "|" + l.size] || 0) + l.qty;
    for (const l of o.lines) {
      const k = l.itemId + "|" + l.size, done = Math.min(l.qty, got[k] || 0);
      got[k] = (got[k] || 0) - done;
      if (l.qty > done) out.push({ key: "o" + l.id, itemId: l.itemId, size: l.size, qty: l.qty - done, where: `On order · ${o.code}` });
    }
  }
  for (const p of s.pickups) if (p.staffId === staffId && !p.pickedUp) p.lines.forEach((l, i) => out.push({ key: "p" + p.id + i, itemId: l.itemId, size: l.size, qty: l.qty, where: "Waiting to collect" }));
  (s.owedRequestLines || []).forEach((r, i) => { if (r.staffId === staffId) out.push({ key: "r" + i, itemId: r.itemId, size: "", qty: r.qty, where: "Approved request" }); });
  return out;
}

export const sizeOf = (it: Item | undefined, si: number) => (it ? String(it.sizes[si] ?? "?") : "?");

/** A real dialog, the command panel or any overlay is up, so page shortcuts stand down. */
export function overlayOpen(): boolean {
  return typeof document !== "undefined" && !!document.querySelector('[role="dialog"][aria-modal="true"], .overlay, .tc-cmd-overlay');
}
