"use client";
/* The pieces the phones' doors are built from — counter sign-in and sign-up, the staff app's
 * sign-in and first-time code. Styles in auth.module.css; see the note at its top for the idea.
 *
 * Everything here renders its finished state on the server, so the page is whole before any
 * script runs; the motion is CSS on top, and reduced motion simply leaves it off. */
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import s from "./auth.module.css";

export { s };

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** True once mounted if the person asked for less motion (checked after mount: the server can't know). */
export function useStill(): boolean {
  const [still, setStill] = useState(false);
  useEffect(() => {
    try { setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch { /* old WebView */ }
  }, []);
  return still;
}

export function stillNow(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

/** The mark: a red square with a dashed white stitch inset, sewn in when it first appears. */
export function Mark({ size = 22, sew = true }: { size?: number; sew?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={s.mark} width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      <rect width="30" height="30" fill="#d42a12" />
      <mask id={"m" + id}>
        <rect x="8" y="8" width="14" height="14" fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="60" className={sew ? s.stitchIn : undefined} />
      </mask>
      <rect x="8" y="8" width="14" height="14" fill="none" stroke="rgba(255,255,255,.92)" strokeWidth="2.2" strokeDasharray="3.6 2.6" mask={`url(#m${id})`} />
    </svg>
  );
}

/** The dashed red thread under a headline. */
export function Stitch() {
  return (
    <svg className={s.stitch} viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden="true">
      <path d="M2 7 Q75 2 150 6 T298 5" />
    </svg>
  );
}

/** The ink stage: mark and wordmark, a kicker, the headline (an array of lines; wrap the accent
 *  phrase in <em>), the thread under it, and an optional line of copy and extra content. */
export function Stage({ app, kicker, lines, lede, back, children, label }: {
  app?: string; kicker: string; lines: React.ReactNode[]; lede?: React.ReactNode;
  back?: (() => void) | null; children?: React.ReactNode; label?: string;
}) {
  return (
    <header className={s.stage}>
      <svg className={s.ghost} viewBox="0 0 210 210" aria-hidden="true">
        <rect x="2" y="2" width="206" height="206" />
        <rect x="52" y="52" width="106" height="106" />
      </svg>
      <div className={s.brandRow}>
        {back && (
          <button type="button" className={s.back} onClick={back} aria-label="Back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="square" aria-hidden="true"><path d="M15 18 9 12l6-6" /></svg>
          </button>
        )}
        <Mark />
        <span className={s.wordmark}>ThreadCount</span>
        {app && <span className={s.appTag}>{app}</span>}
      </div>
      <div className={s.kick}>{kicker}</div>
      <h1 className={s.h1} aria-label={label}>
        {lines.map((l, i) => <span key={i} className={s.ln}>{l}</span>)}
      </h1>
      <Stitch />
      {lede && <p className={s.stageLede}>{lede}</p>}
      {children}
    </header>
  );
}

/** A field on the slip: a mono label with its number, the control, and the seam under it that
 *  sews along as it is typed into. The control comes in as a function so its id and the
 *  hint's id can be handed to it — a real <label for>, and aria-describedby for the hint. */
export function SlipField({ n, label, value, right, hint, children }: {
  n?: string; label: string; value: string; right?: React.ReactNode; hint?: React.ReactNode;
  children: (c: { id: string; className: string; "aria-describedby"?: string }) => React.ReactNode;
}) {
  const id = useId();
  const hintId = id + "h";
  return (
    <div className={s.field} data-filled={value ? "1" : "0"} style={{ ["--n" as string]: Math.min(value.length, 60) }}>
      <div className={s.fHead}>
        {n && <span className={s.fNum} aria-hidden="true">{n}</span>}
        <label htmlFor={id} className={s.fLabel}>{label}</label>
        {right && <span className={s.fRight}>{right}</span>}
      </div>
      {children({ id, className: s.input, ...(hint ? { "aria-describedby": hintId } : {}) })}
      <div className={s.rule} aria-hidden="true"><span className={s.sewn} /></div>
      {hint && <div id={hintId} className={s.hint}>{hint}</div>}
    </div>
  );
}

export function ShowHide({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    // "Show" alone says nothing about what it shows once the label is read out separately.
    <button type="button" className={s.linkBtn} onClick={onToggle} aria-pressed={on} aria-label={on ? "Hide password" : "Show password"}>
      {on ? "Hide" : "Show"}
    </button>
  );
}

/** The error line: always in the tree, so a screen reader is listening before the words arrive. */
export function ErrorLine({ msg }: { msg: string }) {
  return <div className={s.err} role="alert" aria-live="assertive" aria-atomic="true">{msg}</div>;
}

/** The one red action. Presses down like a key. */
export function Press({ label, onClick, busy, disabled, type = "button", ghost, busyLabel = "One moment…" }: {
  label: string; onClick?: () => void; busy?: boolean; disabled?: boolean; type?: "button" | "submit"; ghost?: boolean; busyLabel?: string;
}) {
  return (
    <button type={type} onClick={onClick} disabled={busy || disabled} aria-busy={busy || undefined}
      className={cx(s.press, busy && s.busy, ghost && s.ghostBtn)}>
      <span className={s.lbl}>{busy ? busyLabel : label}</span>
      <span className={s.arr} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="square"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
      </span>
    </button>
  );
}

/** A door: a card with a swatch, a title, a line under it, and an arrow. A link or a button. */
export function Door({ href, onClick, title, sub, sw, dashed, hollow }: {
  href?: string; onClick?: () => void; title: React.ReactNode; sub?: React.ReactNode; sw?: string; dashed?: boolean; hollow?: boolean;
}) {
  const inner = (
    <>
      <span className={cx(s.doorSw, hollow && s.hollow)} style={sw ? { ["--sw" as string]: sw } : undefined} aria-hidden="true" />
      <span><span className={s.doorT}>{title}</span>{sub && <span className={s.doorS}>{sub}</span>}</span>
      <svg className={s.doorArr} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="square" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
    </>
  );
  const cls = cx(s.door, dashed && s.dashed);
  // A plain <a>, not next/link: the doors that matter here (the demo, a server's sign-up) set
  // cookies or change what the server renders, and want a real navigation.
  if (href) return <a href={href} className={cls}>{inner}</a>;
  return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}

/** Back: pop the history when there is something behind, otherwise go to `fallback`. On a fresh
 *  install the shell leaves its own screen with location.replace(), so there often isn't. */
export function useBack(fallback: string) {
  const router = useRouter();
  const [canPop, setCanPop] = useState(false);
  useEffect(() => { setCanPop(window.history.length > 1); }, []);
  return () => { if (canPop) router.back(); else window.location.assign(fallback); };
}

/** Moves focus to an element when `when` turns true — the first field of a new step. */
export function useFocusOn<T extends HTMLElement>(when: unknown) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!when) return;
    const t = setTimeout(() => ref.current?.focus({ preventScroll: false }), 60);
    return () => clearTimeout(t);
  }, [when]);
  return ref;
}

/** The string a hanging tag hangs from. */
export function TagString({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 40 70" preserveAspectRatio="none" aria-hidden="true">
      <path d="M20 0 C 8 22, 32 42, 20 70" />
    </svg>
  );
}
