"use client";
/* The phone app's shared furniture, built once from the approved counter redesign.
   Every screen is a top bar, an accent rule, a scrolling body and (usually) one primary action bar;
   the five tab roots add the tab bar. Sizes are the mockup's px straight: the app runs at device width.
   Square corners, 2px ink borders, 44px minimum targets, IBM Plex Mono for codes, sizes and counts. */
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useWorkCount } from "@/lib/workcount";

export const INK = "var(--color-text)";
export const GROUND = "var(--color-bg)";
export const ACCENT = "var(--color-accent)";
export const ON_DARK = "var(--color-neutral-400)"; // meta text on ink — 500/600 fail contrast there
/** Codes, sizes, counts and money. */
export const MONO = "var(--font-plex-mono), 'IBM Plex Mono', ui-monospace, monospace";
export const OK = "#1e7a4f";
export const AC3 = "var(--color-accent-300)";
export const AC7 = "var(--color-accent-700)";
export const MUTED = "var(--color-neutral-600)";
export const DIVIDER = "var(--color-divider)";
const WHITE = "#ffffff";
const OFF_GREY = "#b5b1af";
const DARK_RULE = "#3a3735";
const DARK_EDGE = "#57534f";

/* Rules inline styles cannot express: first-section margin, focus rings, the viewfinder laser.
   React hoists and de-duplicates a <style> carrying href + precedence, so every component can
   render it and the page gets one copy. */
const M_CSS = `
.tcx-sec{margin:22px 0 4px}
.tcx-sec:first-child{margin-top:4px}
.tcx-app a:focus-visible,.tcx-app button:focus-visible,.tcx-app input:focus-visible,.tcx-app [tabindex]:focus-visible{outline:3px solid var(--color-accent);outline-offset:-3px}
@keyframes tcx-vfsweep{from{top:12%}to{top:88%}}
.tcx-vf-laser{animation:tcx-vfsweep 2.2s ease-in-out infinite alternate;top:12%}
@media (prefers-reduced-motion:reduce){.tcx-vf-laser{animation:none;top:50%}}
`;
export function MStyles() {
  return <style href="tcx-m-furniture" precedence="medium">{M_CSS}</style>;
}

