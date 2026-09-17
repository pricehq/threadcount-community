/* The single source of queue membership for the coordinator portal (/app).
 *
 * Today's queue, the rail badges, the command panel and the Reports strip all read from here, so a
 * number on the rail and the head count on the screen it opens are the same number. Pure functions
 * over the snapshot, plus a small context the shell fills with the four counts only the server can
 * make (requests live outside the snapshot). */
import { createContext, useContext, useMemo } from "react";
import {
  addDays, ccOfIssue, countsAsIssued, daysBetween, forecastFor, isOverdue, isPlacedOpen, locSubtree, onhand, reorderAt, splitKey, touched, variantList,
  type Forecast, type Item, type Ledger, type LocationRec, type OrderRec, type PickupRec, type Snapshot, type StaffRec, type StocktakeRec, type Variant,
} from "./compute";
import { useDerived, useSnap } from "./client";

export const PICKUP_LATE_DAYS = 14;
export const RECEIVE_SOON_DAYS = 2;
export const COUNT_DUE_DAYS = 30;

export type ServerCounts = { pick: number; stranded: number; queries: number; damage: number };
export const EMPTY_SERVER_COUNTS: ServerCounts = { pick: 0, stranded: 0, queries: 0, damage: 0 };

/* Wards with at least one active ward-desk person, cached per snapshot object. */
const deskCache = new WeakMap<Snapshot, Set<string>>();
function deskWards(s: Snapshot): Set<string> {
  let w = deskCache.get(s);
  if (!w) {
    w = new Set(s.staff.filter((x) => !x.inactive && x.wardDesk && x.dept).map((x) => x.dept));
    deskCache.set(s, w);
  }
  return w;
}

/** C14: a bag goes on the round when nobody has called about it and its person's ward has a desk. */
export function isRoundPickup(s: Snapshot, p: PickupRec, staffById: Record<string, StaffRec>): boolean {
  if (p.contacted) return false;
  const st = staffById[p.staffId];
  return !!st && !!st.dept && deskWards(s).has(st.dept);
}

export function waitingPickups(s: Snapshot, staffById: Record<string, StaffRec>, opts?: { includeRound?: boolean }): { p: PickupRec; days: number; late: boolean }[] {
  return s.pickups
    .filter((p) => !p.pickedUp && (opts?.includeRound || !isRoundPickup(s, p, staffById)))
    .map((p) => {
      const days = p.received ? daysBetween(p.received, s.today) : 0;
      return { p, days, late: days >= PICKUP_LATE_DAYS };
    })
    .sort((a, b) => b.days - a.days);
}

export function roundWards(s: Snapshot, staffById: Record<string, StaffRec>): { ward: string; pickups: PickupRec[]; garments: number; people: StaffRec[]; desk: StaffRec[] }[] {
  const by = new Map<string, PickupRec[]>();
  for (const p of s.pickups) {
    if (p.pickedUp || !isRoundPickup(s, p, staffById)) continue;
    const ward = staffById[p.staffId].dept;
    const list = by.get(ward) || [];
    list.push(p);
    by.set(ward, list);
  }
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ward, pickups]) => {
      const people: StaffRec[] = [];
      for (const p of pickups) { const st = staffById[p.staffId]; if (st && !people.includes(st)) people.push(st); }
      return {
        ward, pickups, people,
        garments: pickups.reduce((t, p) => t + p.lines.reduce((u, l) => u + l.qty, 0), 0),
        desk: s.staff.filter((x) => !x.inactive && x.wardDesk && x.dept === ward),
      };
    });
}

export function receiveOrders(s: Snapshot): { o: OrderRec; overdueDays: number; dueInDays: number | null }[] {
  const soon = addDays(s.today, RECEIVE_SOON_DAYS);
  return s.orders
    .filter((o) => isPlacedOpen(o) && !!o.expected && o.expected <= soon)
    .map((o) => {
      const overdue = o.expected < s.today;
      return { o, overdueDays: overdue ? daysBetween(o.expected, s.today) : 0, dueInDays: overdue ? null : daysBetween(s.today, o.expected) };
    })
    .sort((a, b) => {
      const ao = a.dueInDays === null, bo = b.dueInDays === null;
      if (ao !== bo) return ao ? -1 : 1;
      if (ao) return b.overdueDays - a.overdueDays;
      return (a.dueInDays ?? 0) - (b.dueInDays ?? 0);
    });
}

