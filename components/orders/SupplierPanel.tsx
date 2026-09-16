"use client";
/* One supplier's panel in To order: the sizes at reorder with editable quantities, the drafts that
 * belong to the supplier, and one "Order and email" that raises the lot through order.raiseList. */
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { ErrorLine, Field, LiveRegion } from "@/components/ui";
import { Icon, QtyStepper, Tag } from "@/components/portal";
import { csvOf, fmtDate, key, label, money, staffName, supplierCodeOf } from "@/lib/compute";
import { downloadCsv, esc, openPrintWindow, tbl } from "@/lib/print";
import { draftValue, lineFor, siOf, type SupplierGroup, type ToOrderLine } from "./toOrder";
import { plural } from "./bits";

/** Number column headers: right-aligned, but in the 11px uppercase label face like Code and Garment. */
const NUM_TH = { textAlign: "right" } as const;

export type Raised = { id: string; code: string; supplier: string; ref: string; lines: { itemId: string; size: string; qty: number }[] };

export function SupplierPanel({ group, oo, raised, onRaised, onDone }: {
  group: SupplierGroup;
  oo: Record<string, number>;
  raised?: { orders: Raised[]; mail: Record<string, string> };
  onRaised: (orders: Raised[], mail: Record<string, string>) => void;
  onDone: () => void;
}) {
  const { s, mutate } = useSnap();
  const { L, byId, staffById } = useDerived();
  const hid = useId();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<{ itemId: string; si: number }[]>([]);
  const [ref, setRef] = useState("");
  // A draft keeps its own supplier order no.; the panel's box is for the stock order only.
  const [draftRefs, setDraftRefs] = useState<Record<string, string>>({});
  const [pick, setPick] = useState<{ itemId: string; si: number; qty: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [mailMsg, setMailMsg] = useState<Record<string, string>>({});
  const { supplier, lead, email, drafts } = group;

  const lines: ToOrderLine[] = useMemo(() => {
    const base = group.lines.filter((l) => !removed.includes(l.key));
    const have = new Set(group.lines.map((l) => l.key));
    const extra = added.map((a) => lineFor(s, L, byId, oo, a.itemId, a.si)).filter((l): l is ToOrderLine => !!l && !have.has(l.key));
    return [...base, ...extra].map((l) => (qty[l.key] !== undefined ? { ...l, qty: qty[l.key] } : l));
  }, [group.lines, removed, added, qty, s, L, byId, oo]);

  const catalog = useMemo(() => s.catalog.filter((it) => !it.archived).sort((a, b) => Number((b.supplier || "") === supplier) - Number((a.supplier || "") === supplier) || label(a).localeCompare(label(b))), [s.catalog, supplier]);
  const draftLines = drafts.reduce((t, o) => t + o.lines.length, 0);
  const total = lines.reduce((t, l) => t + l.qty * l.cost, 0) + drafts.reduce((t, o) => t + draftValue(o, byId), 0);
  const nLines = lines.length + draftLines;
  const canRaise = lines.some((l) => l.qty > 0) || drafts.length > 0;

  function removeLine(l: ToOrderLine) {
    if (group.lines.some((g) => g.key === l.key)) setRemoved((r) => [...r, l.key]);
    else setAdded((a) => a.filter((x) => key(x.itemId, x.si) !== l.key));
  }
  function addLine() {
    if (!pick || !pick.itemId) return;
    const k = key(pick.itemId, pick.si);
    setRemoved((r) => r.filter((x) => x !== k));
    if (!group.lines.some((g) => g.key === k)) setAdded((a) => (a.some((x) => key(x.itemId, x.si) === k) ? a : [...a, { itemId: pick.itemId, si: pick.si }]));
    setQty((q) => ({ ...q, [k]: Math.max(0, pick.qty) }));
    setPick(null);
  }

  function sheet() {
    const facts = [lead ? `Lead ${lead} days` : "", email || "No email on file", fmtDate(s.today)].filter(Boolean).join(" · ");
    const cols = [{ t: "Code" }, { t: "Garment" }, { t: "Size" }, { t: "Qty", r: true }, { t: "Unit", r: true }, { t: "Total", r: true }];
    const stockRows = lines.filter((l) => l.qty > 0).map((l) => [l.code || "no code", l.name, l.size, l.qty, money(l.cost), money(l.qty * l.cost)]);
    let body = `<h1><span class="sq"></span>${esc(supplier)}</h1><div class="meta">${esc(facts)}</div>`;
    if (stockRows.length) body += `<h2>For stock${ref ? ` · ${esc(ref)}` : ""}</h2>` + tbl(cols, stockRows);
    for (const o of drafts) {
      const who = o.staffId ? staffName(staffById[o.staffId], "staff member") : "stock";
      const dRef = draftRefs[o.id] ?? o.ref ?? "";
      body += `<h2>${esc(o.code)} · for ${esc(who)}${dRef ? ` · ${esc(dRef)}` : ""}</h2>` + tbl(cols, o.lines.map((l) => { const it = byId[l.itemId]; const c = it?.cost || 0; return [supplierCodeOf(s, key(l.itemId, siOf(it, l.size))) || "no code", label(it), l.size, l.qty, money(c), money(l.qty * c)]; }));
    }
    body += `<div class="meta" style="margin-top:12px;text-align:right;font-weight:700">Total ${esc(money(total))}</div>`;
    openPrintWindow(`${supplier} order`, body);
  }

  async function orderAndEmail() {
    setBusy(true); setErr("");
    const stockLines = lines.filter((l) => l.qty > 0).map((l) => ({ itemId: l.itemId, size: l.size, qty: l.qty }));
    const groups = [
      ...(stockLines.length ? [{ kind: "stock", supplier, ref, lines: stockLines }] : []),
      ...drafts.map((d) => ({ kind: "draft", id: d.id, ref: draftRefs[d.id] ?? "" })),
    ];
    const r = await mutate<{ raised: Raised[] }>("order.raiseList", { groups });
    if (!r.ok) { setBusy(false); setErr(r.error); return; }
    const mail: Record<string, string> = {};
    if (email) {
      for (const o of r.result.raised) {
        const m = await mutate<{ sentTo: string }>("order.email", { id: o.id });
        mail[o.id] = m.ok ? `Sent to ${m.result.sentTo}` : m.error;
      }
    }
    setBusy(false);
    setQty({}); setRemoved([]); setAdded([]); setRef(""); setDraftRefs({}); setPick(null);
    onRaised(r.result.raised, mail);
  }

  const costOf = (itemId: string) => byId[itemId]?.cost || 0;
  function csv(o: Raised) {
    const rows = o.lines.map((l) => { const it = byId[l.itemId]; return [supplierCodeOf(s, key(l.itemId, siOf(it, l.size))) || it?.sku || "", label(it), l.size, l.qty, costOf(l.itemId)]; });
    downloadCsv(`${o.code}${o.ref ? "-" + o.ref.replace(/[^A-Za-z0-9-]+/g, "_") : ""}-${o.supplier.replace(/[^A-Za-z0-9]+/g, "_")}.csv`, `Order,${o.code}\nSupplier,${o.supplier}\nSupplier order no.,${o.ref}\n\n` + csvOf(["Supplier code", "Description", "Size", "Qty", "Unit cost"], rows));
  }
  async function emailAgain(o: Raised) {
    setMailMsg((m) => ({ ...m, [o.id]: "Sending…" }));
    const r = await mutate<{ sentTo: string }>("order.email", { id: o.id });
    setMailMsg((m) => ({ ...m, [o.id]: r.ok ? `Sent to ${r.result.sentTo}` : r.error }));
  }

  const head = (aside: React.ReactNode) => (
    <div className="tc-pp-head">
      <span className="tc-pp-title" style={{ flexWrap: "wrap" }}>
        <h3 id={hid} className="tc-pp-h">{supplier}</h3>
        <span className="tc-pp-aside">{lead ? `lead ${lead} days · ` : ""}{email || "no email on file"}</span>
      </span>
      {aside}
    </div>
  );

  if (raised) {
    return (
      <section className="tc-pp" aria-labelledby={hid}>
        {head(<span className="tc-pp-aside tc-mono">{plural(raised.orders.length, "order")} raised</span>)}
        <div>
          {raised.orders.map((o) => {
            const msg = mailMsg[o.id] ?? raised.mail[o.id];
            return (
              <div key={o.id} className="tc-orders-row">
                <div className="tc-orders-rowmain">
                  <div className="tc-orders-rowtitle"><Link href={`/app/orders/${o.id}`}>{o.code}</Link> · {o.supplier}{o.ref ? ` · ${o.ref}` : ""}</div>
                  <div className="tc-orders-rowmeta">
                    <span className="tc-mono">{plural(o.lines.length, "line")} · {money(o.lines.reduce((t, l) => t + l.qty * costOf(l.itemId), 0))}</span>
                  </div>
                  <LiveRegion msg={msg} className="tc-orders-rowmeta" />
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <a className="btn btn-secondary" href={`/print/supplier-order?id=${o.id}`} target="_blank" rel="noreferrer" onClick={() => { void mutate("order.printed", { id: o.id }); }}>Print</a>
                  <button type="button" className="btn btn-ghost" onClick={() => csv(o)}>CSV</button>
                  <button type="button" className="btn btn-ghost" onClick={() => emailAgain(o)}>Email</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="tc-orders-foot"><button type="button" className="btn btn-ghost" onClick={onDone}>Done</button></div>
      </section>
    );
  }

  return (
    <section className="tc-pp" aria-labelledby={hid}>
      {head(<span className="tc-pp-aside tc-mono">{plural(nLines, "line")} · {money(total)}</span>)}
      {lines.length > 0 && (
        <div className="table-wrap">
          <table className="tc-table" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th scope="col">Code</th><th scope="col">Garment</th>
                <th scope="col" style={NUM_TH}>On hand</th><th scope="col" style={NUM_TH}>Reorder</th><th scope="col" style={NUM_TH}>On order</th><th scope="col" style={NUM_TH}>Per week</th>
                <th scope="col" style={NUM_TH}>Order</th><th scope="col" style={NUM_TH}>Cost</th>
                <th scope="col"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key}>
                  {/* Codes and "no code" stay on one line, and the garment keeps enough width for a
                      long name and its size: squeezed, both broke over two or three lines. */}
                  <td className="tc-mono" style={{ fontSize: 12, color: "#57534f", whiteSpace: "nowrap" }}>{l.code || <Link href={`/app/stock/${l.itemId}`} style={{ color: "var(--color-accent-700)", fontWeight: 600 }}>no code</Link>}</td>
                  <td style={{ minWidth: 180 }}>
                    <div style={{ fontWeight: 600 }}>{l.name} · <span className="tc-mono" style={{ whiteSpace: "nowrap" }}>{l.size}</span></div>
                    {l.runsOut && <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-accent-700)" }}>runs out before this arrives</div>}
                  </td>
                  <td className="num" style={l.oh <= 0 ? { color: "var(--color-accent-700)", fontWeight: 600 } : undefined}>{l.oh}</td>
                  <td className="num">{l.ro}</td>
                  <td className="num">{l.onOrder}</td>
                  <td className="num">{l.perWeek === null ? "–" : l.perWeek.toFixed(1)}</td>
                  <td className="num"><QtyStepper size="sm" min={0} value={l.qty} label={`${l.name} ${l.size}`} onChange={(n) => setQty((q) => ({ ...q, [l.key]: n }))} /></td>
                  <td className="num">{money(l.qty * l.cost)}</td>
                  <td style={{ padding: "9px 8px 9px 0" }}>
                    <button type="button" className="btn btn-ghost" style={{ minHeight: 26, padding: "0 4px" }} aria-label={`Remove ${l.name} ${l.size} from the list`} title="Remove from the list" onClick={() => removeLine(l)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {drafts.map((o) => {
        const who = o.staffId ? staffName(staffById[o.staffId], "staff member") : "stock";
        return (
          <div key={o.id} className="tc-orders-draft">
            <div className="tc-orders-drafthead">
              <Tag tone={o.staffId ? "outline" : "quiet"}>{o.staffId ? "staff" : "draft"}</Tag>
              <span>for {who} · <Link href={`/app/orders/${o.id}`} className="tc-mono">{o.code}</Link></span>
              <span className="tc-mono" style={{ marginLeft: "auto", fontSize: 12, color: "#57534f" }}>{plural(o.lines.length, "line")}</span>
              <input className="input tc-orders-ref" placeholder="Supplier order no." aria-label={`${o.code} supplier order number`} maxLength={120}
                value={draftRefs[o.id] ?? o.ref ?? ""} onChange={(e) => { const v = e.target.value; setDraftRefs((m) => ({ ...m, [o.id]: v })); }} />
            </div>
            <div className="table-wrap">
              <table className="tc-table" style={{ minWidth: 520 }}>
                <thead className="sr-only"><tr><th scope="col">Code</th><th scope="col">Garment</th><th scope="col">Qty</th><th scope="col">Cost</th></tr></thead>
                <tbody>
                  {o.lines.map((l) => {
                    const it = byId[l.itemId];
                    const code = supplierCodeOf(s, key(l.itemId, siOf(it, l.size)));
                    return (
                      <tr key={l.id}>
                        <td className="tc-mono" style={{ fontSize: 12, color: "#57534f", width: "18%" }}>{code || "no code"}</td>
                        <td><span style={{ fontWeight: 600 }}>{label(it)} · <span className="tc-mono">{l.size}</span></span></td>
                        <td className="num">{l.qty}</td>
                        <td className="num">{money(l.qty * (it?.cost || 0))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {nLines === 0 && <div className="tc-orders-rowmeta" style={{ padding: "11px 16px" }}>Nothing to order.</div>}
      {pick && (
        <div className="tc-orders-add">
          <Field label="Garment" style={{ minWidth: 220 }}>{(c) => (
            <select {...c} className="input" value={pick.itemId} onChange={(e) => setPick({ ...pick, itemId: e.target.value, si: 0 })}>
              <option value="">Choose…</option>
              {catalog.map((it) => <option key={it.id} value={it.id}>{label(it)}{it.supplier && it.supplier !== supplier ? ` · ${it.supplier}` : ""}</option>)}
            </select>
          )}</Field>
          <Field label="Size">{(c) => (
            <select {...c} className="input" value={pick.si} disabled={!pick.itemId} onChange={(e) => setPick({ ...pick, si: parseInt(e.target.value, 10) })}>
              {(byId[pick.itemId]?.sizes || []).map((sz, i) => <option key={i} value={i}>{String(sz)}</option>)}
            </select>
          )}</Field>
          <Field label="Qty">{(c) => <input {...c} className="input" style={{ width: 80 }} type="number" min={0} inputMode="numeric" value={pick.qty} onChange={(e) => setPick({ ...pick, qty: Math.max(0, parseInt(e.target.value || "0", 10) || 0) })} />}</Field>
          <button type="button" className="btn btn-secondary" disabled={!pick.itemId} onClick={addLine}>Add</button>
          <button type="button" className="btn btn-ghost" onClick={() => setPick(null)}>Cancel</button>
        </div>
      )}
      <div className="tc-orders-foot">
        {lines.length > 0 && <input className="input tc-orders-ref" placeholder="Supplier order no." aria-label={`${supplier} stock order number`} maxLength={120} value={ref} onChange={(e) => setRef(e.target.value)} />}
        {!pick && <button type="button" className="btn btn-ghost" onClick={() => setPick({ itemId: "", si: 0, qty: 1 })}>Add a line</button>}
        <button type="button" className="btn btn-secondary" style={{ marginLeft: "auto" }} onClick={sheet} disabled={nLines === 0}><Icon name="print" size={16} />Sheet</button>
        <button type="button" className="btn btn-primary" onClick={orderAndEmail} disabled={busy || !canRaise}>
          {email && <Icon name="mail" size={16} />}{busy ? "Ordering…" : email ? "Order and email" : "Order"}
        </button>
      </div>
      {err && <div style={{ padding: "0 16px 12px" }}><ErrorLine msg={err} /></div>}
    </section>
  );
}
