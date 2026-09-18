"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { daysBetween, facilityDate, formatInZone } from "@/lib/compute";
import { PortalCountsContext, portalCounts, type ServerCounts } from "@/lib/portalcounts";
import { resolveScan } from "@/lib/search";
import DemoBanner from "@/components/DemoBanner";
import CommandBar from "@/components/CommandBar";
import { Icon, Kbd, type IconName } from "@/components/portal";
import { LiveRegion } from "@/components/ui";

/* Seven screens. Each is active on its own whole path segments and on the older screens folded
   into it, so /app/stocktake lights Stock and /app/requests lights People. */
type Screen = { key: string; href: string; label: string; icon: IconName; on: string[] };
const SCREENS: Screen[] = [
  { key: "today", href: "/app", label: "Today", icon: "today", on: ["/app/rounds"] },
  { key: "counter", href: "/app/counter", label: "Counter", icon: "counter", on: ["/app/issue"] },
  { key: "stock", href: "/app/stock", label: "Stock", icon: "stock", on: ["/app/stocktake"] },
  { key: "orders", href: "/app/orders", label: "Orders", icon: "orders", on: [] },
  { key: "people", href: "/app/staff", label: "People", icon: "people", on: ["/app/requests"] },
  { key: "reports", href: "/app/report", label: "Reports", icon: "reports", on: [] },
  { key: "settings", href: "/app/settings", label: "Settings", icon: "settings", on: ["/app/activity"] },
];

type Badge = { text: string; tone: "accent" | "quiet"; sr: string };
type CmdState = { open: boolean; query: string; camera: boolean; unknown?: string };

const RAIL_OUT = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false">
    <path d="M10 4H4v16h6M13 12h8M18 9l3 3-3 3" />
  </svg>
);
const RAIL_ME = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false">
    <circle cx="12" cy="8" r="4" /><path d="M4 21c1-4.5 4-7 8-7s7 2.5 8 7" />
  </svg>
);

const isEditable = (el: Element | null) =>
  !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLElement && el.isContentEditable));
