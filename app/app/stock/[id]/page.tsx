"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { PageHead, Empty, ErrorLine, Field, Notice } from "@/components/ui";
import { AdjustDialog, DuplicateItemDialog, GROUPS_HINT, GroupsPicker, ScanVariantsDialog } from "@/components/dialogs";
import { Icon, MoreMenu, Panel, QtyStepper, Tag } from "@/components/portal";
import { StockStyles } from "@/components/stock/StockStyles";
import { wholeMoney } from "@/components/stock/url";
import { bcBound, countsAsIssued, fmtDate, forecastFor, forecastLabel, fyStart, garmentGroups, genderLabel, issueCost, itemOrderHistory, key, lastCountMap, locTree, money, onOrderMap, onhand, plOf, reorderAt, staffName, statusTag, supplierCodeOf, touched } from "@/lib/compute";

export default function GarmentPage() {
  const { id } = useParams<{ id: string }>();
  const { s, isAdmin, mutate } = useSnap();
  const { L, byId, staffById } = useDerived();
  const it = s.catalog.find((x) => x.id === id);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ item: "", sku: "", supplier: "", cost: "", gender: "Unisex", groups: [] as string[], notes: "" });
  const [newSize, setNewSize] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [adjust, setAdjust] = useState<{ itemId: string; si: number } | null>(null);
  const [scanSizes, setScanSizes] = useState(false);
  const [dup, setDup] = useState(false);
  // What is typed into each size's barcode box, until it is saved: a label code is as often read out
  // and typed as it is scanned.
  const [codes, setCodes] = useState<Record<number, string>>({});
  const [rowErr, setRowErr] = useState<{ si: number; msg: string } | null>(null);
  const [flash, setFlash] = useState<number | null>(null);

  // Arriving from "Create and scan sizes" (?scan=1) opens the scanner straight away; ?size=<si>
  // (a scanned garment, a size cell) brings that size's row into view and marks it for two seconds.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("scan") === "1") {
      if (isAdmin && it) setScanSizes(true);
      sp.delete("scan");
      window.history.replaceState(null, "", window.location.pathname + (sp.toString() ? "?" + sp.toString() : ""));
    }
    const size = sp.get("size");
    if (size === null || !it) return;
    const si = parseInt(size, 10);
    if (!(si >= 0 && si < it.sizes.length)) return;
    const t0 = window.setTimeout(() => {
      const el = document.getElementById(`size-row-${si}`);
      if (el) { el.scrollIntoView({ block: "center" }); el.focus({ preventScroll: true }); }
      setFlash(si);
    }, 50);
    const t1 = window.setTimeout(() => setFlash(null), 2050);
    return () => { window.clearTimeout(t0); window.clearTimeout(t1); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!it]);

  const d = useMemo(() => {
    if (!it) return null;
    const oo = onOrderMap(s, byId).byKey;
    const lastCount = lastCountMap(s);
    const sizes = it.sizes.map((sz, si) => { const k = key(it.id, si); return { si, size: String(sz), key: k, oh: onhand(s, L, k), ro: reorderAt(s, k), touched: touched(s, L, k), barcode: bcBound(s, it, si), pl: plOf(s, k), onOrd: oo[k] || 0, last: lastCount[k] || "" }; });
    const tot = sizes.reduce((t, v) => t + v.oh, 0);
    const value = sizes.reduce((t, v) => t + Math.max(0, v.oh), 0) * it.cost;
    const fy = fyStart(s.today);
    const fyList = s.issues.filter((i) => i.itemId === it.id && i.date >= fy && countsAsIssued(i));
    const fyIssued = fyList.reduce((t, i) => t + i.qty, 0);
    const fySpend = fyList.reduce((t, i) => t + i.qty * issueCost(i, byId), 0);
    const onOrder = sizes.reduce((t, v) => t + v.onOrd, 0);
    const hist: { date: string; kind: string; cls: string; desc: string }[] = [];
    for (const i of s.issues) if (i.itemId === it.id) {
      hist.push({ date: i.date, kind: i.direct ? "Collected" : "Issued", cls: "tag tag-neutral", desc: `${it.sizes[i.si]} ×${i.qty} — ${staffName(staffById[i.staffId], "—")}` });
      if (i.returned) hist.push({ date: i.returned.date, kind: i.returned.cond.replace("Returned - ", "Returned – "), cls: "tag tag-outline", desc: `${it.sizes[i.si]} ×${i.qty} — ${staffName(staffById[i.staffId], "—")}` });
    }
    for (const o of s.orders) for (const rc of o.receipts) for (const l of rc.lines) if (l.itemId === it.id) hist.push({ date: rc.date, kind: "Received", cls: "tag tag-accent", desc: `${l.size} ×${l.qty} — ${o.code}${l.dest === "shelf" ? " → shelf" : " → staff pickup"}` });
    // A counted correction isn't a write-off: it's the shelf disagreeing with the ledger, either way.
    for (const m of s.moves) if (m.itemId === it.id) hist.push({ date: m.date, kind: m.reason === "Counted correction" ? "Counted" : m.qty < 0 ? "Write-off" : "Added", cls: "tag tag-outline", desc: `${it.sizes[m.si] ?? ""} ${m.reason === "Counted correction" ? (m.qty < 0 ? "−" : "+") + Math.abs(m.qty) : "×" + Math.abs(m.qty)}${m.reason ? " — " + m.reason : ""}` });
    hist.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return { sizes, tot, value, fyIssued, fySpend, onOrder, hist: hist.slice(0, 25) };
  }, [it, s, L, byId, staffById]);

  if (!it || !d) {
    return (
      <section>
        <StockStyles />
        <PageHead title="Garment not found" />
        <nav aria-label="Breadcrumb" className="tc-stk-crumb"><Icon name="chevronLeft" size={16} /><Link href="/app/stock">Stock</Link></nav>
        <Empty>That garment isn&apos;t in the catalogue.</Empty>
      </section>
    );
  }

  const tagged = garmentGroups(it.groups);
  const startEdit = () => { setF({ item: it.item, sku: it.sku, supplier: it.supplier, cost: String(it.cost), gender: it.gender, groups: tagged, notes: it.notes }); setErr(""); setEdit(true); };
  const invalid = !f.item.trim() || !(parseFloat(f.cost) >= 0) || f.cost === "";
  async function save() {
    if (invalid) return;
    const r = await mutate("catalog.update", { id: it!.id, item: f.item, sku: f.sku, supplier: f.supplier, cost: parseFloat(f.cost), gender: f.gender, groups: f.groups, notes: f.notes });
    if (!r.ok) { setErr(r.error); return; }
    setEdit(false);
  }
  async function act(op: string, payload: unknown) { setErr(""); setRowErr(null); setMsg(""); const r = await mutate(op, payload); if (!r.ok) setErr(r.error); }
  const sizeInvalid = !newSize.trim() || it.sizes.map(String).includes(newSize.trim());
  // Adding a size does not mint a barcode: most sizes arrive with the supplier's own number.
  async function addSize() {
    if (sizeInvalid) return;
    setErr("");
    const r = await mutate("catalog.update", { id: it!.id, addSize: newSize.trim() });
    if (!r.ok) { setErr(r.error); return; }
    setNewSize("");
  }
  // A size row's own refusal belongs on that row.
  function rowFail(si: number, m: string) { setErr(""); setRowErr({ si, msg: m }); }
  async function saveCode(si: number, size: string, bound: string, force = false) {
    const code = (codes[si] ?? bound).trim();
    if (code === bound) { setCodes((c) => ({ ...c, [si]: bound })); return; }
    // Clearing the box is how a wrong code comes off.
    if (!code) { if (confirm(`Unbind ${bound} from size ${size}?`)) await unbindCode(si, bound); return; }
    setErr(""); setRowErr(null);
    const r = await mutate("barcode.bind", { code, itemId: it!.id, si, force });
    if (!r.ok) {
      // "Already on another garment" is the one refusal force may clear.
      if (!force && r.error.includes("re-bind to move it") && confirm(`${r.error}\n\nMove ${code} onto ${it!.item} · size ${size}?`)) { await saveCode(si, size, bound, true); return; }
      rowFail(si, r.error); return;
    }
    setCodes((c) => ({ ...c, [si]: code }));
  }
  async function unbindCode(si: number, code: string) {
    setErr(""); setRowErr(null);
    const r = await mutate("barcode.unbind", { code });
    if (!r.ok) { rowFail(si, r.error); return; }
    setCodes((c) => ({ ...c, [si]: "" }));
  }
  // Our own number for sizes that arrived without one. Only fills gaps; the server has the last word.
  async function generateAll() {
    const missing = d!.sizes.filter((v) => !v.barcode).length;
    if (missing && !confirm(`Generate a barcode for the ${missing} size${missing === 1 ? "" : "s"} on ${it!.item} with none? Sizes with a supplier’s code keep it.`)) return;
    setErr(""); setRowErr(null); setMsg("");
    const r = await mutate<{ made: { si: number; size: string; code: string }[]; count: number }>("barcode.generate", { itemId: it!.id });
    if (!r.ok) { setErr(r.error); return; }
    setCodes({});
    setMsg(`Generated ${r.result.count} barcode${r.result.count === 1 ? "" : "s"} — size${r.result.count === 1 ? "" : "s"} ${r.result.made.map((m) => m.size).join(", ")}.`);
  }
  async function generateOne(si: number, size: string) {
    setErr(""); setRowErr(null); setMsg("");
    const r = await mutate<{ made: { si: number; size: string; code: string }[]; count: number }>("barcode.generate", { itemId: it!.id, si });
    if (!r.ok) { rowFail(si, r.error); return; }
    setCodes((c) => { const n = { ...c }; delete n[si]; return n; });
    setMsg(`Size ${size} now carries ${r.result.made.map((m) => m.code).join(", ")}.`);
  }
  async function removeSize(si: number, size: string) {
    if (!confirm(`Remove size ${size} from ${it!.item}? Its reorder level and barcode go with it.`)) return;
    setErr(""); setRowErr(null);
    const r = await mutate("catalog.removeSize", { id: it!.id, si });
    if (!r.ok) { rowFail(si, r.error); return; }
    // Every size above the removed one shifts down a place.
    setCodes({});
  }
  // One label per garment on hand across the sizes that carry a code, so the count goes on the menu
  // item and into the question before the print dialog opens.
  const labelled = d.sizes.filter((v) => v.barcode).length;
  const labels = d.sizes.reduce((t, v) => t + (v.barcode ? Math.max(0, v.oh) : 0), 0);
  function printLabels() {
    if (labels && !confirm(`Print ${labels} label${labels === 1 ? "" : "s"} for ${it!.item}? One for every garment on hand, across the ${labelled} size${labelled === 1 ? "" : "s"} carrying a barcode.`)) return;
    window.open(`/print/labels?item=${encodeURIComponent(it!.id)}`, "_blank", "noopener");
  }

  const locOpts = locTree(s).map(({ loc, depth }) => ({ id: loc.id, name: " ".repeat(depth * 2) + loc.name }));
  const sp = s.supplierDir.find((x) => x.name === it.supplier);
  const hist = itemOrderHistory(s, it.id);
  const prices = s.costs.filter((c) => c.itemId === it.id).sort((a, b) => b.at.localeCompare(a.at));
  const colCount = 10;

  return (
    <section>
      <StockStyles />
      <PageHead
        title={it.item}
        below={
          <div className="tc-stk-tags">
            {tagged.length ? tagged.map((g) => <Tag key={g}>{g}</Tag>) : <Tag>All groups</Tag>}
            {it.gender !== "Unisex" && <Tag>{genderLabel(it.gender)}</Tag>}
            <Tag>{it.supplier || "No supplier"}</Tag>
            {it.archived && <Tag tone="accent">Discontinued</Tag>}
          </div>
        }
      >
        <div className="tc-stk-headfig">
          <span className="tc-stk-mono">{d.tot}</span>
          on hand · <span className="tc-mono">{wholeMoney(d.value)}</span>
        </div>
        {isAdmin && (!edit ? (
          <>
            <button type="button" className="btn btn-primary" onClick={startEdit}>Edit garment</button>
            <button type="button" className="btn btn-onink" onClick={() => setScanSizes(true)}>Scan sizes</button>
            <MoreMenu tone="ink" items={[
              { label: `Print labels (${labels})`, onSelect: printLabels },
              { label: "Generate barcodes", onSelect: generateAll },
              { label: "Duplicate", onSelect: () => setDup(true) },
              it.archived
                ? { label: "Reinstate", onSelect: () => act("catalog.update", { id: it.id, archived: false }) }
                : { label: "Discontinue", danger: true, onSelect: () => act("catalog.update", { id: it.id, archived: true }) },
            ]} />
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={save} disabled={invalid}>Save changes</button>
            <button type="button" className="btn btn-onink" onClick={() => setEdit(false)}>Cancel</button>
          </>
        ))}
      </PageHead>
      <nav aria-label="Breadcrumb" className="tc-stk-crumb">
        <Icon name="chevronLeft" size={16} /><Link href="/app/stock">Stock</Link><span aria-hidden="true">/</span><span style={{ fontWeight: 600, color: "var(--color-text)" }} aria-current="page">{it.item}</span>
      </nav>
      <ErrorLine msg={err} />
      <Notice msg={msg} />

      <div className="tc-stk-grid" style={{ marginTop: 8 }}>
        <div className="tc-stk-col">
          {edit && (
            <Panel title="Edit details">
              <div className="tc-stk-pad tc-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Item name" style={{ gridColumn: "1 / -1" }} error={!f.item.trim() ? "Needed — the garment has to have a name." : undefined}>{(c) => <input {...c} className="input" value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} />}</Field>
                <Field label="SKU / style code">{(c) => <input {...c} className="input" value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} />}</Field>
                <Field label="Unit cost ($)" error={f.cost !== "" && !(parseFloat(f.cost) >= 0) ? "Give a number, or 0." : undefined}>{(c) => <input {...c} className="input" inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value.replace(/[^0-9.]/g, "") })} />}</Field>
                <Field label="Supplier">{(c) => <><input {...c} className="input" list="tc-suppliers" value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /><datalist id="tc-suppliers">{s.settings.suppliers.map((x) => <option key={x} value={x} />)}</datalist></>}</Field>
                <Field label="Gender">{(c) => <select {...c} className="input" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="Unisex">Unisex</option><option value="Male">Men&apos;s</option><option value="Female">Women&apos;s</option></select>}</Field>
                <GroupsPicker style={{ gridColumn: "1 / -1" }} value={f.groups} onChange={(groups) => setF({ ...f, groups })} groups={s.settings.staffGroups} hint={GROUPS_HINT} />
                <Field label="Notes" style={{ gridColumn: "1 / -1" }}>{(c) => <textarea {...c} className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Fit notes, replacement style, supplier quirks…" />}</Field>
              </div>
            </Panel>
          )}

          <Panel title="Sizes" aside={<span className="tc-mono">{labelled} of {it.sizes.length} carry a barcode</span>}
            foot={isAdmin ? (
              <div className="tc-stk-row" style={{ alignItems: "flex-end", width: "100%" }}>
                <Field label="Add a size" hint="Starts with no barcode." style={{ flex: 1, minWidth: 160 }} error={newSize.trim() && it.sizes.map(String).includes(newSize.trim()) ? "That size is already on this garment." : undefined}>{(c) => <input {...c} className="input" value={newSize} onChange={(e) => setNewSize(e.target.value)} placeholder="e.g. 6XL or 127" onKeyDown={(e) => { if (e.key === "Enter") addSize(); }} />}</Field>
                <button type="button" className="btn btn-secondary" onClick={addSize} disabled={sizeInvalid}>Add size</button>
              </div>
            ) : undefined}>
            <div className="table-wrap">
              <table className="tc-table tc-stk-table" style={{ minWidth: isAdmin ? 1040 : 860 }}>
                <thead>
                  <tr>
                    <th>Size</th><th>Barcode</th><th>Status</th><th className="num">On hand</th><th className="num">Pre-loved</th><th className="num">On order</th><th>Last counted</th><th>Location</th><th className="num">Reorder at</th><th><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {d.sizes.map((v) => {
                    const status = v.oh <= 0 ? (v.touched ? "out" : "none") : v.oh <= v.ro ? "reorder" : "ok";
                    const draft = codes[v.si] ?? v.barcode;
                    const dirty = draft.trim() !== v.barcode;
                    return (
                      <Fragment key={v.si}>
                        <tr id={`size-row-${v.si}`} tabIndex={-1} className={flash === v.si ? "tc-stk-flash" : undefined}>
                          <td className="tc-mono" style={{ fontWeight: 600 }}>{v.size}</td>
                          <td>
                            {isAdmin ? (
                              <span className="tc-stk-row" style={{ gap: 4, flexWrap: "nowrap" }}>
                                <input className="input tc-stk-tight tc-mono" style={{ width: 150 }} value={draft} maxLength={64} inputMode="numeric" placeholder="Not bound"
                                  aria-label={`Barcode for size ${v.size}`} title="Type or scan the label code. Clear the box to unbind."
                                  onChange={(e) => setCodes({ ...codes, [v.si]: e.target.value })}
                                  onKeyDown={(e) => { if (e.key === "Enter") saveCode(v.si, v.size, v.barcode); }} />
                                {dirty
                                  ? <button type="button" className="btn btn-secondary tc-stk-tight" aria-label={`Save the barcode for size ${v.size}`} onClick={() => saveCode(v.si, v.size, v.barcode)}>Save</button>
                                  : v.barcode
                                    ? <button type="button" className="btn btn-ghost btn-icon" title="Unbind this barcode" aria-label={`Unbind barcode ${v.barcode} from size ${v.size}`} onClick={() => { if (confirm(`Unbind ${v.barcode} from size ${v.size}?`)) unbindCode(v.si, v.barcode); }}>×</button>
                                    : <button type="button" className="btn btn-ghost tc-stk-tight" aria-label={`Generate a barcode for size ${v.size}`} onClick={() => generateOne(v.si, v.size)}>Generate</button>}
                              </span>
                            ) : (
                              <span className="tc-mono" style={{ fontSize: 12, color: v.barcode ? undefined : "var(--color-neutral-600)" }}>{v.barcode || "Not bound"}</span>
                            )}
                          </td>
                          <td>{status === "out" ? <Tag tone="accent">Out</Tag> : status === "reorder" ? <Tag tone="low">Reorder</Tag> : status === "ok" ? <Tag tone="quiet">OK</Tag> : <Tag tone="quiet">—</Tag>}</td>
                          <td className="num" style={{ fontWeight: 600, color: status === "out" || status === "reorder" ? "var(--color-accent-700)" : undefined }}>{v.oh}</td>
                          <td className="num">{v.pl > 0 ? v.pl : "–"}</td>
                          <td className="num">{v.onOrd > 0 ? v.onOrd : "–"}</td>
                          <td className="tc-mono" style={{ fontSize: 12 }}>{v.last ? fmtDate(v.last) : "never"}</td>
                          <td>
                            <select className="input tc-stk-tight" value={s.placed[v.key] || ""} aria-label={`Where size ${v.size} lives`}
                              onChange={(e) => act("location.place", { itemId: it.id, si: v.si, locationId: e.target.value })}
                              disabled={s.locations.length === 0} title={s.locations.length === 0 ? "No locations yet" : undefined}>
                              <option value="">{s.locations.length === 0 ? "—" : "Unplaced"}</option>
                              {locOpts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                          </td>
                          <td className="num">
                            {isAdmin
                              ? <QtyStepper size="sm" label={`reorder level for size ${v.size}`} value={v.ro} onChange={(n) => act("stock.reorder", { itemId: it.id, si: v.si, reorder: Math.max(0, n) })} />
                              : v.ro}
                          </td>
                          <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                            <button type="button" className="btn btn-ghost tc-stk-tight" aria-label={`Adjust the quantity of size ${v.size}`} onClick={() => setAdjust({ itemId: it.id, si: v.si })}>Adjust</button>
                            {isAdmin && <> <button type="button" className="btn btn-ghost tc-stk-tight" aria-label={`Remove size ${v.size} from this garment`} onClick={() => removeSize(v.si, v.size)}>Remove</button></>}
                          </td>
                        </tr>
                        {rowErr?.si === v.si && <tr><td colSpan={colCount} style={{ borderTop: 0, paddingTop: 0 }}><ErrorLine msg={rowErr.msg} /></td></tr>}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Ordering" aside={<>{it.supplier || "no supplier"}{sp?.lead ? <> · <span className="tc-mono">{sp.lead}</span>-day lead</> : null}</>}>
            <div className="table-wrap">
              <table className="tc-table" style={{ minWidth: 620 }}>
                <thead>
                  <tr><th>Size</th><th>Supplier code</th><th title="Weekly issues over 13 weeks (26 if none) × (lead time + 2 weeks)">Usage · suggested reorder</th><th className="num">Reorder at</th></tr>
                </thead>
                <tbody>
                  {d.sizes.map((v) => {
                    const fc = forecastFor(s, L, byId, v.key);
                    const code = supplierCodeOf(s, v.key);
                    return (
                      <tr key={"ord" + v.si}>
                        <td className="tc-mono" style={{ fontWeight: 600 }}>{v.size}</td>
                        <td>{isAdmin
                          ? <input key={code} className="input tc-stk-tight tc-mono" style={{ width: 180 }} defaultValue={code} placeholder="e.g. NW-10422-M" maxLength={60} aria-label={`Supplier code for size ${v.size}`}
                              onBlur={(e) => { if (e.target.value.trim() !== code) act("stock.supplierCode", { itemId: it.id, si: v.si, code: e.target.value.trim() }); }}
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                          : <span className="tc-mono">{code || "—"}</span>}</td>
                        <td>
                          <span className="tc-stk-row" style={{ gap: 8 }}>
                            <span>{fc.suggestedReorder !== null ? <><b>Suggested <span className="tc-mono">{fc.suggestedReorder}</span></b> · {forecastLabel(fc)}</> : forecastLabel(fc)}</span>
                            {fc.runsOutBeforeDelivery && <Tag tone="low" title="At the current rate the shelf runs out before a delivery placed today would arrive">runs out before delivery</Tag>}
                            {isAdmin && fc.suggestedReorder !== null && fc.suggestedReorder !== v.ro && <button type="button" className="btn btn-ghost tc-stk-tight" aria-label={`Set the reorder level for size ${v.size} to ${fc.suggestedReorder}`} onClick={() => act("stock.reorder", { itemId: it.id, si: v.si, reorder: fc.suggestedReorder })}>Use</button>}
                          </span>
                        </td>
                        <td className="num" style={{ fontWeight: 600 }}>{v.ro}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Orders" aside={<span className="tc-mono">{hist.length} line{hist.length === 1 ? "" : "s"}</span>}>
            {hist.length === 0 ? <div className="tc-stk-pad"><Empty pad={2}>Never ordered.</Empty></div> : (
              <div className="table-wrap">
                <table className="tc-table" style={{ minWidth: 820 }}>
                  <thead>
                    <tr><th>Date</th><th>Order</th><th>Supplier</th><th>Size</th><th className="num">Qty</th><th className="num">Unit then</th><th>Supplier ref</th><th>Invoice</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {hist.map((h, i) => (
                      <tr key={i}>
                        <td className="tc-mono">{fmtDate(h.date)}</td>
                        <td className="tc-mono"><Link href={`/app/orders/${h.orderId}`}>{h.code}</Link></td>
                        <td>{h.supplier || "—"}</td>
                        <td className="tc-mono">{h.size}</td>
                        <td className="num" style={{ fontWeight: 600 }}>{h.qty}</td>
                        <td className="num">{h.unit ? money(h.unit) : "—"}</td>
                        <td className="tc-mono">{h.ref || "—"}</td>
                        <td className="tc-mono">{h.invoice || "—"}</td>
                        <td><span className={statusTag(h.status)}>{h.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Price history" aside={<>now <span className="tc-mono">{money(it.cost)}</span></>}>
            {prices.length === 0 ? <div className="tc-stk-pad"><Empty pad={2}>No price changes recorded.</Empty></div> : (
              <div>
                {prices.map((c) => (
                  <div key={c.id} className="tc-stk-kv">
                    <span><span className="tc-mono">{fmtDate(c.at.slice(0, 10))}</span>{c.byName ? ` · ${c.byName}` : ""}</span>
                    <span className="tc-mono">{c.previous !== null ? `${money(c.previous)} → ` : ""}{money(c.cost)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {it.notes && !edit && (
            <Panel title="Notes">
              <div className="tc-stk-pad" style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{it.notes}</div>
            </Panel>
          )}
        </div>

        <div className="tc-stk-col">
          <Panel title="This financial year">
            <div>
              {([["Issued this FY", `${d.fyIssued}`], ["FY spend (at issue price)", money(d.fySpend)], ["On open orders", `${d.onOrder}`], ["Unit cost", money(it.cost)], ["Sizes carried", String(it.sizes.length)]] as const).map(([k, v]) => (
                <div key={k} className="tc-stk-kv"><span>{k}</span><span className="tc-mono" style={{ fontWeight: 600 }}>{v}</span></div>
              ))}
            </div>
          </Panel>
          <Panel title="Recent movement" aside={d.hist.length > 0 ? "newest first" : undefined}>
            {d.hist.length === 0 ? <div className="tc-stk-pad"><Empty pad={2}>No movement recorded yet.</Empty></div> : (
              <div>
                {d.hist.map((h, i) => (
                  <div key={i} className="tc-stk-kv" style={{ justifyContent: "flex-start" }}>
                    <span className="tc-mono tc-stk-meta" style={{ flex: "none", width: 84 }}>{fmtDate(h.date)}</span>
                    <span className={h.cls} style={{ flex: "none" }}>{h.kind}</span>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.desc}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {adjust && <AdjustDialog init={adjust} onClose={() => setAdjust(null)} />}
      {/* Drafts go when the scanner closes: it binds codes to these same sizes. */}
      {scanSizes && <ScanVariantsDialog item={it} onClose={() => { setScanSizes(false); setCodes({}); }} />}
      {dup && <DuplicateItemDialog item={it} onClose={() => setDup(false)} />}
    </section>
  );
}
