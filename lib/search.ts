/* Search and scan for the portal's command panel. Pure and client-safe. */
import { bcParse, daysBetween, heldByStaff, key, label, longLabel, onhand, setsCap, type GarmentCounts, type Item, type Ledger, type OrderRec, type PickupRec, type Snapshot, type StaffRec } from "./compute";

/** The fields of a /api/requests row the search reads. RequestRow (components/requests/RequestList) is assignable to it. */
export type SearchRequest = { id: string; code: string; status: string; staffName: string; managerId: string | null; managerName: string; decidedAt: string | null; createdAt: string };

export type SearchHit =
  | { kind: "person"; staff: StaffRec; held: GarmentCounts; cap: number; waitingBags: number; oldestWaitDays: number | null }
  | { kind: "waiting"; pickup: PickupRec; staff: StaffRec | undefined; days: number }
  | { kind: "approves"; request: SearchRequest }
  | { kind: "garment"; item: Item; onhand: number }
  | { kind: "order"; order: OrderRec };
export type SearchGroups = { person: SearchHit[]; waiting: SearchHit[]; approves: SearchHit[]; garment: SearchHit[]; order: SearchHit[] };

const LIMIT = 5;
const norm = (t: string) => String(t || "").toLowerCase().replace(/\s+/g, " ").trim();

export function searchPortal(s: Snapshot, d: { L: Ledger; byId: Record<string, Item> }, q: string, requests?: readonly SearchRequest[]): SearchGroups {
  const n = norm(q);
  if (!n) return { person: [], waiting: [], approves: [], garment: [], order: [] };
  const terms = n.split(" ");
  const hit = (hay: string) => { const h = norm(hay); return terms.every((t) => h.includes(t)); };
  const days = (p: PickupRec) => (p.received ? daysBetween(p.received, s.today) : 0);

  const people = s.staff
    .filter((st) => hit(`${st.first} ${st.last} ${st.num}`))
    .sort((a, b) =>
      Number(a.inactive) - Number(b.inactive)
      || Number(norm(b.num) === n) - Number(norm(a.num) === n)
      || `${a.last} ${a.first}`.localeCompare(`${b.last} ${b.first}`))
    .slice(0, LIMIT);
  const cap = setsCap(s.settings.capSets);
  const held = people.length ? heldByStaff(s) : {};
  const person: SearchHit[] = people.map((st) => {
    const w = s.pickups.filter((p) => !p.pickedUp && p.staffId === st.id);
    return { kind: "person", staff: st, held: held[st.id] || { tops: 0, pants: 0, other: 0, sets: 0 }, cap, waitingBags: w.length, oldestWaitDays: w.length ? Math.max(...w.map(days)) : null };
  });

  const ids = new Set(people.map((p) => p.id));
  const staffById: Record<string, StaffRec> = Object.fromEntries(s.staff.map((st) => [st.id, st]));
  const waiting: SearchHit[] = s.pickups
    .filter((p) => !p.pickedUp && (ids.has(p.staffId) || (!!p.orderCode && norm(p.orderCode).includes(n))))
    .map((p) => ({ kind: "waiting" as const, pickup: p, staff: staffById[p.staffId], days: days(p) }))
    .sort((a, b) => b.days - a.days)
    .slice(0, LIMIT);

  const approves: SearchHit[] = (requests || [])
    .filter((r) => r.status === "accepted" && !!r.managerId && ids.has(r.managerId))
    .slice(0, LIMIT)
    .map((r) => ({ kind: "approves" as const, request: r }));

  const garment: SearchHit[] = s.catalog
    .filter((it) => !it.archived && hit(`${longLabel(it)} ${label(it)} ${it.sku}`))
    .slice(0, LIMIT)
    .map((it) => ({ kind: "garment" as const, item: it, onhand: it.sizes.reduce((t, _, si) => t + Math.max(0, onhand(s, d.L, key(it.id, si))), 0) }));

  const order: SearchHit[] = s.orders
    .filter((o) => hit(`${o.code} ${o.ref} ${o.invoice} ${o.supplier}`))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, LIMIT)
    .map((o) => ({ kind: "order" as const, order: o }));

  return { person, waiting, approves, garment, order };
}

export type ScanTarget = { kind: "staff"; staffId: string } | { kind: "garment"; itemId: string; si: number } | { kind: "unknown"; code: string };

/** A staff badge carries the plain staff number (A1); anything else is a garment barcode, or unknown. */
export function resolveScan(s: Snapshot, raw: string): ScanTarget {
  const code = String(raw || "").trim();
  if (code) {
    const c = code.toLowerCase();
    const st = s.staff.find((x) => !x.inactive && !!x.num && x.num.trim().toLowerCase() === c);
    if (st) return { kind: "staff", staffId: st.id };
    const g = bcParse(s, code);
    if (g) return { kind: "garment", itemId: g.itemId, si: g.si };
  }
  return { kind: "unknown", code };
}
