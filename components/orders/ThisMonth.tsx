"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { Panel } from "@/components/portal";
import { money, monthLabel, orderTotal } from "@/lib/compute";
import { plural } from "./bits";

/* Placed uses the Reports rule (dated this month, placed, not a back order); Received is by receipt month. */
export default function ThisMonth() {
  const { s } = useSnap();
  const { byId } = useDerived();
  const month = s.today.slice(0, 7);
  const f = useMemo(() => {
    const placed = s.orders.filter((o) => o.date.slice(0, 7) === month && o.status !== "Draft" && o.status !== "Cancelled" && !o.parentId);
    const received = s.orders.filter((o) => o.status === "Received" && (o.received || "").slice(0, 7) === month);
    const sum = (xs: typeof placed) => xs.reduce((t, o) => t + orderTotal(o, byId), 0);
    return { placed: placed.length, placedVal: sum(placed), received: received.length, receivedVal: sum(received) };
  }, [s.orders, byId, month]);

  return (
    <Panel title="This month" aside={monthLabel(month, { month: "long" })}>
      <div className="tc-orders-row"><span style={{ flex: 1 }}>Placed</span><span className="tc-mono">{plural(f.placed, "order")} · {money(f.placedVal)}</span></div>
      <div className="tc-orders-row"><span style={{ flex: 1 }}>Received</span><span className="tc-mono">{plural(f.received, "order")} · {money(f.receivedVal)}</span></div>
      <div className="tc-orders-row">
        <span className="tc-orders-rowmeta" style={{ flex: 1, marginTop: 0 }}>All orders, drafts and history</span>
        <Link href="/app/orders/all" className="btn btn-ghost" style={{ minHeight: 0 }}>Open the ledger</Link>
      </div>
    </Panel>
  );
}
