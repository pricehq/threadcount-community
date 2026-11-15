"use client";
/* Today's figures, worked out once from the snapshot: the To do rows (each only when there is
 * something to do), Your day, and Recent. Membership comes from the shared selectors
 * (lib/portalcounts.ts through lib/today.ts and lib/workcount.ts), so Today, the Work badge and the
 * Work segments cannot disagree about what is waiting. */
import { useMemo } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { formatInZone, onhand, reorderAt, staffName, variantName } from "@/lib/compute";
import { PICKUP_LATE_DAYS, atReorderVariants } from "@/lib/portalcounts";
import { collectRows, countRows, dayMonth, plural, receiveRows } from "@/lib/today";
import { PICK_STATUSES } from "@/lib/workcount";
import { useRequests } from "@/components/requests/RequestList";

export type TodoRow = { key: string; n: string; accent: boolean; title: string; sub: string; href: string };
export type RecentRow = { key: string; title: string; sub: string; right: string; href?: string };
export type TodayView = {
  kicker: string;
  todo: TodoRow[];
  day: { issued: number; back: number; counted: number };
  recent: RecentRow[];
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Wed 16 Sep" from a facility date, without the locale's comma or four-letter "Sept". */
export function shortDate(iso: string): string {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1, d = +iso.slice(8, 10);
  if (!y || m < 0 || !d) return "";
  return `${WEEKDAYS[new Date(Date.UTC(y, m, d)).getUTCDay()]} ${d} ${MONTHS[m]}`;
}

/** Names, at most four, then "+n". */
function names(list: string[]): string {
  const uniq = [...new Set(list.filter(Boolean))];
  return uniq.slice(0, 4).join(", ") + (uniq.length > 4 ? ` +${uniq.length - 4}` : "");
}
const first = (full: string) => full.trim().split(/\s+/)[0] || "";

export function useToday(): TodayView {
  const { s } = useSnap();
  const { L, byId, staffById } = useDerived();
  const { data } = useRequests();

  return useMemo(() => {
    const today = s.today;
    const todo: TodoRow[] = [];

    // 1. Requests to pick.
    if (data) {
      const picks = data.requests.filter((r) => PICK_STATUSES.has(r.status));
      if (picks.length) {
        todo.push({
          key: "picks", n: String(picks.length), accent: false, title: "Requests to pick",
          sub: names(picks.map((r) => staffById[r.staffId]?.first || first(r.staffName))), href: "/m/work?seg=picks",
        });
      }
    }

    // 2. The most overdue shelf count (countsDue sorts never-counted first, then oldest).
    const due = countRows(s, byId)[0];
    if (due) {
      const never = due.age === "—";
      const days = never ? 0 : parseInt(due.age, 10) || 0;
      const what = due.garments.join(", ");
      todo.push({
        key: "count", n: never ? "New" : `${days}d`, accent: true, title: `Count ${due.trail || due.loc.name}`,
        sub: [what, never ? "never counted" : `not counted for ${plural(days, "day")}`].filter(Boolean).join(" · "),
        href: `/m/count/${encodeURIComponent(due.loc.id)}`,
      });
    }

    // 3. Deliveries to receive.
    const inn = receiveRows(s, staffById);
    if (inn.length) {
      const o = inn[0].o;
      todo.push({
        key: "in", n: String(inn.length), accent: false, title: inn.length === 1 ? "Delivery to receive" : "Deliveries to receive",
        sub: [o.code, o.supplier].filter(Boolean).join(" · "), href: "/m/work?seg=in",
      });
    }

    // 4. Pickups waiting past the late threshold.
    const late = collectRows(s, byId, staffById, { includeRound: true }).filter((r) => r.late);
    if (late.length) {
      todo.push({
        key: "pickups", n: String(late.length), accent: true,
        title: `${late.length === 1 ? "Pickup" : "Pickups"} waiting ${PICKUP_LATE_DAYS}+ days`,
        sub: names(late.map((r) => r.name)), href: "/m/work?seg=pickups",
      });
    }

    // 5. Lines at or below par, the worst one named (lowest on hand against par).
    const low = atReorderVariants(s, L);
    if (low.length) {
      let worst = low[0], worstRatio = Infinity, worstOh = 0;
      for (const v of low) {
        const oh = onhand(s, L, v.key), par = reorderAt(s, v.key);
        const ratio = par > 0 ? oh / par : oh;
        if (ratio < worstRatio) { worst = v; worstRatio = ratio; worstOh = oh; }
      }
      todo.push({
        key: "below", n: String(low.length), accent: false, title: "Lines below par",
        sub: `Worst: ${variantName(worst.item, worst.size)}, ${worstOh <= 0 ? "none on the shelf" : `${worstOh} on the shelf`}`,
        href: "/m/stock?seg=below",
      });
    }

    // Your day.
    let issued = 0, back = 0;
    for (const i of s.issues) {
      if (i.date === today) issued += i.qty;
      if (i.returned?.date === today || (!i.returned && i.handedIn === today)) back += i.qty;
    }
    const countsToday = s.stocktakes.filter((t) => t.date === today && t.mode !== "preloved");

    // Recent: one row per person per kind per day, plus today's counts and deliveries. Newest first.
    type R = RecentRow & { sort: string };
    const groups: Record<string, { staffId: string; kind: "Issued" | "Handed back"; at: string; qty: number; last: string }> = {};
    for (const i of s.issues.slice(-200)) {
      const add = (kind: "Issued" | "Handed back", at: string, stamp: string) => {
        const g = (groups[`${i.staffId}|${kind}|${at}`] ||= { staffId: i.staffId, kind, at, qty: 0, last: "" });
        g.qty += i.qty;
        if (stamp > g.last) g.last = stamp;
      };
      add("Issued", i.date, i.createdAt);
      if (i.returned) add("Handed back", i.returned.date, "");
      else if (i.handedIn) add("Handed back", i.handedIn, "");
    }
    const time = (iso: string) => formatInZone(iso, s.tz, { hour: "numeric", minute: "2-digit", hourCycle: "h23" }).replace(/^0(\d)/, "$1");
    const rows: R[] = Object.entries(groups).map(([k, g]) => ({
      key: k, title: staffName(staffById[g.staffId], "Staff"), sub: `${g.kind} ${plural(g.qty, "item")}`,
      right: g.at === today ? (g.last ? time(g.last) : "Today") : dayMonth(g.at, s.tz),
      href: `/m/person/${g.staffId}`,
      // A record with a time today sorts by it; a date with no time sorts to the end of that day.
      sort: g.last && g.at === today ? g.last : `${g.at}T23:59:59`,
    }));
    const locName = (id: string | null) => (id ? s.locations.find((l) => l.id === id)?.name || "Shelf" : `Whole ${s.settings.terms.store}`);
    for (const t of countsToday) {
      rows.push({
        key: `st|${t.id}`, title: locName(t.locationId),
        sub: t.variances > 0 ? `Counted, ${plural(t.variances, "gap")}` : "Counted, all lines match",
        right: "Today", sort: `${today}T23:59:59`,
      });
    }
    for (const o of s.orders) {
      for (const r of o.receipts) {
        if (r.date !== today) continue;
        const n = r.lines.reduce((a, l) => a + l.qty, 0);
        rows.push({ key: `rc|${r.id}`, title: `Delivery ${o.code}`, sub: `Received ${plural(n, "item")}`, right: "Today", sort: `${today}T23:59:59` });
      }
    }
    const recent = rows
      .sort((a, b) => (a.sort < b.sort ? 1 : a.sort > b.sort ? -1 : 0))
      .slice(0, 4)
      .map(({ key, title, sub, right, href }) => ({ key, title, sub, right, href }));

    const kicker = [shortDate(today), s.settings.facility, s.settings.location].filter(Boolean).join(" · ");
    return { kicker, todo, day: { issued, back, counted: countsToday.length }, recent };
  }, [s, L, byId, staffById, data]);
}
