"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { Field, PageHead } from "@/components/ui";
import { Panel, Seg, SelectButton, Tag } from "@/components/portal";
import { ccOfOrder, csvOf, daysBetween, fmtDate, isOverdue, isPlacedOpen, label, money, orderTotal, staffName, statusTag } from "@/lib/compute";
import { downloadCsv } from "@/lib/print";
import { Crumb, NewOrder, OrdersStyles, shortDate } from "@/components/orders/bits";

const STATUSES = ["All", "Draft", "Open", "Received"] as const;

/* Every order: the filters, the status segment and the CSV that used to sit on the Ordering screen. */
export default function OrderLedgerPage() {
  const { s } = useSnap();
  const { byId, staffById } = useDerived();
  const [dlg, setDlg] = useState(false);
  const [q, setQ] = useState("");
  const [sup, setSup] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [item, setItem] = useState("");

  const supOpts = useMemo(() => [{ value: "", label: "All suppliers" }, ...[...new Set(s.orders.map((o) => o.supplier).filter(Boolean))].sort().map((x) => ({ value: x, label: x }))], [s.orders]);
  const itemOpts = useMemo(() => {
    const ids = new Set<string>();
    for (const o of s.orders) for (const l of o.lines) ids.add(l.itemId);
    return [{ value: "", label: "All garments" }, ...[...ids].map((id) => byId[id]).filter(Boolean).sort((a, b) => label(a).localeCompare(label(b))).map((it) => ({ value: it.id, label: label(it) }))];
  }, [s.orders, byId]);

  const rank = (o: (typeof s.orders)[number]) => (o.status === "Draft" ? 0 : isPlacedOpen(o) ? 1 : o.status === "Received" ? 2 : 3);
  const ql = q.trim().toLowerCase();
  const orders = s.orders.filter((o) => {
    if (sup && o.supplier !== sup) return false;
    if (status === "Draft" && o.status !== "Draft") return false;
    if (status === "Open" && !isPlacedOpen(o)) return false;
    if (status === "Received" && o.status !== "Received") return false;
    if (from && o.date < from) return false;
    if (to && o.date > to) return false;
    if (item && !o.lines.some((l) => l.itemId === item)) return false;
    if (ql) {
      const st = o.staffId ? staffById[o.staffId] : undefined;
      const hay = `${o.code} ${o.ref} ${o.invoice} ${o.tracking} ${o.supplier} ${staffName(st)} ${o.lines.map((l) => label(byId[l.itemId])).join(" ")}`.toLowerCase();
      if (!hay.includes(ql)) return false;
    }
    return true;
  }).sort((a, b) => rank(a) - rank(b) || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const narrowed = ql !== "" || sup !== "" || status !== "All" || from !== "" || to !== "" || item !== "";

  /* The rows on screen, filters applied. Value is orderTotal() so the file agrees with the screen and
     Reports; dates stay ISO so a spreadsheet sorts them; notes stay out. */
  function exportCsv() {
    const cols = ["Order no.", "Status", "Ordered", "Supplier", "Ordered for", "Staff member", "Supplier ref", "Invoice", "Tracking", "Cost centre", "Replenishment", "Expected", "Days overdue", "Received", "Lines", "Units ordered", "Units received", "Value"];
    downloadCsv(`threadcount-orders-${s.today}.csv`, csvOf(cols, orders.map((o) => {
      const st = o.staffId ? staffById[o.staffId] : undefined;
      const units = o.lines.reduce((t, l) => t + l.qty, 0);
      const got = o.receipts.reduce((t, rc) => t + rc.lines.reduce((n, l) => n + l.qty, 0), 0);
      return [o.code, o.status, o.date, o.supplier, o.orderFor === "Stock" ? "Stock" : "Staff member", staffName(st), o.ref, o.invoice, o.tracking, ccOfOrder(s, o, staffById), o.replenish ? "Yes" : "No", o.expected, isOverdue(o, s.today) ? daysBetween(o.expected, s.today) : "", o.received, o.lines.length, units, got, +orderTotal(o, byId).toFixed(2)];
    })));
  }

  return (
    <section>
      <OrdersStyles />
      <PageHead title="All orders" sub={<span className="tc-mono">{orders.length} of {s.orders.length}</span>}>
        <button type="button" className="btn btn-onink" onClick={exportCsv} disabled={orders.length === 0}>{narrowed ? `Export CSV (${orders.length} shown)` : "Export CSV"}</button>
        <button type="button" className="btn btn-primary" onClick={() => setDlg(true)}>New order</button>
      </PageHead>
      <Crumb href="/app/orders" parent="Orders" current="All orders" />
      <div className="tc-orders-filters">
        <input className="input" style={{ width: 240 }} aria-label="Search orders by number, reference or invoice" placeholder="Order no., ref, invoice" value={q} onChange={(e) => setQ(e.target.value)} />
        <SelectButton label="Supplier" value={sup} options={supOpts} onChange={setSup} anyValue="" />
        <SelectButton label="Garment" value={item} options={itemOpts} onChange={setItem} anyValue="" />
        <Field label="From">{(c) => <input {...c} className="input" style={{ width: 150 }} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="To">{(c) => <input {...c} className="input" style={{ width: 150 }} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        <Seg label="Status" opts={STATUSES} value={status} onChange={setStatus} />
      </div>
      <Panel title="Orders" aside={`${orders.length} shown`}>
        {orders.length === 0 && <div className="tc-orders-row"><span className="tc-orders-rowmeta">{s.orders.length === 0 ? "No orders yet." : "No orders match."}</span></div>}
        {orders.map((o) => {
          const st = o.staffId ? staffById[o.staffId] : undefined;
          const overdue = isOverdue(o, s.today);
          const late = overdue ? daysBetween(o.expected, s.today) : 0;
          const due = overdue
            ? late === 1 ? "due yesterday" : `${late} days overdue`
            : isPlacedOpen(o) && o.expected ? (o.expected === s.today ? "due today" : `due ${shortDate(o.expected)}`) : "";
          return (
            <Link key={o.id} href={`/app/orders/${o.id}`} className={"tc-orders-row" + (overdue ? " urgent" : "")}>
              <div className="tc-orders-rowmain" style={{ minWidth: 200 }}>
                <div className="tc-orders-rowtitle">{o.code}</div>
                <div className="tc-orders-rowmeta" title={fmtDate(o.date)}>
                  {o.orderFor === "Stock" ? "For stock" : "For " + staffName(st, "staff member")} · {o.supplier} · {shortDate(o.date)}{o.ref ? " · ref " + o.ref : ""}
                  {due && <> · <span style={{ color: "var(--color-accent-700)", fontWeight: 600 }}>{due}</span></>}
                </div>
              </div>
              {o.replenish && <Tag>Replenishment</Tag>}
              {overdue && <Tag tone="accent">Overdue</Tag>}
              <span className={statusTag(o.status)}>{o.status}</span>
              <span className="tc-mono" style={{ minWidth: 90, textAlign: "right", fontWeight: 500 }}>{money(orderTotal(o, byId))}</span>
              <span aria-hidden="true" style={{ fontSize: 12, color: "#6c6764" }}>→</span>
            </Link>
          );
        })}
      </Panel>
      {dlg && <NewOrder onClose={() => setDlg(false)} />}
    </section>
  );
}
