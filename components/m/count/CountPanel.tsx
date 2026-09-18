"use client";
/* The ink "Now counting" panel (mockup .panel): garment · size, Counted / Expected / Gap, the
 * Hands-free switch, and the inline "Type a count" field when it is open. The same pieces are the
 * figure and control of the live camera overlay when hands-free falls back to it. */
import { useEffect, useRef, useState } from "react";
import { GROUND, INK, MFigRow, MKick, MSwitchRow } from "@/components/m";
import { signed } from "@/components/m/count/lines";

const OFF_GREY_TEXT = "#b5b1af"; // mockup .panel .kick

export function CountFigures({ name, counted, expected }: { name: string; counted: number; expected: number }) {
  const d = counted - expected;
  return (
    <>
      <div style={{ ["--tcx-kick" as string]: OFF_GREY_TEXT } as React.CSSProperties}><MKick>Now counting</MKick></div>
      <div aria-live="polite" style={{ fontSize: 19, fontWeight: 800, marginTop: 2, lineHeight: 1.2 }}>{name}</div>
      <MFigRow figs={[
        { label: "Counted", n: counted },
        { label: "Expected", n: expected },
        { label: "Gap", n: signed(d), tone: d === 0 ? "ok" : "accent" },
      ]} />
    </>
  );
}

export function HandsFree({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return <MSwitchRow dark tone="accent" title="Hands-free" on={on} onToggle={onToggle} disabled={disabled} />;
}

/** Inline count field: Enter or Set applies it. Keyed by the caller on the line, so it never shows
 *  the previous line's figure under the new line's name. */
export function TypeCount({ name, value, onSet }: { name: string; value: number; onSet: (n: number) => void }) {
  const [v, setV] = useState(String(value));
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const set = () => { const n = parseInt(v, 10); if (Number.isFinite(n) && n >= 0) onSet(n); };
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      <input ref={ref} type="text" inputMode="numeric" pattern="[0-9]*" aria-label={`Counted for ${name}`} value={v}
        onChange={(e) => setV(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); set(); } }}
        style={{ flex: 1, minWidth: 0, height: 52, border: "2px solid #57534f", background: "#fff", color: INK, fontFamily: "inherit", fontSize: 16, padding: "0 14px", borderRadius: 0, boxSizing: "border-box" }} />
      <button type="button" onClick={set}
        style={{ minHeight: 52, padding: "0 18px", border: "2px solid " + GROUND, background: "transparent", color: GROUND, fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer" }}>Set</button>
    </div>
  );
}

/** The panel as it sits at the top of the counting body (bleeds over MBody pad). */
export function CountPanel({ children }: { children: React.ReactNode }) {
  return <section aria-label="Now counting" style={{ background: INK, color: GROUND, margin: "-16px -16px 12px", padding: "14px 16px 16px" }}>{children}</section>;
}
