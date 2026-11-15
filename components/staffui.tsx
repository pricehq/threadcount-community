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
import { DEFAULT_TERMS } from "@/lib/terms";
import { useStaff } from "@/lib/staffclient";
import { ACCENT, GROUND, INK, IconRight, MONO, MStepper, OK } from "./m";

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
export function IdentityBlock({ ward, num, name, group }: { ward: string; num: string; name: string; group?: string }) {
  return (
    <div style={{ padding: "20px 16px 18px", borderBottom: "2px solid " + INK, background: GROUND }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 26, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{name}</div>
      {/* The staff group belongs beside the ward and the number: it is what decides which garments
          this person is offered, and somebody declined "wrong item for the role" should be able to
          see the role they were measured against without asking. */}
      <div style={{ fontSize: 13, color: N600, marginTop: 6 }}>{[ward, num, group].filter(Boolean).join(" · ") || "Staff"}</div>
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
      {title && <div style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 22, letterSpacing: "-0.01em", lineHeight: 1.2, marginTop: 8 }}>{title}</div>}
      {meta && <div style={{ fontSize: 13, color: N300, marginTop: 8, lineHeight: 1.5 }}>{meta}</div>}
      {children}
    </>
  );
  const st: React.CSSProperties = {
    background: INK, color: GROUND, padding: 16, display: "block", width: "100%",
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
      {/* Mono, like every other place a collection code is shown: the same four digits have to be
          recognisable on Home, on the order and on the full screen, and a proportional face makes
          8 and B an argument at a counter. */}
      <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 26, letterSpacing: "0.06em" }}>{value}</span>
    </div>
  );
}

/** The action inside a dark card — "Show at the counter →". Ground-outlined rather than filled:
 *  the card is already the loudest thing on the screen, and two fills inside one another read as
 *  two separate things to do. */
export function DarkButton({ label, href, onClick }: { label: string; href?: string; onClick?: () => void }) {
  const st: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 48, marginTop: 16,
    border: `2px solid ${GROUND}`, borderRadius: 0, background: "transparent", color: GROUND,
    font: "inherit", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 13,
    letterSpacing: "0.08em", textTransform: "uppercase", padding: "0 14px", cursor: "pointer",
    textDecoration: "none",
  };
  const inner = <><span style={{ flex: 1, textAlign: "left" }}>{label}</span><IconRight size={18} /></>;
  if (href) return <Link href={href} style={st} className="tcx-bar">{inner}</Link>;
  return <button onClick={onClick} style={st} className="tcx-bar">{inner}</button>;
}

