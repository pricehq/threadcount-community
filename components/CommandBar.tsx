"use client";
/* The search-and-scan panel: people, their waiting bags, the requests they approve, garments and
 * orders, one keyboard list. Opened from the top bar, "/", Ctrl/Cmd+K, an unknown scan, or the
 * phone's SCAN button (camera mode). */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDerived, useSnap } from "@/lib/client";
import { addDays, facilityDate, formatInZone, isOverdue, label, type Snapshot } from "@/lib/compute";
import { resolveScan, searchPortal, type SearchHit, type SearchRequest } from "@/lib/search";
import { Icon, Kbd, Tag } from "@/components/portal";
import { LiveRegion } from "@/components/ui";
import { BindDialog } from "@/components/dialogs";
import Camera from "@/components/Camera";

/* The request queue, fetched when the panel first opens and reused for a minute. A failure leaves
   the Approves group out rather than showing an error in a search box. */
let requestCache: { at: number; rows: SearchRequest[] } | null = null;
async function loadRequests(): Promise<SearchRequest[] | null> {
  if (requestCache && Date.now() - requestCache.at < 60_000) return requestCache.rows;
  try {
    const r = await fetch("/api/requests");
    if (!r.ok) return null;
    const j = (await r.json()) as { requests?: SearchRequest[] };
    const rows = Array.isArray(j.requests) ? j.requests : [];
    requestCache = { at: Date.now(), rows };
    return rows;
  } catch {
    return null;
  }
}

type Row = { id: string; hit: SearchHit; primary: () => void; secondary?: () => void };
const GROUPS: { key: "person" | "waiting" | "approves" | "garment" | "order"; label: string }[] = [
  { key: "person", label: "Person" },
  { key: "waiting", label: "Waiting" },
  { key: "approves", label: "Approves" },
  { key: "garment", label: "Garments" },
  { key: "order", label: "Orders" },
];

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function whenLabel(s: Snapshot, iso: string | null): string {
  if (!iso) return "";
  const d = facilityDate(iso, s.tz);
  if (!d) return "";
  if (d === s.today) return "today";
  if (d === addDays(s.today, -1)) return "yesterday";
  return formatInZone(d, s.tz, { day: "numeric", month: "short" }).replace("Sept", "Sep");
}

export default function CommandBar({ open, onClose, initialQuery = "", camera = false, onScan, unknownCode }: {
  open: boolean;
  onClose: () => void;
  initialQuery?: string;
  camera?: boolean;
  /** Where a scan from the camera, or a scanned code typed into the box, is routed. Shell's routeScan. */
  onScan?: (code: string) => void;
  /** Set when the panel was opened by a scan nothing matched. */
  unknownCode?: string;
}) {
  if (!open) return null;
  if (camera) return <Camera message="Scan a staff badge or a garment barcode" onClose={onClose} onHit={(raw) => { onClose(); onScan?.(raw); }} />;
  return <Panel onClose={onClose} initialQuery={initialQuery} onScan={onScan} unknownCode={unknownCode} />;
}

