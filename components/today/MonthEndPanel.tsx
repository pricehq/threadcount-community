"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { Panel } from "@/components/portal";
import { monthEndView } from "@/lib/today";

const ACCENT = "var(--color-accent-700)";
type Box = "open" | "flag" | "done" | "wait";

function Row({ box, first, children, state }: { box: Box; first?: boolean; children: React.ReactNode; state: React.ReactNode }) {
  const border = box === "flag" ? "#ec3013" : box === "wait" ? "#b5b1af" : "#201e1d";
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 16px", borderTop: first ? 0 : "1px solid #cfcccb" }}>
      <span aria-hidden="true" style={{ width: 16, height: 16, flex: "none", boxSizing: "border-box", border: `2px solid ${border}`, background: box === "done" ? "#201e1d" : "transparent" }} />
      <span style={{ flex: 1, minWidth: 0, color: box === "wait" ? "#6c6764" : undefined }}>{children}</span>
      <span className="tc-meta-line" style={{ flex: "none" }}>{state}</span>
    </li>
  );
}

export default function MonthEndPanel() {
  const { s } = useSnap();
  const { L, byId, staffById } = useDerived();
  const m = useMemo(() => monthEndView(s, L, byId, staffById), [s, L, byId, staffById]);

  return (
    <Panel
      id="month-end"
      title={`Month-end · ${m.monthName}`}
      aside={<span className="tc-mono">{m.daysLeft} day{m.daysLeft === 1 ? "" : "s"} left</span>}
      foot={<Link href="/app/report" className="btn btn-ghost" style={{ marginLeft: "auto" }}>Month-end pack</Link>}
    >
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        <Row first box={m.deliveriesOverdue > 0 ? "flag" : "done"}
          state={m.deliveriesOverdue > 0 ? <span style={{ color: ACCENT }}>{m.deliveriesOverdue} overdue</span> : "done"}>
          Deliveries booked in
        </Row>
        <Row box={m.stocktakeFiled ? "done" : "open"} state={m.stocktakeFiled ? m.stocktakeDate : "not yet"}>
          {m.stocktakeFiled ? "Stock take filed" : <Link href="/app/stock?tab=count" style={{ color: "inherit" }}>Stock take filed</Link>}
        </Row>
        {m.unsignedReceipts > 0 && (
          <Row box="open" state={<Link href="/app/staff?filter=unsigned" className="btn btn-ghost" style={{ minHeight: 0, padding: 0 }} aria-label={`Chase ${m.unsignedReceipts} unsigned receipts`}>Chase</Link>}>
            {m.unsignedReceipts} receipt{m.unsignedReceipts === 1 ? "" : "s"} to sign
          </Row>
        )}
        <Row box={m.journalReady ? "done" : m.stocktakeFiled ? "open" : "wait"}
          state={m.journalReady ? "ready"
            : m.unallocated > 0 ? <Link href="/app/report" style={{ color: ACCENT }}>{m.unallocated} unallocated</Link>
            : "after the count"}>
          Journal ready
        </Row>
      </ul>
    </Panel>
  );
}