/** The code someone holds up at the counter. Big, because it is read across a desk. */
export function CodeBlock({ code, kicker = "Show at the counter" }: { code: string; kicker?: string }) {
  return (
    <div style={{ background: INK, color: GROUND, padding: 18, textAlign: "center" }}>
      {/* Muted rather than accent: the code under it is the loudest thing on the screen, and a
          second colour above it competes with the digits somebody is reading across a counter. */}
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: N400 }}>{kicker}</div>
      {/* Mono and big, because it is read out across a counter; centred because there is nothing
          beside it to line up with. The digits are announced singly for the same reason the full
          screen's are — 54px of mono reads as one four-digit number. */}
      <div aria-label={`Collection code ${code.split("").join(" ")}`} style={{ fontFamily: MONO, fontWeight: 700, fontSize: 54, letterSpacing: "0.1em", marginTop: 8, lineHeight: 1.1 }}>{code}</div>
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
    <div style={{ padding: "10px 16px 2px", background: GROUND }}>
      {/* One box, with 2px of ink between the segments. The border is what says these three are
          the same control; as separate fills on the ground they read as three buttons. */}
      <div role="group" aria-label={label} style={{ display: "flex", border: `2px solid ${INK}`, background: "#fff" }}>
        {options.map((o, i) => {
          const on = o.key === value;
          return (
            <button key={o.key} onClick={() => onPick(o.key)} aria-pressed={on} style={{
              flex: 1, minHeight: 44, border: 0, borderRight: i === options.length - 1 ? 0 : `2px solid ${INK}`,
              background: on ? INK : "#fff", color: on ? GROUND : N700,
              font: "inherit", fontWeight: on ? 800 : 600, fontSize: 13, letterSpacing: "0.06em",
              textTransform: "uppercase", cursor: "pointer", borderRadius: 0,
            }}>{o.label}</button>
          );
        })}
      </div>
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
    /* One box with 2px of ink between the tabs, inset from the edge — the same control `Segments`
       draws, because Open / Done and Holding / My sizes are the same gesture and reading as two
       different controls is how a system stops being one. The count is mono beside the word, never
       instead of it. */
    <div style={{ padding: "10px 16px 2px", background: GROUND }}>
      <div role="group" aria-label={label} style={{ display: "flex", border: `2px solid ${INK}`, background: "#fff" }}>
        {options.map((o, i) => {
          const on = o.key === value;
          return (
            <button key={o.key} onClick={() => onPick(o.key)} aria-pressed={on} style={{
              flex: 1, minHeight: 44, border: 0, borderRight: i === options.length - 1 ? 0 : `2px solid ${INK}`,
              background: on ? INK : "#fff", color: on ? GROUND : N700,
              font: "inherit", fontWeight: 800, fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase",
              cursor: "pointer", borderRadius: 0, whiteSpace: "nowrap", padding: "0 4px",
            }}>
              {o.label}
              {o.count === undefined ? null : (
                <span style={{ fontFamily: MONO, fontWeight: 500, letterSpacing: 0, marginLeft: 4 }}>{o.count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- quick actions ---- */

export function QuickGrid({ items }: { items: { label: string; caption?: string; href?: string; onClick?: () => void; icon?: React.ReactNode }[] }) {
  return (
    /* An ink frame with ink between the tiles, so four shortcuts read as one block. `icon` is
       optional: the approved tiles carry a caption over a label and nothing else, and an empty
       icon slot pushed the label off the bottom of the tile. */
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, background: INK, border: `2px solid ${INK}` }}>
      {items.map((it) => {
        const inner = (
          <>
            {it.icon && <span style={{ color: ACCENT, display: "block" }}>{it.icon}</span>}
            {/* The caption sits above the label, muted: it says what the tile is for — "Last: Navy
                tunic" — and the label is what you tap, so the label reads last and loudest. */}
            {it.caption && <span style={{ display: "block", fontSize: 12, color: N600, lineHeight: 1.35 }}>{it.caption}</span>}
            <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.3, marginTop: 2, display: "block" }}>{it.label}</span>
          </>
        );
        const st: React.CSSProperties = {
          background: "#fff", minHeight: 88, padding: 12, border: 0, borderRadius: 0,
          font: "inherit", color: INK, textAlign: "left", cursor: "pointer", textDecoration: "none",
          display: "flex", flexDirection: "column", justifyContent: "flex-end",
        };
        return it.href
          ? <Link key={it.label} href={it.href} style={st} className="tcx-bar">{inner}</Link>
          : <button key={it.label} onClick={it.onClick} style={st} className="tcx-bar">{inner}</button>;
      })}
      {/* An odd number of tiles would leave the ink ground showing through the empty half of the
          last row, which reads as a broken tile rather than as a frame. It happens in the ordinary
          way: "Same again" is only drawn for somebody who has asked for something before. */}
      {items.length % 2 === 1 && (
        <span aria-hidden="true" style={{ background: "#fff", minHeight: 88 }} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- notice & banner ---- */

/** A broadcast from the linen room. Not a message — nobody replies to it. */
export function Notice({ kicker = `From the ${DEFAULT_TERMS.store}`, children }: { kicker?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderLeft: "6px solid " + ACCENT, padding: "14px 16px", margin: "16px 0 0" }}>
      <Kicker>{kicker}</Kicker>
      <div style={{ fontSize: 14, lineHeight: 1.5, marginTop: 6 }}>{children}</div>
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
            {/* Mono, as the mockup has it: a column of stamps that line up is read down rather
                than across, and tabular figures are what make that possible. */}
            {s.meta && <div style={{ fontFamily: MONO, fontSize: 12, color: N600, marginTop: 3, lineHeight: 1.45 }}>{s.meta}</div>}
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
      {/* A 2px ink border rather than an accent edge: the accent edge is the linen room's voice on
          a row, and in a thread every bubble from them would wear it. The mockup draws both sides
          as bordered boxes, the wearer's own filled ink. */}
      <div style={{
        maxWidth: "86%", padding: "10px 12px", background: mine ? INK : "#fff", color: mine ? GROUND : INK,
        border: `2px solid ${INK}`,
      }}>
        <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{body}</div>
        {/* Who said it and when, on one line under the words. As an uppercase kicker above the body
            it read as a heading on every message — three words of chrome per sentence, in a thread
            that is mostly one-liners. */}
        <div style={{ fontFamily: MONO, fontSize: 11, marginTop: 4, color: mine ? N400 : N600 }}>
          {author ? `${author} · ${stamp}` : stamp}
        </div>
      </div>
    </div>
  );
}

/** The strip under the app bar saying which order this thread belongs to.
 *
 *  The mockup's `.notice`: a bordered white box inset from the edge, not a full-bleed band. It is
 *  about the order rather than from the linen room, so it takes the 2px ink border and none of the
 *  accent edge that marks their voice. */
export function ContextStrip({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "16px 16px 0", background: GROUND, flex: "0 0 auto" }}>
      <div style={{ border: `2px solid ${INK}`, background: "#fff", padding: "12px 14px", color: N700 }}>
        {children}
      </div>
    </div>
  );
}

export function Composer({ value, onChange, onSend, busy, placeholder = "Write a message" }: {
  value: string; onChange: (v: string) => void; onSend: () => void; busy?: boolean; placeholder?: string;
}) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (value.trim() && !busy) onSend(); }}
      style={{ display: "flex", gap: 8, flex: "0 0 auto", padding: "10px 16px calc(10px + env(safe-area-inset-bottom, 0px))", borderTop: "2px solid " + INK, background: "#fff" }}
    >
      <input
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        // The placeholder is the only thing naming this box, and it disappears the moment anybody
        // types — so the same words are given as the label.
        aria-label={placeholder}
        // 16px, never smaller: anything under it and the phone zooms the whole screen when the box
        // takes focus. The box is drawn as a box, as the mockup has it.
        style={{ flex: 1, minWidth: 0, minHeight: 48, border: `2px solid ${INK}`, padding: "0 12px", font: "inherit", fontSize: 16, background: GROUND, color: INK, borderRadius: 0 }}
      />
      <button type="submit" disabled={busy || !value.trim()} style={{
        flex: "0 0 auto", minHeight: 48, padding: "0 16px", background: ACCENT, color: "#fff", border: 0, borderRadius: 0,
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
              minHeight: 58, padding: "12px 14px", border: `2px solid ${o.disabled ? DIVIDER : INK}`,
              borderRadius: 0, textAlign: "left", font: "inherit",
              background: o.disabled ? N200 : on ? INK : "#fff",
              color: o.disabled ? N500 : on ? GROUND : N700,
              fontWeight: on ? 800 : 600, fontSize: 14.5,
              cursor: o.disabled ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 12,
            }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block" }}>{o.label}</span>
              {o.meta && <span style={{ display: "block", fontSize: 12, marginTop: 3, opacity: 0.85 }}>{o.meta}</span>}
            </span>
            {/* A tick on the chosen one, a chevron on the rest. The ink fill says which is chosen
                to anybody who can see it; the tick says it again at arm's length, and the chevron
                says the others are still there to take. Decoration only — aria-checked on the
                radio is what a screen reader is told. */}
            <span aria-hidden="true" style={{ flex: "0 0 auto", display: "flex", color: on ? GROUND : N500 }}>
              {on
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square"><path d="m5 12 5 5 9-10" /></svg>
                : <IconRight size={18} />}
            </span>
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
    /* A top rule and nothing else. Boxed, it read as a second button competing with the 64px bar
       under it; the mockup's `.sbar` is the foot of the screen rather than a control floating on
       it. */
    minHeight: 52, width: "100%", border: 0, borderTop: `2px solid ${INK}`, borderRadius: 0, background: "transparent",
    color: INK, font: "inherit", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 14,
    letterSpacing: "0.08em", textTransform: "uppercase", display: "flex", alignItems: "center",
    padding: "0 20px", gap: 12, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1,
    textDecoration: "none",
  };
  const inner = <><span style={{ flex: 1, textAlign: "left" }}>{label}</span><IconRight /></>;
  if (href && !disabled) return <Link href={href} style={st} className="tcx-bar">{inner}</Link>;
  return <button onClick={onClick} disabled={disabled} style={st} className="tcx-bar">{inner}</button>;
}