// ---------- icons (stroke 2.2, square caps)
const ic = (d: React.ReactNode, size: number, stroke = 2.2) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">{d}</svg>
);
export const IconLeft = ({ size = 22 }: { size?: number }) => ic(<path d="M15 18 9 12l6-6" />, size);
export const IconRight = ({ size = 22 }: { size?: number }) => ic(<><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>, size);
export const IconCheck = ({ size = 22 }: { size?: number }) => ic(<path d="m4 12 5 5L20 6" />, size);
export const IconPrinter = ({ size = 22 }: { size?: number }) => ic(<><path d="M6 9V3h12v6" /><path d="M6 18H3v-6h18v6h-3" /><path d="M6 14h12v7H6z" /></>, size);
export const IconScan = ({ size = 22 }: { size?: number }) => ic(<><path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5" /><path d="M7 8v8M10 8v8M13 8v8M17 8v8" /></>, size, 2.4);
export const IconSearch = ({ size = 22 }: { size?: number }) => ic(<><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></>, size);
export const IconX = ({ size = 22 }: { size?: number }) => ic(<><path d="M5 5 19 19" /><path d="M19 5 5 19" /></>, size);
export const IconPlus = ({ size = 22 }: { size?: number }) => ic(<><path d="M12 5v14" /><path d="M5 12h14" /></>, size);
export const IconToday = ({ size = 24 }: { size?: number }) => ic(<><rect x="3" y="4" width="18" height="17" /><path d="M3 9h18M8 2v4M16 2v4M7 13h4M7 17h7" /></>, size);
export const IconWork = ({ size = 24 }: { size?: number }) => ic(<path d="M4 6h2M4 12h2M4 18h2M9 6h11M9 12h11M9 18h11" />, size);
export const IconStock = ({ size = 24 }: { size?: number }) => ic(<><path d="M3 3v18M21 3v18M3 9h18M3 15h18M3 21h18" /><rect x="6" y="5" width="4" height="4" /><rect x="12" y="11" width="5" height="4" /></>, size);
export const IconPeople = ({ size = 24 }: { size?: number }) => ic(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>, size);
export const IconGear = ({ size = 24 }: { size?: number }) => ic(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>, size);
export const IconBack = ({ size = 24 }: { size?: number }) => ic(<path d="M15 5l-7 7 7 7" />, size, 2.6);
const TickMark = ({ size = 44 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.2} aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" /></svg>
);

// ---------- top bar
/** The top bar. Its title is the screen's only <h1>. `right` is an MTopAction, an MTopCount, or a
 *  short string (drawn small and muted, as before). */
export function MTop({ title, right, back, onBack, dark = true }: { title: string; right?: React.ReactNode; back?: boolean; onBack?: () => void; dark?: boolean }) {
  const router = useRouter();
  const plain = typeof right === "string" || typeof right === "number";
  return (
    // The bar runs under the status bar so the ink reaches the top of the screen, but a hairline
    // keeps the phone's own clock and battery from reading as part of ThreadCount's header.
    <header className="tcx-topbar" style={{ height: 56, flex: "0 0 56px", background: dark ? INK : GROUND, color: dark ? GROUND : INK, display: "flex", alignItems: "center", gap: 4, paddingLeft: back ? 0 : 16, paddingRight: 6, backgroundImage: dark ? "linear-gradient(to bottom, rgba(243,242,242,0.16) 0 1px, transparent 1px)" : undefined, backgroundPosition: "0 env(safe-area-inset-top, 0px)", backgroundRepeat: "no-repeat", backgroundSize: "100% 1px" }}>
      <MStyles />
      {back && (
        <button onClick={() => (onBack ? onBack() : router.back())} aria-label="Back"
          style={{ minWidth: 48, height: 48, border: 0, background: "none", color: "inherit", display: "grid", placeItems: "center", cursor: "pointer", flex: "0 0 48px", padding: 0 }}>
          <IconBack />
        </button>
      )}
      <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 15, letterSpacing: "0.07em", textTransform: "uppercase", margin: 0, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</h1>
      {right !== undefined && right !== null && (plain
        ? <div style={{ fontSize: 12, color: dark ? ON_DARK : MUTED, margin: "0 10px", whiteSpace: "nowrap" }}>{right}</div>
        : right)}
    </header>
  );
}

/** A top-bar action (Settings gear, Finish): 48px, 13px/800 uppercase, ground colour. */
export function MTopAction({ label, onClick, href, icon, ariaLabel }: { label?: string; onClick?: () => void; href?: string; icon?: "gear" | "print" | "scan"; ariaLabel?: string }) {
  const st: React.CSSProperties = { minWidth: 48, height: 48, border: 0, background: "none", color: GROUND, display: "grid", placeItems: "center", fontFamily: "var(--font-heading)", fontSize: 13, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", padding: "0 10px", cursor: "pointer", textDecoration: "none" };
  const inner = icon === "gear" ? <IconGear /> : icon === "print" ? <IconPrinter size={24} /> : icon === "scan" ? <IconScan size={24} /> : label;
  const aria = ariaLabel || (icon ? label : undefined);
  if (href) return <Link href={href} aria-label={aria} style={st}>{inner}</Link>;
  return <button type="button" onClick={onClick} aria-label={aria} style={st}>{inner}</button>;
}

/** A count at the right of the top bar ("142", "7 open"). */
export function MTopCount({ children }: { children: React.ReactNode }) {
  return <span style={{ fontFamily: MONO, fontWeight: 500, fontSize: 13, color: GROUND, padding: "0 10px", whiteSpace: "nowrap" }}>{children}</span>;
}

/* Wordmark and facility bar: the staff app home (components/screens/Home.tsx). */
export function MTopBrand({ facility, right }: { facility: string; right?: React.ReactNode }) {
  return (
    <header
      className="tcx-topbar"
      style={{
        height: 56, flex: "0 0 56px", background: INK, color: GROUND, display: "flex",
        alignItems: "center", gap: 10, paddingLeft: 16, paddingRight: 16,
        backgroundImage: "linear-gradient(to bottom, rgba(243,242,242,0.16) 0 1px, transparent 1px)",
        backgroundPosition: "0 env(safe-area-inset-top, 0px)",
        backgroundRepeat: "no-repeat",
        backgroundSize: "100% 1px",
      }}
    >
      <span aria-hidden="true" style={{ width: 16, height: 16, background: "#fff", flex: "0 0 16px" }} />
      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 19, letterSpacing: "-0.02em", flex: 1 }}>ThreadCount</span>
      <span style={{ fontSize: 12, color: "var(--color-neutral-400)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: right ? "32%" : "48%" }}>{facility}</span>
      {right}
    </header>
  );
}

/** The 4px accent rule under the top bar. Given `of`, it doubles as the count progress bar. */
export function MRule({ n, of }: { n?: number; of?: number }) {
  const pct = of && of > 0 ? Math.max(0, Math.min(1, (n || 0) / of)) : null;
  return (
    <div style={{ height: 4, flex: "0 0 4px", position: "relative", background: pct === null ? ACCENT : DARK_EDGE }}>
      {pct !== null && <div style={{ position: "absolute", inset: "0 auto 0 0", width: `${pct * 100}%`, background: ACCENT, transition: "width 200ms linear" }} />}
    </div>
  );
}

/* Android 15 draws the app edge to edge, so a bar docked at the foot of the column has the gesture
   handle sitting on its bottom edge. The inset goes inside the bar. It reads through a custom
   property that MBody and MSplit set to zero, because the same bars are also used away from the foot
   of the window, where the inset would open a band of dead colour mid-screen. */
const SAFE_BOTTOM = "var(--tcx-safe-bottom, env(safe-area-inset-bottom, 0px))";
export const NOT_DOCKED = { "--tcx-safe-bottom": "0px" } as React.CSSProperties;

/** The scrolling body. `pad` gives the mockup's 16px; `dark` is the ink ground of the Scan tab. */
export function MBody({ children, pad = false, dark = false, className }: { children?: React.ReactNode; pad?: boolean; dark?: boolean; className?: string }) {
  return (
    <div className={className} style={{
      ...NOT_DOCKED, flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "thin", position: "relative",
      background: dark ? INK : GROUND, color: dark ? GROUND : INK, padding: pad ? 16 : 0,
      ...(dark ? { "--tcx-sec-rule": "var(--color-bg)", "--tcx-sec-sub": OFF_GREY } as React.CSSProperties : null),
    }}>
      <MStyles />
      {children}
    </div>
  );
}

// ---------- toast and scan flash
type ToastApi = { toast: (msg: string) => void; flash: (kind: string, label: string, then: () => void) => void };
const ToastContext = createContext<ToastApi | null>(null);

/** Mounts the toast (2200ms, over the column) and the full-screen scan confirmation (650ms). Renders
 *  no wrapper element: screens stay direct children of .tcx-app. */
export function MToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string>("");
  const [fl, setFl] = useState<{ kind: string; label: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(""), 2200);
  }, []);
  const flash = useCallback((kind: string, label: string, then: () => void) => {
    setFl({ kind, label });
    setTimeout(() => { setFl(null); then(); }, 650);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const api = useRef<ToastApi>({ toast, flash });
  return (
    <ToastContext.Provider value={api.current}>
      {children}
      {fl && (
        <div className="tcx-scanui" role="status" aria-live="assertive" style={{ position: "fixed", inset: 0, zIndex: 99, background: "rgba(32,30,29,.92)", color: WHITE, display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}>
          <div>
            <div style={{ width: 72, height: 72, background: ACCENT, display: "grid", placeItems: "center", margin: "0 auto 14px" }}><TickMark /></div>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#d6d3d2" }}>{fl.kind}</span>
            <b style={{ display: "block", fontSize: 22, fontWeight: 900 }}>{fl.label}</b>
          </div>
        </div>
      )}
      <div role="status" aria-live="polite" className="tcx-scanui" style={msg ? {
        position: "fixed", left: 12, right: 12, bottom: "calc(84px + env(safe-area-inset-bottom, 0px))", zIndex: 100,
        background: INK, color: GROUND, padding: "14px 16px", fontWeight: 700, fontSize: 15, borderLeft: "6px solid " + ACCENT,
        boxShadow: "0 10px 30px rgba(0,0,0,.25)", maxWidth: 536, margin: "0 auto", width: "auto",
      } : { position: "fixed", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{msg}</div>
    </ToastContext.Provider>
  );
}
const noopToast = () => {};
/** Show a one-line toast. Outside MToastProvider (the staff app) it does nothing. */
export function useToast(): (msg: string) => void {
  return useContext(ToastContext)?.toast ?? noopToast;
}
/** Full-screen "Staff badge / Priya Nair" confirmation, then `then()` after 650ms. */
export function useScanFlash(): (kind: string, label: string, then: () => void) => void {
  const c = useContext(ToastContext);
  return c?.flash ?? ((_k: string, _l: string, then: () => void) => then());
}

// ---------- action bars
/** Full-bleed 64px primary action: label at the left, small mono text or a glyph at the right.
 *  A disabled bar with `offReason` stays tappable and says why in a toast. */
export function MBar({ label, onClick, href, glyph = "arrow", disabled, tone = "accent", sub, small, offReason }: {
  label: string; onClick?: () => void; href?: string; glyph?: "arrow" | "check" | "printer" | "scan" | "none"; disabled?: boolean; tone?: "accent" | "ink"; sub?: string;
  small?: string; offReason?: string;
}) {
  const toast = useToast();
  const G = glyph === "check" ? IconCheck : glyph === "printer" ? IconPrinter : glyph === "scan" ? IconScan : IconRight;
  const bg = disabled ? OFF_GREY : tone === "ink" ? INK : ACCENT;
  const inner = (
    <>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 15, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>
        {sub && <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.9, textTransform: "none", letterSpacing: 0 }}>{sub}</span>}
      </span>
      {small !== undefined
        ? <small style={{ fontFamily: MONO, fontWeight: 500, fontSize: 13, letterSpacing: 0, textTransform: "none", opacity: 0.9, whiteSpace: "nowrap" }}>{small}</small>
        : glyph !== "none" && <G />}
    </>
  );
  const st: React.CSSProperties = {
    height: `calc(64px + ${SAFE_BOTTOM})`, flex: `0 0 calc(64px + ${SAFE_BOTTOM})`, width: "100%", background: bg, color: WHITE, border: 0, borderRadius: 0,
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: `0 20px ${SAFE_BOTTOM}`, cursor: disabled ? "not-allowed" : "pointer",
    textDecoration: "none", textAlign: "left",
  };
  if (disabled && offReason) {
    return <button type="button" aria-disabled="true" onClick={() => toast(offReason)} style={st} className="tcx-bar">{inner}</button>;
  }
  if (href && !disabled) return <Link href={href} style={st} className="tcx-bar">{inner}</Link>;
  return <button type="button" onClick={onClick} disabled={disabled} style={st} className="tcx-bar">{inner}</button>;
}

/** Two actions sharing the 64px bar, e.g. Undo (1fr, ink) / Scan (2fr) on the counting screen. */
export function MSplit({ children }: { children: React.ReactNode }) {
  return <div style={{ ...NOT_DOCKED, display: "flex", flex: "0 0 64px", height: 64 }}>{children}</div>;
}
// `flex` is only meaningful inside an MSplit; on its own the bar is a fixed 64px like MBar.
export function MAction({ label, onClick, disabled, flex, tone = "accent", glyph, glyphAt = "left", small }: {
  label: string; onClick?: () => void; disabled?: boolean; flex?: number; tone?: "accent" | "grey" | "ink"; glyph?: "scan" | "plus" | "none";
  /** "right" puts the glyph at the far end, as the Scan half of the counting split. */
  glyphAt?: "left" | "right"; small?: string;
}) {
  const bg = disabled && tone !== "grey" ? OFF_GREY : tone === "accent" ? ACCENT : tone === "ink" ? INK : "var(--color-neutral-200)";
  const fg = tone === "grey" ? INK : WHITE;
  const g = glyph === "scan" ? <IconScan size={26} /> : glyph === "plus" ? <IconPlus /> : null;
  const right = glyphAt === "right";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="tcx-bar" style={{ flex: flex ?? `0 0 calc(64px + ${SAFE_BOTTOM})`, height: `calc(64px + ${SAFE_BOTTOM})`, background: bg, color: fg, border: 0, display: "flex", alignItems: "center", justifyContent: right || small ? "space-between" : glyph ? "flex-start" : "center", gap: 10, padding: `0 20px ${SAFE_BOTTOM}`, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled && tone === "grey" ? 0.45 : 1, fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 15, letterSpacing: "0.06em", textTransform: "uppercase" }}>
      {!right && g}
      <span>{label}</span>
      {small !== undefined && <small style={{ fontFamily: MONO, fontWeight: 500, fontSize: 13, letterSpacing: 0, textTransform: "none" }}>{small}</small>}
      {right && g}
    </button>
  );
}

// ---------- tab bar
export type MTab = "today" | "work" | "scan" | "stock" | "people";
const TAB_ROOTS: [MTab, string[]][] = [
  ["work", ["/m/work", "/m/request", "/m/receive", "/m/round"]],
  ["scan", ["/m/scan"]],
  ["stock", ["/m/stock", "/m/line", "/m/count", "/m/reorder", "/m/variance", "/m/catalogue"]],
  ["people", ["/m/people", "/m/person"]],
];
function tabOf(path: string): MTab | undefined {
  if (path === "/m" || path === "/m/") return "today";
  for (const [t, roots] of TAB_ROOTS) if (roots.some((r) => path === r || path.startsWith(r + "/"))) return t;
  return undefined;
}

/** The five-tab bar, drawn only on Today, Work, Scan, Stock and People. */
export function MTabs({ active, workBadge }: { active?: MTab; workBadge?: number }) {
  if (workBadge === undefined) return <MTabsCounted active={active} />;
  return <MTabsView active={active} workBadge={workBadge} />;
}
function MTabsCounted({ active }: { active?: MTab }) {
  const w = useWorkCount();
  return <MTabsView active={active} workBadge={w.total} />;
}
function MTabsView({ active, workBadge }: { active?: MTab; workBadge: number }) {
  const path = usePathname() || "";
  const on = active ?? tabOf(path);
  const tab = (t: MTab, href: string, label: string, icon: React.ReactNode, badge?: number) => {
    const cur = on === t;
    return (
      <Link key={t} href={href} aria-current={cur ? "page" : undefined} aria-label={badge ? `${label}, ${badge} open` : undefined}
        style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, fontSize: 12, fontWeight: 700, color: cur ? INK : MUTED, textDecoration: "none", minHeight: 66 }}>
        {cur && <span aria-hidden="true" style={{ position: "absolute", top: -2, left: "22%", right: "22%", height: 4, background: ACCENT }} />}
        {icon}
        <span>{label}</span>
        {!!badge && (
          <span aria-hidden="true" style={{ position: "absolute", top: 7, left: "calc(50% + 6px)", background: ACCENT, color: WHITE, fontFamily: MONO, fontSize: 11, fontWeight: 800, minWidth: 18, height: 18, padding: "0 5px", display: "grid", placeItems: "center" }}>{badge}</span>
        )}
      </Link>
    );
  };
  return (
    <nav aria-label="Main" style={{ position: "relative", zIndex: 2, flex: "0 0 auto", height: "calc(66px + env(safe-area-inset-bottom, 0px))", paddingBottom: "env(safe-area-inset-bottom, 0px)", background: WHITE, borderTop: "2px solid " + INK, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", alignItems: "stretch" }}>
      {tab("today", "/m", "Today", <IconToday />)}
      {tab("work", "/m/work", "Work", <IconWork />, workBadge)}
      <Link href="/m/scan" aria-current={on === "scan" ? "page" : undefined}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, fontSize: 12, textDecoration: "none", color: WHITE, minHeight: 66 }}>
        <span style={{ width: 62, height: 62, background: ACCENT, display: "grid", placeItems: "center", marginTop: -22, border: "3px solid " + WHITE, boxShadow: "0 0 0 2px " + INK, boxSizing: "border-box" }}><IconScan size={30} /></span>
        <b style={{ color: INK, fontWeight: 800 }}>Scan</b>
      </Link>
      {tab("stock", "/m/stock", "Stock", <IconStock />)}
      {tab("people", "/m/people", "People", <IconPeople />)}
    </nav>
  );
}
/** @deprecated The old four-tab bar. Now the five-tab bar; removed at integration. */
export const MNav = MTabs;

