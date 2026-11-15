"use client";
/* Shared building blocks for the coordinator portal (/app). Styles live in app/globals.css under
 * "portal redesign", scoped to .tc-shell or on class names nothing else in the product wears. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

export type IconName = "today" | "counter" | "stock" | "orders" | "people" | "reports" | "settings" | "phone" | "truck" | "bag" | "doc" | "search" | "scan" | "print" | "mail" | "check" | "plus" | "drag" | "chevronLeft" | "chevronDown" | "alert" | "camera";

/* One glyph per name: 1.8 strokes, square caps, mitred joins, drawn on a 24 grid. */
const GLYPHS: Record<IconName, React.ReactNode> = {
  today: <><rect x="3" y="4" width="18" height="17" /><path d="M3 9h18M8 2v4M16 2v4M8 14l2.5 2.5L16 12" /></>,
  counter: <path d="M8 3l-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z" />,
  stock: <><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" /></>,
  orders: <><path d="M2 6h12v10H2zM14 9h4l3 3v4h-7" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.6 2.5 3 5.2" /></>,
  reports: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  settings: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  phone: <path d="M5 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A18 18 0 0 1 3 5a2 2 0 0 1 2-2z" />,
  truck: <><path d="M2 6h12v10H2zM14 9h4l3 3v4h-7" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  bag: <><path d="M5 8h14l-1 13H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  doc: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 11h7M9 15h7M9 7h3" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l5 5" /></>,
  scan: <path d="M3 8V4h4M17 4h4v4M21 16v4h-4M7 20H3v-4M7 8v8M10 8v8M13 8v8M16 8v8" />,
  print: <><path d="M7 9V3h10v6" /><path d="M5 17H3V9h18v8h-2" /><path d="M7 14h10v7H7z" /></>,
  mail: <><path d="M3 5h18v14H3z" /><path d="M3 5l9 7 9-7" /></>,
  check: <path d="M4 12l5 5L20 6" />,
  plus: <path d="M12 4v16M4 12h16" />,
  drag: <path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" />,
  chevronLeft: <path d="M15 5l-7 7 7 7" />,
  chevronDown: <path d="M5 9l7 7 7-7" />,
  alert: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.01" /></>,
  camera: <><path d="M3 7h4l2-3h6l2 3h4v13H3z" /><circle cx="12" cy="13" r="4" /></>,
};

export function Icon({ name, size = 18, title }: { name: IconName; size?: 16 | 18; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={name === "drag" ? 3 : 1.8} strokeLinecap="square" strokeLinejoin="miter"
      aria-hidden={title ? undefined : true} role={title ? "img" : undefined} aria-label={title} focusable="false" style={{ flex: "none" }}>
      {title && <title>{title}</title>}
      {GLYPHS[name]}
    </svg>
  );
}

export function MonoNum({ children, weight = 500, tone = "ink", size, as = "span" }: { children: React.ReactNode; weight?: 400 | 500 | 600; tone?: "ink" | "accent" | "muted"; size?: number; as?: "span" | "b" }) {
  const Tag = as;
  const color = tone === "accent" ? "var(--color-accent-700)" : tone === "muted" ? "var(--color-neutral-700)" : undefined;
  return <Tag className="tc-mono" style={{ fontWeight: weight, color, fontSize: size }}>{children}</Tag>;
}

export function Kbd({ children, onAccent }: { children: React.ReactNode; onAccent?: boolean }) {
  return <kbd className={"tc-kbd" + (onAccent ? " tc-kbd-onaccent" : "")}>{children}</kbd>;
}

export function Tag({ children, tone = "outline", mono, title }: { children: React.ReactNode; tone?: "outline" | "ink" | "accent" | "low" | "quiet"; mono?: boolean; title?: string }) {
  return <span className={`tag tag-${tone}${mono ? " tc-mono tc-tag-mono" : ""}`} title={title}>{children}</span>;
}

export function Meter({ label, value, of, size = "md", showLabel = true }: { label: string; value: number; of: number; size?: "md" | "sm"; showLabel?: boolean }) {
  const over = value > of;
  const drawn = Math.max(0, Math.min(of, 12));
  const filled = Math.min(value, drawn);
  return (
    <div className={`tc-meter tc-meter-${size}${over ? " tc-meter-over" : ""}`} role="img" aria-label={`${label}: ${value} of ${of}`}>
      {showLabel && <span className="tc-lbl tc-meter-label" aria-hidden="true">{label}</span>}
      <span className="tc-meter-squares" aria-hidden="true">
        {Array.from({ length: drawn }, (_, i) => <span key={i} className={"tc-meter-sq" + (over || i < filled ? " on" : "")} />)}
      </span>
      <span className="tc-mono tc-meter-text" aria-hidden="true">{value} of {of}</span>
    </div>
  );
}

export type SizeCell = { si: number; size: string; count: number | null; state: "ok" | "low" | "out" | "none"; title?: string };

/** `action` is the verb a tappable cell performs ("Adjust", "Add"), put in front of its name;
 *  `opensDialog` marks cells that open a dialog. */
