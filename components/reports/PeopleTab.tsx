"use client";
import { useState } from "react";
import { LiveRegion } from "@/components/ui";
import { Panel } from "@/components/portal";
import { useSnap } from "@/lib/client";
import { fmtDate, money } from "@/lib/compute";
import { HeadActions, PanelEmpty, TableWrap, TOTAL, plural } from "./bits";
import type { ReportData } from "./useReportData";

function SubHead({ children }: { children: React.ReactNode }) {
  return <h3 className="tc-lbl" style={{ margin: 0, padding: "12px 16px 4px", borderTop: "2px solid #201e1d" }}>{children}</h3>;
}

/* The yearly figure is a reporting number, not a limit, so it lives here and nowhere else. */
function YearlyFigure() {
  const { s, isAdmin, busy, mutate } = useSnap();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);
  const current = s.settings.defaultEntitlement;

  async function save() {
    const n = Number(val);
    if (!Number.isInteger(n) || n < 0) { setMsg({ text: "Enter a whole number, 0 or more.", err: true }); return; }
    const r = await mutate("settings.update", { defaultEntitlement: n });
    if (!r.ok) { setMsg({ text: r.error, err: true }); return; }
    setEditing(false);
    setMsg({ text: "Saved.", err: false });
  }

  return (
    <section className="tc-pp" aria-label="Yearly figure for reports">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "11px 16px" }}>
        {!editing ? (
          <>
            <span>Yearly figure for reports · <span className="tc-mono" style={{ fontWeight: 600 }}>{current}</span> garments per person</span>
            {isAdmin && <button type="button" className="btn btn-ghost" style={{ minHeight: 0, padding: 0, marginLeft: "auto" }} onClick={() => { setVal(String(current)); setMsg(null); setEditing(true); }}>Change</button>}
          </>
        ) : (
          <form style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }} onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <label htmlFor="tc-rep-yearly">Yearly figure for reports</label>
            <input id="tc-rep-yearly" className="input tc-mono" type="number" min={0} step={1} inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)} style={{ width: 90 }} autoFocus />
            <span>garments per person</span>
            <button type="submit" className="btn btn-primary" disabled={busy}>Save</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setEditing(false); setMsg(null); }}>Cancel</button>
          </form>
        )}
      </div>
      <LiveRegion tone={msg?.err ? "alert" : "status"} msg={msg?.text}
        style={{ padding: "0 16px 10px", fontSize: 12, fontWeight: 600, color: msg?.err ? "var(--color-accent-700)" : "var(--color-neutral-700)" }} />
    </section>
  );
}