// ---------- lists
/** Section heading: 12px/800 uppercase with a 2px rule, count or note at the right in mono. */
export function MSection({ label, right, flush }: { label: string; right?: React.ReactNode; /** No top margin (straight under an MHead). */ flush?: boolean }) {
  return (
    <div className="tcx-sec" style={{ ...(flush ? { marginTop: 0 } : null), display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, paddingBottom: 6, borderBottom: "2px solid var(--tcx-sec-rule, " + INK + ")", fontSize: 12, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: "inherit" }}>
      <span>{label}</span>
      {right !== undefined && <span style={{ color: "var(--tcx-sec-sub, " + MUTED + ")", fontFamily: MONO, fontWeight: 500, letterSpacing: 0, textTransform: "none" }}>{right}</span>}
    </div>
  );
}

/* Can a tap on a link to the marketing site actually get out of here? In a browser, yes. Inside the
 * Android shell only a browser plugin can do it, and asking the plugin registry is the only honest
 * way to find out. */
function browserPlugin(): { open?: (o: { url: string }) => Promise<unknown> } | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { Browser?: { open?: (o: { url: string }) => Promise<unknown> } } };
  }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.Browser ?? null;
}
type Opens = "tab" | "browser" | "inline";
function whereItOpens(): Opens {
  if (typeof window === "undefined") return "tab";
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return "tab";
  return browserPlugin()?.open ? "browser" : "inline";
}
function handedToTheBrowser(url: string): boolean {
  const browser = browserPlugin();
  if (!browser?.open) return false;
  browser.open({ url }).catch(() => { window.location.href = url; });
  return true;
}

