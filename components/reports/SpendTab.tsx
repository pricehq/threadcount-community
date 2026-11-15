"use client";
import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui";
import { Bar, Figures, Panel } from "@/components/portal";
import { csvEsc, csvOf, fmtDate, money, monthLabel, prevMonth } from "@/lib/compute";
import { downloadCsv } from "@/lib/print";
import { HeadActions, PanelEmpty, TableWrap, TOTAL, plural } from "./bits";
import type { ReportData } from "./useReportData";

export const JOURNAL_ID = "tc-rep-journal";

export default function SpendTab({ d, onMonth }: { d: ReportData; onMonth: (m: string) => void }) {
  const { R, month, mLbl, csv, print, jnTotItems, jnTot } = d;
  // Only the keys are held: the lines are recounted from the snapshot on every render, so the
  // dialog still agrees with the row that opened it if stock moves while it is open.
  const [drill, setDrill] = useState<{ cc: string; dept: string; keys: string[] } | null>(null);
  const drillRows = useMemo(() => (drill ? drill.keys.flatMap((k) => R.ccLines[k] || []).sort((a, b) => a.date.localeCompare(b.date) || a.who.localeCompare(b.who) || a.item.localeCompare(b.item)) : []), [drill, R]);
  const drillQty = drillRows.reduce((t, r) => t + r.qty, 0), drillAmt = drillRows.reduce((t, r) => t + r.amt, 0);
  const csvDrill = () => drill && downloadCsv(`threadcount-cost-centre-${drill.cc.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}-${month}.csv`, `Issues behind cost centre,${csvEsc(drill.cc)},${month}\n\n` + csvOf(["Date", "Staff", "Item", "Size", "Qty", "Unit cost", "Value"], [...drillRows.map((r) => [r.date, r.who, r.item, r.size, r.qty, r.unit.toFixed(2), r.amt.toFixed(2)] as (string | number)[]), ["TOTAL", "", "", "", drillQty, "", drillAmt.toFixed(2)]]));

  const open = (cc: string, dept: string, keys: string[]) => setDrill({ cc: cc === "—" ? "UNALLOCATED" : cc, dept, keys });
  const drillBtn = (cc: string, dept: string, keys: string[], items: number, amt: number) => {
    const name = cc === "—" ? "UNALLOCATED" : cc;
    return (
      <button type="button" className="tc-rep-drill tc-mono" aria-haspopup="dialog" aria-label={`Show the ${plural(items, "item")} issued behind ${name}, ${money(amt)} in ${mLbl}`}
        onClick={(e) => { e.stopPropagation(); open(cc, dept, keys); }}>{cc}</button>
    );
  };

  const pm = prevMonth(month);
  const pct = R.totPrev > 0 ? Math.round(((R.totAmt - R.totPrev) / R.totPrev) * 100) : null;
  const pctText = pct === null ? "—" : (pct > 0 ? "+" : pct < 0 ? "−" : "") + Math.abs(pct) + "%";
  const ccShown = R.ccRows.filter((r) => r.items > 0 || r.amt > 0);
  const ccMax = Math.max(0, ...ccShown.map((r) => r.amt));
  const monthOnly = monthLabel(month, { month: "long" });

  return (
    <div className="tc-rep-stack">
      <Figures items={[
        { value: money(R.totAmt), label: "Issued value", note: <>vs {monthLabel(pm, { month: "long" })} <span className="tc-mono">{pctText}</span></> },
        { value: R.totItems + R.plQty, label: "Garments issued", note: <><span className="tc-mono">{R.plQty}</span> of them pre-loved</> },
        { value: money(R.ordSpend), label: "Ordered from suppliers", note: <><span className="tc-mono">{R.ordCount}</span> order{R.ordCount === 1 ? "" : "s"}</> },
      ]} />

      <div className="tc-grid tc-rep-grid">
        <Panel title="By cost centre" aside={<HeadActions name="issued value by cost centre" aside="click a row for the lines" onCsv={csv.costCentres} onPrint={print.costCentres} />}>
          {ccShown.length === 0 ? <PanelEmpty>No issues recorded in {mLbl}.</PanelEmpty> : (
            <TableWrap>
              <thead><tr><th>Cost centre</th><th>{d.teamHead}</th><th style={{ width: "34%" }}><span className="sr-only">Share of the largest</span></th><th className="num">Items</th><th className="num">Value</th></tr></thead>
              <tbody>
                {ccShown.map((r) => (
                  <tr key={r.key} onClick={() => open(r.cc, r.dept, [r.key])} style={{ cursor: "pointer" }}>
                    <td>{drillBtn(r.cc, r.dept, [r.key], r.items, r.amt)}</td>
                    <td>{r.dept}</td>
                    <td><Bar value={r.amt} max={ccMax} label={`${money(r.amt)} of ${money(ccMax)}`} /></td>
                    <td className="num">{r.items}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{money(r.amt)}</td>
                  </tr>
                ))}
                <tr><td style={TOTAL}>TOTAL</td><td></td><td></td><td className="num" style={TOTAL}>{R.totItems}</td><td className="num" style={TOTAL}>{money(R.totAmt)}</td></tr>
              </tbody>
            </TableWrap>
          )}
        </Panel>

        <Panel title="By staff group" aside={monthOnly}>
          {R.groupRows.length === 0 ? <PanelEmpty>Nothing issued in {mLbl}.</PanelEmpty> : (
            <TableWrap>
              <thead><tr><th>Group</th><th className="num">People</th><th className="num">Value</th></tr></thead>
              <tbody>{R.groupRows.map((g) => <tr key={g.g}><td>{g.g}</td><td className="num">{g.people}</td><td className="num">{money(g.amt)}</td></tr>)}</tbody>
            </TableWrap>
          )}
        </Panel>
      </div>

      <div className="tc-grid tc-rep-grid">
        <Panel title="By staff member" aside={<HeadActions name="issued value by staff member" onCsv={csv.staff} onPrint={print.staff} />}>
          {R.staffRows.length === 0 ? <PanelEmpty>Nothing issued in {mLbl}.</PanelEmpty> : (
            <TableWrap>
              <thead><tr><th>Staff</th><th>Cost centre</th><th className="num">Items</th><th className="num">Value</th></tr></thead>
              <tbody>{R.staffRows.map((r, i) => <tr key={i}><td>{r.who}</td><td className="tc-mono">{r.cc || "—"}</td><td className="num">{r.items}</td><td className="num" style={{ fontWeight: 600 }}>{money(r.amt)}</td></tr>)}</tbody>
            </TableWrap>
          )}
        </Panel>

        <Panel title="Issued value · last 6 months">
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140, padding: "12px 16px" }}>
            {R.trend.map((b) => (
              <button type="button" key={b.m} className="tc-rep-trend" aria-label={`Show ${monthLabel(b.m)}, ${money(b.amt)} issued`} aria-pressed={b.sel} onClick={() => onMonth(b.m)}>
                <span className="tc-mono" style={{ fontSize: 10, color: "var(--color-neutral-700)", whiteSpace: "nowrap", overflow: "hidden" }}>{b.amt ? money(b.amt) : ""}</span>
                <span aria-hidden="true" style={{ display: "block", width: "100%", height: b.h, background: b.sel ? "var(--color-accent-600)" : "#201e1d" }} />
                <span className="tc-lbl" style={{ fontSize: 10 }}>{b.label}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <Panel id={JOURNAL_ID} title="Journal" flag={R.jnUnallocated}
        aside={<HeadActions name="the journal" aside={<>GL <span className="tc-mono">{R.glAcct}</span></>} onCsv={csv.journal} csvText="Export journal CSV" csvSecondary onPrint={print.journal} />}
        foot={R.jnUnallocated ? <span className="tc-meta-line" style={{ color: "var(--color-accent-700)", fontWeight: 600 }}><span className="tc-mark" aria-hidden="true" />UNALLOCATED = no cost centre</span> : undefined}>
        {R.jnRows.length === 0 ? <PanelEmpty>No issues to journal in {mLbl}.</PanelEmpty> : (
          <TableWrap>
            <thead><tr><th>Cost centre</th><th>Department</th><th>GL account</th><th>Description</th><th className="num">Items</th><th className="num">Debit</th></tr></thead>
            <tbody>
              {R.jnRows.map((r) => <tr key={r.cc + r.dept}><td>{drillBtn(r.cc, r.dept, r.keys, r.items, r.debit)}</td><td>{r.dept}</td><td className="tc-mono">{r.gl}</td><td>{r.desc}</td><td className="num">{r.items}</td><td className="num" style={{ fontWeight: 600 }}>{money(r.debit)}</td></tr>)}
              <tr><td style={TOTAL}>TOTAL</td><td></td><td></td><td></td><td className="num" style={TOTAL}>{jnTotItems}</td><td className="num" style={TOTAL}>{money(jnTot)}</td></tr>
            </tbody>
          </TableWrap>
        )}
      </Panel>

      <Panel title="Financial year" aside={<HeadActions name="the financial year summary" aside={`to the end of ${mLbl}`} onCsv={csv.fy} onPrint={print.fy} />}>
        <TableWrap>
          <thead><tr><th>Month</th><th className="num">Items issued</th><th className="num">Issued value</th><th className="num">Orders placed</th></tr></thead>
          <tbody>
            {R.fyRows.map((m) => <tr key={m.m}><td>{m.label}</td><td className="num">{m.items}</td><td className="num" style={{ fontWeight: 600 }}>{money(m.issued)}</td><td className="num">{money(m.orders)}</td></tr>)}
            <tr><td style={TOTAL}>FY TOTAL</td><td className="num" style={TOTAL}>{R.fyTot.items}</td><td className="num" style={TOTAL}>{money(R.fyTot.issued)}</td><td className="num" style={TOTAL}>{money(R.fyTot.orders)}</td></tr>
          </tbody>
        </TableWrap>
      </Panel>

      {drill && (
        <Dialog title={`Issues behind ${drill.cc} — ${mLbl}`} width={820} onClose={() => setDrill(null)}
          sub={`${drill.dept} · ${plural(drillQty, "item")} · ${money(drillAmt)}`}
          foot={<>
            {drillRows.length > 0 && <button type="button" className="btn btn-secondary" style={{ marginRight: "auto" }} onClick={csvDrill}>Export CSV</button>}
            <button type="button" className="btn btn-ghost" onClick={() => setDrill(null)}>Close</button>
          </>}>
          {drillRows.length === 0 ? <PanelEmpty>Nothing was issued against this cost centre in {mLbl}.</PanelEmpty> : (
            <div style={{ marginTop: 12 }}>
              <TableWrap>
                <thead><tr><th>Date</th><th>Staff</th><th>Item</th><th>Size</th><th className="num">Qty</th><th className="num">Unit cost</th><th className="num">Value</th></tr></thead>
                <tbody>
                  {drillRows.map((r, i) => <tr key={i}><td className="tc-mono">{fmtDate(r.date)}</td><td>{r.who}</td><td>{r.item}</td><td className="tc-mono">{r.size}</td><td className="num">{r.qty}</td><td className="num">{money(r.unit)}</td><td className="num" style={{ fontWeight: 600 }}>{money(r.amt)}</td></tr>)}
                  <tr><td style={TOTAL}>TOTAL</td><td></td><td></td><td></td><td className="num" style={TOTAL}>{drillQty}</td><td></td><td className="num" style={TOTAL}>{money(drillAmt)}</td></tr>
                </tbody>
              </TableWrap>
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
