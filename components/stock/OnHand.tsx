"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { Empty, Notice } from "@/components/ui";
import { AdjustDialog, BindDialog } from "@/components/dialogs";
import Camera from "@/components/Camera";
import { Icon, Seg, SelectButton, SizeStrip, Tag, type SizeCell } from "@/components/portal";
import { ALL_GROUPS, bcBound, bcFor, bcParse, csvOf, genderLabel, label, groupKey, inBucket, key, lastCountMap, onOrderMap, onhand, reorderAt, touched, type Item } from "@/lib/compute";
import { downloadCsv } from "@/lib/print";
import { setQuery, wholeMoney } from "./url";

export const STOCK_FILTERS = ["all", "reorder", "out", "onorder", "nobarcode"] as const;
export type StockFilter = (typeof STOCK_FILTERS)[number];
const FILTER_LABELS: Record<StockFilter, string> = { all: "All", reorder: "At reorder", out: "Out", onorder: "On order", nobarcode: "No barcode" };
type SortKey = "" | "name" | "value" | "onorder" | "onhand";

type SizeRow = { si: number; size: string; key: string; oh: number; ro: number; touched: boolean; barcode: string; bound: string; onOrd: number };
type Row = { it: Item; sizes: SizeRow[]; tot: number; val: number; onOrd: number; out: number; low: number; reorder: boolean; unbound: boolean };

export function asStockFilter(v: string | null | undefined): StockFilter {
  return (STOCK_FILTERS as readonly string[]).includes(v || "") ? (v as StockFilter) : "all";
}

