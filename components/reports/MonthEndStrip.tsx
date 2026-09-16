"use client";
/* The four month-end steps across the top of Reports. Every state comes from monthEnd() in
 * lib/portalcounts.ts, so Today's checklist and this strip agree. */
import Link from "next/link";
import { useDerived, useSnap } from "@/lib/client";
import { monthEnd } from "@/lib/portalcounts";
import { Icon } from "@/components/portal";
import { shortDate } from "./bits";

const cell: React.CSSProperties = { background: "var(--color-bg)", padding: "14px 18px", minWidth: 0 };
const state: React.CSSProperties = { marginTop: 6, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const inline: React.CSSProperties = { minHeight: 0, padding: 0 };

export default function MonthEndStrip({ month, onJournal, onPrint }: { month: string; onJournal: () => void; onPrint: () => void }) {
  const { s } = useSnap();
  const { L, byId, staffById } = useDerived();
  const me = monthEnd(s, L, byId, staffById, month);

  return (
    <section className="tc-rep-strip" aria-label="Month-end steps">
      <div style={cell}>
        <div className="tc-lbl">1 · Deliveries booked in</div>
        {me.deliveriesOverdue > 0
          ? <div style={{ ...state, color: "var(--color-accent-700)" }}><Icon name="alert" size={16} /><Link href="/app/orders/all" style={{ color: "inherit" }}>{me.deliveriesOverdue} overdue</Link></div>
          : <div style={state}><Icon name="check" size={16} />All in</div>}
      </div>
      <div style={cell}>
        <div className="tc-lbl">2 · Stock take filed</div>
        {me.stocktakeFiled
          ? <div style={state}>Filed <span className="tc-mono">{shortDate(me.stocktakeFiled.date)}</span></div>
          : <div style={state}><span>Not yet ·</span><Link href="/app/stock?tab=count" className="btn btn-ghost" style={inline}>Start</Link></div>}
      </div>
      <div style={cell}>
        <div className="tc-lbl">3 · Journal</div>
        {!me.stocktakeFiled
          ? <div style={{ ...state, color: "#6c6764" }}>Ready after the count</div>
          : me.unallocated > 0
            ? <div style={state}><button type="button" className="btn btn-ghost" style={{ ...inline, color: "var(--color-accent-700)" }} onClick={onJournal}><span className="tc-mono">{me.unallocated}</span>&nbsp;unallocated</button></div>
            : <div style={state}><Icon name="check" size={16} />Ready</div>}
      </div>
      <button type="button" className="tc-rep-pack" aria-label="Print the month-end pack" onClick={onPrint}
        style={{ ...cell, background: "#201e1d", color: "#f3f2f2", border: 0, textAlign: "left", font: "inherit", cursor: "pointer" }}>
        <div className="tc-lbl" style={{ color: "#b5b1af" }}>4 · Month-end pack</div>
        <div style={state}>PDF + journal CSV + valuation</div>
      </button>
    </section>
  );
}
