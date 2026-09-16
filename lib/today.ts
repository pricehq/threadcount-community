/* Display rows for the Today queue (/app) and the delivery rounds sheet (/app/rounds).
 *
 * Membership comes only from lib/portalcounts.ts: this file shapes the rows those selectors return
 * into the words and figures a row prints, and adds no rule of its own about what belongs where. */
import {
  addDays, ccOf, facilityDate, formatInZone, label, leadDaysOf, locTrail, staffName, supplierInfo, telHref,
  type Item, type Ledger, type LocationRec, type OrderRec, type PickupRec, type Snapshot, type StaffRec,
} from "./compute";
import { PICKUP_LATE_DAYS, countsDue, monthEnd, receiveOrders, roundWards, runsOut, waitingPickups } from "./portalcounts";

/** "15 Sep" */
export function dayMonth(iso: string, tz: string): string {
  return iso ? formatInZone(iso, tz, { day: "numeric", month: "short" }) : "";
}
/** "Fri 11 Sep" */
export function weekdayDayMonth(iso: string, tz: string): string {
  return iso ? formatInZone(iso, tz, { weekday: "short", day: "numeric", month: "short" }) : "";
}
/** "today", "yesterday" or "9 Sep" for an instant or a date, in the facility's zone. */
export function relativeDay(iso: string | null | undefined, s: Snapshot): string {
  if (!iso) return "";
  const d = facilityDate(iso, s.tz);
  if (!d) return "";
  if (d === s.today) return "today";
  if (d === addDays(s.today, -1)) return "yesterday";
  return dayMonth(d, s.tz);
}

/** The head's count line. */
export function todayHeadLine(total: number, overdue: number): string {
  const base = total === 0 ? "Nothing needs a person" : total === 1 ? "1 thing needs a person" : `${total} things need a person`;
  return overdue > 0 ? `${base} · ${overdue} overdue` : base;
}

export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export type PickupLine = { garment: string; size: string; qty: number };
export function pickupLines(p: PickupRec, byId: Record<string, Item>): PickupLine[] {
  return p.lines.map((l) => ({ garment: label(byId[l.itemId]), size: l.size, qty: l.qty }));
}

/** The collection slip payload, exactly as the dashboard built it. */
export function collectionSlip(s: Snapshot, p: PickupRec, st: StaffRec | undefined): Record<string, string | number | boolean | undefined> {
  const ord = s.orders.find((o) => o.id === p.orderId);
  return { staffName: staffName(st), dept: st?.dept, sets: p.lines.reduce((t, l) => t + l.qty, 0), po: ord?.ref || ord?.code || "", dateReceived: p.received, notifiedPhone: p.contacted, dateNotified: "" };
}

export type CollectRow = { p: PickupRec; st: StaffRec | undefined; days: number; late: boolean; name: string; phone: string; tel: string; lines: PickupLine[] };
/** `includeRound` keeps the bags going out on a ward round in the list too (the counter phone's
 *  Pickups, where the owner can still turn up at the window). */
export function collectRows(s: Snapshot, byId: Record<string, Item>, staffById: Record<string, StaffRec>, opts?: { includeRound?: boolean }): CollectRow[] {
  return waitingPickups(s, staffById, opts).map(({ p, days, late }) => {
    const st = staffById[p.staffId];
    return { p, st, days, late, name: staffName(st, "Staff"), phone: st?.phone || "", tel: telHref(st?.phone), lines: pickupLines(p, byId) };
  });
}

export type RoundRow = { ward: string; bags: number; garments: number; names: string[]; moreNames: number; desk: boolean; href: string };
export function roundRows(s: Snapshot, staffById: Record<string, StaffRec>): RoundRow[] {
  return roundWards(s, staffById).map((w) => ({
    ward: w.ward,
    bags: w.pickups.length,
    garments: w.garments,
    names: w.people.slice(0, 3).map((p) => staffName(p)),
    moreNames: Math.max(0, w.people.length - 3),
    desk: w.desk.length > 0,
    href: `/app/rounds?ward=${encodeURIComponent(w.ward)}`,
  }));
}

