"use client";
/* This facility's rules, as the counter applies them: the panel at the top of Help. It was the whole
 * Help page until the manual arrived (docs/manual); it stays because it is the one place the rules
 * are stated with this facility's own figures rather than the defaults.
 *
 * Every figure is read from this facility's own settings rather than written in, so the page can't
 * quote a number the facility has changed. The import rules are the templates' own notes, so they
 * can't drift from what the importer accepts. */
import Link from "next/link";
import { useSnap } from "@/lib/client";
import { CSV_TEMPLATES } from "@/lib/csv";
import { FTE_SETS, SLIP_DAYS } from "@/lib/compute";
import { SET_GARMENTS, setsCap, setsOnStart } from "@/lib/sets";

function Section({ title, more, children }: { title: string; more?: string; children: React.ReactNode }) {
  return (
    <div className="tc-panel" style={{ marginBottom: "var(--space-3)" }}>
      <div className="tc-panel-head"><span>{title}</span>{more && <Link href={`/app/help/${more}`} style={{ fontSize: 12, fontWeight: 600 }}>In the manual</Link>}</div>
      <div className="tc-panel-body" style={{ fontSize: 14, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

const list = { margin: 0, paddingLeft: "1.2em", display: "grid", gap: "var(--space-1)" } as const;

export default function FacilityRules() {
  const { s } = useSnap();
  const cap = setsCap(s.settings.capSets);
  const start = Math.min(cap, setsOnStart(s.settings.initialSets));
  // The table as the form lists it: a full-timer's figure first, down to the smallest.
  const table = Object.entries(FTE_SETS).filter(([, n]) => n !== null) as [string, number][];

  return (
    <div className="mn-rules">
      <Section title="What anyone may hold" more="people/entitlement-rule">
        <ul style={list}>
          <li>Up to <b>{cap} sets</b> at any time — {cap} tops and {cap} pairs of trousers. The same for every staff group, including those on the FTE table.</li>
          <li>It counts everything issued and not handed in or returned, plus anything on order for them, waiting at the counter, or approved and not yet collected. Pre-loved garments count.</li>
          <li>Garments that aren&apos;t part of a set — fleeces, jackets, maternity wear — have their own ceiling of {cap}.</li>
          <li>It isn&apos;t a yearly allowance and nothing resets in July. At the ceiling, the next garment comes by handing one in first, or on a coordinator&apos;s override, which is recorded.</li>
          <li>Change the figure under Settings → Issuing rules, as Most anyone holds.</li>
        </ul>
      </Section>

      <Section title="Ordering from suppliers" more="stock/order-list">
        <ul style={list}>
          <li><b>Orders → To order</b> lists every size at or below its reorder level, topped up to twice the level and netted off what is already on order, one panel per supplier. Adjust the quantities, add a line, type the supplier order no., then <b>Order and email</b> (<b>Order</b> when the supplier has no order email).</li>
          <li>A person&apos;s order from the counter stays its own order — one per supplier per person — so an order placed under their account at the supplier is never merged into the shelf&apos;s.</li>
          <li><b>Sheet</b> prints the supplier&apos;s A4 sheet with their product codes. The email goes to the Order email under Settings → Catalogue &amp; suppliers. Enter each size&apos;s code once, on the garment&apos;s page under Ordering. Invoice and tracking numbers go on the order&apos;s own page, opened from On the way.</li>
        </ul>
      </Section>

      <Section title="The three routes" more="people/groups-and-routes">
        <p style={{ margin: "0 0 var(--space-2)" }}>Each staff group is on one route, chosen under Settings → Issuing rules, on the staff groups board. All three stop at the same {cap} sets.</p>
        <ul style={list}>
          <li><b>FTE table</b> — the hours someone works propose their starting kit: {table.map(([fte, n]) => `${fte} FTE ${n}`).join(", ")} sets; a casual is at the manager&apos;s discretion. A manager may sign for more.</li>
          <li><b>Starting kit</b> — {start} sets on the first day ({start * SET_GARMENTS} garments), then more as needed. Nothing has to be handed back first.</li>
          <li><b>Manager approval</b> — no starting kit; the manager approves each set that is asked for. The counter checks the ceiling, not whether an approval is on file.</li>
          <li>A group can&apos;t be on two routes. Taking a group with staff in it off the list puts them on manager approval, so move them to another group or rename it instead.</li>
        </ul>
      </Section>

      <Section title="The yearly figure" more="reports/the-nine-reports">
        <p style={{ margin: 0 }}>&ldquo;Items (FY)&rdquo; on Reports → People counts what someone has drawn since 1 July. It feeds the reports and the Exceptions list, and never limits what the counter issues. Groups on the FTE table aren&apos;t measured against one.</p>
      </Section>

      <Section title="Hand-ins" more="counter/exchanges-and-returns">
        <ul style={list}>
          <li>Handing a garment in frees room at the counter straight away, whether or not the credit box is ticked.</li>
          <li>The credit tick adds the good garments back to the yearly figure and to the manager&apos;s approval. Pre-loved garments earn neither.</li>
          <li>Good garments join the pre-loved pool and are reissued free; rags are counted for disposal.</li>
        </ul>
      </Section>

      <Section title="Garment types" more="stock/catalogue-sizes-and-cuts">
        <p style={{ margin: 0 }}>A garment&apos;s type decides how it counts. Tops and trousers are each half a set; every other type counts toward the separate ceiling. A type typed in by hand that isn&apos;t on the list counts toward no set, so pick from the list.</p>
        <p style={{ margin: "var(--space-2) 0 0" }}>Each garment is tagged for the staff groups that wear it, or for all groups. Staff can only request their own groups&apos; garments, and the counter needs a coordinator&apos;s override, which is recorded, to issue anyone a garment outside their group.</p>
        <p style={{ margin: "var(--space-2) 0 0" }}>A garment is also men&apos;s, women&apos;s or unisex. Somebody is offered the cut set as their Uniform style plus everything unisex; blank means every style until a coordinator sets it, and the counter needs the same override, also recorded, to issue anyone another cut.</p>
      </Section>

      <Section title="The staff app" more="apps/staff-app">
        <ul style={list}>
          <li>On the person&apos;s record, under Details &amp; access → Staff app, generate a code and print the slip. A code works once and expires after {SLIP_DAYS} days.</li>
          <li>Record their manager first, under Manager on the same tab — nobody can raise a request without one.</li>
        </ul>
      </Section>

      <Section title="Requests and approvals" more="counter/manager-approvals">
        <ul style={list}>
          <li>A request goes to the person&apos;s manager — the same person who signs their paper order form.</li>
          <li>A manager can raise requests for the people who report to them; those go to the manager above. With nobody above, the request waits on Requests under Needs an approver.</li>
          <li>Nobody approves a request they raised for somebody else.</li>
          <li>Anyone can be set as their own manager; what they approve for themselves is marked Self-approved.</li>
        </ul>
      </Section>

      <Section title="Stock takes" more="stock/stocktakes">
        <p style={{ margin: 0 }}>A count in progress on Stock → Count is saved in this browser only, under your sign-in. It survives a reload, but not a move to another computer or the phone — finish a count where you started it.</p>
      </Section>

      <Section title="Importing and exporting" more="reference/csv-templates">
        <p style={{ margin: "0 0 var(--space-2)" }}>Settings → Data &amp; audit log imports each list from a CSV file. The rules for each:</p>
        <ul style={list}>
          {Object.entries(CSV_TEMPLATES).map(([k, t]) => <li key={k}><b>{t.name}</b> — {t.note}</li>)}
        </ul>
        <p style={{ margin: "var(--space-2) 0 0" }}>People → Export CSV writes headers the import reads back, so each {s.settings.terms.team}&apos;s list can go to its manager, come back with Manager number filled in, and be imported again.</p>
      </Section>

      <Section title="Month-end journal" more="reports/journal-export">
        <p style={{ margin: 0 }}>Reports → Spend → Journal: one debit line per cost centre, priced at each garment&apos;s cost on the day it was issued. Finance posts the balancing credit.</p>
      </Section>

      <Section title="Who ThreadCount emails" more="selfhost/email">
        <ul style={list}>
          <li>You — password resets, and updates you&apos;ve subscribed to.</li>
          <li>Staff — only about their own requests, once they&apos;ve set up the staff app.</li>
          <li>Managers — the link to approve or decline a request.</li>
        </ul>
      </Section>
    </div>
  );
}