export type Mark = "ink" | "accent" | "mute" | "ok" | "none";
const markColour = (m: Mark) => (m === "accent" ? ACCENT : m === "mute" ? DIVIDER : m === "ok" ? OK : INK);

function rowBody(bar: React.ReactNode, title: React.ReactNode, sub: React.ReactNode, right: React.ReactNode, note?: string, chev?: boolean) {
  return (
    <>
      {bar}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>{title}</span>
        {sub !== undefined && sub !== "" && sub !== null && <span style={{ display: "block", fontSize: 13, color: MUTED, marginTop: 1 }}>{sub}</span>}
        {note && <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-neutral-700)", marginTop: 4 }}>{note}</span>}
      </span>
      {right !== undefined && right !== null && <span style={{ flex: "0 0 auto", textAlign: "right", fontFamily: MONO, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>{right}</span>}
      {chev && <span aria-hidden="true" style={{ color: MUTED, fontSize: 18, flex: "0 0 auto" }}>›</span>}
    </>
  );
}
/** A list row (`dense`: 48px, for short check lists). `mark` is the 4px status stripe at the left; `active` is the selected row (white,
 *  accent edge); `attention` lifts the row to white; `chev` says it opens something. */
export function MRow({ title, sub, right, mark = "none", attention, active, chev, onClick, href, external, disabled, dense }: {
  title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; mark?: Mark; attention?: boolean; active?: boolean; chev?: boolean; dense?: boolean;
  onClick?: () => void; href?: string; external?: boolean; disabled?: boolean;
}) {
  const bar = mark === "none" ? null : (
    <span aria-hidden="true" style={{ width: 4, alignSelf: "stretch", minHeight: 34, flex: "0 0 4px", background: markColour(mark), visibility: active ? "hidden" : undefined }} />
  );
  const body = rowBody(bar, title, sub, right, undefined, chev);
  const st: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: dense ? 48 : 62, padding: dense ? "6px 0" : "9px 0",
    background: active || attention ? WHITE : "none", boxShadow: active ? "inset 4px 0 0 " + ACCENT : undefined,
    border: "none", borderBottom: "1px solid " + DIVIDER,
    color: "inherit", textAlign: "left", textDecoration: "none", font: "inherit", cursor: onClick || href ? "pointer" : "default", opacity: disabled ? 0.5 : 1,
  };
  if (href && external && !disabled) return <MExternal href={href} st={st} bar={bar} title={title} sub={sub} right={right} />;
  if (href && !disabled) return <Link href={href} style={st}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active === undefined ? undefined : active} style={st}>{body}</button>;
  return <div style={st}>{body}</div>;
}

/* A row pointing at the marketing site (privacy, terms, deleting an account). In a browser a new
 * tab; in the shell, Chrome through the Browser plugin, or the page itself with a note on how to
 * come back when there is no plugin. Settled after mount. */
function MExternal({ href, st, bar, title, sub, right }: {
  href: string; st: React.CSSProperties; bar: React.ReactNode; title: React.ReactNode; sub: React.ReactNode; right: React.ReactNode;
}) {
  const [opens, setOpens] = useState<Opens>("tab");
  useEffect(() => { setOpens(whereItOpens()); }, []);
  if (opens === "inline") {
    return <a href={href} style={st}>{rowBody(bar, title, sub, right, "Opens here in ThreadCount — the back button brings you back")}</a>;
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={st}
      onClick={(e) => { if (handedToTheBrowser(href)) e.preventDefault(); }}>
      {rowBody(bar, title, sub, right, opens === "browser" ? "Opens in your browser" : "Opens in a new tab")}
    </a>
  );
}

/** A link to the marketing site inside a sentence, with the same three behaviours as the row above. */
export function MExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  const [opens, setOpens] = useState<Opens>("tab");
  useEffect(() => { setOpens(whereItOpens()); }, []);
  const st: React.CSSProperties = { color: "inherit", fontWeight: 800, textDecoration: "underline", textUnderlineOffset: 3 };
  if (opens === "inline") return <a href={href} style={st}>{children}</a>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={st}
      onClick={(e) => { if (handedToTheBrowser(href)) e.preventDefault(); }}>
      {children}
    </a>
  );
}

/** The ink panel (old screens). */
export function MPanel({ kicker, kickerRight, children, pad = 16 }: { kicker?: string; kickerRight?: React.ReactNode; children: React.ReactNode; pad?: number }) {
  return (
    <section style={{ background: INK, color: GROUND, padding: pad }}>
      {(kicker || kickerRight) && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: OFF_GREY }}>{kicker}</span>
          {kickerRight}
        </div>
      )}
      {children}
    </section>
  );
}