export default function OnHand({ init }: { init: { filter: StockFilter; q: string; group: string; supplier: string } }) {
  const router = useRouter();
  const { s, isAdmin, mutate } = useSnap();
  const { L, byId } = useDerived();
  const [q, setQ] = useState(init.q);
  const [group, setGroup] = useState(init.group || ALL_GROUPS);
  const [supplier, setSupplier] = useState(init.supplier);
  const [filter, setFilter] = useState<StockFilter>(init.filter);
  const [sortKey, setSortKey] = useState<SortKey>("");
  const [sortDir, setSortDir] = useState(1);
  const [adjust, setAdjust] = useState<{ itemId: string; si: number } | null | false>(false);
  const [cam, setCam] = useState(false);
  const [bind, setBind] = useState("");
  const [limit, setLimit] = useState(40);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [bulkRo, setBulkRo] = useState("");
  const [bulkPrice, setBulkPrice] = useState("");

  // The SCAN button on a phone lands here as ?scan=1: a camera lookup of one garment.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("scan") === "1") { setCam(true); setQuery({ scan: null }); }
  }, []);

  const onOrder = useMemo(() => onOrderMap(s, byId), [s, byId]);
  const lastCount = useMemo(() => lastCountMap(s), [s]);

  const supplierOpts = useMemo(() => [{ value: "", label: "All suppliers" }, ...[...new Set(s.catalog.map((it) => it.supplier).filter(Boolean))].sort().map((x) => ({ value: x, label: x }))], [s.catalog]);
  const groupFilterOpts = [ALL_GROUPS, ...s.settings.staffGroups.filter((g) => g !== ALL_GROUPS)].map((g) => ({ value: g, label: g }));

  // Value walks the whole catalogue, discontinued lines included: they are still garments on a
  // shelf, and the CSV and Reports → Valuation count them too.
  const totals = useMemo(() => {
    let value = 0, ordered = 0;
    for (const it of s.catalog) it.sizes.forEach((_sz, si) => { const k = key(it.id, si); const oh = onhand(s, L, k); if (oh > 0) value += oh * it.cost; ordered += (onOrder.byKey[k] || 0) * it.cost; });
    return { value, ordered };
  }, [s, L, onOrder]);

  // Every garment the text, group and supplier filters let through; the segment then picks from it.
  const matched = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const out: Row[] = [];
    for (const it of s.catalog) {
      if (!inBucket(it, group)) continue;
      if (supplier && it.supplier !== supplier) continue;
      const sizes = it.sizes.map((sz, si) => { const k = key(it.id, si); return { si, size: String(sz), key: k, oh: onhand(s, L, k), ro: reorderAt(s, k), touched: touched(s, L, k), barcode: bcFor(s, it, si), bound: bcBound(s, it, si), onOrd: onOrder.byKey[k] || 0 }; });
      if (ql && !(label(it).toLowerCase().includes(ql) || it.sku.toLowerCase().includes(ql) || sizes.some((v) => v.barcode.includes(ql) || v.size.toLowerCase() === ql))) continue;
      const out0 = sizes.filter((v) => v.touched && v.oh <= 0).length;
      const low = sizes.filter((v) => v.touched && v.oh > 0 && v.oh <= v.ro).length;
      out.push({
        it, sizes, out: out0, low,
        tot: sizes.reduce((t, v) => t + v.oh, 0),
        val: sizes.reduce((t, v) => t + Math.max(0, v.oh) * it.cost, 0),
        onOrd: sizes.reduce((t, v) => t + v.onOrd, 0),
        reorder: sizes.some((v) => v.touched && v.oh <= v.ro),
        unbound: sizes.some((v) => !v.bound),
      });
    }
    return out;
  }, [s, L, q, group, supplier, onOrder]);

  const test: Record<StockFilter, (r: Row) => boolean> = {
    all: () => true,
    reorder: (r) => !r.it.archived && r.reorder,
    out: (r) => !r.it.archived && r.out > 0,
    onorder: (r) => !r.it.archived && r.onOrd > 0,
    nobarcode: (r) => !r.it.archived && r.unbound,
  };
  const counts = Object.fromEntries(STOCK_FILTERS.map((f) => [f, matched.filter(test[f]).length])) as Record<StockFilter, number>;

  const rows = useMemo(() => {
    const list = matched.filter(test[filter]);
    if (sortKey) list.sort((a, b) => (sortKey === "name" ? label(a.it).localeCompare(label(b.it)) : sortKey === "onhand" ? a.tot - b.tot : sortKey === "value" ? a.val - b.val : a.onOrd - b.onOrd) * sortDir);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched, filter, sortKey, sortDir]);
  const shown = rows.slice(0, limit);

  function changeFilter(f: StockFilter) { setFilter(f); setMsg(""); setQuery({ filter: f === "all" ? null : f }); }
  function changeQ(v: string) { setQ(v); setQuery({ q: v.trim() ? v : null }); }
  function changeGroup(v: string) { setGroup(v); setQuery({ group: v === ALL_GROUPS ? null : v }); }
  function changeSupplier(v: string) { setSupplier(v); setQuery({ supplier: v || null }); }

  function sortTh(k: Exclude<SortKey, "">, t: string, num = false) {
    const on = sortKey === k;
    return (
      <th className={num ? "num" : undefined} aria-sort={on ? (sortDir > 0 ? "ascending" : "descending") : "none"}>
        <button type="button" className="tc-stk-sort" onClick={() => { if (on) setSortDir(-sortDir); else { setSortKey(k); setSortDir(1); } }}>
          {t}<span aria-hidden="true">{on ? (sortDir > 0 ? " ▲" : " ▼") : ""}</span>
        </button>
      </th>
    );
  }

  function camHit(raw: string) {
    const p = bcParse(s, raw);
    setCam(false);
    if (!p) { if (isAdmin) setBind(raw.trim()); else setMsg(`No garment carries ${raw.trim()}.`); return; }
    router.push(`/app/stock/${encodeURIComponent(p.itemId)}?size=${p.si}`);
  }

  function exportCsv() {
    const out: (string | number)[][] = [];
    for (const it of s.catalog) it.sizes.forEach((sz, si) => { const k = key(it.id, si); const oh = onhand(s, L, k); out.push([it.item, genderLabel(it.gender), it.sku, it.supplier, String(sz), bcBound(s, it, si), oh, reorderAt(s, k), onOrder.byKey[k] || 0, lastCount[k] || "", it.cost, (Math.max(0, oh) * it.cost).toFixed(2)]); });
    downloadCsv(`threadcount-stock-${s.today}.csv`, csvOf(["Item", "Gender", "SKU", "Supplier", "Size", "Barcode", "On hand", "Reorder at", "On order", "Last counted", "Unit cost", "Value"], out));
  }

  const selIds = Object.keys(sel).filter((id) => sel[id] && byId[id]);
  const shownIds = shown.map((x) => x.it.id);
  const allSel = shownIds.length > 0 && shownIds.every((id) => sel[id]);
  const selectAll = () => setSel((m) => { const n = { ...m }; for (const id of shownIds) n[id] = !allSel; return n; });
  const groupOpts = [ALL_GROUPS, ...s.settings.staffGroups.filter((g) => groupKey(g) !== "all" && groupKey(g) !== groupKey(ALL_GROUPS))];
  const bp = bulkPrice.trim();
  const priceOk = /^[+-]\d+(\.\d+)?%$/.test(bp) || /^\$?\d+(\.\d+)?$/.test(bp);
  async function bulk(action: string, value?: string, extra?: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await mutate<{ message: string }>("catalog.bulk", { ids: selIds, action, value, ...extra });
      setMsg(r.ok ? r.result.message : r.error);
      if (r.ok) { setSel({}); setBulkRo(""); setBulkPrice(""); }
    } finally { setBusy(false); }
  }

  const cellsOf = (r: Row): SizeCell[] => r.sizes.map((v) => ({
    si: v.si, size: v.size, count: v.oh,
    state: v.touched && v.oh <= 0 ? "out" : v.touched && v.oh <= v.ro ? "low" : !v.touched && v.oh === 0 ? "none" : "ok",
  }));
  const statusOf = (r: Row) => r.out > 0 ? <Tag tone="accent">{r.out} out</Tag> : r.low > 0 ? <Tag tone="low">{r.low} low</Tag> : r.unbound ? <Tag tone="quiet">no barcode</Tag> : null;

  return (
    <div className="tc-stk">
      <div className="tc-stk-row">
        <div className="tc-stk-segscroll">
          <Seg label="Which garments" opts={STOCK_FILTERS} value={filter} onChange={changeFilter} labels={FILTER_LABELS} counts={counts} />
        </div>
        <label className="tc-stk-search">
          <Icon name="search" size={16} />
          <input className="input" type="search" placeholder="Filter garments" aria-label="Filter garments by name, SKU, size or barcode" value={q} onChange={(e) => changeQ(e.target.value)} />
        </label>
        <SelectButton label="Group" value={group} anyValue={ALL_GROUPS} options={groupFilterOpts} onChange={changeGroup} />
        <SelectButton label="Supplier" value={supplier} anyValue="" options={supplierOpts} onChange={changeSupplier} />
        <span className="tc-stk-totals">On hand <b>{wholeMoney(totals.value)}</b> · on order <b>{wholeMoney(totals.ordered)}</b></span>
      </div>

      {isAdmin && selIds.length > 0 && (
        <div className="tc-stk-bulk" role="group" aria-label="Change the selected garments">
          <b className="tc-stk-mono" style={{ fontSize: 13 }}>{selIds.length} selected</b>
          <button type="button" className="btn btn-ghost" onClick={() => setSel({})}>Clear</button>
          <span className="tc-stk-vr" aria-hidden="true" />
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => bulk("discontinue")}>Discontinue</button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => bulk("reinstate")}>Reinstate</button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { if (confirm(`Delete ${selIds.length} garment${selIds.length === 1 ? "" : "s"}? Anything with history or stock on hand is discontinued instead.`)) bulk("delete"); }}>Delete</button>
          <span className="tc-stk-vr" aria-hidden="true" />
          <SelectButton label="Set supplier" value="" anyValue="" options={[{ value: "", label: "choose" }, ...s.settings.suppliers.map((o) => ({ value: o, label: o }))]} onChange={(v) => { if (v) bulk("supplier", v); }} />
          <SelectButton label="Set group" value="" anyValue="" options={[{ value: "", label: "choose" }, ...groupOpts.map((o) => ({ value: o, label: o }))]} onChange={(v) => { if (v) bulk("group", undefined, { groups: v === ALL_GROUPS ? [] : [v] }); }} />
          <span className="tc-stk-row" style={{ gap: 6 }}>
            <input className="input tc-stk-mono" style={{ width: 70 }} aria-label="Reorder level to set on the selected garments" placeholder="Level" inputMode="numeric" value={bulkRo} onChange={(e) => setBulkRo(e.target.value.replace(/[^0-9]/g, ""))} />
            <button type="button" className="btn btn-ghost" disabled={busy || bulkRo === ""} onClick={() => bulk("reorder", bulkRo)}>Set reorder</button>
          </span>
          <span className="tc-stk-row" style={{ gap: 6 }}>
            <input className="input tc-stk-mono" style={{ width: 96 }} aria-label="New price, or a percentage change, for the selected garments" placeholder="$ or +5%" value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)} />
            <button type="button" className="btn btn-ghost" disabled={busy || !priceOk} onClick={() => bulk("price", bp)}>Apply price</button>
          </span>
        </div>
      )}
      <Notice msg={msg} />

      <div className="tc-pp">
        {s.catalog.length === 0 ? (
          <div className="tc-stk-pad"><Empty pad={2}>No garments yet.{isAdmin && <> <Link href="/app/settings?tab=data">Import them</Link></>}</Empty></div>
        ) : rows.length === 0 ? (
          <div className="tc-stk-pad"><Empty pad={2}>No garments match.</Empty></div>
        ) : (
          <div className="table-wrap">
            <table className={"tc-table tc-stk-table cards" + (isAdmin ? "" : " noselect")}>
              <thead>
                <tr>
                  {isAdmin && <th style={{ width: 18 }}><input type="checkbox" className="tc-stk-check" checked={allSel} onChange={selectAll} aria-label="Select every garment shown" /></th>}
                  {sortTh("name", "Garment")}
                  <th>Sizes · on hand</th>
                  {sortTh("onhand", "On hand", true)}
                  {sortTh("value", "Value", true)}
                  {sortTh("onorder", "On order", true)}
                  <th><span className="sr-only">Status</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const status = statusOf(r);
                  return (
                    <tr key={r.it.id} className={r.it.archived ? "archived" : undefined}>
                      {isAdmin && <td className="tc-stk-c-check" style={{ width: 18 }}><input type="checkbox" className="tc-stk-check" checked={!!sel[r.it.id]} aria-label={`Select ${label(r.it)}`} onChange={() => setSel((m) => ({ ...m, [r.it.id]: !m[r.it.id] }))} /></td>}
                      <td className="tc-stk-c-name">
                        <Link href={`/app/stock/${r.it.id}`} className="tc-stk-name">{label(r.it)}</Link>
                        {r.it.archived && <> <Tag>Discontinued</Tag></>}
                        <div className="tc-stk-meta"><span className="tc-mono">{r.it.sku || "—"}</span> · {r.it.supplier || "No supplier"}</div>
                      </td>
                      <td className="tc-stk-c-sizes">
                        <SizeStrip itemLabel={label(r.it)} cells={cellsOf(r)} action="Adjust" opensDialog onCell={(si) => setAdjust({ itemId: r.it.id, si })} />
                      </td>
                      <td className="num tc-stk-desk" style={{ fontWeight: 600 }}>{r.tot}</td>
                      <td className="num tc-stk-desk">{wholeMoney(r.val)}</td>
                      <td className="num tc-stk-desk">{r.onOrd > 0 ? r.onOrd : "–"}</td>
                      <td className="tc-stk-desk">{status}</td>
                      <td className="tc-stk-mob">
                        <span>On hand <b className="tc-mono">{r.tot}</b> · <span className="tc-mono">{wholeMoney(r.val)}</span> · on order <span className="tc-mono">{r.onOrd}</span></span>
                        {status}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="tc-stk-foot">
          <span className="tc-stk-meta tc-mono">Showing {shown.length} of {rows.length}</span>
          {rows.length > limit && <button type="button" className="btn btn-ghost" onClick={() => setLimit(100000)}>Show all</button>}
          <span className="tc-stk-foot-right">
            <button type="button" className="btn btn-ghost" onClick={() => setAdjust(null)}>Adjust quantity</button>
            <button type="button" className="btn btn-ghost" onClick={exportCsv}>Export CSV</button>
          </span>
        </div>
      </div>

      {adjust !== false && <AdjustDialog init={adjust} onClose={() => setAdjust(false)} />}
      {cam && <Camera onHit={camHit} message="" onClose={() => setCam(false)} />}
      {bind && <BindDialog code={bind} onClose={() => setBind("")} onBound={(itemId, si) => router.push(`/app/stock/${encodeURIComponent(itemId)}?size=${si}`)} />}
    </div>
  );
}
