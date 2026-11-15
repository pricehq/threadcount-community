"use client";
import { Figures, Panel } from "@/components/portal";
import { fmtDate, money, signedInt, signedMoney } from "@/lib/compute";
import { HeadActions, PanelEmpty, TableWrap, TOTAL, plural } from "./bits";
import type { ReportData } from "./useReportData";

export default function StockTab({ d }: { d: ReportData }) {
  const { R, mLbl, csv, print } = d;
  return (
    <div className="tc-rep-stack">
      <Panel title="Valuation" flag={R.negSizes > 0}
        aside={<HeadActions name="the stock valuation" aside={R.negSizes > 0 ? `${plural(R.negSizes, "size")} negative on hand` : "today, at catalogue cost"} onCsv={csv.valuation} onPrint={print.valuation} />}
        foot={R.negSizes > 0 ? <span className="tc-meta-line" style={{ color: "var(--color-accent-700)", fontWeight: 600 }}><span className="tc-mark" aria-hidden="true" />Negative sizes count as 0</span> : undefined}>
        {R.valRows.length === 0 ? <PanelEmpty>Nothing on hand.</PanelEmpty> : (
          <TableWrap>
            <thead><tr><th>Item</th><th>SKU</th><th>Supplier</th><th className="num">Units on hand</th><th className="num">Unit cost</th><th className="num">Value</th></tr></thead>
            <tbody>
              {R.valRows.map((r, i) => <tr key={i}><td>{r.item}</td><td className="tc-mono">{r.sku}</td><td>{r.supplier}</td><td className="num">{r.units}</td><td className="num">{money(r.cost)}</td><td className="num" style={{ fontWeight: 600 }}>{money(r.val)}</td></tr>)}
              <tr><td style={TOTAL}>TOTAL</td><td></td><td></td><td className="num" style={TOTAL}>{R.valTotUnits}</td><td></td><td className="num" style={TOTAL}>{money(R.valTot)}</td></tr>
            </tbody>
          </TableWrap>
        )}
      </Panel>

      <Panel title="Shrinkage" aside={<HeadActions name="shrinkage" aside={`FY to the end of ${mLbl}`} onCsv={csv.shrinkage} onPrint={print.shrinkage} />}>
        <div style={{ padding: 16 }}>
          <Figures items={[
            { value: R.shRows.length, label: "Stocktakes this FY" },
            { value: signedInt(R.shU), label: "Net variance, units", flag: R.shV < 0 },
            { value: signedMoney(R.shV), label: "Net value", flag: R.shV < 0 },
          ]} />
        </div>
        {R.shRows.length === 0 ? <PanelEmpty>No stocktakes filed this financial year.</PanelEmpty> : (
          <TableWrap>
            <thead><tr><th>Date</th><th>Counted by</th><th className="num">Lines counted</th><th className="num">Variances</th><th className="num">Net units</th><th className="num">Net value</th></tr></thead>
            <tbody>{R.shRows.map((r, i) => <tr key={i}><td className="tc-mono">{fmtDate(r.date)}</td><td>{r.by}</td><td className="num">{r.counted}</td><td className="num">{r.variances}</td><td className="num">{signedInt(r.net)}</td><td className="num" style={{ fontWeight: 600 }}>{signedMoney(r.netVal)}</td></tr>)}</tbody>
          </TableWrap>
        )}
      </Panel>

      <Panel title="Top stock" aside={<HeadActions name="top stock" aside={mLbl} onCsv={csv.topStock} onPrint={print.topStock} />}>
        {R.topRows.length === 0 ? <PanelEmpty>Nothing issued in {mLbl}.</PanelEmpty> : (
          <TableWrap>
            <thead><tr><th>#</th><th>Item</th><th>Supplier</th><th className="num">Qty (month)</th><th className="num">Value (month)</th><th className="num">Share</th><th className="num">Qty (FY)</th></tr></thead>
            <tbody>{R.topRows.map((r) => <tr key={r.n}><td className="tc-mono" style={{ color: "var(--color-neutral-700)" }}>{r.n}</td><td>{r.item}</td><td>{r.supplier}</td><td className="num" style={{ fontWeight: 600 }}>{r.qty}</td><td className="num">{money(r.val)}</td><td className="num">{r.share}</td><td className="num">{r.fyQty}</td></tr>)}</tbody>
          </TableWrap>
        )}
      </Panel>

      <Panel title="Supplier spend" aside={<HeadActions name="supplier spend" aside={mLbl} onCsv={csv.suppliers} onPrint={print.suppliers} />}>
        {R.supRows.length === 0 ? <PanelEmpty>No supplier orders placed in {mLbl}.</PanelEmpty> : (
          <TableWrap>
            <thead><tr><th>Supplier</th><th className="num">Orders</th><th className="num">Value</th><th>Invoices</th></tr></thead>
            <tbody>{R.supRows.map((r) => <tr key={r.name}><td>{r.name}</td><td className="num">{r.n}</td><td className="num" style={{ fontWeight: 600 }}>{money(r.amt)}</td><td className="tc-mono">{r.invoices}</td></tr>)}</tbody>
          </TableWrap>
        )}
      </Panel>
    </div>
  );
}
