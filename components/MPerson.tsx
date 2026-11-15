"use client";
/* The ink header that identifies whoever is at the counter, plus the "what are they holding"
   derivation the person, issue, return and exchange screens all need. */
import { useMemo } from "react";
import { approvalRemaining, capCheck, ccOf, isNursing, type IssueRec, itemMap, type Snapshot, staffName, type StaffRec, variantName } from "@/lib/compute";
import { GROUND, INK, ON_DARK } from "@/components/m";

export function MPersonHead({ s, st, sub }: { s: Snapshot; st: StaffRec; sub?: React.ReactNode }) {
  const cc = ccOf(s, st);
  const sizes = [st.top && `Top ${st.top}`, st.pants && `Pants ${st.pants}`].filter(Boolean) as string[];
  return (
    <section style={{ background: INK, color: GROUND, padding: "18px 16px 20px" }}>
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-accent-300)" }}>
        {[st.dept || st.group || "Staff", st.num].filter(Boolean).join(" · ")}
      </div>
      <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 30, letterSpacing: "-0.03em", lineHeight: 1.05, marginTop: 8 }}>{staffName(st)}</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", marginTop: 12, fontSize: 14, color: ON_DARK }}>
        {sizes.length ? sizes.map((x) => <span key={x}>{x}</span>) : <span>No sizes recorded yet</span>}
        {cc && <span>Cost centre {cc}</span>}
      </div>
      {sub}
    </section>
  );
}

/** What this person is holding, against what anybody may hold, in the words the coordinator uses.
 *
 *  Six sets at any time — a top and a pair of trousers to a set — for every group, nursing included.
 *  Not a figure that starts again in July: six sets is what somebody has on their back and in their
 *  locker, so the bar fills on what they are holding plus whatever is in the bag on the counter, and
 *  the ways past a full six are a hand-in or a coordinator's override.
 *
 *  `cart` is that bag. The head bar and the issue screen under it ask one function, because each
 *  keeping its own copy of the sum is what let the head demand a tick the counter didn't want — two
 *  halves of one screen contradicting each other is worse than either being wrong.
 *
 *  A manager's approval is a different control and still belongs on a nurse's header: the approval is
 *  what pays for the garments, this is how much uniform one person may walk around with. */
export function MEntitlement({ s, st, cart = [] }: { s: Snapshot; st: StaffRec; cart?: { itemId: string; qty: number }[] }) {
  const nursing = isNursing(s, st);
  const cap = capCheck(s, st, cart);
  const sets = approvalRemaining(s, st.id);
  // Filled by whichever of the three is nearest the ceiling — tops, pairs, or garments outside a set —
  // because that is the one the counter turns somebody away on. Filled by sets, six tops and two
  // pairs with a seventh top in the bag showed a bar a third full directly above "Past what one
  // person holds", and a coordinator reading the two has no way to tell which one is lying.
  const pct = cap.cap > 0 && cap.otherCap > 0 ? Math.min(1, Math.max(cap.afterTops / cap.cap, cap.afterPants / cap.cap, cap.afterOther / cap.otherCap)) : 1;
  const over = cap.over;
  const approval = sets > 0 ? `Manager’s approval — ${sets} set${sets === 1 ? "" : "s"} still approved` : "No manager’s approval open — anything issued now needs a new form";
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, color: ON_DARK }}>
        {nursing ? `${approval} · ${cap.note}` : cap.note}
      </div>
      <div style={{ height: 8, background: "var(--color-neutral-900)", border: "1.5px solid var(--color-neutral-600)", marginTop: 8 }}>
        <div style={{ height: "100%", width: `${pct * 100}%`, background: over || (nursing && sets === 0) ? "var(--color-accent-300)" : "var(--color-accent)" }} />
      </div>
      {over && <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-accent-300)", marginTop: 8 }}>Past what one person holds — this needs a coordinator override.</div>}
    </div>
  );
}

export type Held = { key: string; itemId: string; si: number; size: string; name: string; qty: number; issues: IssueRec[] };

/** What a staff member has out right now, grouped by garment and size, newest issue first. */
export function useHeld(s: Snapshot, staffId: string): Held[] {
  return useMemo(() => {
    const byId = itemMap(s);
    const m: Record<string, Held> = {};
    for (const i of s.issues) {
      if (i.staffId !== staffId || i.returned || i.handedIn) continue;
      const it = byId[i.itemId];
      const k = `${i.itemId}:${i.si}`;
      const size = String(it?.sizes[i.si] ?? i.si);
      (m[k] ||= { key: k, itemId: i.itemId, si: i.si, size, name: `${variantName(it, size)}`, qty: 0, issues: [] });
      m[k].qty += i.qty;
      m[k].issues.push(i);
    }
    return Object.values(m).sort((a, b) => a.name.localeCompare(b.name));
  }, [s, staffId]);
}