export function SizeStrip({ itemLabel, cells, onCell, selectedSi, action, opensDialog }: { itemLabel: string; cells: SizeCell[]; onCell?: (si: number) => void; selectedSi?: number | null; action?: string; opensDialog?: boolean }) {
  const note = (c: SizeCell) => (c.state === "low" ? ", at reorder" : c.state === "out" ? ", out" : c.state === "none" ? ", not stocked" : "");
  return (
    <div className="tc-sizestrip">
      {cells.map((c) => {
        const cls = `tc-sizecell tc-sizecell-${c.state}${selectedSi === c.si ? " selected" : ""}`;
        const inner = <><span className="tc-sizecell-size">{c.size}</span><span className="tc-sizecell-count">{c.state === "none" || c.count === null ? "–" : c.count}</span></>;
        const aria = c.state === "none" ? `${itemLabel} ${c.size}, not stocked` : `${itemLabel} ${c.size}: ${c.count ?? 0} on hand${note(c)}`;
        return onCell
          ? <button key={c.si} type="button" className={cls} title={c.title} aria-label={action ? `${action} ${aria}` : aria} aria-haspopup={opensDialog ? "dialog" : undefined} aria-pressed={selectedSi === undefined ? undefined : selectedSi === c.si} onClick={() => onCell(c.si)}>{inner}</button>
          : <span key={c.si} className={cls} title={c.title} role="img" aria-label={aria}>{inner}</span>;
      })}
    </div>
  );
}

export function Seg<T extends string>({ opts, value, onChange, label, labels, counts, hrefs, tone = "paper", size = "md", disabled, style }: {
  opts: readonly T[]; value: T; onChange: (v: T) => void;
  label?: string;
  labels?: Partial<Record<T, React.ReactNode>>;
  counts?: Partial<Record<T, number | string>>;
  hrefs?: Partial<Record<T, string>>;
  tone?: "paper" | "ink";
  size?: "md" | "sm";
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const body = (o: T) => (
    <>
      {labels?.[o] ?? o}
      {counts?.[o] !== undefined && counts[o] !== "" && <span className="tc-seg-count tc-mono">{counts[o]}</span>}
    </>
  );
  return (
    <div className={`seg tc-seg tc-seg-${tone} tc-seg-${size}`} style={style} role={label ? "group" : undefined} aria-label={label}>
      {opts.map((o) => {
        const on = value === o;
        const cls = "seg-opt tc-seg-opt" + (on ? " on" : "");
        const href = hrefs?.[o];
        if (href && !disabled) return <Link key={o} href={href} className={cls} aria-current={on ? "page" : undefined} onClick={() => onChange(o)}>{body(o)}</Link>;
        return <button key={o} type="button" className={cls} aria-pressed={on} disabled={disabled} onClick={() => onChange(o)}>{body(o)}</button>;
      })}
    </div>
  );
}

export function Tabs({ label, tabs, value, hrefFor }: { label: string; tabs: { id: string; label: string; count?: number }[]; value: string; hrefFor: (id: string) => string }) {
  const router = useRouter();
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  function go(e: React.MouseEvent, id: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    router.replace(hrefFor(id), { scroll: false });
  }
  function key(e: React.KeyboardEvent, i: number) {
    const n = tabs.length;
    const to = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    refs.current[to]?.focus();
  }
  return (
    <div className="tc-tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => {
        const on = t.id === value;
        return (
          <Link key={t.id} ref={(el) => { refs.current[i] = el; }} href={hrefFor(t.id)} role="tab" aria-selected={on} tabIndex={on ? 0 : -1}
            className={"tc-tab" + (on ? " on" : "")} onClick={(e) => go(e, t.id)} onKeyDown={(e) => key(e, i)} scroll={false}>
            {t.label}
            {t.count !== undefined && <Tag tone="ink" mono>{t.count}</Tag>}
          </Link>
        );
      })}
    </div>
  );
}

export function Panel({ title, icon, count, aside, flag, foot, id, headingLevel = 2, children }: { title: React.ReactNode; icon?: IconName; count?: number; aside?: React.ReactNode; flag?: boolean; foot?: React.ReactNode; id?: string; headingLevel?: 2 | 3; children: React.ReactNode }) {
  const H = headingLevel === 3 ? "h3" : "h2";
  const hid = useId();
  return (
    <section id={id} className={"tc-pp" + (flag ? " tc-flag" : "")} aria-labelledby={hid}>
      <div className="tc-pp-head">
        <span className="tc-pp-title">
          {icon && <Icon name={icon} size={16} />}
          <H id={hid} className="tc-pp-h">{title}</H>
          {count !== undefined && <span className="tag tag-ink tc-mono tc-pp-count">{count}</span>}
        </span>
        {aside && <span className="tc-pp-aside">{aside}</span>}
      </div>
      <div className="tc-pp-body">{children}</div>
      {foot && <div className="tc-pp-foot">{foot}</div>}
    </section>
  );
}

export function QueueGroup({ id, icon, title, count, aside, children }: { id: string; icon: IconName; title: string; count: number; aside?: React.ReactNode; children: React.ReactNode }) {
  if (count === 0) return null;
  return <Panel id={id} icon={icon} title={title} count={count} aside={aside}>{children}</Panel>;
}

