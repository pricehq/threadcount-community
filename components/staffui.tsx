"use client";
/* The primitives the staff app needs that the counter app never did.
 *
 * components/m.tsx already carries the shared half of the system — app bar, 64px bars, rows,
 * sections, dark panels, chips, steppers — and this file adds the rest of the recipes from the
 * handoff rather than restating them. Anything that exists in m.tsx is imported, not re-drawn:
 * two implementations of a 64px flush-left button is how a design system stops being one.
 *
 * House rules that every component here obeys, because they are the system:
 *   · radius 0, always. No shadows. Hierarchy comes from rules and fills.
 *   · 2px rules between sections, 1px between rows, 4px accent bar under the app bar.
 *   · 44px is the floor for anything you tap.
 *   · gaps between sibling options are 2px — never 0, never 8.
 *   · button labels are flush left with the icon pushed right. Nothing is centred except the
 *     date separators in a message thread.
 *   · status is carried by a word. Colour only ever reinforces it.
 */
import Link from "next/link";
import { createContext, useContext, useId, useRef, useState } from "react";
import { GARMENT_CATEGORIES, garmentCategory, type GarmentCategory } from "@/lib/compute";
import { ACCENT, GROUND, INK, IconRight, MStepper } from "./m";

const DIVIDER = "var(--color-divider)";
const ACCENT_300 = "var(--color-accent-300)";
const ACCENT_700 = "var(--color-accent-700)";
const N200 = "var(--color-neutral-200)";
const N300 = "var(--color-neutral-300)";
const N400 = "var(--color-neutral-400)";
const N500 = "var(--color-neutral-500)";
const N600 = "var(--color-neutral-600)";
const N700 = "var(--color-neutral-700)";
const SURFACE = "var(--color-surface)";

/* ---------------------------------------------------------------- text ---- */

export const Kicker = ({ children, tone = "quiet" }: { children: React.ReactNode; tone?: "quiet" | "attention" | "dark" }) => (
  <div style={{
    fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
    color: tone === "attention" ? ACCENT_700 : tone === "dark" ? ACCENT_300 : N600,
  }}>{children}</div>
);

/* ---------------------------------------------------------------- identity ---- */

/** 1A’s identity block: who you are, then the sizes the linen room has on file. */
/** Who this is: the ward and staff number over the name, at the top of Home.
 *
 *  It carried the recorded top and trouser sizes too, and they have gone. Home answers one
 *  question — is anything waiting for me — and a size is not something anybody acts on from here.
 *  They still sit on Kit, which is where a wearer goes to see their own record. */
export function IdentityBlock({ ward, num, name }: { ward: string; num: string; name: string }) {
  return (
    <div style={{ padding: "20px 16px 18px", borderBottom: "2px solid " + INK, background: GROUND }}>
      <Kicker>{[ward, num].filter(Boolean).join(" · ") || "Staff"}</Kicker>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 28, letterSpacing: "-0.02em", lineHeight: 1.15, marginTop: 8 }}>{name}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- dark card ---- */

/** The ink card: the live order on Home, the collection code, the waitlist position. */
export function DarkCard({ kicker, title, meta, children, onClick, href }: {
  kicker?: string; title?: React.ReactNode; meta?: React.ReactNode;
  children?: React.ReactNode; onClick?: () => void; href?: string;
}) {
  const inner = (
    <>
      {kicker && <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: ACCENT_300 }}>{kicker}</div>}
      {title && <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, letterSpacing: "-0.01em", lineHeight: 1.2, marginTop: 8 }}>{title}</div>}
      {meta && <div style={{ fontSize: 13, color: N300, marginTop: 8, lineHeight: 1.5 }}>{meta}</div>}
      {children}
    </>
  );
  const st: React.CSSProperties = {
    background: INK, color: GROUND, padding: 18, display: "block", width: "100%",
    border: 0, borderRadius: 0, textAlign: "left", font: "inherit",
    cursor: onClick || href ? "pointer" : "default",
  };
  if (href) return <Link href={href} style={{ ...st, textDecoration: "none" }} className="tcx-bar">{inner}</Link>;
  if (onClick) return <button onClick={onClick} style={st} className="tcx-bar">{inner}</button>;
  return <div style={st}>{inner}</div>;
}

