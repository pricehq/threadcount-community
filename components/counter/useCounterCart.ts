"use client";
/* The pickup being put together at the counter, and every rule it is checked against before it can
 * be recorded. The rules are asked of lib/compute (capCheck, garmentForGroup, garmentForStyle) so the
 * screen and the server's refusal can never disagree. */
import { useMemo, useState } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { openSlip } from "@/components/dialogs";
import { approvalRemaining, capCheck, garmentForGroup, garmentForStyle, isPantItem, isTopItem, key, longLabel, onhand, openApproval, plOf, staffName, type StaffRec } from "@/lib/compute";
import { plural, type CartLine } from "./lib";

export function useCounterCart(sel: StaffRec | undefined) {
  const { s, mutate } = useSnap();
  const { L, byId } = useDerived();
  const selId = sel?.id || "";
  const [cart, setCart] = useState<CartLine[]>([]);
  const [override, setOverride] = useState(false);
  const [apDeduct, setApDeduct] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // A new person starts with an empty bag and no deduction.
  const [owner, setOwner] = useState(selId);
  if (owner !== selId) { setOwner(selId); setCart([]); setApDeduct(null); setOverride(false); }

  // An override is about one person and one bag: the tick goes the moment either changes, cleared
  // as the page draws so the new bag is never on screen with the old tick behind it.
  const bagKey = selId ? `${selId}|${cart.map((c) => `${c.itemId}:${c.si}:${c.qty}:${c.src}`).join(",")}` : "";
  const [tickedFor, setTickedFor] = useState(bagKey);
  if (tickedFor !== bagKey) { setTickedFor(bagKey); setOverride(false); }

  function add(itemId: string, si: number) {
    setCart((c) => {
      const f = c.find((x) => x.itemId === itemId && x.si === si);
      if (f) return c.map((x) => (x === f ? { ...x, qty: x.qty + 1 } : x));
      const oh = onhand(s, L, key(itemId, si)), pl = plOf(s, key(itemId, si));
      return [...c, { itemId, si, qty: 1, src: pl > 0 && oh >= 1 ? null : pl > 0 ? "preloved" : oh >= 1 ? "stock" : "order" }];
    });
  }
  const setLine = (i: number, p: Partial<CartLine>) => setCart((c) => c.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const setQty = (i: number, n: number) => setCart((c) => (n < 1 ? c.filter((_, j) => j !== i) : c.map((x, j) => (j === i ? { ...x, qty: n } : x))));

  // The whole cart goes to the ceiling, pre-loved and ordered-in lines included.
  const cap = useMemo(() => (sel ? capCheck(s, sel, cart.map((c) => ({ itemId: c.itemId, qty: c.qty }))) : null), [s, sel, cart]);
  const cartItems = useMemo(() => [...new Set(cart.map((c) => c.itemId))].map((id) => byId[id]).filter((it): it is NonNullable<typeof it> => !!it), [cart, byId]);
  const offItems = sel ? cartItems.filter((it) => !garmentForGroup(it, sel.group)) : [];
  const offStyleItems = sel ? cartItems.filter((it) => !garmentForStyle(it, sel.uniformStyle)) : [];
  const overCap = !!cap && cap.over;
  const needsTick = overCap || offItems.length > 0 || offStyleItems.length > 0;

  const anyShort = cart.some((c) => (c.src === "stock" && c.qty > onhand(s, L, key(c.itemId, c.si))) || (c.src === "preloved" && c.qty > plOf(s, key(c.itemId, c.si))));
  const anyUnpicked = cart.some((c) => c.src === null);
  const inactive = !!sel?.inactive;

  // Pre-loved is free: out of the charge and out of what a signed form pays for.
  const cartVal = cart.filter((c) => c.src !== "preloved").reduce((t, c) => t + c.qty * (byId[c.itemId]?.cost || 0), 0);
  const garments = cart.reduce((t, c) => t + c.qty, 0);

  const ap = sel ? openApproval(s, sel.id) : undefined;
  const apRem = sel ? approvalRemaining(s, sel.id) : 0;
  const cartTops = cart.reduce((t, c) => t + (isTopItem(byId[c.itemId]) && c.src !== "preloved" ? c.qty : 0), 0);
  const cartPants = cart.reduce((t, c) => t + (isPantItem(byId[c.itemId]) && c.src !== "preloved" ? c.qty : 0), 0);
  const apDefault = ap ? Math.min(apRem, Math.max(cartTops, cartPants)) : 0;
  const apN = ap ? (apDeduct === null ? apDefault : Math.min(apDeduct, apRem)) : 0;

  const cannot = !sel || inactive || cart.length === 0 || anyShort || anyUnpicked || (needsTick && !override) || busy;

  async function record(): Promise<{ ok: true; msg: string } | { ok: false; error: string } | null> {
    if (cannot || !sel) return null;
    setBusy(true);
    // Only the ticked box, and only while the box is on the screen.
    const r = await mutate<{ stock: number; ordered: number; preloved: number; apDeducted: number; apRemaining: number }>("issue.create", { staffId: sel.id, override: needsTick && override, apDeduct: ap ? apN : 0, lines: cart });
    setBusy(false);
    if (!r.ok) return { ok: false, error: r.error };
    const parts = [
      r.result.stock ? `${r.result.stock} from stock` : "",
      r.result.ordered ? `${r.result.ordered} ordered in` : "",
      r.result.preloved ? `${r.result.preloved} pre-loved` : "",
      r.result.apDeducted ? `${r.result.apDeducted} off the signed form` : "",
    ].filter(Boolean);
    setCart([]); setOverride(false); setApDeduct(null);
    return { ok: true, msg: `Recorded for ${staffName(sel)}: ${parts.length ? parts.join(" · ") : plural(garments, "garment", "garments")}.` };
  }

  // The collection slip covers what crosses the counter today: shelf and pre-loved lines.
  const handed = cart.filter((c) => c.src === "stock" || c.src === "preloved");
  function printSlip() {
    if (!sel) return;
    openSlip("collection", {
      staffName: staffName(sel), dept: sel.dept, sets: handed.reduce((t, c) => t + c.qty, 0), po: "",
      lines: handed.map((c) => `${c.qty} × ${longLabel(byId[c.itemId])} — ${byId[c.itemId]?.sizes[c.si] ?? "?"}${c.src === "preloved" ? " (pre-loved)" : ""}`).join("\n"),
      dateReceived: s.today, requestedBy: sel.num, deliveredBy: s.settings.coordinator, dateTime: s.today,
    });
  }

  return {
    cart, add, setLine, setQty, replace: setCart,
    cap, overCap, offItems, offStyleItems, needsTick, override, setOverride,
    anyShort, anyUnpicked, inactive, cartVal, garments,
    ap, apRem, apN, setApDeduct,
    busy, cannot, record, handed, printSlip,
  };
}
export type CounterCart = ReturnType<typeof useCounterCart>;
