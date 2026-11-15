"use client";
/* Person › Hand back (HANDBACK workstream). One basket for everything a person brings to the window:
 * each line is one garment with its condition, and any line can swap for another size. The whole
 * list is recorded in one handback.commit, so a return and its swap never land half way. A list
 * with a size swap goes through the Sign screen first (./sign), because a swap hands a garment over. */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDerived, useSnap } from "@/lib/client";
import { bcParse, key, label, onhand, plOf } from "@/lib/compute";
import { DIVIDER, INK, MBar, MButton, MChipRow, MEmpty, MONO, MRow, MSection, MUTED, useScanFlash, useToast } from "@/components/m";
import type { Held } from "@/components/MPerson";
import { useBasket, type BackLine } from "@/components/MBasket";
import { useHandBack } from "@/components/m/handback/useHandBack";
import MScan from "@/components/MScan";
import type { DoneProps } from "@/components/SignFlow";

export type PersonTabProps = {
  staffId: string;
  /** The tab calls it in an effect; the shell renders it docked below MBody (History sets null). */
  setBar: (bar: React.ReactNode) => void;
  /** The shell swaps the whole screen for <DoneScreen {...d} />. */
  onDone: (d: DoneProps) => void;
  /** The shell shows MError under the rule. */
  onError: (msg: string) => void;
};

type Cond = BackLine["cond"];
const CONDS: { value: Cond; label: string }[] = [
  { value: "Good", label: "Good" }, { value: "Damaged", label: "Damaged" }, { value: "Condemn", label: "Condemn" }, { value: "Lost", label: "Lost" },
];

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
let seq = 0;
const newUid = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// The mockup's .chip and .x; m.tsx keeps its chip style private.
const chipBtn: React.CSSProperties = {
  minHeight: 44, minWidth: 48, padding: "0 12px", border: "2px solid " + INK, background: "transparent", color: INK,
  fontFamily: "inherit", fontSize: 14, fontWeight: 700, borderRadius: 0, display: "inline-flex", alignItems: "center",
  justifyContent: "center", cursor: "pointer", flex: "none",
};
const xBtn: React.CSSProperties = {
  border: 0, background: "none", width: 44, height: 44, fontSize: 22, color: MUTED, padding: 0, cursor: "pointer", flex: "none", fontFamily: "inherit",
};