/** A divided row inside a dark card — "COLLECTION CODE  4 8 2 6". */
export function DarkRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ borderTop: "1px solid #4a4746", marginTop: 16, paddingTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: N400 }}>{label}</span>
      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, letterSpacing: "0.16em" }}>{value}</span>
    </div>
  );
}

/** The code someone holds up at the counter. Big, because it is read across a desk. */
export function CodeBlock({ code, kicker = "Show at the counter" }: { code: string; kicker?: string }) {
  return (
    <div style={{ background: INK, color: GROUND, padding: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: ACCENT_300 }}>{kicker}</div>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 38, letterSpacing: "0.2em", marginTop: 10 }}>{code}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- segments & tabs ---- */

/** Two or three mutually exclusive views. 2px gaps; the selected one inverts.
 *
 *  The inversion is the only thing that says which view you are on, and an ink fill is not
 *  something a screen reader can see — so `aria-pressed` says it in words, and the row announces
 *  itself as one group rather than as two unrelated buttons. */
export function Segments<T extends string>({ options, value, onPick, label = "View" }: {
  options: { key: T; label: string }[]; value: T; onPick: (k: T) => void; label?: string;
}) {
  return (
    <div role="group" aria-label={label} style={{ display: "flex", gap: 2, padding: "12px 16px", background: GROUND }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button key={o.key} onClick={() => onPick(o.key)} aria-pressed={on} style={{
            flex: 1, minHeight: 44, border: 0, background: on ? INK : "#fff", color: on ? GROUND : N700,
            font: "inherit", fontWeight: on ? 800 : 600, fontSize: 13, letterSpacing: "0.06em",
            textTransform: "uppercase", cursor: "pointer", borderRadius: 0,
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

/** Tabs with counts — OPEN 3 / DONE 11.
 *
 *  Pressed rather than the full tablist/tabpanel machinery: these swap the list underneath rather
 *  than switching between labelled panels, and claiming a role the markup doesn't keep would be
 *  worse than the honest one. */
export function Tabs<T extends string>({ options, value, onPick, label = "Filter" }: {
  options: { key: T; label: string; count?: number }[]; value: T; onPick: (k: T) => void; label?: string;
}) {
  return (
    <div role="group" aria-label={label} style={{ display: "flex", gap: 2, background: GROUND, borderBottom: "2px solid " + INK }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button key={o.key} onClick={() => onPick(o.key)} aria-pressed={on} style={{
            flex: 1, minHeight: 48, border: 0, background: on ? INK : "transparent", color: on ? GROUND : N600,
            font: "inherit", fontWeight: 800, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase",
            cursor: "pointer", borderRadius: 0,
          }}>
            {o.label}{o.count === undefined ? "" : ` ${o.count}`}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- quick actions ---- */

export function QuickGrid({ items }: { items: { label: string; href?: string; onClick?: () => void; icon: React.ReactNode }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, background: DIVIDER }}>
      {items.map((it) => {
        const inner = (
          <>
            <span style={{ color: ACCENT, display: "block" }}>{it.icon}</span>
            <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.3, marginTop: 12, display: "block" }}>{it.label}</span>
          </>
        );
        const st: React.CSSProperties = {
          background: "#fff", minHeight: 96, padding: "16px 14px", border: 0, borderRadius: 0,
          font: "inherit", color: INK, textAlign: "left", cursor: "pointer", textDecoration: "none", display: "block",
        };
        return it.href
          ? <Link key={it.label} href={it.href} style={st} className="tcx-bar">{inner}</Link>
          : <button key={it.label} onClick={it.onClick} style={st} className="tcx-bar">{inner}</button>;
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- notice & banner ---- */

/** A broadcast from the linen room. Not a message — nobody replies to it. */
export function Notice({ kicker = "From the linen room", children }: { kicker?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderLeft: "6px solid " + ACCENT, padding: "14px 16px", margin: "16px 0 0" }}>
      <Kicker>{kicker}</Kicker>
      <div style={{ fontSize: 14, lineHeight: 1.5, marginTop: 6 }}>{children}</div>
    </div>
  );
}

/** An in-app notification, directly under the accent bar. Tapping it goes there and clears it. */
export function Banner({ title, body, onOpen, onDismiss }: {
  title: string; body: string; onOpen?: () => void; onDismiss?: () => void;
}) {
  return (
    <div style={{ background: INK, color: GROUND, borderLeft: "6px solid " + ACCENT, padding: "12px 14px", display: "flex", gap: 12, alignItems: "flex-start" }}>
      <button onClick={onOpen} style={{ flex: 1, minWidth: 0, background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer" }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: ACCENT_300 }}>ThreadCount · now</div>
        <div style={{ fontSize: 15, fontWeight: 800, marginTop: 5 }}>{title}</div>
        <div style={{ fontSize: 13, color: N300, marginTop: 4, lineHeight: 1.45 }}>{body}</div>
      </button>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" style={{ background: "none", border: 0, color: N400, padding: 4, cursor: "pointer", flex: "0 0 auto", font: "inherit", fontSize: 18, lineHeight: 1 }}>×</button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- timeline ---- */

export type Step = { label: string; meta?: string; state: "done" | "current" | "future" };

/** The order's progress. A step that hasn't happened is always shown, as an outlined dot — the
 *  point of the screen is what is still to come as much as what has happened. */
export function Timeline({ steps }: { steps: Step[] }) {
  return (
    <div style={{ padding: "16px 16px 4px" }}>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <div key={i} style={{
            position: "relative", marginLeft: 5, paddingLeft: 20, paddingBottom: last ? 4 : 18,
            borderLeft: last ? "2px solid transparent" : `2px solid ${s.state === "current" ? ACCENT : INK}`,
          }}>
            <span style={{
              position: "absolute", left: -7, top: 2, width: 12, height: 12,
              background: s.state === "future" ? "transparent" : s.state === "current" ? ACCENT : INK,
              border: s.state === "future" ? `2px solid ${N500}` : "none",
            }} />
            <div style={{
              fontSize: 15, fontWeight: 800, lineHeight: 1.3,
              color: s.state === "current" ? ACCENT_700 : s.state === "future" ? N600 : INK,
            }}>{s.label}</div>
            {s.meta && <div style={{ fontSize: 12, color: N600, marginTop: 3, lineHeight: 1.45 }}>{s.meta}</div>}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- messages ---- */

export function DateSeparator({ children }: { children: React.ReactNode }) {
  // The only centred text in the system.
  return (
    <div style={{ textAlign: "center", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: N600, padding: "16px 0 8px" }}>
      {children}
    </div>
  );
}

export function Bubble({ mine, author, body, stamp }: { mine: boolean; author?: string; body: string; stamp: string }) {
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", padding: "4px 16px" }}>
      <div style={{
        maxWidth: 300, padding: 14, background: mine ? INK : "#fff", color: mine ? GROUND : INK,
        borderLeft: mine ? undefined : "6px solid " + ACCENT,
      }}>
        {!mine && author && <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: N600, marginBottom: 6 }}>{author}</div>}
        <div style={{ fontSize: 14.5, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{body}</div>
        <div style={{ fontSize: 12, marginTop: 8, color: mine ? N400 : N600 }}>{stamp}</div>
      </div>
    </div>
  );
}

/** The strip under the app bar saying which order this thread belongs to. */
export function ContextStrip({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: N200, padding: "10px 16px", fontSize: 12, borderBottom: "2px solid " + INK, color: N700 }}>
      {children}
    </div>
  );
}

export function Composer({ value, onChange, onSend, busy, placeholder = "Write a message" }: {
  value: string; onChange: (v: string) => void; onSend: () => void; busy?: boolean; placeholder?: string;
}) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (value.trim() && !busy) onSend(); }}
      style={{ display: "flex", flex: "0 0 60px", height: 60, borderTop: "2px solid " + INK, background: "#fff" }}
    >
      <input
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        // The placeholder is the only thing naming this box, and it disappears the moment anybody
        // types — so the same words are given as the label.
        aria-label={placeholder}
        style={{ flex: 1, minWidth: 0, border: 0, padding: "0 16px", font: "inherit", fontSize: 15, background: "transparent", color: INK, borderRadius: 0 }}
      />
      <button type="submit" disabled={busy || !value.trim()} style={{
        flex: "0 0 auto", padding: "0 20px", background: ACCENT, color: "#fff", border: 0, borderRadius: 0,
        fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 13, letterSpacing: "0.08em",
        textTransform: "uppercase", cursor: busy || !value.trim() ? "not-allowed" : "pointer",
        opacity: busy || !value.trim() ? 0.45 : 1,
      }}>Send</button>
    </form>
  );
}

/* ---------------------------------------------------------------- forms ---- */

/* The id of the heading a NumberedField drew, handed down to whatever grouped control it wraps.
 *
 * A group of options needs a name, and the name is already on the screen — "02 SIZE AND QUANTITY".
 * Passing the id through context rather than as a prop keeps every call site unchanged: the field
 * knows what it wrote, the control inside it points at that, and nobody has to invent an id at each
 * of the dozen places these are used. */
const FieldLabelId = createContext<string | undefined>(undefined);

/** `01` in accent, then the label, then the control. Carried over from ThreadCount onboarding,
 *  where the numbering reinforces the counting identity. */
export function NumberedField({ n, label, children, first }: { n: number; label: string; children: React.ReactNode; first?: boolean }) {
  const labelId = useId();
  return (
    <div style={{ padding: "18px 16px", borderTop: first ? "none" : "2px solid " + INK }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", color: ACCENT }}>{String(n).padStart(2, "0")}</span>
        <span id={labelId} style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>
      </div>
      <div style={{ marginTop: 14 }}>
        <FieldLabelId.Provider value={labelId}>{children}</FieldLabelId.Provider>
      </div>
    </div>
  );
}

/** A list of mutually exclusive options at 2px gaps. Unavailable options are shown, greyed —
 *  never hidden, because "it isn't there" is information the person came for.
 *
 *  Announced as a radio group, because that is what it is: exactly one answer, and the answer was
 *  previously carried by an ink fill and a heavier weight — nothing a screen reader could report,
 *  so every option sounded identical before and after it was chosen. `label` names the group when
 *  a NumberedField holds more than one of these; otherwise the field's own heading names it.
 *  Arrow keys move between options the way a radio group is expected to, and the buttons stay
 *  buttons, so tapping and the Enter key behave exactly as they did. */
export function OptionList<T extends string>({ options, value, onPick, columns = 1, label }: {
  options: { key: T; label: string; meta?: string; disabled?: boolean }[];
  value: T | null; onPick: (k: T) => void; columns?: number; label?: string;
}) {
  const fieldLabelId = useContext(FieldLabelId);
  const box = useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const live = options.filter((o) => !o.disabled);
    if (live.length < 2) return;
    e.preventDefault();
    const at = live.findIndex((o) => o.key === value);
    // Nothing picked yet: an arrow starts at whichever end it is heading away from.
    const next = at < 0 ? (step > 0 ? live[0] : live[live.length - 1]) : live[(at + step + live.length) % live.length];
    onPick(next.key);
    box.current?.querySelector<HTMLButtonElement>(`[data-opt="${CSS.escape(next.key)}"]`)?.focus();
  }

  return (
    <div
      ref={box}
      role="radiogroup"
      aria-label={label}
      aria-labelledby={label ? undefined : fieldLabelId}
      onKeyDown={onKeyDown}
      style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 2 }}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key} data-opt={o.key} role="radio" aria-checked={on}
            aria-disabled={o.disabled || undefined} disabled={o.disabled}
            onClick={() => onPick(o.key)}
            style={{
              minHeight: 48, padding: "10px 14px", border: 0, borderRadius: 0, textAlign: "left", font: "inherit",
              background: o.disabled ? N200 : on ? INK : "#fff",
              color: o.disabled ? N500 : on ? GROUND : N700,
              fontWeight: on ? 800 : 600, fontSize: 14.5,
              cursor: o.disabled ? "not-allowed" : "pointer",
            }}>
            <span style={{ display: "block" }}>{o.label}</span>
            {o.meta && <span style={{ display: "block", fontSize: 12, marginTop: 3, opacity: 0.85 }}>{o.meta}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Square, like everything else. */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} style={{
      width: 52, height: 30, padding: 3, border: `2px solid ${INK}`, borderRadius: 0, background: on ? ACCENT : "#fff",
      display: "flex", justifyContent: on ? "flex-end" : "flex-start", alignItems: "center",
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, flex: "0 0 auto",
    }}>
      <span style={{ width: 24, height: 24, background: on ? "#fff" : INK, display: "block" }} />
    </button>
  );
}

/** The optional photo. Dashed, because it is the one thing on the screen that isn’t required. */
export function PhotoWell({ has, onPick, hint }: { has: boolean; onPick: () => void; hint?: string }) {
  return (
    <button onClick={onPick} style={{
      width: "100%", minHeight: 96, border: `2px dashed ${has ? INK : DIVIDER}`, borderRadius: 0, background: "#fff",
      display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center",
      padding: "16px 14px", cursor: "pointer", font: "inherit", color: INK, gap: 6,
    }}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2.2" strokeLinecap="square" aria-hidden>
        <path d="M3 8h4l2-3h6l2 3h4v11H3z" /><circle cx="12" cy="13" r="3.5" />
      </svg>
      <span style={{ fontSize: 15, fontWeight: 800 }}>{has ? "Photo attached" : "Add a photo"}</span>
      {hint && <span style={{ fontSize: 12.5, color: N600 }}>{hint}</span>}
    </button>
  );
}

/* ---------------------------------------------------------------- rows ---- */

/** A row with an emphasis border. accent = needs attention, divider = neutral, ink = informational. */
export function EdgeRow({ tone = "divider", onClick, href, children }: {
  tone?: "accent" | "divider" | "ink"; onClick?: () => void; href?: string; children: React.ReactNode;
}) {
  const edge = tone === "accent" ? ACCENT : tone === "ink" ? INK : DIVIDER;
  const st: React.CSSProperties = {
    display: "block", width: "100%", textAlign: "left", font: "inherit", color: INK,
    background: "#fff", border: 0, borderLeft: `6px solid ${edge}`, borderRadius: 0,
    padding: "14px 16px", cursor: onClick || href ? "pointer" : "default", textDecoration: "none",
  };
  if (href) return <Link href={href} style={st} className="tcx-bar">{children}</Link>;
  if (onClick) return <button onClick={onClick} style={st} className="tcx-bar">{children}</button>;
  return <div style={st}>{children}</div>;
}

/** A muted row — a job already done. */
export function DoneRow({ children }: { children: React.ReactNode }) {
  return <div style={{ background: SURFACE, padding: "14px 16px", color: N600, borderTop: `1px solid ${DIVIDER}` }}>{children}</div>;
}

/** 44px is the floor for anything you tap. */
export function CompactAction({ label, onClick, tone = "outline", disabled }: {
  label: string; onClick?: () => void; tone?: "outline" | "accent"; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      minHeight: 44, padding: "0 14px", borderRadius: 0, font: "inherit",
      border: tone === "accent" ? 0 : `2px solid ${INK}`,
      background: tone === "accent" ? ACCENT : "transparent",
      color: tone === "accent" ? "#fff" : INK,
      fontWeight: 800, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase",
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, flex: "0 0 auto",
    }}>{label}</button>
  );
}

/** Full-width, transparent, 2px ink border. The action you are allowed but not encouraged to take. */
export function SecondaryBar({ label, onClick, href, disabled }: { label: string; onClick?: () => void; href?: string; disabled?: boolean }) {
  const st: React.CSSProperties = {
    minHeight: 52, width: "100%", border: `2px solid ${INK}`, borderRadius: 0, background: "transparent",
    color: INK, font: "inherit", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 14,
    letterSpacing: "0.08em", textTransform: "uppercase", display: "flex", alignItems: "center",
    padding: "0 20px", gap: 12, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1,
    textDecoration: "none",
  };
  const inner = <><span style={{ flex: 1, textAlign: "left" }}>{label}</span><IconRight /></>;
  if (href && !disabled) return <Link href={href} style={st} className="tcx-bar">{inner}</Link>;
  return <button onClick={onClick} disabled={disabled} style={st} className="tcx-bar">{inner}</button>;
}

/** The word a ward is allowed to see. Never a number, and never colour on its own. */
export function StockTag({ word }: { word: "in_stock" | "low" | "none" | string }) {
  const label = word === "in_stock" ? "In stock" : word === "low" ? "Low" : "None on shelf";
  return (
    <span style={{
      fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
      color: word === "none" ? ACCENT_700 : N700, whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

/* ---------------------------------------------------------------- request lines ---- */

/* One request covers as many garments as the person needed, so six screens draw a list where they
 * used to print a single bold line. All of it lives here rather than in each screen, for the same
 * reason the status words live in lib/staffreq: the manager deciding, the wearer reading the
 * outcome, the desk signing for the bag and the linen room picking it have to describe the same
 * garments the same way. A declined fleece struck through on one screen and silently missing on
 * the next is exactly the confusion this flow exists to end.
 */

/** A garment line, however it reached the screen — a saved RequestLine or one being drafted. The
 *  decision fields are optional because nothing has been decided while somebody is still typing. */
export type LineLike = {
  id: string; item: string; size: string; qty: number;
  status?: string; declineReason?: string | null;
};

/** How a line reads everywhere, in one place. */
export function lineText(l: { qty: number; item: string; size: string }): string {
  return `${l.qty} × ${l.item} — ${l.size}`;
}

/** The lines of a request, as a record. Declines are struck through and carry their reason: a
 *  wearer whose fleece was refused should be able to see that on the order rather than count the
 *  bag and wonder. The approved word only appears on a split decision — where everything was
 *  approved the request's own status has already said so. */
export function LineList({ lines }: { lines: readonly LineLike[] }) {
  const mixed = lines.some((l) => l.status === "declined") && lines.some((l) => l.status === "approved");
  return (
    <div style={{ display: "grid", gap: 1, background: DIVIDER }}>
      {lines.map((l) => {
        const off = l.status === "declined";
        return (
          <div key={l.id} style={{ background: "#fff", padding: "13px 14px" }}>
            <div style={{
              fontSize: 15.5, fontWeight: 800, lineHeight: 1.35,
              textDecoration: off ? "line-through" : "none", color: off ? N600 : INK,
            }}>{lineText(l)}</div>
            {off && (
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: ACCENT_700, marginTop: 5 }}>
                Declined{l.declineReason ? ` — ${l.declineReason}` : ""}
              </div>
            )}
            {!off && mixed && (
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: N600, marginTop: 5 }}>
                Approved
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A line on a request nobody has sent yet. `key` is the row's identity while it is being edited —
 *  the same garment in two sizes is two rows, and neither has an id until the server writes one. */
export type DraftLine = { key: string; itemId: string; si: number; item: string; size: string; qty: number };

/** The list somebody is building. Every row can be counted up and down or taken out again, which is
 *  the whole difference between this and the old one-garment form: getting a line wrong costs a tap
 *  rather than a second request and a second approval. */
export function DraftLineList({ lines, maxQty, onQty, onRemove }: {
  lines: readonly DraftLine[]; maxQty: number;
  onQty: (key: string, qty: number) => void; onRemove: (key: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      {lines.map((l) => (
        <div key={l.key} style={{ background: "#fff", padding: "12px 14px" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, lineHeight: 1.3 }}>
              {l.item} — {l.size}
            </div>
            <button
              onClick={() => onRemove(l.key)}
              aria-label={`Take ${l.item} — ${l.size} off this request`}
              style={{
                flex: "0 0 auto", minWidth: 44, minHeight: 44, border: 0, background: "transparent",
                color: N600, font: "inherit", fontSize: 20, lineHeight: 1, cursor: "pointer", borderRadius: 0,
              }}
            >×</button>
          </div>
          <div style={{ marginTop: 10 }}>
            <MStepper n={l.qty} onChange={(v) => onQty(l.key, v)} min={1} max={maxQty} />
          </div>
        </div>
      ))}
    </div>
  );
}

export type PickerSize = { size: string; si: number; word: string; countedOn?: string; held?: number };
export type PickerItem = { id: string; item: string; type: string; gender?: string; sizes: PickerSize[] };

/** Choosing one garment to add to a request. Shared by the wearer's own request screen and the one
 *  a manager raises on somebody else's behalf, because the only thing that differs between them is
 *  whose sizes and holdings are being shown — and that arrives as `defaultSi` and `note` rather
 *  than as a second copy of this.
 *
 *  The garment list is narrowed by a row of category chips — Tops, Bottoms, Maternity, Outerwear,
 *  Everything else. On a real catalogue the flat list is the longest scroll in the flow and it is
 *  walked once per garment, on a request that often runs to three or four.
 *
 *  Chips rather than a heading over each group, for two reasons. A heading labels a long scroll;
 *  only a filter shortens it, and the length is the complaint. And OptionList's arrow keys walk one
 *  radiogroup, so a separate list per category would trap the arrows in whichever section they
 *  started in — one filtered list keeps the keyboard walking the whole picker.
 *
 *  The categories come from garmentCategory(), which reads the type already on the garment and
 *  falls back to its name, so this needs no new prop and no data entry: both screens that render
 *  the picker get the grouping without knowing it exists. */
export function GarmentPicker<I extends PickerItem>({ items, defaultSi, note, maxQty, addLabel = "Add to the request", onAdd, onCancel }: {
  items: readonly I[];
  defaultSi: (item: I) => number | null;
  note?: (item: I, size: PickerSize | null) => React.ReactNode;
  maxQty: number;
  addLabel?: string;
  onAdd: (line: { itemId: string; si: number; item: string; size: string; qty: number }) => void;
  onCancel?: () => void;
}) {
  const [itemId, setItemId] = useState<string | null>(null);
  const [si, setSi] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [cat, setCat] = useState<GarmentCategory | "all">("all");

  const item = items.find((i) => i.id === itemId) || null;
  const size = item && si !== null ? item.sizes.find((s) => s.si === si) || null : null;

  const catOf: Record<string, GarmentCategory> = {};
  const counts = new Map<GarmentCategory, number>();
  for (const i of items) {
    const c = garmentCategory(i);
    catOf[i.id] = c;
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  // Only the categories something actually falls in: a facility that stocks no maternity wear must
  // never be shown the word, and an empty chip is a promise of garments that aren't there.
  const chips = GARMENT_CATEGORIES.filter((c) => counts.has(c.key));
  /* Below about a screenful there is nothing to shorten, and a filter row over a list you can
   * already see whole is one more thing to read before you can start. Eight 48px options is
   * roughly where the list stops fitting on a phone. One category is nothing to filter either. */
  const filtering = chips.length > 1 && items.length > 8;
  const shown = filtering && cat !== "all" ? items.filter((i) => catOf[i.id] === cat) : items;

  function pickCat(k: GarmentCategory | "all") {
    setCat(k);
    /* A garment half-chosen under the old filter can fall outside the new one, and leaving its
     * sizes, note and count on screen under a filter that hides the garment itself is the one
     * thing a filter must not do: the next tap would add something nobody can see. */
    if (itemId && k !== "all" && catOf[itemId] !== k) { setItemId(null); setSi(null); setQty(1); }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {filtering && (
        <div role="group" aria-label="Show one kind of garment" style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
          {[{ key: "all" as const, label: "All", n: items.length }, ...chips.map((c) => ({ key: c.key, label: c.label, n: counts.get(c.key) || 0 }))].map((c) => {
            const on = c.key === cat;
            return (
              <button
                key={c.key} onClick={() => pickCat(c.key)} aria-pressed={on}
                style={{
                  minHeight: 44, padding: "0 14px", border: 0, borderRadius: 0, cursor: "pointer",
                  background: on ? INK : "#fff", color: on ? GROUND : N600, font: "inherit",
                  fontWeight: 800, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase",
                }}
              >{c.label} {c.n}</button>
            );
          })}
        </div>
      )}

      <OptionList
        label={cat === "all" || !filtering ? "Garment" : `Garment — ${chips.find((c) => c.key === cat)?.label}`}
        value={itemId}
        onPick={(id) => {
          setItemId(id);
          setQty(1);
          // Opening on the size the record already knows is the difference between three taps and
          // one, and the wrong size is what generates the exchange this app exists to stop.
          const it = items.find((i) => i.id === id);
          setSi(it ? defaultSi(it) : null);
        }}
        options={shown.map((i) => ({
          key: i.id,
          label: i.item,
          meta: [i.type, i.gender && i.gender !== "Unisex" ? i.gender : ""].filter(Boolean).join(" · "),
        }))}
      />

      {item && (
        <>
          <OptionList
            label="Size"
            columns={3}
            value={si === null ? null : String(si)}
            onPick={(k) => setSi(Number(k))}
            // Unavailable sizes are shown greyed, never hidden: "it isn't there" is the information
            // the person came for.
            options={item.sizes.map((s) => ({
              key: String(s.si),
              label: String(s.size),
              meta: [s.word === "none" ? "none" : s.word === "low" ? "low" : "", s.held ? `${s.held} held` : ""].filter(Boolean).join(" · "),
            }))}
          />
          {note && <div style={{ fontSize: 12.5, color: N600, lineHeight: 1.5 }}>{note(item, size)}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <MStepper n={qty} onChange={setQty} min={1} max={maxQty} />
            <span style={{ fontSize: 12.5, color: N600, flex: 1, minWidth: 120, lineHeight: 1.45 }}>
              {qty === 1 ? "One garment" : `${qty} garments`}
            </span>
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: 2 }}>
        <CompactAction
          label={addLabel}
          tone="accent"
          disabled={!item || si === null}
          onClick={() => {
            if (!item || !size) return;
            onAdd({ itemId: item.id, si: size.si, item: item.item, size: String(size.size), qty });
            // The chosen garment clears for the next one; the category filter deliberately does
            // not. Somebody adding two tops is still looking at tops.
            setItemId(null); setSi(null); setQty(1);
          }}
        />
        {onCancel && <CompactAction label="Cancel" onClick={onCancel} />}
      </div>
    </div>
  );
}

export { ACCENT, ACCENT_300, ACCENT_700, DIVIDER, GROUND, INK, N200, N300, N400, N500, N600, N700, SURFACE };