/** A link inside an ink panel (old screens). */
export function MInkLink({ label, onClick, href }: { label: string; onClick?: () => void; href?: string }) {
  const st: React.CSSProperties = { background: "none", border: 0, padding: 0, color: "#fff", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", borderBottom: "2px solid " + ACCENT, paddingBottom: 2, cursor: "pointer", textDecoration: "none" };
  return href ? <Link href={href} style={st}>{label}</Link> : <button type="button" onClick={onClick} style={st}>{label}</button>;
}

/** Counted / expected / delta (old counting screen). */
export function MFigures({ counted, expected, unit = "COUNTED" }: { counted: number; expected: number; unit?: string }) {
  const d = counted - expected;
  return <MFigRow figs={[{ label: unit, n: counted }, { label: "Expected", n: expected }, { label: "Gap", n: d === 0 ? 0 : d > 0 ? `+${d}` : `−${-d}`, tone: d === 0 ? "ok" : "accent" }]} />;
}

// ---------- odds and ends
/** Nothing to show: a bold line and at most one short line under it. */
export function MEmpty({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div style={{ padding: "28px 0", textAlign: "left" }}>
      <div style={{ fontSize: 17, fontWeight: 700 }}>{title}</div>
      {sub && <div style={{ fontSize: 14, color: MUTED, marginTop: 2 }}>{sub}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function MNote({ children, tone = "ink" }: { children: React.ReactNode; tone?: "ink" | "warn" }) {
  return (
    <div style={{ margin: 16, padding: 16, background: tone === "ink" ? INK : "#fff", color: tone === "ink" ? GROUND : INK, borderLeft: tone === "warn" ? "4px solid " + ACCENT : undefined, fontSize: 13.5, lineHeight: 1.6 }}>
      {children}
    </div>
  );
}

/** Something went wrong, said plainly, full-bleed under the rule. */
export function MError({ msg, onDismiss }: { msg: string; onDismiss?: () => void }) {
  if (!msg) return null;
  return (
    <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", background: ACCENT, color: "#fff", fontSize: 14, lineHeight: 1.45, fontWeight: 700 }}>
      <span style={{ flex: 1 }}>{msg}</span>
      {onDismiss && <button type="button" onClick={onDismiss} aria-label="Dismiss" style={{ width: 44, height: 44, margin: "-12px -12px -12px 0", border: 0, background: "none", color: "#fff", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "0 0 44px" }}><IconX size={18} /></button>}
    </div>
  );
}

const chipStyle = (on: boolean, off: boolean, warn = false): React.CSSProperties => ({
  minHeight: 44, minWidth: 48, padding: "0 12px", border: "2px solid " + (off ? DIVIDER : on && warn ? ACCENT : INK),
  background: on ? (warn ? ACCENT : INK) : "transparent", color: off ? OFF_GREY : on ? (warn ? WHITE : GROUND) : INK,
  fontFamily: "inherit", fontSize: 14, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  cursor: off ? "not-allowed" : "pointer", borderRadius: 0,
});
const chipSmall = (on: boolean): React.CSSProperties => ({ fontFamily: MONO, fontSize: 11, fontWeight: 500, color: on ? OFF_GREY : MUTED });

/** Size chips; the selected one inverts. `counts` adds how many are on the shelf. */
export function MChips({ sizes, value, onPick, disabled, counts }: { sizes: string[]; value: number; onPick: (i: number) => void; disabled?: (i: number) => boolean; counts?: number[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      {sizes.map((sz, i) => {
        const off = !!disabled?.(i);
        const on = i === value;
        const n = counts?.[i];
        return (
          <button type="button" key={i} onClick={() => onPick(i)} disabled={off} aria-pressed={on} aria-label={n === undefined ? undefined : `${sz}, ${n} on the shelf`} style={chipStyle(on, off)}>
            {sz}{n !== undefined && <small style={chipSmall(on)}>{n}</small>}
          </button>
        );
      })}
    </div>
  );
}

/** Chips with optional small counts. `tone="warn"` turns the chosen chip accent (reasons). */
export function MChipRow<V extends string>({ options, value, onPick, tone = "ink", label, disabled, grid }: {
  options: { value: V; label: string; n?: number }[]; value: V | null; onPick: (v: V) => void;
  tone?: "ink" | "warn"; label: string; disabled?: (v: V) => boolean;
  /** Equal columns instead of wrapping (the four condition chips). */
  grid?: number;
}) {
  return (
    <div role="group" aria-label={label} style={grid ? { display: "grid", gridTemplateColumns: `repeat(${grid}, 1fr)`, gap: 6, marginTop: 8 } : { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      {options.map((o) => {
        const on = value === o.value;
        const off = !!disabled?.(o.value);
        return (
          <button type="button" key={o.value} onClick={() => onPick(o.value)} disabled={off} aria-pressed={on}
            aria-label={o.n === undefined ? undefined : `${o.label}, ${o.n} on the shelf`}
            style={{ ...chipStyle(on, off, tone === "warn"), ...(grid ? { minWidth: 0, padding: "0 4px", fontSize: 13 } : null) }}>
            {o.label}{o.n !== undefined && <small style={chipSmall(on)}>{o.n}</small>}
          </button>
        );
      })}
    </div>
  );
}

/** The fixed reasons for a flagged line or a count gap. Tapping the chosen chip clears it. */
export function MReasonChips({ reasons, value, onPick, label }: { reasons: readonly string[]; value: string | null; onPick: (r: string | null) => void; label: string }) {
  return (
    <MChipRow tone="warn" label={label} value={value} options={reasons.map((r) => ({ value: r, label: r }))}
      onPick={(r) => onPick(r === value ? null : r)} />
  );
}

/** − n + with 44px buttons. `label` names what is counted for screen readers. */
export function MStepper({ n, onChange, min = 0, max = 999, label = "" }: { n: number; onChange: (v: number) => void; min?: number; max?: number; label?: string }) {
  const b = (off: boolean): React.CSSProperties => ({ width: 44, height: 44, border: "2px solid " + INK, background: "transparent", color: INK, fontSize: 20, fontWeight: 700, lineHeight: 1, cursor: off ? "not-allowed" : "pointer", opacity: off ? 0.35 : 1, padding: 0, fontFamily: "inherit" });
  const what = label ? ` ${label}` : "";
  return (
    <div style={{ display: "flex", alignItems: "stretch", height: 44, flex: "none" }}>
      <button type="button" style={b(n <= min)} onClick={() => onChange(Math.max(min, n - 1))} disabled={n <= min} aria-label={`One fewer${what}`}>−</button>
      <b aria-live="polite" aria-label={label ? `${n} ${label}` : undefined} style={{ minWidth: 44, background: INK, color: GROUND, display: "grid", placeItems: "center", fontFamily: MONO, fontSize: 16, padding: "0 6px" }}>{n}</b>
      <button type="button" style={b(n >= max)} onClick={() => onChange(Math.min(max, n + 1))} disabled={n >= max} aria-label={`One more${what}`}>+</button>
    </div>
  );
}

export function MField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", padding: "12px 0" }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: MUTED, marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  );
}

/** 52px field, 2px ink border, white. Add `paddingLeft: 44` when an icon sits in it. */
export const inputStyle: React.CSSProperties = {
  width: "100%", minHeight: 52, padding: "0 14px", border: "2px solid " + INK, background: "#fff", color: INK,
  fontSize: 16, fontFamily: "inherit", borderRadius: 0, boxSizing: "border-box", // 16px keeps Android from zooming on focus
};

/** Numerals that line up in a column (old screens). */
export function MNum({ a, b: bb, tone }: { a: number | string; b?: number | string; tone?: "accent" | "mute" }) {
  return (
    <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 15, fontVariantNumeric: "tabular-nums", color: tone === "accent" ? AC7 : tone === "mute" ? "var(--color-neutral-500)" : INK }}>
      {a}{bb !== undefined && <span style={{ color: "var(--color-neutral-700)" }}>/{bb}</span>}
    </span>
  );
}

// ---------- redesign components
/** Kicker line: 12px/800 uppercase, muted. */
export function MKick({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <div style={mono
      ? { fontFamily: MONO, fontSize: 12, fontWeight: 500, color: MUTED }
      : { fontSize: 12, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--tcx-kick, " + MUTED + ")" }}>
      {children}
    </div>
  );
}

/** The ink person header. Bleeds to the body edges (use inside MBody pad). */
export function MHead({ name, meta, children }: { name: string; meta: string; children?: React.ReactNode }) {
  return (
    <section style={{ background: INK, color: GROUND, margin: "-16px -16px 14px", padding: "14px 16px 16px" }}>
      <h2 style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.01em", lineHeight: 1.1, margin: 0 }}>{name}</h2>
      {meta && <div style={{ fontSize: 13, color: "#d6d3d2", marginTop: 3 }}>{meta}</div>}
      {children}
    </section>
  );
}

/** Held-against-the-cap meters: held in ground, what is being added in accent after it. */
export function MMeterPair({ items }: { items: { label: string; held: number; adding: number; cap: number }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
      {items.map((m) => {
        const total = m.held + m.adding;
        const cap = Math.max(1, m.cap);
        const heldPct = Math.min(100, (m.held / cap) * 100);
        const addPct = Math.max(0, Math.min(100 - heldPct, (m.adding / cap) * 100));
        return (
          <div key={m.label} role="meter" aria-valuenow={total} aria-valuemin={0} aria-valuemax={m.cap} aria-label={`${m.label} ${total} of ${m.cap}`}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#d6d3d2" }}>
              <span>{m.label}</span>
              <b style={{ fontFamily: MONO, fontSize: 14, letterSpacing: 0, color: total > m.cap ? AC3 : GROUND }}>{total}/{m.cap}</b>
            </div>
            <div style={{ height: 8, background: DARK_RULE, marginTop: 5, position: "relative", overflow: "hidden" }}>
              <i style={{ position: "absolute", inset: "0 auto 0 0", width: `${heldPct}%`, background: GROUND }} />
              <em style={{ position: "absolute", top: 0, bottom: 0, left: `${heldPct}%`, width: `${addPct}%`, background: ACCENT }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** One line under the meters ("Manager approval · 1 set left"). */
export function MHeadRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, borderTop: "1px solid " + DARK_RULE, paddingTop: 10, color: "#d6d3d2" }}>
      <span>{label}</span>
      <b style={{ color: GROUND, fontFamily: MONO }}>{value}</b>
    </div>
  );
}

/** Segmented control. */
export function MSeg<K extends string>({ value, options, onPick, label }: { value: K; options: { key: K; label: string; n?: number }[]; onPick: (k: K) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} style={{ display: "flex", border: "2px solid " + INK, marginBottom: 6 }}>
      {options.map((o, i) => {
        const on = o.key === value;
        return (
          <button type="button" key={o.key} role="tab" aria-selected={on} onClick={() => onPick(o.key)}
            style={{ flex: 1, minHeight: 44, border: 0, borderRight: i === options.length - 1 ? 0 : "2px solid " + INK, background: on ? INK : "transparent", color: on ? GROUND : INK, fontFamily: "inherit", fontSize: 13, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase", padding: "0 4px", whiteSpace: "nowrap", cursor: "pointer" }}>
            {o.label}{o.n !== undefined && <span style={{ fontFamily: MONO, fontWeight: 500, marginLeft: 4 }}>{o.n}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A garment in their kit: size button, on-shelf count, and a big plus. The size chips go in children. */
export function MKitCard({ title, size, onShelf, onSize, sizeOpen, onAdd, addDisabled, addLabel, children }: {
  title: string; size: string | null; onShelf: number | null; onSize: () => void; sizeOpen: boolean;
  onAdd: () => void; addDisabled: boolean; addLabel: string; children?: React.ReactNode;
}) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, border: "2px solid " + INK, background: WHITE, padding: "10px 10px 10px 14px", marginTop: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontWeight: 800 }}>{title}</span>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4, fontSize: 13, color: MUTED, flexWrap: "wrap" }}>
            <button type="button" onClick={onSize} aria-expanded={sizeOpen}
              style={{ border: 0, background: "var(--color-surface, #eae9e9)", color: INK, fontFamily: "inherit", fontWeight: 800, fontSize: 13, minHeight: 44, padding: "0 10px", display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
              {size === null ? "Pick a size" : `Size ${size}`}<span aria-hidden="true">▾</span>
            </button>
            {onShelf !== null && <span style={{ fontFamily: MONO }}>{onShelf} on shelf</span>}
          </div>
        </div>
        <button type="button" onClick={onAdd} disabled={addDisabled} aria-label={addLabel}
          style={{ width: 56, height: 56, border: 0, background: addDisabled ? DIVIDER : INK, color: GROUND, fontSize: 30, fontWeight: 600, lineHeight: 1, flex: "none", cursor: addDisabled ? "not-allowed" : "pointer", fontFamily: "inherit" }}>+</button>
      </div>
      {sizeOpen && children && <div style={{ border: "2px solid " + INK, borderTop: 0, padding: "4px 12px 12px", background: WHITE }}>{children}</div>}
    </>
  );
}

/** A basket line. `flag` draws the accent stripe and says why the line needs a reason. */
export function MLine({ title, size, flag, right, children }: { title: string; size?: string; flag?: string; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div style={{ borderBottom: "1px solid " + DIVIDER, padding: "10px 0", ...(flag ? { background: `linear-gradient(90deg, ${ACCENT} 0 4px, transparent 4px)`, paddingLeft: 12 } : null) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontWeight: 700 }}>{title}</b>{size !== undefined && <> <span style={{ fontFamily: MONO }}>{size}</span></>}
          {flag && <div style={{ fontSize: 13, fontWeight: 800, color: AC7, marginTop: 2 }}>{flag}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

/** Bottom sheet. Backdrop tap and Escape close it; focus moves in and returns on close. */
export function MSheet({ open, onClose, labelId, children, bar }: { open: boolean; onClose: () => void; labelId: string; children: React.ReactNode; bar?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); back?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="tcx-scanui" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(32,30,29,.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelId} tabIndex={-1} onClick={(e) => e.stopPropagation()}
        style={{ ...NOT_DOCKED, background: GROUND, color: INK, width: "100%", maxWidth: 560, borderTop: "4px solid " + ACCENT, padding: "16px 16px 0", outline: "none" }}>
        {children}
        {bar && <div style={{ margin: "16px -16px 0", paddingBottom: "env(safe-area-inset-bottom, 0px)", background: GROUND }}>{bar}</div>}
      </div>
    </div>
  );
}

/** Finish screen head. The top bar "Done" is the h1; this is an h2. */
export function MDone({ head, sub, children }: { head: string; sub: string; children?: React.ReactNode }) {
  return (
    <div>
      <div aria-hidden="true" style={{ width: 84, height: 84, background: ACCENT, display: "grid", placeItems: "center", margin: "18px 0 16px" }}><TickMark /></div>
      <h2 style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.05, letterSpacing: "-0.015em", margin: 0 }}>{head}</h2>
      <div style={{ color: MUTED, marginTop: 6 }}>{sub}</div>
      {children}
    </div>
  );
}

/** "Shelf now" on a Done screen: what is left of each variant that moved. */
export function MShelfNow({ lines }: { lines: { key: string; name: string; onHand: number; par: number; onOrder: string }[] }) {
  if (!lines.length) return null;
  return (
    <>
      <MSection label="Shelf now" />
      {lines.map((l) => (
        <MRow key={l.key} mark={l.onHand < l.par ? "accent" : "ok"} title={l.name}
          sub={l.onHand < l.par ? `${l.par - l.onHand} below par${l.onOrder ? ` · ${l.onOrder}` : ""}` : "At par"}
          right={`${l.onHand}/${l.par}`} />
      ))}
    </>
  );
}

/** Three figures in a white box (Today's "Your day"). */
export function MDay({ figs }: { figs: { n: number | string; label: string }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, figs.length)}, 1fr)`, border: "2px solid " + INK, background: WHITE, marginTop: 8 }}>
      {figs.map((f, i) => (
        <div key={f.label} style={{ padding: "10px 12px", borderRight: i === figs.length - 1 ? 0 : "1px solid " + DIVIDER }}>
          <b style={{ display: "block", fontSize: 30, fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{f.n}</b>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED }}>{f.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Counted / Expected / Gap on the ink counting panel. */
export function MFigRow({ figs }: { figs: { label: string; n: number | string; tone?: "accent" | "ok" }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, figs.length)}, 1fr)`, marginTop: 12, borderTop: "1px solid " + DARK_RULE, paddingTop: 10 }}>
      {figs.map((f) => (
        <div key={f.label} style={{ display: "grid" }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: OFF_GREY }}>{f.label}</span>
          <b style={{ fontSize: 34, fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1.1, color: f.tone === "accent" ? AC3 : f.tone === "ok" ? "#9fd8b8" : undefined }}>{f.n}</b>
        </div>
      ))}
    </div>
  );
}

/** A to-do row on Today: the number block, what to do, and where it goes. */
export function MTodo({ n, accent, title, sub, href }: { n: string | number; accent?: boolean; title: string; sub: string; href: string }) {
  return (
    <Link href={href} style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", minHeight: 68, borderBottom: "1px solid " + DIVIDER, padding: "10px 0", textDecoration: "none", color: "inherit" }}>
      <span style={{ minWidth: 52, height: 52, padding: "0 6px", display: "grid", placeItems: "center", fontFamily: MONO, fontSize: 22, fontWeight: 600, background: accent ? ACCENT : INK, color: accent ? WHITE : GROUND, flex: "none", boxSizing: "border-box" }}>{n}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 800 }}>{title}</span>
        {sub && <span style={{ display: "block", fontSize: 13, color: MUTED }}>{sub}</span>}
      </span>
      <span aria-hidden="true" style={{ color: MUTED, fontSize: 18 }}>›</span>
    </Link>
  );
}

/** A small status label. */
export function MPill({ tone = "ink", children, mono }: { tone?: "ink" | "accent" | "ok" | "mute"; children: React.ReactNode; mono?: boolean }) {
  const [bg, fg] = tone === "accent" ? [ACCENT, WHITE] : tone === "ok" ? [OK, WHITE] : tone === "mute" ? [DIVIDER, INK] : [INK, GROUND];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", minHeight: 26, padding: "0 8px", fontSize: 12, fontWeight: 800, letterSpacing: mono ? 0 : "0.05em", textTransform: mono ? "none" : "uppercase", fontFamily: mono ? MONO : "var(--font-body)", background: bg, color: fg, whiteSpace: "nowrap" }}>{children}</span>
  );
}

/** A setting you switch on or off. `dark` is the Hands-free switch on the ink counting panel. */
export function MSwitchRow({ title, sub, on, onToggle, disabled, tone = "ink", dark }: { title: string; sub?: string; on: boolean; onToggle: () => void; disabled?: boolean; tone?: "ink" | "accent"; dark?: boolean }) {
  const onBg = tone === "accent" || dark ? ACCENT : INK;
  const tog = (
    <span aria-hidden="true" style={{ width: 52, height: 30, background: on ? onBg : dark ? DARK_EDGE : DIVIDER, position: "relative", flex: "none" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 25 : 3, width: 24, height: 24, background: WHITE, transition: "left .15s" }} />
    </span>
  );
  const st: React.CSSProperties = dark
    ? { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12, border: 0, background: "#2d2b2b", width: "100%", minHeight: 48, padding: "0 12px", color: GROUND, fontFamily: "inherit", fontWeight: 800, fontSize: 13, letterSpacing: "0.05em", textTransform: "uppercase", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, textAlign: "left" }
    : { display: "flex", alignItems: "center", gap: 12, minHeight: 60, border: 0, borderBottom: "1px solid " + DIVIDER, width: "100%", background: "none", padding: 0, color: "inherit", fontFamily: "inherit", fontSize: 15, textAlign: "left", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 };
  return (
    <button type="button" role="switch" aria-checked={on} onClick={disabled ? undefined : onToggle} aria-disabled={disabled || undefined} style={st}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: dark ? 800 : 700 }}>{title}</span>
        {sub && <span style={{ display: "block", fontSize: 13, color: MUTED, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>{sub}</span>}
      </span>
      {tog}
    </button>
  );
}

/** A pick-list row: the tick box is the button. */
export function MPickRow({ done, onToggle, title, sub, right, children, tickLabel }: { done: boolean; onToggle: () => void; title: string; sub?: string; right?: React.ReactNode; children?: React.ReactNode; tickLabel?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 64, borderBottom: "1px solid " + DIVIDER, width: "100%", padding: "8px 0" }}>
      <button type="button" onClick={onToggle} aria-pressed={done} aria-label={tickLabel || `Picked ${title}`}
        style={{ padding: 7, margin: -7, border: 0, background: "none", cursor: "pointer", flex: "none" }}>
        <span style={{ width: 30, height: 30, border: "2px solid " + INK, display: "grid", placeItems: "center", background: done ? INK : WHITE, color: GROUND, boxSizing: "border-box" }}>
          {done && <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" /></svg>}
        </span>
      </button>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 700 }}>{title}</span>
        {sub && <span style={{ display: "block", fontSize: 13, color: MUTED }}>{sub}</span>}
      </span>
      {right !== undefined && <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>{right}</span>}
      {children}
    </div>
  );
}

