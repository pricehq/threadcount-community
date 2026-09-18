"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { PageHead, Empty, Field, ItemSizePicker, LiveRegion } from "@/components/ui";
import { ReceiveDialog } from "@/components/dialogs";
import { Figures, MoreMenu, Panel, QtyStepper, Tag } from "@/components/portal";
import { Crumb, OrdersStyles } from "@/components/orders/bits";
import { viewPhoto } from "@/lib/photo";
import { key, supplierCodeOf, ccBudgetNote, ccFor, ccOfOrder, csvOf, daysBetween, fmtDate, isOverdue, label, money, orderTotal, staffName, statusTag, supplierInfo, csvEsc } from "@/lib/compute";
import { downloadCsv, esc, openPrintWindow } from "@/lib/print";

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { s, isAdmin, mutate } = useSnap();
  const { byId, staffById } = useDerived();
  const router = useRouter();
  const o = s.orders.find((x) => x.id === id);
  const [rcv, setRcv] = useState(false);
  const [err, setErr] = useState("");
  const [pick, setPick] = useState("");
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  // What the coordinator has tapped on the quantity steppers but the server hasn't confirmed yet.
  // The state is what the screen shows; the ref is what the next tap adds to while it is set,
  // because it is current the instant a tap happens, where the state and the snapshot are both a
  // render (or a whole round trip) behind.
  const [qtyDraft, setQtyDraft] = useState<Record<string, number>>({});
  const qtyWanted = useRef<Record<string, number>>({});
  // What the snapshot said about a line as its write came back, and the lines the latest snapshot
  // has. Both are read by the backstop below, from a timer: a timer armed two renders ago still
  // closes over that render's copy of the order, and judging the screen out of date from a copy
  // that is itself out of date is exactly how the pre-tap quantity gets back under a finger.
  const qtySeen = useRef<Record<string, number>>({});
  const snapLines = useRef(o?.lines);
  // The field edits a debounce is still sitting on, so leaving the page can send them (see below).
  const fieldWanted = useRef<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  /* Anything still in a debounce when this screen goes away is sent, not thrown away.
   *
   * Clearing the timers on unmount was silent data loss: tap + on a quantity, or type the invoice
   * number, then click straight through to another page inside the debounce window and the change
   * vanished — it was on the screen as the coordinator left, and the supplier got the old figure.
   * The writes go out bare because the component is already gone: there is nothing left to show an
   * error in, and the record is one refresh away for whoever opens it next. */
  const flush = useRef<() => void>(() => {});
  useEffect(() => {
    flush.current = () => {
      for (const [k, v] of Object.entries(fieldWanted.current)) void mutate("order.update", { id, [k]: v });
      for (const [lineId, qty] of Object.entries(qtyWanted.current)) void mutate("order.lineQty", { id, lineId, qty });
    };
  });
  useEffect(() => { const t = timers.current, f = flush; return () => { Object.values(t).forEach(clearTimeout); f.current(); }; }, []);
  useEffect(() => { snapLines.current = o?.lines; });
  // Hand a line back to the snapshot once the refreshed snapshot agrees with what was tapped (or
  // the line is gone). Waiting for agreement rather than for the write to return matters: the
  // provider re-renders on its own the moment a write lands, still carrying the old snapshot, and
  // dropping the tapped number there would flick the counter back to the old quantity and again
  // look like the taps had been lost.
  useEffect(() => {
    setQtyDraft((d) => {
      const n = Object.fromEntries(Object.entries(d).filter(([k, v]) => {
        const line = o?.lines.find((l) => l.id === k);
        return qtyWanted.current[k] !== undefined || (!!line && line.qty !== v);
      }));
      return Object.keys(n).length === Object.keys(d).length ? d : n;
    });
  });

  const [mailMsg, setMailMsg] = useState("");

  if (!o) return <section><OrdersStyles /><PageHead title="Order not found" /><Crumb href="/app/orders/all" parent="Orders" current="Not found" /><Empty><Link href="/app/orders/all">All orders</Link></Empty></section>;

  const st = o.staffId ? staffById[o.staffId] : undefined;
  const overdue = isOverdue(o, s.today);
  const forLabel = o.orderFor === "Stock" ? "For stock" : "For " + staffName(st, "staff member");
  const ccCode = ccOfOrder(s, o, staffById);
  const ccNote = ccBudgetNote(s, byId, staffById, ccCode, " (incl. this one)");

  function saveField(k: string, v: string) {
    setDraft((d) => ({ ...d, [k]: v }));
    fieldWanted.current[k] = v;
    clearTimeout(timers.current[k]);
    timers.current[k] = setTimeout(async () => {
      // Off the pending list the moment it is on its way: a keystroke that lands after this point
      // has already put its own value back and scheduled its own timer.
      if (fieldWanted.current[k] === v) delete fieldWanted.current[k];
      const r = await mutate("order.update", { id: o!.id, [k]: v });
      if (!r.ok) setErr(r.error);
    }, 400);
  }
  const val = (k: keyof typeof o) => (draft[k] !== undefined ? draft[k] : String(o[k] ?? ""));
  /* The order as the coordinator can actually see it: the taps and the typing still sitting in a
   * debounce, laid over the snapshot that has not caught up with them yet.
   *
   * Everything that puts this order in front of a person reads it — the lines, the total, the
   * printed purchase order, the CSV, the receive dialog — so what leaves the building says what the
   * screen said when it was asked for. Printing from the snapshot sent the supplier a tunic count
   * one tap behind. Sending the pending write first would not have fixed it: the refreshed snapshot
   * lands some time after the write returns, and the print window has to open on the click itself
   * or the browser blocks it. Actions the server answers out of its own copy go through flushQty()
   * instead — that is what the database has to be right about. */
  const onScreen = { ...o, ref: val("ref"), invoice: val("invoice"), tracking: val("tracking"), expected: val("expected"), supplier: val("supplier"), notes: val("notes"), lines: o.lines.map((l) => (qtyDraft[l.id] !== undefined ? { ...l, qty: qtyDraft[l.id] } : l)) };
  async function act(op: string, payload: unknown) { setErr(""); const r = await mutate(op, payload); if (!r.ok) setErr(r.error); return r.ok; }
  /* Steppers count from what has been tapped, never from the snapshot.
   *
   * order.lineQty takes an absolute quantity and the snapshot only catches up once a write comes
   * back, so reading l.qty on every tap meant six quick taps on the size-14 tunic all posted
   * qty: 2: the line settled at 2 or 3 and the purchase order went to the supplier four tunics
   * short. Each tap now adds to the pending figure and the debounce sends whatever it reached.
   *
   * `shown` is the number on the screen, which is the one the coordinator is counting from. It
   * matters in the gap between a write landing and the refreshed snapshot arriving: the pending
   * figure is cleared the moment the write returns, so a tap in that gap would otherwise fall back
   * to the snapshot and count from the old quantity again — the very defect this exists to stop.
   * The pending figure still wins where it exists, because two taps in one frame both read the same
   * already-rendered number. */
  function bumpQty(lineId: string, shown: number, by: number) {
    clearTimeout(timers.current["qtyclear:" + lineId]);
    const next = (qtyWanted.current[lineId] ?? shown) + by;
    qtyWanted.current[lineId] = next;
    setQtyDraft((d) => ({ ...d, [lineId]: next }));
    clearTimeout(timers.current["qty:" + lineId]);
    timers.current["qty:" + lineId] = setTimeout(() => { void sendQty(lineId); }, 300);
  }
  async function sendQty(lineId: string) {
    const want = qtyWanted.current[lineId];
    if (want === undefined) return true;
    clearTimeout(timers.current["qty:" + lineId]);
    const ok = await act("order.lineQty", { id: o!.id, lineId, qty: want });
    // A tap that landed while this write was in the air has already raised the target; leaving it
    // pending lets the timer that tap scheduled send the higher number instead of losing it here.
    if (qtyWanted.current[lineId] === want) {
      delete qtyWanted.current[lineId];
      // Nothing was saved, so the tapped number must come off the screen now rather than sit there
      // above the error looking like a quantity the supplier is going to be sent.
      if (!ok) dropPendingQty(lineId);
      else {
        qtySeen.current[lineId] = snapLines.current?.find((l) => l.id === lineId)?.qty ?? want;
        timers.current["qtyclear:" + lineId] = setTimeout(() => dropOverriddenQty(lineId, want), 2000);
      }
    }
    return ok;
  }
  /* The backstop for the case where the snapshot never comes to agree — someone else editing the
   * same draft line. Without it this screen would keep showing our number over theirs.
   *
   * It runs on a clock, so it must never act on a snapshot that is merely late. Dropping the draft
   * the moment the two seconds were up put the pre-tap quantity back on the screen whenever the
   * refreshed snapshot was slower than that, and the next tap counted on from it — the miscount all
   * of this exists to stop. A snapshot still showing the figure it had when our write came back,
   * and not the figure we wrote, has not caught up yet: the tapped number stays and this waits
   * another two seconds. Once it moves — to ours, or to whatever the other coordinator saved — the
   * draft has nothing left to protect and goes. */
  function dropOverriddenQty(lineId: string, wrote: number) {
    const line = snapLines.current?.find((l) => l.id === lineId);
    if (line && line.qty !== wrote && line.qty === qtySeen.current[lineId]) { timers.current["qtyclear:" + lineId] = setTimeout(() => dropOverriddenQty(lineId, wrote), 2000); return; }
    dropPendingQty(lineId);
  }
  // Send anything still sitting in the debounce before an action the server answers out of its own
  // copy of the order — it reads the lines the database holds, not the ones on this screen — or
  // before one that closes the draft to edits and would have the pending write refused.
  async function flushQty() {
    for (const lineId of Object.keys(qtyWanted.current)) if (!(await sendQty(lineId))) return false;
    return true;
  }
  function dropPendingQty(lineId: string) {
    clearTimeout(timers.current["qty:" + lineId]);
    clearTimeout(timers.current["qtyclear:" + lineId]);
    delete qtyWanted.current[lineId];
    delete qtySeen.current[lineId];
    setQtyDraft((d) => { const n = { ...d }; delete n[lineId]; return n; });
  }
  async function removeLine(lineId: string) { dropPendingQty(lineId); await act("order.lineRemove", { id: o!.id, lineId }); }
  /* Every line is priced the way orderTotal() prices it — delivered units at the cost the delivery
   * was invoiced at, whatever is still outstanding at today's catalogue price — so the rows a
   * coordinator ticks off against the invoice add up to the total printed under them. Pricing the
   * rows from the catalogue while the total came from orderTotal() left the two visibly disagreeing
   * as soon as a delivery arrived at a different price, on the one screen where that sum is checked.
   *
   * The amounts come out of orderTotal() itself rather than a second copy of its arithmetic: what
   * line n contributes is the total of the first n lines less the total of the first n−1. Asking it
   * about a line on its own would not do, because it draws each delivery down across the lines in
   * order — two lines for the same size would then both claim the same delivery. */
  const lineAmt: Record<string, number> = {};
  let runTotal = 0;
  for (let i = 0; i < onScreen.lines.length; i++) { const t = orderTotal({ ...onScreen, lines: onScreen.lines.slice(0, i + 1) }, byId); lineAmt[onScreen.lines[i].id] = t - runTotal; runTotal = t; }
  const unitOf = (l: { id: string; itemId: string; qty: number }) => (l.qty > 0 ? lineAmt[l.id] / l.qty : byId[l.itemId]?.cost || 0);
  const received = (itemId: string, size: string) => o.receipts.reduce((t, r) => t + r.lines.filter((x) => x.itemId === itemId && x.size === size).reduce((a, x) => a + x.qty, 0), 0);

  /* What the delivery docket gets checked against: the units this order asked for and the units
     that have actually turned up. Both are read off the same lines the total is priced from, so the
     figure above the table can never disagree with the table. */
  const units = onScreen.lines.reduce((t, l) => t + l.qty, 0);
  const got = o.receipts.reduce((t, rc) => t + rc.lines.reduce((n, l) => n + l.qty, 0), 0);
  const total = orderTotal(onScreen, byId);

  const ev: { date: string; what: string; sub: string; photoId?: string | null }[] = [{ date: o.date, what: "Order created", sub: o.replenish ? "Auto-built replenishment draft" : o.source }];
  if (o.status !== "Draft" && o.status !== "Cancelled") ev.push({ date: o.date, what: "Placed with " + onScreen.supplier + (onScreen.ref ? " — ref " + onScreen.ref : ""), sub: "" });
  for (const rc of o.receipts) ev.push({ photoId: rc.photoId, date: rc.date, what: "Delivery received" + (rc.invoice ? " — invoice " + rc.invoice : ""), sub: rc.lines.map((x) => `${label(byId[x.itemId])} ${x.size} ×${x.qty}${x.dest === "pickup" ? " → pickup" : " → shelf"}`).join(", ") + (rc.note ? " · " + rc.note : "") });
  if (o.status === "Cancelled") ev.push({ date: "", what: "Order cancelled", sub: "" });
  const backOrders = s.orders.filter((x) => x.parentId === o.id);
  const parent = o.parentId ? s.orders.find((x) => x.id === o.parentId) : undefined;

  function printPO() {
    const sp = supplierInfo(s, onScreen.supplier);
    const rows = onScreen.lines.map((l) => { const it = byId[l.itemId]; return `<tr><td>${esc(label(it))}</td><td>${esc(it?.sku || "—")}</td><td>${esc(l.size)}</td><td class="r">${l.qty}</td><td class="r">${esc(money(unitOf(l)))}</td><td class="r">${esc(money(lineAmt[l.id]))}</td></tr>`; }).join("");
    const css = ".hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #201e1d;padding-bottom:8px}.hd h1{border:none;padding:0;font-size:20px}.meta2{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin:12px 0;font-size:12px;line-height:1.7}.tot{text-align:right;font-size:16px;font-weight:800;margin-top:10px}.notes{margin-top:14px;font-size:12px;color:#444}";
    const body = `<div class="hd"><h1><span class="sq"></span>Purchase order — ${esc(onScreen.code)}</h1><div style="font-size:12px">${esc(s.settings.facility)} · ${esc(s.settings.location)}</div></div>` +
      `<div class="meta2"><div>Supplier: <b>${esc(onScreen.supplier)}${sp && (sp.contact || sp.phone) ? " · " + esc([sp.contact, sp.phone].filter(Boolean).join(" · ")) : ""}</b></div><div>Date: <b>${esc(fmtDate(onScreen.date || s.today))}</b></div><div>Supplier ref: <b>${esc(onScreen.ref || "—")}</b></div><div>Expected: <b>${esc(onScreen.expected ? fmtDate(onScreen.expected) : "—")}</b></div><div>Account: <b>${esc(sp?.account || "—")}</b> · ${esc(forLabel)}</div><div>Cost centre: <b>${esc(ccCode || "—")}</b></div></div>` +
      `<table><tr><th>Item</th><th>SKU</th><th>Size</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">Total</th></tr>${rows}</table><div class="tot">Total ${esc(money(orderTotal(onScreen, byId)))}</div>` +
      (onScreen.notes ? `<div class="notes">Notes: ${esc(onScreen.notes)}</div>` : "") + `<div class="notes">Ordered by ____________________ &nbsp;&nbsp; Date ____________</div>`;
    openPrintWindow(onScreen.code, body, { page: "size:A4;margin:16mm", css, width: 780, height: 920 });
  }
  function exportCsv() {
    downloadCsv((onScreen.code + (onScreen.ref ? "-" + onScreen.ref.replace(/[^A-Za-z0-9-]+/g, "_") : "")).toLowerCase() + ".csv", `Order,${csvEsc(onScreen.code)}\nSupplier,${csvEsc(onScreen.supplier)}\nRef,${csvEsc(onScreen.ref)}\n\n` + csvOf(["Item", "Supplier code", "SKU", "Size", "Qty", "Unit cost", "Total"], onScreen.lines.map((l) => { const it = byId[l.itemId]; return [label(it), supplierCodeOf(s, key(l.itemId, it ? it.sizes.map(String).indexOf(l.size) : -1)), it?.sku || "", l.size, l.qty, +unitOf(l).toFixed(2), lineAmt[l.id].toFixed(2)]; })));
  }
  async function emailSupplier() {
    setMailMsg("Sending…");
    const r = await mutate<{ sentTo: string }>("order.email", { id: o!.id });
    setMailMsg(r.ok ? `Sent to ${r.result.sentTo}` : r.error);
  }
  async function duplicate() {
    if (!(await flushQty())) return;
    const r = await mutate<{ id: string }>("order.duplicate", { id: o!.id });
    if (!r.ok) { setErr(r.error); return; }
    router.push(`/app/orders/${r.result.id}`);
  }

  return (
    <section>
      <OrdersStyles />
      <PageHead
        title={o.code}
        sub={<>{forLabel} · {onScreen.supplier} · placed {fmtDate(o.date)}{o.replenish ? " · replenishment" : ""}{parent && <> · back order of <Link href={`/app/orders/${parent.id}`} style={{ color: "inherit" }}>{parent.code}</Link></>}</>}
        below={<div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>{overdue && <Tag tone="accent">Overdue</Tag>}<span className={statusTag(o.status)}>{o.status}</span></div>}
      >
        {o.status === "Draft" && isAdmin && <button type="button" className="btn btn-primary" onClick={async () => { if (await flushQty()) act("order.status", { id: o.id, status: "Ordered" }); }} disabled={o.lines.length === 0}>Mark ordered</button>}
        {["Ordered", "Shipped", "Back Order"].includes(o.status) && <button type="button" className="btn btn-primary" onClick={async () => { if (await flushQty()) setRcv(true); }}>Receive delivery</button>}
        {isAdmin && <a className="btn btn-onink" href={`/print/supplier-order?id=${o.id}`} target="_blank" rel="noreferrer" title="The A4 sheet with the supplier's product codes" onClick={() => { void mutate("order.printed", { id: o.id }); }}>Order sheet</a>}
        <MoreMenu tone="ink" items={[
          { label: "Print order", onSelect: printPO },
          { label: "CSV", onSelect: exportCsv },
          { label: "Email supplier", onSelect: emailSupplier, hidden: !(isAdmin && o.status !== "Draft" && o.status !== "Cancelled") },
          { label: "Mark shipped", onSelect: () => { void act("order.status", { id: o.id, status: "Shipped" }); }, hidden: !(isAdmin && ["Ordered", "Back Order"].includes(o.status)) },
          { label: "Duplicate", onSelect: () => { void duplicate(); } },
          { label: "Cancel order", danger: true, hidden: !(isAdmin && ["Draft", "Ordered", "Back Order", "Shipped"].includes(o.status)), onSelect: async () => { if (confirm(`Cancel ${o.code}?`) && await flushQty()) act("order.status", { id: o.id, status: "Cancelled" }); } },
        ]} />
      </PageHead>
      <Crumb href="/app/orders/all" parent="Orders" current={o.code} />
      <LiveRegion tone="alert" className="notice tc-flag" msg={err} style={{ marginBottom: 16, color: "var(--color-accent-700)", fontWeight: 700 }} />
      <LiveRegion msg={mailMsg} className="notice" style={{ marginBottom: 16 }} />
      <Figures items={[
        { value: money(total), label: "Order value", note: <span className="tc-mono">{onScreen.lines.length} line{onScreen.lines.length === 1 ? "" : "s"}</span> },
        { value: `${got} of ${units}`, label: "Units received" },
        { value: onScreen.expected ? fmtDate(onScreen.expected) : "—", label: "Expected", flag: overdue, note: overdue ? <span className="tc-mono">{daysBetween(onScreen.expected, s.today)} day{daysBetween(onScreen.expected, s.today) === 1 ? "" : "s"} overdue</span> : undefined },
      ]} />
      <div className="tc-orders-detail">
        <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
          <Panel title="Order details" aside="Saves as you type">
              <div className="tc-orders-fields">
                {([["ref", "Supplier order no.", "text", "e.g. NW-48211"], ["invoice", "Invoice no.", "text", "e.g. INV-102938"], ["tracking", "Tracking no.", "text", "e.g. 34XY990812"], ["expected", "Expected delivery", "date", ""]] as const).map(([k, lbl, type, ph]) => (
                  <Field key={k} label={lbl}>{(c) => <input {...c} className="input" type={type} placeholder={ph} value={val(k)} onChange={(e) => saveField(k, e.target.value)} />}</Field>
                ))}
                <Field label="Supplier">
                  {(c) => s.settings.suppliers.length ? <select {...c} className="input" value={val("supplier")} onChange={(e) => saveField("supplier", e.target.value)}>{[...new Set([o.supplier, ...s.settings.suppliers])].filter(Boolean).map((x) => <option key={x}>{x}</option>)}</select> : <input {...c} className="input" value={val("supplier")} onChange={(e) => saveField("supplier", e.target.value)} />}
                </Field>
                <Field label="Order for">
                  {(c) => (
                    <select {...c} className="input" value={o.staffId || ""} onChange={(e) => act("order.update", { id: o.id, staffId: e.target.value })}>
                      <option value="">{`Stock (${s.settings.terms.store})`}</option>
                      {s.staff.filter((x) => !x.inactive || x.id === o.staffId).map((x) => <option key={x.id} value={x.id}>{x.first} {x.last} ({x.num})</option>)}
                    </select>
                  )}
                </Field>
                <Field label="Cost centre">
                  {(c) => (
                    <select {...c} className="input" value={val("cc") || (st ? st.dept : "")} onChange={(e) => act("order.update", { id: o.id, cc: e.target.value })}>
                      <option value="">— none —</option>
                      {s.depts.map((d) => <option key={d.id} value={d.name}>{d.name}{d.cc ? ` (${d.cc})` : ""}</option>)}
                      {o.cc && !s.depts.find((d) => d.name === o.cc) && <option value={o.cc}>{o.cc}{ccFor(s, o.cc) ? "" : " (code)"}</option>}
                    </select>
                  )}
                </Field>
                {ccNote && <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--color-neutral-700)", borderLeft: "4px solid var(--color-text)", paddingLeft: "var(--space-2)" }}>{ccNote}</div>}
                <Field label="Notes" style={{ gridColumn: "1 / -1" }}>{(c) => <input {...c} className="input" placeholder="e.g. rang the supplier re back order 12/8" value={val("notes")} onChange={(e) => saveField("notes", e.target.value)} />}</Field>
              </div>
          </Panel>
          <div>
          <Panel title="Lines" aside={<span className="tc-mono">{units} unit{units === 1 ? "" : "s"} ordered</span>}
            foot={<><span className="tc-lbl">Total</span><span className="tc-mono" style={{ marginLeft: "auto", fontSize: 18, fontWeight: 600 }}>{money(total)}</span></>}>
            <div>
              {onScreen.lines.map((l) => {
                const it = byId[l.itemId]; const rec = received(l.itemId, l.size); const cKey = l.id;
                const catCost = it ? it.cost : 0;
                // What this line is actually worth per unit once a delivery has been invoiced.
                const unit = unitOf(l);
                return (
                  <div key={l.id} className="tc-orders-row" style={{ fontSize: 13 }}>
                    <div className="tc-orders-rowmain" style={{ minWidth: 150 }}>
                      <div style={{ fontWeight: 600 }}>{label(it)} · <span className="tc-mono">{l.size}</span></div>
                      <div className="tc-orders-rowmeta">{supplierCodeOf(s, key(l.itemId, it ? it.sizes.map(String).indexOf(l.size) : -1)) && <span className="tc-mono">{supplierCodeOf(s, key(l.itemId, it ? it.sizes.map(String).indexOf(l.size) : -1))}</span>}{rec ? <> · received <span className="tc-mono">{rec}</span></> : ""}{Math.abs(unit - catCost) > 0.004 && <span title={`Delivered units are priced at what the invoice charged: ${money(unit)} a unit across this line`}> · invoice price</span>}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flex: "none" }}>
                      {o.status === "Draft"
                        ? <QtyStepper size="sm" min={1} value={l.qty} label={`${label(it)} size ${l.size}`} onChange={(n) => bumpQty(l.id, l.qty, n - l.qty)} />
                        : <span className="tc-mono" style={{ fontWeight: 600 }}>×{l.qty}</span>}
                      <span className="tc-mono">@ $</span>
                      <input className="input tc-mono" style={{ minHeight: 28, padding: "2px 8px", width: 70, textAlign: "right" }} inputMode="decimal" aria-label={`Unit cost of ${label(it)} size ${l.size}`} title={isAdmin ? "Editing a price updates that item's catalogue cost everywhere." : "Prices are set by an admin."} disabled={!isAdmin} value={priceDraft[cKey] !== undefined ? priceDraft[cKey] : String(catCost)}
                        onChange={(e) => setPriceDraft({ ...priceDraft, [cKey]: e.target.value.replace(/[^0-9.]/g, "") })}
                        onBlur={async () => { const v = parseFloat(priceDraft[cKey]); if (!isNaN(v) && v >= 0 && Math.abs(v - catCost) > 0.004 && it) { await act("catalog.update", { id: it.id, cost: v }); } const d = { ...priceDraft }; delete d[cKey]; setPriceDraft(d); }} />
                      {o.status === "Draft" && o.lines.length > 1 && <button type="button" className="btn btn-ghost" style={{ minHeight: 26, padding: "0 4px" }} aria-label={`Remove ${label(it)} size ${l.size} from this order`} title="Remove" onClick={() => removeLine(l.id)}>×</button>}
                    </div>
                    <div className="tc-mono" style={{ minWidth: 86, textAlign: "right", fontWeight: 500 }}>{money(l.qty * unit)}</div>
                  </div>
                );
              })}
            </div>
            {o.status === "Draft" && (
              <div className="tc-orders-add">
                <span className="tc-lbl" style={{ alignSelf: "center" }}>Add a line</span>
                <ItemSizePicker s={s} itemId={pick} onItem={setPick} placeholder="Choose an item…" maxWidth={280} onSize={async (it, si) => { if (await flushQty()) act("order.lineAdd", { id: o.id, itemId: it.id, size: it.sizes[si], qty: 1 }); }} />
              </div>
            )}
          </Panel>
          {backOrders.length > 0 && <div className="tc-orders-rowmeta" style={{ marginTop: 8 }}>Back order{backOrders.length > 1 ? "s" : ""}: {backOrders.map((b) => <Link key={b.id} href={`/app/orders/${b.id}`} className="tc-mono" style={{ marginRight: 8 }}>{b.code}</Link>)}</div>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
          <Panel title="History">
              {ev.map((e, i) => (
                <div key={i} className="tc-orders-row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                  <div className="tc-mono" style={{ minWidth: 92, flex: "none", paddingTop: 1, fontSize: 12, color: "#57534f" }}>{e.date ? fmtDate(e.date) : "—"}</div>
                  <div className="tc-orders-rowmain">
                    <div style={{ fontWeight: 600 }}>{e.what}{e.photoId && <button type="button" className="btn btn-ghost" style={{ minHeight: 22, padding: "0 6px", marginLeft: 8 }} onClick={() => viewPhoto(e.photoId!)}>Invoice photo</button>}</div>
                    {e.sub && <div className="tc-orders-rowmeta">{e.sub}</div>}
                  </div>
                </div>
              ))}
          </Panel>
          {st && (
            <Panel title="Staff member">
              <div style={{ fontSize: 13, lineHeight: 1.7, padding: "12px 16px" }}>
                <div style={{ fontWeight: 600 }}><Link href={`/app/staff/${st.id}`} className="link-name">{staffName(st)}</Link> <span className="tc-mono" style={{ fontWeight: 400, color: "var(--color-neutral-700)" }}>{st.num}</span></div>
                <div>{st.dept} · {st.phone || "no phone"}</div>
              </div>
            </Panel>
          )}
        </div>
      </div>
      {rcv && <ReceiveDialog order={onScreen} onClose={() => { setRcv(false); router.refresh(); }} />}
    </section>
  );
}
