import Link from "next/link";
import type { ManualBase } from "@/components/ManualView";
import { MANUAL_REVIEWED, manual, tree } from "@/lib/manual";

/* The manual's front page: every section with every page and its one-line summary, so the whole
 * table of contents is readable without opening a thing, plus the questions people arrive with. */

const ASKED: [string, string][] = [
  ["Load my staff list and catalogue", "reference/csv-templates"],
  ["Issue a set to a new starter", "counter/issue-a-garment"],
  ["Handle someone who asks for more than six sets", "people/entitlement-rule"],
  ["Raise an order to a supplier with their codes", "stock/order-list"],
  ["Receive a box that came short", "stock/receiving-and-back-orders"],
  ["Run a stocktake", "stock/stocktakes"],
  ["Give finance the month-end journal", "reports/journal-export"],
  ["Print a barcode for a garment that has none", "stock/barcodes"],
  ["Add a second admin", "account/users"],
  ["Export everything", "account/export-and-backup"],
];

export default function ManualHome({ base, title, lede, children }: { base: ManualBase; title: string; lede: string; children?: React.ReactNode }) {
  const sections = tree();
  const known = new Set(manual().map((p) => `${p.section}/${p.slug}`));
  const asked = ASKED.filter(([, h]) => known.has(h));
  const pages = sections.reduce((n, s) => n + s.pages.length, 0);
  return (
    <div className="mn-article mn-homepage">
      <h1 className="mn-h1">{title}</h1>
      <p className="mn-lede">{lede}</p>
      <div className="mn-facts">
        <div><b>Pages</b><span className="mn-mono">{pages}</span></div>
        <div><b>Sections</b><span className="mn-mono">{sections.length}</span></div>
        <div><b>Checked against the code</b><span className="mn-mono">{MANUAL_REVIEWED}</span></div>
        <div><b>Search</b><span>press <kbd>/</kbd></span></div>
      </div>

      {children}

      {asked.length > 0 && (
        <section className="mn-section" id="asked">
          <h2 className="mn-h2"><span className="n">01</span><span>How do I…</span></h2>
          <div className="mn-asked">
            {asked.map(([q, h]) => <Link key={h + q} href={`${base}/${h}`}><span>…{q.charAt(0).toLowerCase() + q.slice(1)}?</span><span className="k">{h.split("/")[0]}</span></Link>)}
          </div>
        </section>
      )}

      <section className="mn-section" id="contents">
        <h2 className="mn-h2"><span className="n">02</span><span>Every page</span></h2>
        <div className="mn-sections">
          {sections.map((s) => (
            <div key={s.id} id={s.id} className="mn-sec">
              <div className="hd"><b>{s.title}</b><span className="mn-mono">{s.pages.length}</span></div>
              <p>{s.blurb}</p>
              <ol>
                {s.pages.map((p) => (
                  <li key={p.slug}><Link href={`${base}/${s.id}/${p.slug}`}><b>{p.title}</b><span>{p.summary}</span></Link></li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