export default function HandBackTab({ staffId, setBar, onDone, onError }: PersonTabProps) {
  const { s } = useSnap();
  const router = useRouter();
  const { L, byId } = useDerived();
  const toast = useToast();
  const flash = useScanFlash();
  const basket = useBasket();
  const { setBack } = basket;
  const { st, held, heldBy, lines, preloved, hasSwap, commit: record } = useHandBack(staffId);
  const [scanning, setScanning] = useState(false);
  const [swapOpen, setSwapOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const usedOf = (k: string) => lines.filter((l) => key(l.itemId, l.si) === k).length;

  // The record moved under the basket (a garment taken back elsewhere): drop lines past what they hold.
  useEffect(() => {
    if (!lines.length) return;
    const seen: Record<string, number> = {};
    const kept = lines.filter((l) => {
      const k = key(l.itemId, l.si);
      seen[k] = (seen[k] || 0) + 1;
      return seen[k] <= (heldBy[k]?.qty || 0);
    });
    if (kept.length !== lines.length) setBack(staffId, kept);
  }, [heldBy, lines, setBack, staffId]);


  /** What a swap to size `si` can still draw on for this line, after the other lines' swaps and
   *  whatever the other lines put back in good condition. */
  const swapStock = (line: BackLine, si: number) => {
    const k = key(line.itemId, si);
    const pl = preloved[line.uid];
    let n = pl ? plOf(s, k) : onhand(s, L, k);
    for (const o of lines) {
      if (o.uid === line.uid || preloved[o.uid] !== pl || o.itemId !== line.itemId) continue;
      if (o.swapSi === si) n--;
      if (o.cond === "Good" && o.si === si) n++;
    }
    return Math.max(0, n);
  };

  const add = (h: Held) => {
    setBack(staffId, [...lines, { uid: newUid(), itemId: h.itemId, si: h.si, cond: "Good", swapSi: null }]);
  };

  const tapHeld = (h: Held) => {
    if (usedOf(h.key) >= h.qty) { toast(`They only hold ${h.qty}`); return; }
    add(h);
  };

  const onScan = (raw: string) => {
    setScanning(false);
    const code = raw.trim();
    const v = bcParse(s, code);
    const h = v ? heldBy[key(v.itemId, v.si)] : undefined;
    if (!h) { toast(`${code} isn’t something ${st?.first || "they"} holds`); return; }
    if (held.every((x) => usedOf(x.key) >= x.qty)) { toast("Everything they hold is already on the list"); return; }
    if (usedOf(h.key) >= h.qty) { toast(`They only hold ${h.qty}`); return; }
    flash("Garment", `${label(byId[h.itemId])} ${h.size}`, () => add(h));
  };

  const update = (uid: string, patch: Partial<BackLine>) =>
    setBack(staffId, lines.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
  const remove = (uid: string) => {
    setBack(staffId, lines.filter((l) => l.uid !== uid));
    setSwapOpen(null);
  };

  const commit = useCallback(async () => {
    if (!lines.length || saving) return;
    // A swap hands a garment over: sign for it on the Sign screen, which records the whole list.
    if (hasSwap) { router.push(`/m/person/${encodeURIComponent(staffId)}/handback-sign`); return; }
    setSaving(true);
    onError("");
    const r = await record();
    setSaving(false);
    if (!r.ok) { onError(r.error); return; }
    onDone(r.done);
  }, [lines.length, saving, hasSwap, router, staffId, onError, record, onDone]);

  useEffect(() => {
    setBar(saving
      ? <MBar label="Recording…" disabled small={plural(lines.length, "item")} />
      : lines.length
        ? <MBar label={hasSwap ? "Review and sign" : "Record hand back"} small={plural(lines.length, "item")} onClick={commit} />
        : <MBar label="Record hand back" small="nothing yet" disabled offReason="Scan or tap what they hand back" />);
  }, [setBar, saving, lines.length, hasSwap, commit]);

  return (
    <>
      <MButton tone="ink" icon="scan" label="Scan what they hand back" onClick={() => setScanning(true)} />

      {lines.length > 0 && (
        <>
          <MSection label="Handing back" right={plural(lines.length, "item")} />
          {lines.map((l) => {
            const it = byId[l.itemId];
            const name = label(it);
            const size = String(it?.sizes[l.si] ?? l.si);
            const swapSize = l.swapSi === null ? null : String(it?.sizes[l.swapSi] ?? l.swapSi);
            const open = swapOpen === l.uid;
            const others = (it?.sizes || []).map((sz, i) => ({ sz: String(sz), i })).filter((x) => x.i !== l.si);
            const counts: Record<string, number> = {};
            for (const x of others) counts[String(x.i)] = swapStock(l, x.i);
            const cur = l.swapSi === null ? null : String(l.swapSi);
            return (
              // The mockup's .cl: MLine's layout, with the swap note in ink rather than the flag's accent.
              <div key={l.uid} style={{ borderBottom: "1px solid " + DIVIDER, padding: "10px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontWeight: 700 }}>{name}</b> <span style={{ fontFamily: MONO }}>{size}</span>
                    {swapSize && <div style={{ fontSize: 13, fontWeight: 800, color: INK, marginTop: 2 }}>Swap for {swapSize}</div>}
                  </div>
                  <button type="button" style={{ ...chipBtn, opacity: l.cond === "Good" ? 1 : 0.4, cursor: l.cond === "Good" ? "pointer" : "not-allowed" }}
                    disabled={l.cond !== "Good"} aria-expanded={open} aria-controls={`swap-${l.uid}`}
                    aria-label={swapSize ? `Size ${swapSize}: change the swap for ${name} ${size}` : `Swap size for ${name} ${size}`}
                    onClick={() => setSwapOpen(open ? null : l.uid)}>
                    {swapSize ? `Size ${swapSize}` : "Swap size"}
                  </button>
                  <button type="button" style={xBtn} aria-label={`Remove ${name} ${size}`} onClick={() => remove(l.uid)}>×</button>
                </div>
                <MChipRow grid={4} label={`Condition of ${name} ${size}`} options={CONDS} value={l.cond}
                  onPick={(c) => {
                    // Only a garment going back on the shelf swaps; anything else is replaced by an issue.
                    if (c === "Good") { update(l.uid, { cond: c }); return; }
                    update(l.uid, { cond: c, swapSi: null });
                    if (open) setSwapOpen(null);
                  }} />
                {open && l.cond === "Good" && (
                  <div id={`swap-${l.uid}`}>
                    <MChipRow label={`Swap ${name} ${size} for`} value={cur}
                      options={others.map((x) => ({ value: String(x.i), label: x.sz, n: counts[String(x.i)] }))}
                      disabled={(v) => counts[v] <= 0 && cur !== v}
                      onPick={(v) => { update(l.uid, { swapSi: cur === v ? null : Number(v) }); setSwapOpen(null); }} />
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      <MSection label="Holding now" />
      {held.length === 0
        ? <MEmpty title="Nothing out" />
        : held.map((h) => (
            <MRow key={h.key} mark="ink" title={`${label(byId[h.itemId])} ${h.size}`} sub="Tap to hand one back" right={`×${h.qty}`}
              onClick={() => tapHeld(h)} />
          ))}

      {scanning && <MScan title="Scan what they hand back" onHit={onScan} onClose={() => setScanning(false)} />}
    </>
  );
}