export type ReceiveRow = { o: OrderRec; overdue: boolean; age: string; ageLabel: string; lines: number; expected: string; forName: string; chase: string };
export function receiveRows(s: Snapshot, staffById: Record<string, StaffRec>): ReceiveRow[] {
  return receiveOrders(s).map(({ o, overdueDays, dueInDays }) => {
    const overdue = dueInDays === null;
    const sup = supplierInfo(s, o.supplier);
    const chase = sup?.email ? `mailto:${sup.email}?subject=${encodeURIComponent(o.code)}` : telHref(sup?.phone);
    return {
      o, overdue,
      age: overdue ? `${overdueDays}d` : dueInDays === 0 ? "today" : `${dueInDays}d`,
      ageLabel: overdue ? "overdue" : "due",
      lines: o.lines.length,
      expected: weekdayDayMonth(o.expected, s.tz),
      forName: o.staffId ? staffName(staffById[o.staffId]) : "",
      chase,
    };
  });
}

export type CountRow = { loc: LocationRec; trail: string; age: string; ageLabel: string; garments: string[]; last: string; sizes: number; href: string };
export function countRows(s: Snapshot, byId: Record<string, Item>): CountRow[] {
  const locById: Record<string, LocationRec> = Object.fromEntries(s.locations.map((l) => [l.id, l]));
  return countsDue(s).map(({ loc, lastCounted, days, sizes, itemIds }) => ({
    loc,
    trail: locTrail(locById, loc.id, 0) || loc.name,
    age: days === null ? "—" : `${days}d`,
    ageLabel: days === null ? "never" : "since",
    garments: itemIds.slice(0, 3).map((id) => label(byId[id])),
    last: lastCounted ? `last counted ${dayMonth(lastCounted, s.tz)}` : "never counted",
    sizes,
    href: `/app/stock?tab=count&location=${encodeURIComponent(loc.id)}`,
  }));
}

export type RunsOutRow = { key: string; itemId: string; name: string; size: string; oh: number; ro: number; leadDays: number; coverDays: number | null; out: boolean; short: boolean };
export function runsOutRows(s: Snapshot, L: Ledger, byId: Record<string, Item>): RunsOutRow[] {
  return runsOut(s, L, byId).map(({ v, oh, ro, f, coverDays }) => {
    const leadDays = leadDaysOf(s, v.item.supplier) || Math.round(f.leadWeeks * 7);
    return {
      key: v.key, itemId: v.itemId, name: label(v.item), size: v.size, oh, ro, leadDays, coverDays,
      out: oh <= 0,
      short: coverDays !== null && coverDays < leadDays,
    };
  });
}

export type MonthEndView = ReturnType<typeof monthEnd> & { month: string; monthName: string; stocktakeDate: string };
export function monthEndView(s: Snapshot, L: Ledger, byId: Record<string, Item>, staffById: Record<string, StaffRec>): MonthEndView {
  const month = s.today.slice(0, 7);
  const m = monthEnd(s, L, byId, staffById, month);
  return { ...m, month, monthName: formatInZone(`${month}-01`, s.tz, { month: "long" }), stocktakeDate: m.stocktakeFiled ? dayMonth(m.stocktakeFiled.date, s.tz) : "" };
}

/** The delivery rounds sheet: every uncollected pickup (round or not), by ward, wards A–Z. */
export type RoundSheetRow = { p: PickupRec; st: StaffRec | undefined; name: string; phone: string; tel: string; days: number; late: boolean; lines: PickupLine[] };
export type RoundSheetWard = { ward: string; cc: string; rows: RoundSheetRow[]; garments: number };
export function roundSheet(s: Snapshot, byId: Record<string, Item>, staffById: Record<string, StaffRec>): RoundSheetWard[] {
  const wards = new Map<string, RoundSheetRow[]>();
  for (const { p, days } of waitingPickups(s, staffById, { includeRound: true })) {
    const st = staffById[p.staffId];
    const w = st?.dept || "Unknown";
    const list = wards.get(w) || [];
    list.push({ p, st, name: staffName(st, "Staff"), phone: st?.phone || "", tel: telHref(st?.phone), days, late: days >= PICKUP_LATE_DAYS, lines: pickupLines(p, byId) });
    wards.set(w, list);
  }
  return [...wards.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([ward, rows]) => {
    const st0 = rows.find((r) => r.st)?.st;
    return { ward, rows, cc: st0 ? ccOf(s, st0) : "", garments: rows.reduce((t, r) => t + r.lines.reduce((u, l) => u + l.qty, 0), 0) };
  });
}