/** A card with a strip of three action chips (Pickups). */
export function MCard({ title, sub, pill, actions }: { title: string; sub: string; pill?: React.ReactNode; actions: React.ReactNode }) {
  return (
    <div style={{ border: "2px solid " + INK, background: WHITE, padding: "12px 14px", marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800 }}>{title}</div>
          {sub && <div style={{ fontSize: 13, color: MUTED }}>{sub}</div>}
        </div>
        {pill}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 10 }}>{actions}</div>
    </div>
  );
}
/** A chip for MCard's action strip (a button, or a link such as tel:). */
export function MCardChip({ label, onClick, href, on, disabled }: { label: string; onClick?: () => void; href?: string; on?: boolean; disabled?: boolean }) {
  const st: React.CSSProperties = { ...chipStyle(!!on, !!disabled), minWidth: 0, fontSize: 13, padding: "0 6px", textDecoration: "none" };
  if (href && !disabled) return <a href={href} style={st}>{label}</a>;
  return <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on === undefined ? undefined : on} style={st}>{label}</button>;
}

/** Big button: 52px (44 when small), 2px ink, optional icon at the left. */
export function MButton({ label, onClick, href, icon, tone = "line", disabled, small }: { label: string; onClick?: () => void; href?: string; icon?: "scan" | "print" | "plus"; tone?: "line" | "ink"; disabled?: boolean; small?: boolean }) {
  const ink = tone === "ink";
  const st: React.CSSProperties = {
    minHeight: small ? 44 : 52, width: "100%", border: "2px solid " + (disabled ? DIVIDER : INK), background: ink ? (disabled ? DIVIDER : INK) : "transparent",
    color: disabled ? OFF_GREY : ink ? GROUND : INK, fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "0 14px", cursor: disabled ? "not-allowed" : "pointer", textDecoration: "none", boxSizing: "border-box", marginTop: 10,
  };
  const g = icon === "scan" ? <IconScan /> : icon === "print" ? <IconPrinter /> : icon === "plus" ? <IconPlus /> : null;
  if (href && !disabled) return <Link href={href} style={st}>{g}{label}</Link>;
  return <button type="button" onClick={onClick} disabled={disabled} style={st}>{g}{label}</button>;
}