export function QueueRow({ age, ageLabel, urgent, title, titleMeta, meta, actions }: {
  age: React.ReactNode; ageLabel: string; urgent?: boolean; title: React.ReactNode; titleMeta?: React.ReactNode; meta: React.ReactNode; actions?: React.ReactNode;
}) {
  return (
    <div className={"tc-qrow" + (urgent ? " urgent" : "")}>
      <div className="tc-qrow-age">
        <div className="tc-mono tc-qrow-agefig">{age}</div>
        <div className="tc-qrow-agelbl">{ageLabel}</div>
      </div>
      <div className="tc-qrow-main">
        <div className="tc-qrow-title">{title}{titleMeta && <> <span className="tc-mono tc-qrow-titlemeta">{titleMeta}</span></>}</div>
        <div className="tc-qrow-meta">{meta}</div>
      </div>
      {actions && <div className="tc-qrow-actions">{actions}</div>}
    </div>
  );
}

export function QtyStepper({ value, onChange, min = 0, max, label, size = "md" }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string; size?: "md" | "sm" }) {
  const atMin = value <= min, atMax = max !== undefined && value >= max;
  return (
    <span className={`tc-qty tc-qty-${size}`}>
      <button type="button" className="tc-qty-btn" aria-label={`One fewer ${label}`} disabled={atMin} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <output className="tc-qty-val tc-mono" aria-live="polite">{value}</output>
      <button type="button" className="tc-qty-btn" aria-label={`One more ${label}`} disabled={atMax} onClick={() => onChange(max === undefined ? value + 1 : Math.min(max, value + 1))}>+</button>
    </span>
  );
}

export function SelectButton({ label, value, options, onChange, anyValue }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; anyValue?: string }) {
  const shown = value === anyValue ? "any" : options.find((o) => o.value === value)?.label ?? value;
  return (
    <span className="tc-selectbtn btn btn-secondary">
      <span aria-hidden="true">{label}: {shown}</span>
      <Icon name="chevronDown" size={16} />
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </span>
  );
}

export type MoreMenuItem = { label: string; onSelect?: () => void; href?: string; newTab?: boolean; disabled?: boolean; danger?: boolean; hidden?: boolean };

export function MoreMenu({ label = "More", tone = "paper", items }: { label?: string; tone?: "paper" | "ink"; items: MoreMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const shown = items.filter((i) => !i.hidden);
  const focusItem = (i: number) => {
    const els = wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
    if (!els || !els.length) return;
    els[(i + els.length) % els.length].focus();
  };
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", down);
    requestAnimationFrame(() => focusItem(0));
    return () => document.removeEventListener("mousedown", down);
  }, [open]);
  function onKey(e: React.KeyboardEvent) {
    const els = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') || []);
    const at = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") { e.preventDefault(); focusItem(at + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusItem(at - 1); }
    else if (e.key === "Home") { e.preventDefault(); focusItem(0); }
    else if (e.key === "End") { e.preventDefault(); focusItem(els.length - 1); }
    else if (e.key === "Escape" || e.key === "Tab") { if (e.key === "Escape") e.preventDefault(); setOpen(false); if (e.key === "Escape") btn.current?.focus(); }
  }
  const done = () => { setOpen(false); btn.current?.focus(); };
  return (
    <div className="tc-more" ref={wrap} onKeyDown={open ? onKey : undefined}>
      <button ref={btn} type="button" className={"btn " + (tone === "ink" ? "btn-onink" : "btn-secondary")} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}>
        {label}<Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <div id={menuId} className="tc-more-menu" role="menu" aria-label={label}>
          {shown.map((it) => {
            const cls = "tc-more-item" + (it.danger ? " danger" : "");
            if (it.href && !it.disabled) {
              return <Link key={it.label} role="menuitem" tabIndex={-1} className={cls} href={it.href} target={it.newTab ? "_blank" : undefined} rel={it.newTab ? "noopener" : undefined}
                onClick={() => { it.onSelect?.(); setOpen(false); }}>{it.label}</Link>;
            }
            return <button key={it.label} type="button" role="menuitem" tabIndex={-1} className={cls} aria-disabled={it.disabled || undefined}
              onClick={() => { if (it.disabled) return; done(); it.onSelect?.(); }}>{it.label}</button>;
          })}
        </div>
      )}
    </div>
  );
}

export function Figures({ items }: { items: { value: React.ReactNode; label: string; note?: React.ReactNode; flag?: boolean }[] }) {
  return (
    <div className="tc-figs" style={{ gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))` }}>
      {items.map((it) => (
        <div key={it.label} className={"tc-fig" + (it.flag ? " flag" : "")}>
          <div className="tc-mono tc-fig-value">{it.flag && <span className="tc-mark" aria-hidden="true" />}{it.value}</div>
          <div className="tc-lbl">{it.label}</div>
          {it.note && <div className="tc-meta-line">{it.note}</div>}
        </div>
      ))}
    </div>
  );
}

export function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return <div className="tc-bar" role="img" aria-label={label}><span style={{ width: pct + "%" }} /></div>;
}
