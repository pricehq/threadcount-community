"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { Panel } from "@/components/portal";
import { money, orderTotal, staffName, statusTag } from "@/lib/compute";
import { shortDate } from "./bits";

/* An issuer's left column: raising orders from the list is an admin task, so they see the latest ten. */
export default function RecentOrders() {
  const { s } = useSnap();
  const { byId, staffById } = useDerived();
  const rows = useMemo(() => [...s.orders].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 10), [s.orders]);
  return (
    <Panel title="Recent orders" foot={<Link href="/app/orders/all" className="btn btn-ghost">Open the ledger</Link>}>
      {rows.length === 0 && <div className="tc-orders-row"><span className="tc-orders-rowmeta">No orders yet.</span></div>}
      {rows.map((o) => (
        <Link key={o.id} href={`/app/orders/${o.id}`} className="tc-orders-row">
          <div className="tc-orders-rowmain">
            <div className="tc-orders-rowtitle">{o.code}</div>
            <div className="tc-orders-rowmeta">{o.staffId ? `For ${staffName(staffById[o.staffId], "staff member")}` : "For stock"} · {o.supplier} · {shortDate(o.date)}</div>
          </div>
          <span className={statusTag(o.status)}>{o.status}</span>
          <span className="tc-mono">{money(orderTotal(o, byId))}</span>
        </Link>
      ))}
    </Panel>
  );
}