/** A full-width outlined button with its label centred — the mockup's `.btn`.
 *
 *  Distinct from `SecondaryBar`, which is the foot of a screen: a top rule, a flush-left label and
 *  an arrow. This one is a button sitting in the flow of a screen, where the mockup draws a box —
 *  "Show at the counter" under the collection code, and the two actions on the Sent screen. */
export function OutlineButton({ label, href, onClick, disabled }: {
  label: string; href?: string; onClick?: () => void; disabled?: boolean;
}) {
  const st: React.CSSProperties = {
    minHeight: 52, width: "100%", border: `2px solid ${INK}`, borderRadius: 0, background: "transparent",
    color: INK, font: "inherit", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 14,
    letterSpacing: "0.05em", textTransform: "uppercase", display: "flex", alignItems: "center",
    justifyContent: "center", padding: "0 14px", textDecoration: "none",
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1,
  };
  if (href && !disabled) return <Link href={href} style={st} className="tcx-bar">{label}</Link>;
  return <button onClick={onClick} disabled={disabled} style={st} className="tcx-bar">{label}</button>;
}

/** The word a ward is allowed to see. Never a number, and never colour on its own. */
export function StockTag({ word }: { word: "in_stock" | "low" | "none" | string }) {
  const label = word === "in_stock" ? "In stock" : word === "low" ? "Low" : "None on shelf";
  /* Filled, as the mockup draws it — but the word is still the whole message: somebody who cannot
     tell the three fills apart reads `Low` and `None on shelf` and knows exactly the same thing.
     The label stays this element's only child on purpose; the behavioural suite greps for a tag
     whose text is exactly `Low`. */
  const fill = word === "in_stock" ? OK : word === "none" ? ACCENT : SURFACE;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", minHeight: 26, padding: "0 8px",
      fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
      background: fill, color: word === "low" ? INK : "#fff",
      border: word === "low" ? `2px solid ${INK}` : 0, whiteSpace: "nowrap",
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

/* ---------------------------------------------------------------- banners, tabs, states ---- */

/** The one full-bleed banner at the top of Home: "3 requests waiting on you ›".
 *
 *  A link, not a card with a button in it: the whole strip is the target, which is the only sensible
 *  size for something somebody taps while walking. At most one is ever drawn — a home screen with
 *  two things shouting at once has nothing at the top. */
export function AlertBar({ title, href }: { title: string; href: string }) {
  return (
    <Link href={href} className="tcx-bar" style={{
      display: "flex", alignItems: "center", gap: 12, minHeight: 52, padding: "12px 16px",
      background: ACCENT, color: "#fff", textDecoration: "none", font: "inherit",
      fontWeight: 800, fontSize: 15, lineHeight: 1.3,
    }}>
      <span style={{ flex: 1, minWidth: 0 }}>{title}</span>
      <IconRight size={20} />
    </Link>
  );
}

/** A segmented control whose segments are URLs — the Team shell's tabs.
 *
 *  Links rather than buttons, because each tab is a real screen with its own address: the back
 *  button works, an emailed link lands on the right tab, and a screen reader is told these are
 *  places to go. That is also why the chosen one carries `aria-current="page"` and not
 *  `aria-pressed` — `Segments` is the button version, for views that swap a list in place. */
export function SegmentLinks({ options, active, label = "View" }: {
  options: { href: string; label: string; count?: number }[];
  active: string;
  label?: string;
}) {
  return (
    <nav aria-label={label} style={{ display: "flex", gap: 2, padding: "12px 16px", background: GROUND }}>
      {options.map((o) => {
        const on = o.href === active;
        return (
          <Link
            key={o.href}
            href={o.href}
            aria-current={on ? "page" : undefined}
            style={{
              flex: 1, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              border: `2px solid ${INK}`, background: on ? INK : "#fff", color: on ? GROUND : N700,
              textDecoration: "none", font: "inherit", fontWeight: on ? 800 : 600, fontSize: 13,
              letterSpacing: "0.06em", textTransform: "uppercase", borderRadius: 0,
            }}
          >
            <span>{o.label}</span>
            {o.count ? <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800 }}>{o.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** The in-app offline bar, drawn once by the (app) layout and never by a screen.
 *
 *  It says the one thing somebody standing in a corridor needs to know — that nothing they typed
 *  has been thrown away — and offers to look again. Retry never re-sends: none of the staff ops are
 *  idempotent, so a replay raises a second request and emails the manager twice (see mutate()). */
export function OfflineBar() {
  const { online, retry } = useStaff();
  if (online) return null;
  return (
    <div role="status" style={{
      display: "flex", alignItems: "center", gap: 12, flex: "0 0 auto",
      background: INK, color: GROUND, padding: "10px 16px",
    }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, lineHeight: 1.4 }}>
        No signal. Nothing you typed is lost.
      </span>
      <button onClick={retry} style={{
        minHeight: 36, padding: "0 12px", border: `2px solid ${GROUND}`, borderRadius: 0,
        background: "transparent", color: GROUND, font: "inherit", fontWeight: 800, fontSize: 12,
        letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", flex: "0 0 auto",
      }}>Retry</button>
    </div>
  );
}

/** The collection code, full screen and nothing else: this is held up across a counter, often at
 *  arm's length, and everything else on the screen is something to read past.
 *
 *  ⛔ Done is a real link to the order, never `history.back()`. This screen is opened cold at least
 *  three ways — a notification tap, a refresh on a ward phone, an app link — and in each of them
 *  there is no history to pop, so a back-button Done walks the person out of the app holding an
 *  unread code.
 *
 *  The digits are given an aria-label that reads them singly: 92px mono is announced as one
 *  four-digit number, and somebody reading it out to a clerk needs the digits. */
export function FullCode({ code, name, lines, backHref }: {
  code: string; name: string; lines: string[]; backHref: string;
}) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 18, background: "#fff", padding: "24px 16px calc(24px + env(safe-area-inset-bottom, 0px))", textAlign: "center",
    }}>
      <Kicker>Show at the counter</Kicker>
      <div
        aria-label={`Collection code ${code.split("").join(" ")}`}
        style={{ fontFamily: MONO, fontWeight: 600, fontSize: "clamp(64px, 22vw, 92px)", letterSpacing: "0.1em", lineHeight: 1 }}
      >{code}</div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{name}</div>
      {lines.length > 0 && (
        <div style={{ fontSize: 14, color: N600, lineHeight: 1.6 }}>
          {lines.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
      <Link href={backHref} className="tcx-bar" style={{
        minHeight: 52, minWidth: 160, display: "flex", alignItems: "center", justifyContent: "center",
        border: `2px solid ${INK}`, color: INK, textDecoration: "none", font: "inherit",
        fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 14, letterSpacing: "0.08em",
        textTransform: "uppercase", marginTop: 6,
      }}>Done</Link>
    </div>
  );
}

/** "Signing — 2 of 3 signed", with a rule that fills as it goes.
 *
 *  The words are in a `role="status"` so the count is announced as it climbs; the rule itself is
 *  decoration and says nothing, so it is hidden. */
export function Progress({ label, done, total, unit }: { label: string; done: number; total: number; unit?: string }) {
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
  return (
    <div style={{ padding: "14px 16px", background: "#fff", borderTop: `1px solid ${DIVIDER}` }}>
      <div role="status" style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {label} — {done} of {total}{unit ? ` ${unit}` : ""}
      </div>
      <div aria-hidden="true" style={{ height: 8, background: N200, marginTop: 10 }}>
        <div style={{ height: 8, width: `${pct}%`, background: ACCENT, transition: "width .2s" }} />
      </div>
    </div>
  );
}

/** One signed hand-over: the day, what was on it, and the signature underneath.
 *
 *  Quantities appear here and nowhere else on a wearer's side of the app. This is their own slip,
 *  which they signed at the counter, and three identical lines under one date read as a bug. */
export function SlipCard({ date, lines, sigSrc }: {
  date: string; lines: { item: string; size: string; qty: number }[]; sigSrc?: string;
}) {
  return (
    <div style={{ padding: "14px 16px", background: "#fff", borderTop: `1px solid ${DIVIDER}` }}>
      <div style={{ fontSize: 16, fontWeight: 800 }}>{date}</div>
      <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "grid", gap: 4 }}>
        {lines.map((l, i) => (
          <li key={i} style={{ fontSize: 14.5, lineHeight: 1.5 }}>{lineText(l)}</li>
        ))}
      </ul>
      {sigSrc && <SlipSignature src={sigSrc} />}
    </div>
  );
}

/** The signature under a slip, with the label the mockup gives it.
 *
 *  `/api/staff/slip/<id>/sig` can 404 for an old slip whose image is no longer on disk, and a
 *  broken-image icon on somebody's own signed record reads as a fault in the record rather than a
 *  missing file. A failed load leaves the label and says, quietly, that it is not stored. */
function SlipSignature({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div style={{
      display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12,
      marginTop: 12, paddingTop: 10, borderTop: `1px solid ${DIVIDER}`,
    }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: N600 }}>Your signature</span>
      {failed
        ? <span style={{ fontSize: 12.5, color: N600 }}>not stored</span>
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={src} alt="Your signature" onError={() => setFailed(true)} style={{ display: "block", maxHeight: 70, maxWidth: "62%" }} />}
    </div>
  );
}

export { ACCENT, ACCENT_300, ACCENT_700, DIVIDER, GROUND, INK, N200, N300, N400, N500, N600, N700, OK, SURFACE };
