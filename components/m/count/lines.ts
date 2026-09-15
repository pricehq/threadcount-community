"use client";
/* The lines a shelf count lists, shared by the counting screen and Check the gaps.
 *
 * The two screens have to list exactly the same set: anything countable on one and missing on the
 * other is counted on the phone and then dropped at commit, with the tally cleared behind it.
 *
 * A placed size is countable even with no stock history (a shelf being set up). The unplaced bucket
 * needs a test or it would be the whole catalogue: stock history, or a bound barcode (somebody
 * scanned that label onto that size, so the garment physically exists). /m/count uses the same
 * test through `looseVariants` for its "Not on a shelf yet" row. */
import { useMemo } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { UNPLACED, bcBound, label, locMap, locSubtree, locTrail, locUnder, onhand, touched } from "@/lib/compute";
import type { Item, Ledger, Snapshot, Variant } from "@/lib/compute";

export type CountLine = {
  key: string; itemId: string; si: number; size: string; item: Item;
  expected: number; code: string; where: string;
};

/** Unplaced sizes worth counting: stock history or a bound barcode. */
export function looseVariants(s: Snapshot, L: Ledger, variants: Variant[]): Variant[] {
  return variants.filter((v) => !s.placed[v.key] && (touched(s, L, v.key) || !!bcBound(s, v.item, v.si)));
}

export function useCountLines(locationId: string) {
  const { s } = useSnap();
  const { L, variants } = useDerived();
  const locs = useMemo(() => locMap(s), [s]);
  const lines = useMemo<CountLine[]>(() => {
    const picked = locationId === UNPLACED
      ? looseVariants(s, L, variants)
      : (() => { const sub = locSubtree(s, locationId); return variants.filter((v) => sub.has(s.placed[v.key] || "")); })();
    return picked.map((v) => ({
      key: v.key, itemId: v.itemId, si: v.si, size: v.size, item: v.item,
      expected: onhand(s, L, v.key), code: bcBound(s, v.item, v.si), where: locUnder(locs, s.placed[v.key], locationId),
    }));
  }, [s, L, variants, locationId, locs]);
  const locName = locationId === UNPLACED ? "Not on a shelf" : locTrail(locs, locationId, 0) || locs[locationId]?.name || "Location";
  return { lines, locName, locs };
}

/** "Scrub top (W)": the garment as a row title; the size follows it. */
export const lineTitle = (l: Pick<CountLine, "item">) => label(l.item);

/** Gap with its sign, using a true minus: "+3", "−12", "0". */
export const signed = (d: number) => (d === 0 ? "0" : d > 0 ? `+${d}` : `−${-d}`);

/** The reasons a count gap can carry, stored as the stocktake line's reason. A short count gets the
 *  first list, a count over what was expected the second. */
export const SHORT_REASONS = ["At laundry", "Condemned", "Missing", "Other"] as const;
export const OVER_REASONS = ["Found extra", "Other"] as const;