export default function PeopleTab({ d }: { d: ReportData }) {
  const { R, mLbl, csv, print } = d;
  return (
    <div className="tc-rep-stack">
      <Panel title="Exceptions" flag={R.excRows.length > 0}
        aside={<HeadActions name="staff exceptions" aside={<>threshold <span className="tc-mono">{R.excThreshold}</span> items/month</>} onCsv={csv.exceptions} onPrint={print.exceptions} />}>
        {R.excRows.length === 0 ? <PanelEmpty>No exceptions in {mLbl}.</PanelEmpty> : (
          <TableWrap>
            <thead><tr><th>Staff</th><th>Group</th><th>Cost centre</th><th className="num">Items (month)</th><th className="num">Items (FY)</th><th>Flag</th></tr></thead>
            <tbody>{R.excRows.map((r, i) => <tr key={i}><td>{r.who}</td><td>{r.group}</td><td className="tc-mono">{r.cc || "—"}</td><td className="num">{r.mQty}</td><td className="num">{r.fyQty}</td><td><span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{r.flags.map((f, j) => <span key={j} className="tag tag-flag">{f}</span>)}</span></td></tr>)}</tbody>
          </TableWrap>
        )}
      </Panel>

      <Panel title="Approvals outstanding" flag={R.apprTot > 0}
        aside={<HeadActions name="approvals outstanding" aside={R.apprTot > 0 ? `${plural(R.apprTot, "set")} outstanding` : undefined} onCsv={csv.approvals} onPrint={print.approvals} />}>
        {R.apprRows.length === 0 ? <PanelEmpty>No uncollected approvals.</PanelEmpty> : (
          <TableWrap>
            <thead><tr><th>Staff</th><th>{d.teamHead}</th><th>Approved by</th><th>Date</th><th className="num">Sets approved</th><th className="num">Collected</th><th className="num">Remaining</th></tr></thead>
            <tbody>
              {R.apprRows.map((r, i) => <tr key={i}><td>{r.who}</td><td>{r.dept}</td><td>{r.by}</td><td className="tc-mono">{fmtDate(r.date)}</td><td className="num">{r.sets}</td><td className="num">{r.used}</td><td className="num" style={{ fontWeight: 600, color: "var(--color-accent-700)" }}>{r.rem}</td></tr>)}
              <tr><td style={TOTAL}>TOTAL OUTSTANDING</td><td></td><td></td><td></td><td></td><td></td><td className="num" style={TOTAL}>{R.apprTot}</td></tr>
            </tbody>
          </TableWrap>
        )}
      </Panel>

      <Panel title="Pre-loved" aside={<HeadActions name="pre-loved issues, hand-ins and pool" aside={<>saved <span className="tc-mono">{money(R.plSaved)}</span></>} onCsv={csv.preloved} onPrint={print.preloved} />}>
        <h3 className="tc-lbl" style={{ margin: 0, padding: "12px 16px 4px" }}>Issued free · <span className="tc-mono">{R.plQty}</span></h3>
        {R.plIssueRows.length === 0 ? <PanelEmpty>Nothing issued from the pool in {mLbl}.</PanelEmpty> : (
          <TableWrap>
            <thead><tr><th>Date</th><th>Staff</th><th>Item</th><th>Size</th><th className="num">Qty</th><th className="num">Value saved</th></tr></thead>
            <tbody>{R.plIssueRows.map((r, i) => <tr key={i}><td className="tc-mono">{fmtDate(r.date)}</td><td>{r.who}</td><td>{r.item}</td><td className="tc-mono">{r.size}</td><td className="num">{r.qty}</td><td className="num">{money(r.saved)}</td></tr>)}</tbody>
          </TableWrap>
        )}
        <SubHead>Hand-ins · <span className="tc-mono">{R.ragMonth}</span> to rag</SubHead>
        {R.hiRows.length === 0 ? <PanelEmpty>No hand-ins in {mLbl}.</PanelEmpty> : (
          <TableWrap>
            <thead><tr><th>Date</th><th>Staff</th><th>Received by</th><th className="num">Good</th><th className="num">Rag</th><th>Allowance</th></tr></thead>
            <tbody>{R.hiRows.map((r, i) => <tr key={i}><td className="tc-mono">{fmtDate(r.date)}</td><td>{r.who}</td><td>{r.by}</td><td className="num">{r.good}</td><td className="num">{r.rag}</td><td>{r.credit}</td></tr>)}</tbody>
          </TableWrap>
        )}
        <SubHead>Pool today · <span className="tc-mono">{R.plPoolTotal}</span> at $0</SubHead>
        {R.plPoolRows.length === 0 ? <PanelEmpty>The pool is empty.</PanelEmpty> : (
          <TableWrap>
            <thead><tr><th>Item</th><th>Sizes on hand</th><th className="num">Total</th></tr></thead>
            <tbody>{R.plPoolRows.map((r, i) => <tr key={i}><td>{r.item}</td><td className="tc-mono">{r.sizes}</td><td className="num" style={{ fontWeight: 600 }}>{r.total}</td></tr>)}</tbody>
          </TableWrap>
        )}
      </Panel>

      <YearlyFigure />
    </div>
  );
}