/** Locations due a shelf count (A2). A whole-room shelf count (no location) counts every location. */
export function countsDue(s: Snapshot): { loc: LocationRec; lastCounted: string | null; days: number | null; sizes: number; itemIds: string[] }[] {
  const byId: Record<string, LocationRec> = Object.fromEntries(s.locations.map((l) => [l.id, l]));
  const liveItems = new Set(s.catalog.filter((i) => !i.archived).map((i) => i.id));
  const shelf = s.stocktakes.filter((t) => t.mode !== "preloved");
  const ancestors = (id: string): Set<string> => {
    const out = new Set<string>();
    for (let cur: LocationRec | undefined = byId[id]; cur && !out.has(cur.id); cur = cur.parentId ? byId[cur.parentId] : undefined) out.add(cur.id);
    return out;
  };
  const rows = s.locations.filter((l) => !l.archived).map((loc) => {
    const sub = locSubtree(s, loc.id);
    const itemIds = new Set<string>();
    let sizes = 0;
    for (const [k, locId] of Object.entries(s.placed)) {
      if (!sub.has(locId)) continue;
      const { itemId } = splitKey(k);
      if (!liveItems.has(itemId)) continue;
      sizes++;
      itemIds.add(itemId);
    }
    const up = ancestors(loc.id);
    let lastCounted: string | null = null;
    for (const t of shelf) if ((t.locationId === null || up.has(t.locationId)) && (!lastCounted || t.date > lastCounted)) lastCounted = t.date;
    const days = lastCounted ? daysBetween(lastCounted, s.today) : null;
    return { loc, lastCounted, days, sizes, itemIds: [...itemIds], due: sizes > 0 && (lastCounted === null || (days ?? 0) >= COUNT_DUE_DAYS) };
  });
  const dueIds = new Set(rows.filter((r) => r.due).map((r) => r.loc.id));
  return rows
    .filter((r) => r.due && ![...ancestors(r.loc.id)].some((a) => a !== r.loc.id && dueIds.has(a)))
    .sort((a, b) => {
      if (a.lastCounted === null && b.lastCounted !== null) return -1;
      if (b.lastCounted === null && a.lastCounted !== null) return 1;
      return (b.days ?? 0) - (a.days ?? 0);
    })
    .map(({ loc, lastCounted, days, sizes, itemIds }) => ({ loc, lastCounted, days, sizes, itemIds }));
}

/** The only "at reorder" rule: live, touched, on hand at or below its reorder level. */
export function atReorderVariants(s: Snapshot, L: Ledger): Variant[] {
  return variantList(s).filter((v) => touched(s, L, v.key) && onhand(s, L, v.key) <= reorderAt(s, v.key));
}

