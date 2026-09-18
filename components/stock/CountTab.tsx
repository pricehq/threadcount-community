"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { Empty, Notice } from "@/components/ui";
import { BindDialog } from "@/components/dialogs";
import Camera from "@/components/Camera";
import { Bar, Panel, Seg, SelectButton } from "@/components/portal";
import { ALL_GROUPS, bcBound, bcFor, bcParse, csvEsc, csvOf, fmtDate, formatInZone, inBucket, key, label, locMap, locPath, locSubtree, locTree, money, onhand, plOf, signedInt, signedMoney } from "@/lib/compute";
import { downloadCsv, esc, openPrintWindow } from "@/lib/print";
import { setQuery } from "./url";

/* An in-progress count belongs to the person doing it, not to the browser: the key is scoped to the
   user id, and the saved-at stamp says how old a restored tally is. */
const countsKey = (userId: string) => `threadcount-counts:${userId}`;
type Saved = { counts: Record<string, string>; savedAt: string };
const VIEWS = ["All", "Uncounted"] as const;
const MODES = ["Normal", "Blind"] as const;
const POOLS = ["Shelf", "Pre-loved"] as const;
/* The same four the phone offers on its variance screen, so shrinkage reports stay in one wording. */
const REASONS = ["At laundry", "Condemned", "Missing", "Other"];

