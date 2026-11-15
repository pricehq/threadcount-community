"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { Panel, Tag } from "@/components/portal";
import { ReceiveDialog } from "@/components/dialogs";
import { daysBetween, isOverdue, isPlacedOpen, label, staffName, type OrderRec } from "@/lib/compute";
import { plural, shortDate } from "./bits";

/* Placed orders still open: overdue first (most days late first), then by expected date, then undated. */
export default function OnTheWay() {
  const { s } = useSnap();
  const { byId, staffById } = useDerived();
  const [rcv, setRcv] = useState<OrderRec | null>(null);
  const rows = useMemo(() => s.orders.filter(isPlacedOpen).map((o) => ({ o, late: isOverdue(o, s.today) ? daysBetween(o.expected, s.today) : 0 })).sort((a, b) => {
    if ((a.late > 0) !== (b.late > 0)) return a.late > 0 ? -1 : 1;
    if (a.late !== b.late) return b.late - a.late;
    if (!a.o.expected !== !b.o.expected) return a.o.expected ? -1 : 1;
    return a.o.expected.localeCompare(b.o.expected);
  }), [s.orders, s.today]);

  return (
    <Panel title="On the way" aside={plural(rows.length, "order")}>
      {rows.length === 0 && <div className="tc-orders-row"><span className="tc-orders-rowmeta">Nothing on the way.</span></div>}
      {rows.map(({ o, late }) => {
        const st = o.staffId ? staffById[o.staffId] : undefined;
        const what = o.lines.length === 1 ? `${label(byId[o.lines[0].itemId])} ×${o.lines[0].qty}` : plural(o.lines.length, "line");
        const sup = (o.supplier || "No supplier").split(/\s+/)[0];
        return (
          <div key={o.id} className={"tc-orders-row" + (late > 0 ? " urgent" : "")} style={{ flexWrap: "nowrap" }}>
            <div className="tc-orders-rowmain">
              <div className="tc-orders-rowtitle">
                <Link href={`/app/orders/${o.id}`} style={{ color: "inherit" }}>{o.code}</Link>
                {late > 0 ? <Tag tone="accent">{late === 1 ? "1 day late" : `${late} days late`}</Tag> : o.staffId ? <Tag>staff</Tag> : null}
                {(o.status === "Shipped" || o.status === "Back Order") && <Tag tone="quiet">{o.status}</Tag>}
              </div>
              <div className="tc-orders-rowmeta">
                {sup} · {what} · {o.expected ? `expected ${shortDate(o.expected)}` : "no date"}{st ? ` · for ${staffName(st)}` : ""}
              </div>
            </div>
            <button type="button" className={"btn " + (late > 0 ? "btn-primary" : "btn-ghost")} onClick={() => setRcv(o)} aria-label={`Receive ${o.code}`}>Receive</button>
          </div>
        );
      })}
      {rcv && <ReceiveDialog order={rcv} onClose={() => setRcv(null)} />}
    </Panel>
  );
}
