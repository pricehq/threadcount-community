"use client";
import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import HelpMark from "@/components/HelpMark";
import { label, longLabel, type Item, type Snapshot } from "@/lib/compute";

/* The slim ink head every /app screen wears. `eyebrow` is accepted so existing callers compile,
   but it is no longer drawn: the rail already says which screen this is. The help mark is always
   the last thing on the right. */
export function PageHead({ title, sub, children, below }: { eyebrow?: string; title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; below?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div className="tc-ph-main">
        <h1 className="h1">{title}</h1>
        {sub && <div className="tc-ph-sub">{sub}</div>}
        {below}
      </div>
      <div className="tc-ph-actions">{children}<HelpMark /></div>
    </header>
  );
}

export function Sec({ children, right, style }: { children: React.ReactNode; right?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="sec" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, ...style }}>
      <div>{children}</div>
      {right && <div style={{ fontSize: 12, fontWeight: 400, letterSpacing: 0, textTransform: "none", color: "var(--color-neutral-700)" }}>{right}</div>}
    </div>
  );
}

/** The props a Field hands its control. Spread them onto the input/select/textarea. */
export type FieldControl = { id: string; "aria-describedby": string | undefined; "aria-invalid": true | undefined };

/* A labelled form control.
 *
 * The pattern this replaces — `<div className="field"><label>Sets</label><input className="input" …/></div>`
 * — draws a label and leaves it a sibling of the box it names, so nothing connects the two: a
 * screen reader reaching the input announces "edit text, blank", and clicking the label does not
 * put the cursor in the field. Field generates one id per instance and wires it as the label's
 * htmlFor and the control's id, so every consumer gets the association for free rather than having
 * to invent an id at each of the ninety-odd fields in the product.
 *
 * The control comes in as a function because only the consumer knows which element is the one the
 * label names — some fields draw a button or a hint alongside the input. Grouped controls (a Seg,
 * a set of radios) are not Fields: a single label cannot name several controls, and they want a
 * fieldset or role="group" instead.
 *
 * The markup is the same div.field the stylesheet already targets, so the visual result is
 * unchanged; `hint` and `error` only appear when a consumer asks for them, and both are wired into
 * aria-describedby so they are read out as part of the field rather than as loose text. */
export function Field({ label, hint, error, className, style, children }: {
  label: React.ReactNode; hint?: React.ReactNode; error?: string; className?: string; style?: React.CSSProperties;
  children: (control: FieldControl) => React.ReactNode;
}) {
  const base = useId();
  const id = base + "c";
  const hintId = hint ? base + "h" : undefined;
  const errId = error ? base + "e" : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={"field" + (className ? " " + className : "")} style={style}>
      <label htmlFor={id}>{label}</label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && <div id={hintId} style={{ fontSize: 11, color: "var(--color-neutral-700)" }}>{hint}</div>}
      {/* Red on its own says nothing here — the accent is already the primary button an inch below
          this line. The mark is what carries at a glance; the words are what carry the meaning, so
          the mark is decoration and stays out of the reading. */}
      <LiveRegion id={errId} tone="alert" style={{ fontSize: 12, fontWeight: 700, color: "var(--color-accent-700)" }}
        msg={error ? <><span className="tc-mark" aria-hidden="true" />{error}</> : undefined} />
    </div>
  );
}

/* Everything the keyboard can reach inside a dialog, in tab order. getClientRects() is the
   visibility test rather than offsetParent because a fixed-position control inside the dialog has
   no offset parent and would otherwise drop out of the cycle. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function focusables(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
}

/* Drawn here rather than pulled off a CDN, and drawn the way the rail's icons are: 2px strokes,
   square caps, mitred joins. A rounded × would be the only soft corner in an app built out of 2px
   square borders. */
const CLOSE_ICON = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false">
    <path d="M5 5l14 14M19 5L5 19" />
  </svg>
);

