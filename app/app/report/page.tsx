"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSnap } from "@/lib/client";
import { monthLabel } from "@/lib/compute";
import { PageHead } from "@/components/ui";
import { Icon, Seg } from "@/components/portal";
import { useReportData } from "@/components/reports/useReportData";
import MonthEndStrip from "@/components/reports/MonthEndStrip";
import SpendTab, { JOURNAL_ID } from "@/components/reports/SpendTab";
import StockTab from "@/components/reports/StockTab";
import PeopleTab from "@/components/reports/PeopleTab";

const TABS = ["spend", "stock", "people"] as const;
type Tab = (typeof TABS)[number];
const LABELS: Record<Tab, string> = { spend: "Spend", stock: "Stock", people: "People" };
/* The nine reports' old names, so a link to one of them still lands on the tab that holds it. */
const LEGACY: Record<string, Tab> = {
  overview: "spend", journal: "spend",
  valuation: "stock", shrinkage: "stock", "top-stock": "stock", topstock: "stock", suppliers: "stock",
  exceptions: "people", approvals: "people", "pre-loved": "people", preloved: "people",
};

/* Screen-local layout. Scoped to .tc-rep so nothing leaks outside this screen. */

export default function ReportPage() {
  return <Suspense fallback={null}><ReportInner /></Suspense>;
}

function ReportInner() {
  const { s } = useSnap();
  const router = useRouter();
  const sp = useSearchParams();
  const thisMonth = s.today.slice(0, 7);
  const rawTab = (sp.get("tab") || "").toLowerCase();
  const tab: Tab = (TABS as readonly string[]).includes(rawTab) ? (rawTab as Tab) : LEGACY[rawTab] ?? "spend";
  const rawMonth = sp.get("month") || "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : thisMonth;
  const d = useReportData(month);
  const [jump, setJump] = useState(false);

  function go(next: { tab?: Tab; month?: string }) {
    const t = next.tab ?? tab, m = next.month ?? month;
    const q = new URLSearchParams();
    q.set("tab", t);
    if (m !== thisMonth) q.set("month", m);
    router.replace(`/app/report?${q.toString()}`, { scroll: false });
  }

  useEffect(() => {
    if (!jump || tab !== "spend") return;
    document.getElementById(JOURNAL_ID)?.scrollIntoView({ block: "start" });
    setJump(false);
  }, [jump, tab]);

  const exportCsv = tab === "spend" ? d.csv.overview : tab === "stock" ? d.csv.valuation : d.csv.exceptions;

  return (
    <section className="tc-rep">
      <PageHead title="Reports">
        <span className="tc-selectbtn btn btn-onink" style={{ gap: 10 }}>
          <span aria-hidden="true">{monthLabel(month)}</span>
          <Icon name="chevronDown" size={16} />
          <select aria-label="Reporting month" value={month} onChange={(e) => go({ month: e.target.value })}>
            {d.R.repMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </span>
        <button type="button" className="btn btn-onink" onClick={exportCsv}>Export CSV</button>
        <button type="button" className="btn btn-primary" onClick={d.printEomPack}>Month-end pack</button>
      </PageHead>

      <div className="tc-rep-stack">
        <MonthEndStrip month={month} onPrint={d.printEomPack} onJournal={() => { setJump(true); if (tab !== "spend") go({ tab: "spend" }); }} />
        <div>
          <Seg label="Report" opts={TABS} value={tab} labels={LABELS} onChange={(t) => go({ tab: t })} />
        </div>
        {tab === "spend" && <SpendTab d={d} onMonth={(m) => go({ month: m })} />}
        {tab === "stock" && <StockTab d={d} />}
        {tab === "people" && <PeopleTab d={d} />}
      </div>
    </section>
  );
}