function Panel({ onClose, initialQuery, onScan, unknownCode }: { onClose: () => void; initialQuery: string; onScan?: (code: string) => void; unknownCode?: string }) {
  const { s, isAdmin, mutate, busy } = useSnap();
  const d = useDerived();
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const [requests, setRequests] = useState<SearchRequest[] | undefined>(requestCache?.rows);
  const [msg, setMsg] = useState<{ tone: "status" | "alert"; text: string } | null>(null);
  const [binding, setBinding] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const opener = useRef<Element | null>(null);
  if (opener.current === null && typeof document !== "undefined") opener.current = document.activeElement;

  useEffect(() => {
    let live = true;
    loadRequests().then((rows) => { if (live && rows) setRequests(rows); });
    return () => { live = false; };
  }, []);

  // Modal: everything behind the panel leaves the tab order and the accessibility tree, as ui Dialog does.
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const opened = opener.current;
    const off: HTMLElement[] = [];
    for (let el: HTMLElement | null = node.parentElement; el && el !== document.body && el.parentElement; el = el.parentElement) {
      for (const sib of Array.from(el.parentElement.children)) {
        if (sib !== el && sib instanceof HTMLElement && !sib.inert) { sib.inert = true; off.push(sib); }
      }
    }
    input.current?.focus();
    input.current?.select();
    return () => {
      for (const el of off) el.inert = false;
      const back = opened instanceof HTMLElement && opened.isConnected && opened !== document.body ? opened : document.getElementById("tc-search-trigger");
      back?.focus();
    };
  }, []);

  const groups = useMemo(() => searchPortal(s, d, q, requests), [s, d, q, requests]);
  const staffById = d.staffById;

  const go = (href: string) => { onClose(); router.push(href); };
  async function pickedUp(id: string, what: string) {
    setMsg(null);
    const r = await mutate("pickup.pickedUp", { id });
    setMsg(r.ok ? { tone: "status", text: `Picked up: ${what}.` } : { tone: "alert", text: r.error });
  }

  const rows: Row[] = [];
  const byGroup: Record<string, Row[]> = {};
  for (const g of GROUPS) {
    byGroup[g.key] = groups[g.key].map((hit, i) => {
      const id = `${listId}-${g.key}-${i}`;
      let row: Row;
      switch (hit.kind) {
        case "person": row = { id, hit, primary: () => go(`/app/counter?staff=${encodeURIComponent(hit.staff.id)}`), secondary: () => go(`/app/staff/${encodeURIComponent(hit.staff.id)}`) }; break;
        case "waiting": {
          const first = hit.pickup.lines[0];
          const what = first ? `${label(d.byId[first.itemId])} ${first.size}` : hit.pickup.orderCode;
          row = { id, hit, primary: () => { void pickedUp(hit.pickup.id, what); } };
          break;
        }
        case "approves": row = { id, hit, primary: () => go(`/app/requests?open=${encodeURIComponent(hit.request.id)}`) }; break;
        case "garment": row = { id, hit, primary: () => go(`/app/stock/${encodeURIComponent(hit.item.id)}`) }; break;
        default: row = { id, hit, primary: () => go(`/app/orders/${encodeURIComponent(hit.order.id)}`) };
      }
      rows.push(row);
      return row;
    });
  }
  const at = Math.min(active, Math.max(0, rows.length - 1));
  const current = rows[at];

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    if (!current) return;
    document.getElementById(current.id)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!rows.length) return;
      e.preventDefault();
      setActive((a) => (Math.min(a, rows.length - 1) + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length);
      return;
    }
    if (e.key === "Enter" && e.target === input.current) {
      e.preventDefault();
      const scan = resolveScan(s, q);
      // A garment barcode typed or scanned into the box goes straight to it: no row carries barcodes.
      if (scan.kind === "garment" && onScan) { onClose(); onScan(q.trim()); return; }
      if (!current) { if (scan.kind === "staff" && onScan) { onClose(); onScan(q.trim()); } return; }
      if (e.shiftKey && current.secondary) current.secondary();
      else current.primary();
      return;
    }
    if (e.key === "Tab") {
      const node = box.current;
      if (!node) return;
      const f = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
      if (!f.length) return;
      const now = document.activeElement;
      if (e.shiftKey && now === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && now === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  }

  if (binding !== null) {
    return (
      <BindDialog code={binding} onClose={onClose}
        onBound={(itemId, si) => { onClose(); router.push(`/app/stock/${encodeURIComponent(itemId)}?size=${si}`); }} />
    );
  }

  const trimmed = q.trim();
  const showUnknown = !!unknownCode && trimmed === unknownCode.trim();
  const empty = !trimmed;
  const cap = s.settings.capSets;

  const rowBody = (row: Row, on: boolean) => {
    const h = row.hit;
    switch (h.kind) {
      case "person": {
        const st = h.staff;
        const bits = [st.group, st.dept, `holds ${h.held.sets} of ${h.cap || cap} sets`];
        if (h.waitingBags > 0) bits.push(`${plural(h.waitingBags, "bag", "bags")} waiting ${plural(h.oldestWaitDays ?? 0, "day", "days")}`);
        if (st.inactive) bits.push("inactive");
        return (
          <>
            <div className="tc-cmd-main">
              <div className="tc-cmd-title">{st.first} {st.last} <span className="tc-mono tc-cmd-num">{st.num}</span></div>
              <div className="tc-cmd-meta">{bits.filter(Boolean).join(" · ")}<span className="sr-only">. Enter for the counter, Shift+Enter for the record.</span></div>
            </div>
            <button type="button" tabIndex={-1} aria-hidden="true" className={"btn tc-cmd-act" + (on ? " lead" : "")} onClick={(e) => { e.stopPropagation(); row.primary(); }}>Counter <Kbd>↵</Kbd></button>
            <button type="button" tabIndex={-1} aria-hidden="true" className="btn tc-cmd-act quiet" onClick={(e) => { e.stopPropagation(); row.secondary?.(); }}>Record <Kbd>⇧↵</Kbd></button>
          </>
        );
      }
      case "waiting": {
        const p = h.pickup;
        const first = p.lines[0];
        const more = p.lines.length > 1 ? ` +${p.lines.length - 1}` : "";
        const name = h.staff ? `${h.staff.first} ${h.staff.last}` : "someone no longer on the register";
        return (
          <>
            <div className="tc-cmd-main">
              <div className="tc-cmd-title">{first ? <>{label(d.byId[first.itemId])} · <span className="tc-mono">{first.size}</span>{more}</> : "A bag"} for {name}</div>
              <div className="tc-cmd-meta">{[p.orderCode, `${plural(h.days, "day", "days")} at the counter`].filter(Boolean).join(" · ")}</div>
            </div>
            <button type="button" tabIndex={-1} className="btn btn-ghost tc-cmd-ghost" disabled={busy} onClick={(e) => { e.stopPropagation(); row.primary(); }}>Picked up</button>
          </>
        );
      }
      case "approves": {
        const r = h.request;
        const firstName = (r.managerName || "").trim().split(/\s+/)[0] || (staffById[r.managerId || ""]?.first ?? "");
        const when = whenLabel(s, r.decidedAt);
        return (
          <>
            <div className="tc-cmd-main">
              <div className="tc-cmd-title">{r.code} · {r.staffName}</div>
              <div className="tc-cmd-meta">approved by {firstName}{when ? ` ${when}` : ""} · ready to pick</div>
            </div>
            <button type="button" tabIndex={-1} className="btn btn-ghost tc-cmd-ghost" onClick={(e) => { e.stopPropagation(); row.primary(); }}>Open</button>
          </>
        );
      }
      case "garment":
        return (
          <div className="tc-cmd-main">
            <div className="tc-cmd-title">{label(h.item)}{h.item.sku && <> <span className="tc-mono tc-cmd-num">{h.item.sku}</span></>}</div>
            <div className="tc-cmd-meta">{[h.item.supplier, `${h.onhand} on hand`].filter(Boolean).join(" · ")}</div>
          </div>
        );
      default: {
        const o = h.order;
        const late = isOverdue(o, s.today);
        const tone = late ? "accent" : o.status === "Received" || o.status === "Cancelled" ? "quiet" : "outline";
        const exp = o.expected ? `expected ${formatInZone(o.expected, s.tz, { day: "numeric", month: "short" }).replace("Sept", "Sep")}` : "";
        return (
          <div className="tc-cmd-main">
            <div className="tc-cmd-title"><span className="tc-mono">{o.code}</span> <Tag tone={tone}>{late ? "Overdue" : o.status}</Tag></div>
            <div className="tc-cmd-meta">{[o.supplier, exp].filter(Boolean).join(" · ")}</div>
          </div>
        );
      }
    }
  };

  return (
    <div className="tc-cmd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className={"tc-cmd" + (empty && !showUnknown ? " empty" : "")} role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onKey}>
        <div className="tc-cmd-inputrow">
          <Icon name="search" size={18} />
          <input ref={input} className="tc-cmd-input" value={q} onChange={(e) => setQ(e.target.value)}
            aria-label="Search people, garments and orders" role="combobox" aria-expanded={rows.length > 0} aria-controls={listId}
            aria-activedescendant={current ? current.id : undefined} aria-describedby={`${listId}-keys`} aria-autocomplete="list" autoComplete="off" spellCheck={false} />
          <button type="button" className="tc-cmd-esc" onClick={onClose} aria-label="Close search"><Kbd>esc</Kbd></button>
        </div>
        <span id={`${listId}-keys`} className="sr-only">Arrow keys move through results. Enter opens the result; for a person, Enter opens the counter and Shift+Enter opens their record.</span>
        <LiveRegion tone={msg?.tone} msg={msg?.text} className={"tc-cmd-live" + (msg?.tone === "alert" ? " err" : "")} />
        {showUnknown && (
          <div className="tc-cmd-unknown">
            <span>No person or garment has <span className="tc-mono">{unknownCode}</span>.</span>
            {isAdmin && <button type="button" className="btn btn-ghost tc-cmd-ghost" onClick={() => setBinding(unknownCode || "")}>Bind it to a garment</button>}
          </div>
        )}
        <div className="tc-cmd-results" id={listId} role="listbox" aria-label="Results">
          {GROUPS.map((g) => byGroup[g.key].length > 0 && (
            <div key={g.key} role="group" aria-labelledby={`${listId}-${g.key}`}>
              <div id={`${listId}-${g.key}`} className="tc-lbl tc-cmd-group" role="presentation">{g.label}</div>
              {byGroup[g.key].map((row) => {
                const on = row === current;
                return (
                  <div key={row.id} id={row.id} role="option" aria-selected={on} className={"tc-cmd-row" + (on ? " active" : "")}
                    onMouseMove={() => { const i = rows.indexOf(row); if (i !== at) setActive(i); }}
                    onClick={() => row.primary()}>
                    {rowBody(row, on)}
                  </div>
                );
              })}
            </div>
          ))}
          {!empty && !showUnknown && rows.length === 0 && <div className="tc-cmd-empty">Nothing matches “{trimmed}”.</div>}
        </div>
        <div className="tc-cmd-foot" aria-hidden="true">
          <span><Kbd>↑↓</Kbd> move</span>
          <span><Kbd>↵</Kbd> open</span>
          <span>scan jumps straight to it</span>
        </div>
      </div>
    </div>
  );
}