/* A dialog is chrome, so it wears the chrome's ink: a dark head with the accent rule under it, the
   same band the rail and the page header carry. What the dialog is *about* — the garment rows, the
   counted figures, the invoice costs — stays on paper below it, for the same reason the page
   content did: those numbers get read at arm's length under ward lighting.
 *
 * `foot` is the row of buttons. It is a prop rather than the last thing in `children` so the head
 * and the buttons stay put and only the middle scrolls: Receive delivery on a fourteen-line order
 * used to push Receive off the bottom of the screen, and someone had to scroll a dialog they had
 * just finished filling in to find out where the button went. */
export function Dialog({ title, width = 560, onClose, children, sub, foot }: { title: React.ReactNode; width?: number; onClose: () => void; children: React.ReactNode; sub?: React.ReactNode; foot?: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subId = useId();
  // Whoever had focus when the dialog was opened gets it back when it closes. Read during render,
  // not in the effect: by the time an effect runs the dialog is in the page and a field with
  // autoFocus may already have taken focus off the button that opened it.
  const opener = useRef<Element | null>(null);
  if (opener.current === null && typeof document !== "undefined") opener.current = document.activeElement;

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const opened = opener.current;
    // "Modal" has to mean something to the keyboard and the screen reader, not just to the eye.
    // Marking every ancestor's other children `inert` takes the page behind the overlay out of the
    // tab order and out of the accessibility tree, which is what the dim layer only implies. Doing
    // it by walking the ancestors keeps the dialog where it is rendered — moving it to a portal
    // would change which React tree its events bubble through.
    const off: HTMLElement[] = [];
    for (let el: HTMLElement | null = node.parentElement; el && el !== document.body && el.parentElement; el = el.parentElement) {
      for (const sib of Array.from(el.parentElement.children)) {
        if (sib !== el && sib instanceof HTMLElement && !sib.inert) { sib.inert = true; off.push(sib); }
      }
    }
    // Focus the dialog itself rather than its first control: the name and the contents get read
    // out, and nothing is armed by accident. The two dialogs that autoFocus a field have already
    // moved focus inside by now, so leave those alone.
    if (!node.contains(document.activeElement)) node.focus();
    return () => {
      for (const el of off) el.inert = false;
      if (opened instanceof HTMLElement && opened.isConnected) opened.focus();
    };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const node = box.current;
      if (!node) return;
      // Wrap the tab cycle inside the dialog. `inert` already stops the page behind it from taking
      // focus, but on a browser without inert this is what keeps Tab from walking out, and it is
      // what returns Tab at the last control to the first rather than to the browser chrome.
      const f = focusables(node);
      if (f.length === 0) { e.preventDefault(); node.focus(); return; }
      const at = document.activeElement;
      if (e.shiftKey && (at === f[0] || at === node)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && at === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* The stylesheet's .dialog is a padded box that scrolls as a whole. Overridden here to a
          column that clips, so the three bands below can decide for themselves what scrolls —
          88vh and the 2px frame still come off the class. */}
      <div ref={box} className="dialog" style={{ maxWidth: width, padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={sub ? subId : undefined} tabIndex={-1}>
        {/* --tc-* are literal values that no scope remaps, unlike the --color-* tokens the page
            head reassigns — a dialog can be rendered inside one, and this band has to stay ink
            either way. */}
        <div style={{ flex: "0 0 auto", display: "flex", alignItems: "flex-start", gap: "var(--space-3)", background: "var(--tc-ink)", borderBottom: "4px solid var(--color-accent)", padding: "var(--space-4) var(--space-6)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="dialog-title" id={titleId} style={{ color: "var(--tc-on-ink)" }}>{title}</div>
            {sub && <div id={subId} style={{ fontSize: 12, color: "var(--tc-ink-muted)", marginTop: "var(--space-1)" }}>{sub}</div>}
          </div>
          {/* The rail's collapse button wears this class: it is the product's one piece of
              ink-on-ink chrome, and a dialog head is the same material. Escape and a click outside
              already close, but neither is discoverable on a shared linen-room PC. */}
          <button type="button" className="tc-rail-toggle" onClick={onClose} aria-label="Close" title="Close">{CLOSE_ICON}</button>
        </div>
        {/* Light on top: every dialog's first element already brings its own top margin — they had
            to, sitting directly under a title in the old box — and a full gutter here on top of
            that opens a hole under the accent rule. Enough that a future dialog without one is not
            printed against the band. */}
        <div style={{ flex: "1 1 auto", minHeight: 0, overflow: "auto", padding: "var(--space-2) var(--space-6) var(--space-5)" }}>{children}</div>
        {foot && <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "var(--space-2)", flexWrap: "wrap", padding: "var(--space-3) var(--space-6)", borderTop: "2px solid var(--color-text)" }}>{foot}</div>}
      </div>
    </div>
  );
}

export function Empty({ children, pad = 6 }: { children: React.ReactNode; pad?: number }) {
  return <div style={{ padding: `var(--space-${pad}) 0`, fontSize: 13, color: "var(--color-neutral-700)" }}>{children}</div>;
}

/* Something the app has to say back: a save that failed, a save that went through.
 *
 * A message that is only painted is silent — nothing about a div that turns up mid-page reaches
 * anyone who is not looking at it, which is why a failed login used to leave a screen reader user
 * with an apparently unchanged page. `tone` chooses how much it interrupts: "alert" cuts into
 * whatever is being read (a failure that has to be acted on), "status" waits for a gap (a result).
 *
 * The element is rendered only when there is something to say. A live region that is inserted
 * along with its text is announced by current screen readers, and keeping an empty one mounted
 * would count as a flex item wherever one of these sits in a column and open a gap in the layout. */
export function LiveRegion({ msg, tone = "status", id, className, style }: { msg?: React.ReactNode; tone?: "status" | "alert"; id?: string; className?: string; style?: React.CSSProperties }) {
  if (!msg) return null;
  return <div id={id} className={className} style={style} role={tone} aria-live={tone === "alert" ? "assertive" : "polite"} aria-atomic="true">{msg}</div>;
}

/* A save that would not go through. Marked three ways over — the rule down the left edge, the
   heavier type, and the mark — because this sits under a form whose primary button is already the
   same red, and two reds a metre apart across a linen room is a guess rather than a signal. */
export function ErrorLine({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <LiveRegion tone="alert" className="tc-flag" style={{ marginTop: "var(--space-3)", padding: "var(--space-2) var(--space-3)", fontSize: 13, color: "var(--color-accent-700)", fontWeight: 700 }}
      msg={<><span className="tc-mark" aria-hidden="true" />{msg}</>} />
  );
}

export function Notice({ msg }: { msg: string }) {
  return <LiveRegion msg={msg} className="notice" />;
}

/** Segmented control.
 *
 *  Which option is chosen was carried by the btn-primary class alone — a fill and a colour, and
 *  nothing at all in the accessibility tree. Read aloud, every segment was an ordinary button and
 *  the one already in force was indistinguishable from the four that would change the screen.
 *  aria-pressed is the honest role for a control that stays down: these swap what the list below
 *  shows rather than navigating anywhere, which is a toggle, not a tab. Every caller already wraps
 *  the row in a labelled role="group". */
export { Seg } from "@/components/portal";

/** Inventory / Stock take sub-tabs shown under the Inventory heading. */
export function InvTabs({ active }: { active: "stock" | "take" }) {
  return (
    <div className="seg" style={{ marginTop: "var(--space-3)" }}>
      {/* Links, not buttons — so the one you are on is aria-current, not aria-pressed. Same defect
          as Seg's: without it the current tab was a fill and nothing more. */}
      <Link href="/app/stock" aria-current={active === "stock" ? "page" : undefined} className={"seg-opt" + (active === "stock" ? " btn-primary" : "")} style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Stock on hand</Link>
      <Link href="/app/stocktake" aria-current={active === "take" ? "page" : undefined} className={"seg-opt" + (active === "take" ? " btn-primary" : "")} style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Stock take</Link>
    </div>
  );
}

/* `flag` is how a screen says a figure needs attention — sizes out of stock, a gap that has to be
   explained before the count can be filed. It never means "paint it red": a flagged tile gets the
   rule down its edge, the heavier accent-700 figure and the mark, all three off .tc-flag, because
   the accent is already the primary button on the same screen.
   A caller that reaches for the accent through `color` instead meant the same thing, so it lands in
   the same place rather than as the red-only treatment this design is trying to get rid of. */
const flagged = (color?: string, flag?: boolean) => flag ?? /accent/.test(color || "");

/** The figures under a page head. Grid is auto-fit, so three tiles and five both fill the row. */
export function KpiStrip({ items }: { items: { val: React.ReactNode; label: string; color?: string; note?: string; flag?: boolean }[] }) {
  return (
    <div className="tc-tiles" style={{ marginTop: "var(--space-4)" }}>
      {items.map((k) => {
        const on = flagged(k.color, k.flag);
        return (
          <div key={k.label} className={"tc-tile" + (on ? " tc-flag" : "")}>
            <div className="tc-figure" style={on ? undefined : { color: k.color || "var(--color-text)" }}>{on && <span className="tc-mark" aria-hidden="true" />}{k.val}</div>
            <div className="tc-tile-label">{k.label}</div>
            {k.note && <div className="tc-tile-note">{k.note}</div>}
          </div>
        );
      })}
    </div>
  );
}

/** A single figure under a top rule, for a row of them that is not a bordered tile strip. Flagged,
 *  it gains a left rule as well — an L around the figure, which reads as a mark on the page rather
 *  than as a border. */
export function Stat({ label, val, color, flag }: { label: string; val: React.ReactNode; color?: string; flag?: boolean }) {
  const on = flagged(color, flag);
  return (
    <div className={on ? "tc-flag" : undefined} style={{ borderTop: "2px solid var(--color-text)", paddingTop: "var(--space-2)", paddingLeft: on ? "var(--space-2)" : undefined }}>
      <div className="tc-meta">{label}</div>
      <div className="tc-figure" style={on ? { fontSize: 26 } : { fontSize: 26, color: color || "var(--color-text)" }}>{on && <span className="tc-mark" aria-hidden="true" />}{val}</div>
    </div>
  );
}

export function itemOptions(s: Snapshot) {
  return s.catalog.filter((i) => !i.archived).map((it) => ({ v: it.id, label: longLabel(it) + (it.sku ? " · " + it.sku : "") }));
}

/** Item select + one button per size. */
/* The sizes default to outlined boxes rather than underlined text. They sit immediately beside the
   2px select they belong to, they are the thing being aimed at, and two of the four callers had
   already overridden the underline away — this makes the odd two out the same as the rest. */
export function ItemSizePicker({ s, itemId, onItem, onSize, placeholder = "Choose an item…", btnClass = "btn btn-secondary", maxWidth = 320 }: {
  s: Snapshot; itemId: string; onItem: (id: string) => void; onSize: (it: Item, si: number) => void; placeholder?: string; btnClass?: string; maxWidth?: number;
}) {
  const it = s.catalog.find((x) => x.id === itemId);
  return (
    <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
      <select className="input" style={{ maxWidth }} value={itemId} onChange={(e) => onItem(e.target.value)}>
        <option value="">{placeholder}</option>
        {itemOptions(s).map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
      {it && it.sizes.map((sz, si) => (
        <button key={si} className={btnClass} style={{ minHeight: 26, padding: "2px 8px", justifyContent: "center" }} onClick={() => onSize(it, si)} title={label(it) + " " + sz}>{sz}</button>
      ))}
    </div>
  );
}

/* Two square boxes with the count between them. They were ghost buttons, which means .btn-ghost's
   underline ran under the − and the + and flush-left alignment pushed both glyphs off centre in
   their own boxes. Outlined at 2px, they match the quantity inputs they sit in a row with. */
export function Stepper({ value, onDec, onInc, width = 24 }: { value: number; onDec: () => void; onInc: () => void; width?: number }) {
  const btn: React.CSSProperties = { padding: "0 9px", minHeight: 26, justifyContent: "center" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)" }}>
      <button className="btn btn-secondary" style={btn} onClick={onDec} aria-label="decrease">−</button>
      <span style={{ width, textAlign: "center", fontFamily: "var(--font-heading)", fontWeight: 800 }}>{value}</span>
      <button className="btn btn-secondary" style={btn} onClick={onInc} aria-label="increase">+</button>
    </span>
  );
}

export const th = (t: string, right = false, extra: React.CSSProperties = {}) => <th key={t} style={{ textAlign: right ? "right" : "left", ...extra }}>{t}</th>;