export function runsOut(s: Snapshot, L: Ledger, byId: Record<string, Item>): { v: Variant; oh: number; ro: number; f: Forecast; coverDays: number | null }[] {
  const out: { v: Variant; oh: number; ro: number; f: Forecast; coverDays: number | null }[] = [];
  for (const v of atReorderVariants(s, L)) {
    const oh = onhand(s, L, v.key), ro = reorderAt(s, v.key);
    const f = forecastFor(s, L, byId, v.key);
    if (!(oh <= 0 || f.runsOutBeforeDelivery)) continue;
    out.push({ v, oh, ro, f, coverDays: f.weeksOfCover === null ? null : Math.round(f.weeksOfCover * 7) });
  }
  return out.sort((a, b) => {
    const ao = a.oh <= 0 ? 0 : 1, bo = b.oh <= 0 ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return (a.coverDays ?? Infinity) - (b.coverDays ?? Infinity);
  });
}

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function monthEnd(s: Snapshot, L: Ledger, byId: Record<string, Item>, staffById: Record<string, StaffRec>, month: string): {
  deliveriesOverdue: number;
  stocktakeFiled: StocktakeRec | null;
  unsignedReceipts: number;
  unallocated: number;
  journalReady: boolean;
  daysLeft: number;
} {
  const current = s.today.slice(0, 7) === month;
  const inMonth = (d: string) => !!d && d.slice(0, 7) === month;
  const deliveriesOverdue = current
    ? s.orders.filter((o) => isOverdue(o, s.today)).length
    : s.orders.filter((o) => isPlacedOpen(o) && inMonth(o.date)).length;
  let stocktakeFiled: StocktakeRec | null = null;
  for (const t of s.stocktakes) if (t.mode !== "preloved" && inMonth(t.date) && (!stocktakeFiled || t.date > stocktakeFiled.date)) stocktakeFiled = t;
  const unsignedReceipts = s.issues.filter((i) => !i.receipt && !i.returned && !i.handedIn).length;
  const unallocated = s.issues.filter((i) => inMonth(i.date) && countsAsIssued(i) && !i.preloved && ccOfIssue(s, i, staffById[i.staffId]) === "").length;
  const end = lastDayOfMonth(month);
  void L; void byId;
  return {
    deliveriesOverdue, stocktakeFiled, unsignedReceipts, unallocated,
    journalReady: !!stocktakeFiled && unallocated === 0,
    daysLeft: end < s.today ? 0 : daysBetween(s.today, end),
  };
}

export type PortalCounts = {
  today: { total: number; overdue: number; groups: { collect: number; round: number; pick: number; receive: number; counts: number } };
  stock: { garmentsAtReorder: number; out: number; onOrder: number; noBarcode: number };
  orders: { overdue: number; toOrderLines: number };
  people: { attention: number; stranded: number };
};

export function portalCounts(s: Snapshot, d: { L: Ledger; byId: Record<string, Item>; staffById: Record<string, StaffRec> }, server: ServerCounts, isAdmin: boolean): PortalCounts {
  const { L, staffById } = d;
  const collect = waitingPickups(s, staffById).length;
  const round = roundWards(s, staffById).reduce((t, w) => t + w.pickups.length, 0);
  const receive = receiveOrders(s).length;
  const counts = countsDue(s).length;
  const groups = { collect, round, pick: server.pick, receive, counts };
  const overdueOrders = s.orders.filter((o) => isOverdue(o, s.today)).length;
  const latePickups = waitingPickups(s, staffById, { includeRound: true }).filter((w) => w.late).length;

  const reorder = atReorderVariants(s, L);
  const bound = new Set(Object.values(s.barcodes));
  let out = 0, noBarcode = 0;
  for (const v of variantList(s)) {
    if (!touched(s, L, v.key)) continue;
    if (onhand(s, L, v.key) <= 0) out++;
    if (!bound.has(v.key)) noBarcode++;
  }
  let onOrder = 0;
  for (const o of s.orders) {
    if (!isPlacedOpen(o)) continue;
    const got = o.receipts.reduce((t, r) => t + r.lines.reduce((u, l) => u + l.qty, 0), 0);
    onOrder += Math.max(0, o.lines.reduce((t, l) => t + l.qty, 0) - got);
  }
  return {
    today: { total: collect + round + server.pick + receive + counts, overdue: latePickups + overdueOrders, groups },
    stock: { garmentsAtReorder: new Set(reorder.map((v) => v.itemId)).size, out, onOrder, noBarcode },
    orders: { overdue: overdueOrders, toOrderLines: isAdmin ? reorder.length : 0 },
    people: { attention: server.stranded + server.queries + server.damage, stranded: server.stranded },
  };
}

export const PortalCountsContext = createContext<ServerCounts>(EMPTY_SERVER_COUNTS);
export function useServerCounts(): ServerCounts { return useContext(PortalCountsContext); }
export function usePortalCounts(): PortalCounts {
  const { s, isAdmin } = useSnap();
  const d = useDerived();
  const server = useServerCounts();
  return useMemo(() => portalCounts(s, d, server, isAdmin), [s, d, server, isAdmin]);
}