export default function CountTab({ initLocation }: { initLocation: string }) {
  const { s, mutate } = useSnap();
  const { L, byId, variants } = useDerived();
  const [counts, setCountsRaw] = useState<Record<string, string>>({});
  const countsRef = useRef(counts);
  countsRef.current = counts;
  const [reason, setReason] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [scan, setScan] = useState("");
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [group, setGroup] = useState(ALL_GROUPS);
  const [loc, setLoc] = useState(s.locations.some((l) => l.id === initLocation) ? initLocation : "");
  const [view, setView] = useState<(typeof VIEWS)[number]>("All");
  const [mode, setMode] = useState<(typeof MODES)[number]>("Normal");
  const [pool, setPool] = useState<(typeof POOLS)[number]>("Shelf");
  const [cam, setCam] = useState(false);
  const [camMsg, setCamMsg] = useState("");
  const [bind, setBind] = useState("");
  const [expand, setExpand] = useState<string | null>(null);
  const [limit, setLimit] = useState(60);
  const [busy, setBusy] = useState(false);
  const blind = mode === "Blind";
  const plMode = pool === "Pre-loved";
  // Pre-loved counts live under a "pl:" prefix so a shelf take and a pool take can run together.
  const kOf = (k: string) => (plMode ? "pl:" + k : k);
  const sysOf = (k: string) => (plMode ? plOf(s, k) : onhand(s, L, k));

  const KEY = countsKey(s.session.userId);
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<Saved>;
      if (raw && typeof raw.counts === "object" && raw.counts) { setCountsRaw(raw.counts); setSavedAt(typeof raw.savedAt === "string" ? raw.savedAt : ""); }
    } catch { /* ignore */ }
    setLoaded(true);
  }, [KEY]);
  const setCounts = (c: Record<string, string>) => {
    countsRef.current = c;
    setCountsRaw(c);
    const at = new Date().toISOString();
    setSavedAt(at);
    try { localStorage.setItem(KEY, JSON.stringify({ counts: c, savedAt: at } satisfies Saved)); } catch { /* ignore */ }
  };

  // A location scopes the count to the sizes placed at it or anywhere under it; the server refuses
  // a line from anywhere else, so lines outside the scope are never counted or sent.
  const scopeLocs = useMemo(() => (loc ? locSubtree(s, loc) : null), [s, loc]);
  const inLoc = (k: string) => !scopeLocs || scopeLocs.has(s.placed[k] || "");
  const poolVariants = useMemo(() => variants.filter((v) => !scopeLocs || scopeLocs.has(s.placed[v.key] || "")), [variants, scopeLocs, s.placed]);

  const has = (k: string, from = counts) => from[k] !== undefined && from[k] !== "";
  function countPlus(itemId: string, si: number) {
    const it = byId[itemId];
    const name = `${label(it)} ${it?.sizes[si] ?? ""}`;
    if (!inLoc(key(itemId, si))) return `${name} isn't placed under this location — not counted.`;
    const cur = countsRef.current;
    const k = kOf(key(itemId, si));
    const n = (parseInt(cur[k] || "0", 10) || 0) + 1;
    setCounts({ ...cur, [k]: String(n) });
    return `${name} → ${n}`;
  }
  function handleScan(raw: string) {
    const p = bcParse(s, raw);
    setScan("");
    if (!p) { setBind(raw.trim()); return; }
    setMsg(countPlus(p.itemId, p.si));
  }
  function camHit(raw: string) {
    const p = bcParse(s, raw);
    if (!p) { setCam(false); setBind(raw.trim()); return; }
    setCamMsg(countPlus(p.itemId, p.si));
  }
  // The phone SCAN button opens the camera; the desk scanner, typed outside any field, arrives as a
  // garment the shell has already resolved.
  const hitRef = useRef(countPlus);
  hitRef.current = countPlus;
  useEffect(() => {
    const onCam = () => { setCamMsg(""); setCam(true); };
    const onGarment = (e: Event) => { const d = (e as CustomEvent<{ itemId: string; si: number }>).detail; if (d) setMsg(hitRef.current(d.itemId, d.si)); };
    window.addEventListener("tc-scan", onCam);
    window.addEventListener("tc-scan-garment", onGarment);
    return () => { window.removeEventListener("tc-scan", onCam); window.removeEventListener("tc-scan-garment", onGarment); };
  }, []);

  const tq = q.trim().toLowerCase();
  const scopeAll = useMemo(() => poolVariants.filter((v) => inBucket(v.item, group)), [poolVariants, group]);
  const match = useMemo(() => scopeAll.filter((v) => (view !== "Uncounted" || !has(kOf(v.key))) && (!tq || v.item.item.toLowerCase().includes(tq) || v.item.sku.toLowerCase().includes(tq) || v.size.toLowerCase() === tq || bcFor(s, v.item, v.si).includes(tq))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeAll, view, tq, counts, s, plMode]);
  // A gap this big or bigger has to say why; the server refuses the whole count otherwise.
  const gate = Math.max(1, s.settings.varianceReason);
  let counted = 0, variances = 0, netVal = 0;
  const bigGaps: string[] = [];
  for (const v of poolVariants) if (has(kOf(v.key))) { counted++; const diff = (parseInt(counts[kOf(v.key)], 10) || 0) - sysOf(v.key); if (diff !== 0) { variances++; netVal += diff * (plMode ? 0 : v.item.cost); if (Math.abs(diff) >= gate) bigGaps.push(kOf(v.key)); } }
  const needsReason = bigGaps.filter((k) => !reason[k]);
  const scopeCounted = scopeAll.filter((v) => has(kOf(v.key))).length;
  const pct = Math.round((scopeCounted / Math.max(scopeAll.length, 1)) * 100);
  // A line still owing a reason stays reachable whatever the filter or the row limit hides.
  const needSet = new Set(needsReason);
  const forced = needSet.size ? poolVariants.filter((v) => needSet.has(kOf(v.key)) && !match.includes(v)) : [];
  const rows = [...forced, ...[...match].sort((a, b) => (has(kOf(b.key)) ? 1 : 0) - (has(kOf(a.key)) ? 1 : 0))];

  async function apply() {
    if (counted === 0 || busy) return;
    if (needsReason.length) { setMsg(`A gap of ${gate} or more needs a reason — ${needsReason.length} line${needsReason.length === 1 ? "" : "s"} still to go.`); return; }
    setBusy(true);
    const sent = poolVariants.filter((v) => has(kOf(v.key)));
    const lines = sent.map((v) => ({ itemId: v.itemId, si: v.si, counted: parseInt(counts[kOf(v.key)], 10) || 0, reason: reason[kOf(v.key)] || "" }));
    const r = await mutate("stocktake.apply", { lines, mode: plMode ? "preloved" : "shelf", ...(loc ? { locationId: loc } : {}) });
    setBusy(false);
    if (!r.ok) { setMsg(r.error); return; }
    const done = new Set(sent.map((v) => kOf(v.key)));
    const kept: Record<string, string> = {};
    for (const k in counts) {
      if (done.has(k)) continue;
      // A whole-room count clears the pool's tally, as it always has; a location count keeps the rest.
      if (!loc && (plMode ? k.startsWith("pl:") : !k.startsWith("pl:"))) continue;
      kept[k] = counts[k];
    }
    const keptReasons: Record<string, string> = {}; for (const k in reason) if (kept[k]) keptReasons[k] = reason[k];
    setCounts(kept); setReason(keptReasons);
    setMsg(variances ? (plMode ? "Pre-loved pool updated and filed." : "Adjustments applied and filed.") : "Count filed — everything matched.");
  }
  function zeroFill() {
    const c = { ...counts }; let n = 0;
    for (const v of match) if (!has(kOf(v.key))) { c[kOf(v.key)] = "0"; n++; }
    setCounts(c); setMsg(n ? `${n} uncounted line${n === 1 ? "" : "s"} set to zero.` : "Everything in scope is already counted.");
  }
  const lById = useMemo(() => locMap(s), [s]);
  const trail = (id: string | null | undefined) => locPath(lById, id).map((l) => l.name).join(" · ");
  function printCountSheet() {
    const byItem: Record<string, typeof match> = {};
    for (const v of match) (byItem[v.itemId] = byItem[v.itemId] || []).push(v);
    let rowsHtml = "";
    for (const itemId in byItem) {
      const it = byId[itemId];
      rowsHtml += `<tr class="ih"><td colspan="4">${esc(label(it))}${it?.sku ? " · " + esc(it.sku) : ""}</td></tr>`;
      // Only the real supplier code goes on paper; a generated id isn't on the garment.
      for (const v of byItem[itemId]) rowsHtml += `<tr><td>${esc(v.size)}</td><td>${esc(bcBound(s, v.item, v.si))}</td><td class="r">${blind ? "" : sysOf(v.key)}</td><td class="box"></td></tr>`;
    }
    openPrintWindow("Count sheet", `<h1>ThreadCount — ${plMode ? "Pre-loved pool" : "Stocktake"} count sheet</h1><div class="meta">${esc(s.settings.facility)} · Scope: ${esc(group)}${loc ? " · " + esc(trail(loc)) : ""}${tq ? " · filter “" + esc(q) + "”" : ""} · ${match.length} lines · Printed ${esc(fmtDate(s.today))} · Counted by ____________ ${blind ? "· BLIND COUNT" : ""}</div><table><tr><th>Size</th><th>Barcode</th><th class="r">${blind ? "" : "System"}</th><th>Counted</th></tr>${rowsHtml}</table>`, { width: 780, height: 920 });
  }
  function historyCsv(h: (typeof s.stocktakes)[number]) {
    downloadCsv(`threadcount-stocktake-${h.date}.csv`, `Stocktake ${h.date} by ${csvEsc(h.by)}${h.mode === "preloved" ? " · pre-loved pool" : ""}${h.locationId ? " · " + csvEsc(trail(h.locationId)) : ""}\n` + csvOf(["Item", "Size", "System", "Counted", "Variance", "Unit cost", "Variance value"], h.lines.filter((l) => l.counted !== l.sys).map((l) => { const it = byId[l.itemId]; const diff = l.counted - l.sys; return [label(it), it ? String(it.sizes[l.si]) : "?", l.sys, l.counted, diff, it ? it.cost : "", it ? (diff * it.cost).toFixed(2) : ""]; })));
  }

  const locOpts = [{ value: "", label: "All" }, ...locTree(s).map(({ loc: l }) => ({ value: l.id, label: trail(l.id) }))];
  const groupOpts = [ALL_GROUPS, ...s.settings.staffGroups.filter((g) => g !== ALL_GROUPS)].map((g) => ({ value: g, label: g }));
  const fileLabel = variances === 0 ? "File count" : "Apply adjustments";

  return (
    <div className="tc-stk">
      <div className="tc-stk-row">
        <input className="input" style={{ width: 280, maxWidth: "100%", background: "#fff" }} aria-label="Scan a barcode to add one to its count" placeholder="Scan to count +1" value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && scan.trim()) handleScan(scan); }} autoFocus />
        <button type="button" className="btn btn-ghost" onClick={() => { setCamMsg(""); setCam(true); }}>Camera</button>
        <input className="input" style={{ width: 200, maxWidth: "100%", background: "#fff" }} type="search" aria-label="Filter the lines to count" placeholder="Filter garments" value={q} onChange={(e) => setQ(e.target.value)} />
        <SelectButton label="Group" value={group} anyValue={ALL_GROUPS} options={groupOpts} onChange={setGroup} />
        <SelectButton label="Location" value={loc} anyValue="" options={locOpts} onChange={(v) => { setLoc(v); setQuery({ location: v || null }); }} />
        <Seg label="Pool" opts={POOLS} value={pool} onChange={setPool} />
        <Seg label="Show" opts={VIEWS} value={view} onChange={setView} />
        <Seg label="Mode" opts={MODES} value={mode} onChange={setMode} />
      </div>
      <div className="tc-stk-row">
        <div style={{ flex: 1, minWidth: 160 }}><Bar value={scopeCounted} max={scopeAll.length} label={`${pct}% counted`} /></div>
        <span className="tc-stk-meta tc-mono">{pct}% counted · {scopeCounted} of {scopeAll.length}</span>
        <span className="tc-stk-row" style={{ gap: 16, marginLeft: "auto" }}>
          <button type="button" className="btn btn-ghost" onClick={zeroFill}>Zero uncounted</button>
          <button type="button" className="btn btn-ghost" onClick={printCountSheet}>Print count sheet</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setCounts({}); setReason({}); setMsg(""); }}>Clear counts</button>
          <button type="button" className="btn btn-primary" onClick={apply} disabled={counted === 0 || busy || !loaded || needsReason.length > 0}
            title={needsReason.length ? `${needsReason.length} large gap${needsReason.length === 1 ? "" : "s"} still need a reason` : undefined}>{fileLabel}</button>
        </span>
      </div>
      {counted > 0 && (
        <div className="tc-stk-meta">
          {needsReason.length > 0 && <span className="tc-mark" aria-hidden="true" />}
          {!blind && <><span className="tc-mono">{variances}</span> variance{variances === 1 ? "" : "s"} · <span className="tc-mono">{signedMoney(netVal)}</span> · </>}
          <span className="tc-mono">{needsReason.length}</span> need a reason
        </div>
      )}
      {loaded && counted > 0 && savedAt && <div className="tc-stk-meta">Saved tally · last entry <span className="tc-mono">{formatInZone(savedAt, s.tz, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span></div>}
      <Notice msg={msg} />

      <Panel title={`${plMode ? "Pre-loved pool" : "Shelf"} — lines to count`} aside={<span className="tc-mono">{Math.min(limit, rows.length)} of {scopeAll.length}{blind ? " · blind" : ""}</span>}
        foot={rows.length > limit ? <button type="button" className="btn btn-ghost" onClick={() => setLimit(100000)}>Show all</button> : undefined}>
        {variants.length === 0 ? <div className="tc-stk-pad"><Empty pad={2}>No garments to count yet.</Empty></div>
          : rows.length === 0 ? <div className="tc-stk-pad"><Empty pad={2}>{loc && poolVariants.length === 0 ? "Nothing is placed under this location." : "No lines match."}</Empty></div> : (
          <div className="table-wrap">
            <table className="tc-table">
              <thead>
                <tr><th>Garment</th><th>Size</th><th className="num">{blind ? <span className="sr-only">System</span> : "System"}</th><th className="num">Counted</th><th className="num">{blind ? "Counted?" : "Variance"}</th><th>Reason</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((v) => {
                  const ck = kOf(v.key); const sys = sysOf(v.key); const h = has(ck); const varr = h ? (parseInt(counts[ck], 10) || 0) - sys : 0;
                  const big = h && Math.abs(varr) >= gate;
                  const name = `${label(v.item)} size ${v.size}`;
                  return (
                    <tr key={v.key}>
                      <td style={{ fontWeight: 600 }}>{label(v.item)}</td>
                      <td className="tc-mono">{v.size}</td>
                      <td className="num">{blind ? "" : sys}</td>
                      <td className="num"><input className="input tc-stk-cnt" inputMode="numeric" aria-label={`Counted — ${name}`} value={h ? counts[ck] : ""} onChange={(e) => setCounts({ ...counts, [ck]: e.target.value.replace(/[^0-9]/g, "") })} /></td>
                      <td className="num" style={{ fontWeight: 600, color: !blind && h && varr !== 0 ? "var(--color-accent-700)" : undefined }}>{blind ? (h ? "✓" : "") : h ? signedInt(varr) : "—"}</td>
                      {/* Only big gaps get the chooser, blind or not: the line can't be filed without one. */}
                      <td>{big && (<>
                        {!reason[ck] && <span className="tc-mark" aria-hidden="true" />}
                        <select className="input tc-stk-tight" style={{ borderColor: reason[ck] ? undefined : "var(--color-accent-600)" }} aria-label={`Reason for the gap on ${name}`} value={reason[ck] || ""} onChange={(e) => setReason({ ...reason, [ck]: e.target.value })}>
                          <option value="">Needs a reason…</option>
                          {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </>)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Stocktake history" aside={s.stocktakes.length > 0 ? <span className="tc-mono">{s.stocktakes.length} filed</span> : undefined}>
        {s.stocktakes.length === 0 && <div className="tc-stk-pad"><Empty pad={2}>No stocktakes filed yet.</Empty></div>}
        {s.stocktakes.map((h) => {
          const net = h.lines.reduce((t, l) => t + (l.counted - l.sys), 0);
          const nv = h.mode === "preloved" ? 0 : h.lines.reduce((t, l) => t + (l.counted - l.sys) * (byId[l.itemId]?.cost || 0), 0);
          const open = expand === h.id;
          const where = h.locationId ? trail(h.locationId) : "";
          return (
            <div key={h.id} className="tc-stk-hist">
              <div className="tc-stk-histrow">
                <span className="tc-mono" style={{ width: 70, flex: "none" }}>{fmtDate(h.date).replace(/\s\d{4}$/, "")}</span>
                <span className="tc-stk-histmain">
                  {h.by}{h.mode === "preloved" ? " · pre-loved pool" : ""}{where ? ` · ${where}` : ""}
                  <span className="tc-stk-meta"> · <span className="tc-mono">{h.counted}</span> lines · <span className="tc-mono">{h.variances}</span> variances · net <span className="tc-mono">{signedInt(net)} ({signedMoney(nv)})</span></span>
                </span>
                <button type="button" className="btn btn-ghost" aria-label={`Download the ${fmtDate(h.date)} count as CSV`} onClick={() => historyCsv(h)}>CSV</button>
                <button type="button" className="btn btn-ghost" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} the variances from the ${fmtDate(h.date)} count`} onClick={() => setExpand(open ? null : h.id)}>{open ? "Hide" : "Variances"}</button>
              </div>
              {open && (
                <div style={{ padding: "0 16px 12px" }}>
                  {h.variances === 0 && <Empty pad={2}>No variances.</Empty>}
                  {h.lines.filter((l) => l.counted !== l.sys).map((l, i) => { const diff = l.counted - l.sys; return (
                    <Fragment key={i}>
                      <div className="tc-stk-row" style={{ justifyContent: "space-between", padding: "4px 0", fontSize: 13, borderTop: i ? "1px solid #e4e2e1" : undefined }}>
                        <span>{label(byId[l.itemId])} · <span className="tc-mono">{byId[l.itemId]?.sizes[l.si] ?? "?"}</span>{l.reason ? <span className="tc-stk-meta"> · {l.reason}</span> : null}</span>
                        <span className="tc-mono">{l.sys} → {l.counted} · <b style={{ color: "var(--color-accent-700)" }}>{signedInt(diff)}</b> ({money(Math.abs(diff) * (byId[l.itemId]?.cost || 0))})</span>
                      </div>
                    </Fragment>
                  ); })}
                </div>
              )}
            </div>
          );
        })}
      </Panel>

      {cam && <Camera onHit={camHit} message={camMsg} onClose={() => setCam(false)} />}
      {bind && <BindDialog code={bind} onClose={() => setBind("")} onBound={(itemId, si) => setMsg(countPlus(itemId, si))} />}
    </div>
  );
}