const dialogOpen = () => !!document.querySelector('[aria-modal="true"]');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function Shell({ children, serverCounts }: { children: React.ReactNode; serverCounts: ServerCounts }) {
  const { s, isAdmin } = useSnap();
  const d = useDerived();
  const path = usePathname() || "/app";
  const router = useRouter();
  const counts = useMemo(() => portalCounts(s, d, serverCounts, isAdmin), [s, d, serverCounts, isAdmin]);
  const inSeg = (h: string) => path === h || path.startsWith(h + "/");
  const screenOn = (sc: Screen) => (sc.href === "/app" ? path === "/app" : inSeg(sc.href)) || sc.on.some(inSeg);

  const backupStale = (() => {
    const last = s.settings.lastBackup ? facilityDate(s.settings.lastBackup, s.tz) : "";
    return !last || daysBetween(last, s.today) > 7;
  })();

  const badges: Record<string, Badge | null> = {
    today: counts.today.total > 0
      ? { text: String(counts.today.total), tone: counts.today.overdue > 0 ? "accent" : "quiet", sr: `, ${plural(counts.today.total, "thing needs", "things need")} a person${counts.today.overdue > 0 ? `, ${counts.today.overdue} overdue` : ""}` }
      : null,
    counter: null,
    stock: counts.stock.garmentsAtReorder > 0 ? { text: String(counts.stock.garmentsAtReorder), tone: "quiet", sr: `, ${plural(counts.stock.garmentsAtReorder, "garment", "garments")} at reorder` } : null,
    orders: counts.orders.overdue > 0
      ? { text: String(counts.orders.overdue), tone: "accent", sr: `, ${plural(counts.orders.overdue, "order", "orders")} overdue` }
      : isAdmin && counts.orders.toOrderLines > 0 ? { text: String(counts.orders.toOrderLines), tone: "quiet", sr: `, ${plural(counts.orders.toOrderLines, "line", "lines")} to order` } : null,
    people: counts.people.attention > 0
      ? { text: String(counts.people.attention), tone: counts.people.stranded > 0 ? "accent" : "quiet", sr: `, ${plural(counts.people.attention, "item needs", "items need")} attention${counts.people.stranded > 0 ? `, ${plural(counts.people.stranded, "request has", "requests have")} no approver` : ""}` }
      : null,
    reports: null,
    settings: isAdmin && backupStale ? { text: "!", tone: "quiet", sr: ", backup overdue" } : null,
  };

  /* Collapsing the rail is a habit of the machine, not the account, so it lives in localStorage,
     read after mount so the server's HTML and the first paint agree. */
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    try { setNarrow(localStorage.getItem("tc.rail") === "narrow"); } catch { /* storage is off: the rail starts open */ }
  }, []);
  function toggleRail() {
    setNarrow((n) => {
      const next = !n;
      try { localStorage.setItem("tc.rail", next ? "narrow" : "wide"); } catch { /* nothing to remember it with */ }
      return next;
    });
  }

  const [more, setMore] = useState(false);
  useEffect(() => { setMore(false); }, [path]);

  const [cmd, setCmd] = useState<CmdState>({ open: false, query: "", camera: false });
  const openCmd = useCallback((over: Partial<CmdState> = {}) => setCmd({ open: true, query: "", camera: false, ...over }), []);
  const closeCmd = useCallback(() => setCmd({ open: false, query: "", camera: false }), []);

  const routeScan = useCallback((raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const t = resolveScan(s, code);
    if (t.kind === "staff") { router.push(`/app/counter?staff=${encodeURIComponent(t.staffId)}`); return; }
    if (t.kind === "garment") {
      const sp = new URLSearchParams(window.location.search);
      const here = window.location.pathname;
      const counterWithPerson = (here === "/app/counter" || here === "/app/issue") && !!sp.get("staff");
      const counting = (here === "/app/stock" && sp.get("tab") === "count") || here === "/app/stocktake";
      if (counterWithPerson || counting) window.dispatchEvent(new CustomEvent("tc-scan-garment", { detail: { itemId: t.itemId, si: t.si } }));
      else router.push(`/app/stock/${encodeURIComponent(t.itemId)}?size=${t.si}`);
      return;
    }
    openCmd({ query: code, unknown: code });
  }, [s, router, openCmd]);

  /* "/" and Ctrl/Cmd+K open the panel. A hardware scanner types fast and ends in Enter: printable
     keys no more than 35ms apart, at least four of them, outside any field and any dialog. The
     counter's and the count's own scan boxes handle scans typed into them. */
  const cmdOpen = cmd.open;
  const scanBuf = useRef<{ chars: string; last: number }>({ chars: "", last: 0 });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const buf = scanBuf.current;
      if (cmdOpen || isEditable(document.activeElement) || dialogOpen()) { buf.chars = ""; return; }
      const now = e.timeStamp || performance.now();
      if (e.key === "Enter") {
        const fast = buf.chars.length >= 4 && now - buf.last <= 35;
        const code = buf.chars;
        buf.chars = "";
        if (fast) { e.preventDefault(); e.stopPropagation(); routeScan(code); }
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        buf.chars = buf.chars && now - buf.last <= 35 ? buf.chars + e.key : e.key;
        buf.last = now;
        return;
      }
      if (e.key !== "Shift") buf.chars = "";
    };
    const onShortcut = (e: KeyboardEvent) => {
      if (cmdOpen || e.defaultPrevented) return;
      const slash = e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey;
      const k = (e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey) && !e.altKey;
      if (!slash && !k) return;
      if (isEditable(document.activeElement) || dialogOpen()) return;
      e.preventDefault();
      openCmd();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keydown", onShortcut);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("keydown", onShortcut); };
  }, [cmdOpen, routeScan, openCmd]);

  // The clock: display only, facility zone, after mount, every 30 seconds.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const clock = now
    ? formatInZone(now, s.tz, { weekday: "short", day: "numeric", month: "short", year: "numeric" }).replace(/,/g, "").replace("Sept", "Sep")
      + " · " + formatInZone(now, s.tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    : "";

  function fabScan() {
    setMore(false);
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (path === "/app/counter" || path === "/app/issue" || path === "/app/stocktake" || (path === "/app/stock" && tab === "count")) window.dispatchEvent(new CustomEvent("tc-scan"));
    else openCmd({ camera: true });
  }

  /* The session cookie is httpOnly, so only the server can end a session. If the request never lands,
     say so and leave the button to try again. */
  const [out, setOut] = useState<"" | "busy" | "err">("");
  async function signOut() {
    if (out === "busy") return;
    setOut("busy");
    const ok = await fetch("/api/auth/logout", { method: "POST" }).then((r) => r.ok).catch(() => false);
    if (!ok) { setOut("err"); return; }
    router.push("/auth"); router.refresh();
  }

  const mobMain: { href: string; label: string; on: boolean }[] = [
    { href: "/app", label: "Today", on: path === "/app" || inSeg("/app/rounds") },
    { href: "/app/counter", label: "Counter", on: inSeg("/app/counter") || inSeg("/app/issue") },
    { href: "/app/stock", label: "Stock", on: inSeg("/app/stock") || inSeg("/app/stocktake") },
  ];
  const mobMore: { href: string; label: string; badge: Badge | null; on: boolean }[] = [
    { href: "/app/orders", label: "Orders", badge: badges.orders, on: inSeg("/app/orders") },
    { href: "/app/staff", label: "People", badge: badges.people, on: inSeg("/app/staff") },
    { href: "/app/requests", label: "Requests", badge: counts.people.stranded > 0 ? { text: String(counts.people.stranded), tone: "accent", sr: `, ${plural(counts.people.stranded, "request has", "requests have")} no approver` } : null, on: inSeg("/app/requests") },
    { href: "/app/rounds", label: "Delivery rounds", badge: counts.today.groups.round > 0 ? { text: String(counts.today.groups.round), tone: "quiet", sr: `, ${plural(counts.today.groups.round, "bag", "bags")} for the round` } : null, on: inSeg("/app/rounds") },
    { href: "/app/report", label: "Reports", badge: null, on: inSeg("/app/report") },
    { href: "/app/settings", label: "Settings", badge: badges.settings, on: inSeg("/app/settings") || inSeg("/app/activity") },
    { href: "/app/help", label: "Help", badge: null, on: inSeg("/app/help") },
    { href: "/m", label: "Counter app", badge: null, on: false },
  ];
  const moreOn = !mobMain.some((m) => m.on);

  useEffect(() => {
    if (!more) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setMore(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [more]);

  const badgeEl = (b: Badge | null, cls: string) => b && (
    <>
      <span className={`${cls} ${b.tone}`} aria-hidden="true">{cls === "tc-rail-dot" ? null : b.text}</span>
    </>
  );

  return (
    <PortalCountsContext.Provider value={serverCounts}>
      <div className="tc-shell">
        <a className="skip-link" href="#content">Skip to content</a>
        <aside id="tc-side" className={narrow ? "tc-rail-narrow" : undefined}>
          <div className="tc-rail-head">
            <div className="tc-rail-brand">
              <span className="tc-rail-mark" aria-hidden="true" />
              <span className="tc-rail-word">ThreadCount</span>
              <button type="button" className="tc-rail-toggle" onClick={toggleRail} aria-expanded={!narrow} aria-controls="tc-rail-nav"
                aria-label={narrow ? "Expand the menu" : "Collapse the menu"} title={narrow ? "Expand the menu" : "Collapse the menu"}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false"
                  style={narrow ? { transform: "scaleX(-1)" } : undefined}>
                  <path d="M11 6l-6 6 6 6M19 6l-6 6 6 6" />
                </svg>
              </button>
            </div>
            <div className="tc-rail-facility" title={s.settings.facility}>{s.settings.facility}</div>
          </div>
          <nav id="tc-rail-nav" className="tc-rail-nav" aria-label="Screens">
            {SCREENS.map((sc) => {
              const on = screenOn(sc);
              const b = badges[sc.key];
              return (
                <Link key={sc.key} href={sc.href} className={"tc-rail-item" + (on ? " active" : "")} aria-current={on ? "page" : undefined}>
                  <span className="tc-rail-icon"><Icon name={sc.icon} />{badgeEl(b, "tc-rail-dot")}</span>
                  <span className="tc-rail-label">{sc.label}{b && <span className="sr-only">{b.sr}</span>}</span>
                  {badgeEl(b, "tc-rail-badge")}
                </Link>
              );
            })}
          </nav>
          <div className="tc-rail-foot">
            <div className="tc-rail-loc">{s.settings.location}</div>
            <div className="tc-rail-user">
              <Link href="/app/settings?tab=people" className="tc-rail-name" title="Edit your profile">{s.session.name}</Link>
              <span className="tc-rail-role">{s.session.role}</span>
              <button type="button" className="tc-rail-signout" onClick={signOut} disabled={out === "busy"}>{out === "busy" ? "Signing out…" : "Sign out"}</button>
            </div>
            <div className="tc-rail-foot-narrow">
              <Link href="/app/settings?tab=people" className="tc-rail-item" title="Edit your profile">
                <span className="tc-rail-icon">{RAIL_ME}</span>
                <span className="tc-rail-label">{s.session.name}</span>
              </Link>
              <button type="button" className="tc-rail-item" onClick={signOut} disabled={out === "busy"}>
                <span className="tc-rail-icon">{RAIL_OUT}</span>
                <span className="tc-rail-label">{out === "busy" ? "Signing out…" : "Sign out"}</span>
              </button>
            </div>
            <LiveRegion tone="alert" className="tc-rail-live" msg={out === "err" ? "Network error — you are still signed in." : ""} />
          </div>
        </aside>

        <div className="tc-column">
          <header className="tc-topbar no-print">
            <button type="button" id="tc-search-trigger" className="input tc-search-trigger" aria-haspopup="dialog" aria-keyshortcuts="/" onClick={() => openCmd()}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#57534f" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l5 5" /></svg>
              <span className="tc-search-ph">Search or scan: a person, a garment, an order</span>
              <Kbd>/</Kbd>
            </button>
            <button type="button" className="tc-topbar-icon" aria-haspopup="dialog" aria-label="Search or scan" onClick={() => openCmd()}>
              <Icon name="search" />
            </button>
            <div className="tc-scanner">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#57534f" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false"><path d="M3 8V4h4M17 4h4v4M21 16v4h-4M7 20H3v-4M7 8v8M10 8v8M13 8v8M16 8v8" /></svg>
              <span>Scanner ready · a badge opens the counter</span>
            </div>
            <div className="tc-clock tc-mono" suppressHydrationWarning>{clock}</div>
          </header>
          <main id="content" tabIndex={-1} className="tc-main"><DemoBanner />{children}</main>
        </div>

        <nav id="tc-mobilebar" aria-label="Screens">
          {mobMain.map((m) => (
            <Link key={m.href} href={m.href} className={"tc-mob-btn" + (m.on ? " on" : "")} aria-current={m.on ? "page" : undefined}>
              {m.label}
              {m.href === "/app" && badges.today && <span className={`tc-mob-badge ${badges.today.tone}`} aria-hidden="true">{badges.today.text}</span>}
              {m.href === "/app" && badges.today && <span className="sr-only">{badges.today.sr}</span>}
            </Link>
          ))}
          <button type="button" className={"tc-mob-btn" + (moreOn || more ? " on" : "")} onClick={() => setMore(!more)} aria-expanded={more} aria-controls="tc-more-sheet">More</button>
        </nav>
        <button type="button" id="tc-scanfab" onClick={fabScan} title="Scan a barcode" aria-label="Scan a barcode">SCAN</button>
        {more && (
          <div className="tc-more-sheet" onClick={() => setMore(false)}>
            <nav id="tc-more-sheet" className="tc-more-sheet-panel" aria-label="More screens" onClick={(e) => e.stopPropagation()}>
              {mobMore.map((m) => (
                <Link key={m.href} href={m.href} className={"tc-more-row" + (m.on ? " on" : "")} aria-current={m.on ? "page" : undefined} onClick={() => setMore(false)}>
                  <span>{m.label}{m.badge && <span className="sr-only">{m.badge.sr}</span>}</span>
                  {m.badge && <span className={`tc-mob-badge ${m.badge.tone}`} aria-hidden="true">{m.badge.text}</span>}
                </Link>
              ))}
              <div className="tc-more-me">
                <Link href="/app/settings?tab=people" className="tc-more-row" onClick={() => setMore(false)}>
                  <span>{s.session.name}</span>
                  <span className="tc-more-role">{s.session.role}</span>
                </Link>
                <button type="button" className="tc-more-row" onClick={signOut} disabled={out === "busy"}>{out === "busy" ? "Signing out…" : "Sign out"}</button>
                <LiveRegion tone="alert" msg={out === "err" ? "Network error — you are still signed in." : ""} />
              </div>
            </nav>
          </div>
        )}
        <CommandBar key={cmd.open ? `open-${cmd.query}-${cmd.camera}` : "closed"} open={cmd.open} onClose={closeCmd} initialQuery={cmd.query} camera={cmd.camera} onScan={routeScan} unknownCode={cmd.unknown} />
      </div>
    </PortalCountsContext.Provider>
  );
}
