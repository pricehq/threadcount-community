"use client";
/* The twelve-character code a uniform store prints for a wearer, entered as it looks on the slip:
 * a swing tag with three groups of four boxes.
 *
 * It is ONE real text input laid over the boxes, not twelve: a paste of the whole code (with or
 * without its dashes, in any case) lands in one go, a screen reader meets one field with one name,
 * and the phone's keyboard stays up between characters. The boxes only draw what the input holds.
 * Letters and digits only — the server normalises whatever is typed, so this just keeps the boxes
 * honest. When the twelfth character lands, `onFull` moves on to the next field. */
import { useId, useRef } from "react";
import { cx, s } from "./kit";

export const CODE_LEN = 12;

export function cleanCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LEN);
}

/** As the server wants it: XXXX-XXXX-XXXX. */
export function formatCode(clean: string): string {
  return [clean.slice(0, 4), clean.slice(4, 8), clean.slice(8, 12)].filter(Boolean).join("-");
}

export function TagCode({ value, onChange, onFull, autoFocus, stamp }: {
  value: string; onChange: (v: string) => void; onFull?: () => void; autoFocus?: boolean; stamp?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement | null>(null);
  const chars = value.split("");
  const cells: React.ReactNode[] = [];
  for (let i = 0; i < CODE_LEN; i++) {
    if (i === 4 || i === 8) cells.push(<span key={"d" + i} className={s.dash} />);
    const ch = chars[i];
    cells.push(<span key={i} className={cx(s.cell, ch && s.full, !stamp && i === Math.min(value.length, CODE_LEN - 1) && value.length < CODE_LEN && s.at)}>{ch || ""}</span>);
  }
  return (
    <div className={s.codeWrap}>
      <svg className={s.codeString} viewBox="0 0 40 62" preserveAspectRatio="none" aria-hidden="true"><path d="M20 0 C 8 18, 32 36, 20 62" /></svg>
      <div className={s.codeSwing}>
        <div className={s.tagShadow}>
          <div className={s.codeEdge}><div className={s.codeTag} onClick={() => input.current?.focus()}>
            <span className={s.ftagBand} aria-hidden="true" />
            <span className={s.codeRing} aria-hidden="true" />
            <div className={s.codeHead}>
              <label htmlFor={id} className={s.fLabel}>Your code</label>
              <span className={s.codeCount} aria-hidden="true"><b>{String(value.length).padStart(2, "0")}</b> / {CODE_LEN}</span>
            </div>
            <div className={s.cells} aria-hidden="true">{cells}</div>
            {!stamp && (
              <input ref={input} id={id} className={s.codeInput} value={formatCode(value)}
                aria-describedby={id + "h"}
                autoFocus={autoFocus} autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
                inputMode="text" enterKeyHint="next"
                onChange={(e) => {
                  const v = cleanCode(e.target.value);
                  onChange(v);
                  if (v.length === CODE_LEN && value.length < CODE_LEN) onFull?.();
                }}
                // The boxes fill left to right; keep the caret at the end so a tap mid-code can't
                // put a character in the middle of the ones already typed.
                onSelect={(e) => { const el = e.currentTarget; const n = el.value.length; if (el.selectionStart !== n || el.selectionEnd !== n) { try { el.setSelectionRange(n, n); } catch { /* */ } } }} />
            )}
            <div id={id + "h"} className={s.codeFoot}><span>Printed on your slip</span><span>12 letters &amp; numbers</span></div>
            {stamp && <><span className={s.shock} aria-hidden="true" /><span className={s.stamp} aria-hidden="true" style={{ top: "56%", fontSize: 30, padding: "2px 14px" }}>{stamp}</span></>}
          </div></div>
        </div>
      </div>
    </div>
  );
}