/** Search field: leading icon, trailing accent scan button. Never focuses itself on load. */
export function MSearch({ value, onChange, placeholder, label, scanHref, onScan, scanLabel = "Scan a badge" }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; scanHref?: string; onScan?: () => void; scanLabel?: string }) {
  const id = useId();
  const scanSt: React.CSSProperties = { position: "absolute", right: 4, top: 4, width: 44, height: 44, background: ACCENT, border: 0, display: "grid", placeItems: "center", color: WHITE, cursor: "pointer" };
  return (
    <div style={{ position: "relative" }}>
      <label htmlFor={id} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{label}</label>
      <span aria-hidden="true" style={{ position: "absolute", left: 12, top: 15, color: MUTED, display: "flex" }}><IconSearch /></span>
      <input id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off"
        style={{ ...inputStyle, paddingLeft: 44, paddingRight: scanHref || onScan ? 56 : 14 }} />
      {scanHref ? <Link href={scanHref} aria-label={scanLabel} style={scanSt}><IconScan /></Link>
        : onScan ? <button type="button" onClick={onScan} aria-label={scanLabel === "Scan a badge" ? "Scan" : scanLabel} style={scanSt}><IconScan /></button> : null}
    </div>
  );
}

/** Signature box. The canvas is sized to its CSS box at the device pixel ratio. */
export function MSignature({ name, onReady, onChange }: { name: string; onReady: (api: { clear: () => void; dataUrl: () => string | null }) => void; onChange: (signed: boolean) => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const dirty = useRef(false);
  const change = useRef(onChange); change.current = onChange;
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    const r = el.getBoundingClientRect();
    el.width = Math.max(1, Math.round(r.width * dpr));
    el.height = Math.max(1, Math.round(r.height * dpr));
    const ctx = el.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#201e1d";
    let draw = false;
    const pos = (ev: PointerEvent) => { const b = el.getBoundingClientRect(); return [ev.clientX - b.left, ev.clientY - b.top] as const; };
    const down = (ev: PointerEvent) => {
      ev.preventDefault(); draw = true; el.setPointerCapture(ev.pointerId);
      const [x, y] = pos(ev); ctx.beginPath(); ctx.moveTo(x, y);
      if (!dirty.current) { dirty.current = true; change.current(true); }
    };
    const move = (ev: PointerEvent) => { if (!draw) return; const [x, y] = pos(ev); ctx.lineTo(x, y); ctx.stroke(); };
    const up = () => { draw = false; };
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    onReady({
      clear: () => { ctx.clearRect(0, 0, el.width, el.height); if (dirty.current) { dirty.current = false; change.current(false); } },
      dataUrl: () => (dirty.current ? el.toDataURL("image/png") : null),
    });
    return () => { el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div style={{ position: "relative", border: "2px solid " + INK, background: WHITE, height: 150, marginTop: 8, touchAction: "none" }}>
      <canvas ref={ref} role="img" aria-label={`Signature box for ${name}`} style={{ display: "block", width: "100%", height: "100%", touchAction: "none" }} />
      <div aria-hidden="true" style={{ position: "absolute", left: 14, right: 14, bottom: 12, borderTop: "1px solid " + DIVIDER, paddingTop: 6, fontSize: 12, color: MUTED, pointerEvents: "none", display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>{name}</span><span>Sign above the line</span>
      </div>
    </div>
  );
}
