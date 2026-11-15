"use client";
/* The hand-back basket's commit, shared by the Hand back tab (a list with no swap records at once)
 * and its Sign screen (a list with a swap is a hand-over, so it is signed for first). */
import { useCallback, useMemo } from "react";
import { useSnap } from "@/lib/client";
import { key, staffName } from "@/lib/compute";
import { useHeld, type Held } from "@/components/MPerson";
import { useBasket, type BackLine } from "@/components/MBasket";
import type { DoneProps } from "@/components/SignFlow";

/** The phone's four words for the record's four return conditions. */
export const RECORDED: Record<BackLine["cond"], "Returned - Good" | "Returned - Damaged" | "Written Off" | "Lost"> = {
  Good: "Returned - Good", Damaged: "Returned - Damaged", Condemn: "Written Off", Lost: "Lost",
};

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function useHandBack(staffId: string) {
  const { s, mutate } = useSnap();
  const basket = useBasket();
  const st = s.staff.find((x) => x.id === staffId);
  const held = useHeld(s, staffId);
  const lines = basket.back(staffId);

  const heldBy = useMemo(() => {
    const m: Record<string, Held> = {};
    for (const h of held) m[h.key] = h;
    return m;
  }, [held]);

  /* The server takes new garments back before pre-loved ones, so the first N lines of a variant are
   * new (a swap comes off the shelf, a Good one goes back on it) and the rest pre-loved (the pool). */
  const preloved = useMemo(() => {
    const out: Record<string, boolean> = {};
    const seen: Record<string, number> = {};
    for (const l of lines) {
      const k = key(l.itemId, l.si);
      const newUnits = (heldBy[k]?.issues || []).filter((i) => !i.preloved).reduce((t, i) => t + i.qty, 0);
      out[l.uid] = (seen[k] || 0) >= newUnits;
      seen[k] = (seen[k] || 0) + 1;
    }
    return out;
  }, [lines, heldBy]);

  const hasSwap = lines.some((l) => l.swapSi !== null);

  /** Records the whole basket. `sig` is required by the server whenever a line swaps size. */
  const commit = useCallback(async (sig?: { sigId: string; slip: boolean }): Promise<{ ok: true; done: DoneProps } | { ok: false; error: string }> => {
    const sent = lines;
    const r = await mutate<{ back: number; swaps: number }>("handback.commit", {
      staffId,
      lines: sent.map((l) => ({ itemId: l.itemId, si: l.si, cond: RECORDED[l.cond], swapSi: l.swapSi })),
      ...(sig ? { sigId: sig.sigId, slip: sig.slip } : {}),
    });
    if (!r.ok) return { ok: false, error: r.error };
    const shelfKeys: string[] = [];
    for (const l of sent) {
      if (l.cond === "Good" && !preloved[l.uid]) shelfKeys.push(key(l.itemId, l.si));
      if (l.swapSi !== null) shelfKeys.push(key(l.itemId, l.swapSi));
    }
    const n = r.result?.back ?? sent.length;
    const swaps = r.result?.swaps ?? sent.filter((l) => l.swapSi !== null).length;
    basket.clear("back", staffId);
    return {
      ok: true,
      done: {
        head: `${plural(n, "item")} handed back`,
        sub: staffName(st) + (swaps ? ` · ${plural(swaps, "size swap")} ${sig?.slip ? "issued, slip sent" : "issued, signed"}` : ""),
        shelfKeys: [...new Set(shelfKeys)],
        next: "scan",
      },
    };
  }, [lines, mutate, staffId, preloved, basket, st]);

  return { st, held, heldBy, lines, preloved, hasSwap, commit };
}
