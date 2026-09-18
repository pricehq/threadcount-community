"use client";
/* Helpers and the few layout rules the People screens need beyond components/portal.tsx.
 * The rules are scoped to class names prefixed tc-people- and hoisted once by React (href + precedence). */
import type { StaffRec } from "@/lib/compute";

export type Act = (op: string, payload: unknown) => Promise<boolean>;
export type Mutate = <T = unknown>(op: string, payload?: unknown) => Promise<{ ok: true; result: T } | { ok: false; error: string }>;

/** "3 Feb" from an ISO date. */
export function dayMonth(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return iso || "–";
  const d = new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

/** Same pronoun rule the counter uses: Women's → her, Men's → him, otherwise them. */
export function objectPronoun(st: StaffRec): "her" | "him" | "them" {
  return st.uniformStyle === "Women's" ? "her" : st.uniformStyle === "Men's" ? "him" : "them";
}

export const fullName = (st: StaffRec) => `${st.first} ${st.last}`.trim();
export const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;


/* Most rules live in app/globals.css under the portal redesign. These tighten the register so its
 * eleven columns fit a 1440px screen (with a scrollbar) without scrolling sideways: narrower cell
 * padding, a Holding column sized by its meters rather than a fixed floor, and capped Group/Ward. */
const PEOPLE_CSS = `@media screen and (min-width: 781px) {
  table.tc-table.tc-people-reg th, table.tc-table.tc-people-reg td { padding-left: 8px; padding-right: 8px; }
  table.tc-table.tc-people-reg th:first-child, table.tc-table.tc-people-reg td:first-child { padding-left: 14px; }
  table.tc-table.tc-people-reg th:last-child, table.tc-table.tc-people-reg td:last-child { padding-right: 14px; }
  table.tc-table.tc-people-reg td.hold { min-width: 0; }
  table.tc-table.tc-people-reg .tc-meter { gap: 6px; }
  table.tc-table.tc-people-reg .tc-meter-label { width: 40px; }
  table.tc-table.tc-people-reg td.wrapcap { max-width: 120px; }
  table.tc-table.tc-people-reg td.open a { white-space: nowrap; }
}`;

export function PeopleStyles() {
  return <style href="tc-people-register" precedence="default">{PEOPLE_CSS}</style>;
}
