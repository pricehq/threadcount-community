"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useSnap } from "@/lib/client";
import { PageHead, Empty, ErrorLine } from "@/components/ui";
import { Icon, Tabs } from "@/components/portal";
import { StaffDialog } from "@/components/dialogs";
import { requestCounts, useRequests } from "@/components/requests/RequestList";
import type { StaffRec } from "@/lib/compute";
import { PeopleStyles, fullName } from "./shared";
import Summary from "./Summary";
import UniformTab from "./UniformTab";
import RequestsTab from "./RequestsTab";
import HistoryTab from "./HistoryTab";
import DetailsTab from "./DetailsTab";

const TAB_IDS = ["uniform", "requests", "history", "details"] as const;
type TabId = (typeof TAB_IDS)[number];
const asTab = (v: string | null): TabId => ((TAB_IDS as readonly string[]).includes(v || "") ? (v as TabId) : "uniform");

/** Head actions shared by the register and the record (ADMIN only). */
function HeadActions({ onAdd }: { onAdd: () => void }) {
  const { isAdmin } = useSnap();
  if (!isAdmin) return null;
  return (
    <>
      <Link href="/app/settings?tab=data&import=staff" className="btn btn-onink">Import the register</Link>
      <button type="button" className="btn btn-primary" onClick={onAdd}>Add a person</button>
    </>
  );
}

function Crumb({ name }: { name: string }) {
  return (
    <nav aria-label="Breadcrumb" className="tc-people-crumb">
      <Icon name="chevronLeft" size={16} />
      <Link href="/app/staff">People</Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{name}</span>
    </nav>
  );
}

export default function StaffRecord() {
  const { id } = useParams<{ id: string }>();
  const { s } = useSnap();
  const [add, setAdd] = useState(false);
  const st = s.staff.find((x) => x.id === id);
  if (!st) {
    return (
      <section>
        <PeopleStyles />
        <PageHead title="People"><HeadActions onAdd={() => setAdd(true)} /></PageHead>
        <Crumb name="Not found" />
        <Empty>Nobody on the register has this record. <Link href="/app/staff">Back to People</Link></Empty>
        {add && <StaffDialog staff={null} onClose={() => setAdd(false)} />}
      </section>
    );
  }
  /* Keyed on the person, so walking from one record to another (through "Whose requests they
     approve") starts every draft, dialog and one-time code afresh instead of carrying it over. */
  return <RecordBody key={st.id} st={st} />;
}

function RecordBody({ st }: { st: StaffRec }) {
  const { isAdmin, mutate } = useSnap();
  const sp = useSearchParams();
  const tab = asTab(sp.get("tab"));
  const edit = isAdmin && tab === "details" && sp.get("edit") === "1";
  const [add, setAdd] = useState(false);
  const [err, setErr] = useState("");
  const act = useCallback(async (op: string, payload: unknown) => {
    setErr("");
    const r = await mutate(op, payload);
    if (!r.ok) setErr(r.error);
    return r.ok;
  }, [mutate]);
  /* One fetch of this person's requests feeds the tab count, the Requests tab and the order-form history. */
  const req = useRequests({ staffId: st.id });
  const counts = req.data ? requestCounts(req.data, { staffId: st.id }) : null;
  const base = `/app/staff/${st.id}`;
  const hrefFor = (t: string) => (t === "uniform" ? base : `${base}?tab=${t}`);
  const tabs = [
    { id: "uniform", label: "Uniform" },
    { id: "requests", label: "Requests", count: counts ? counts.open : undefined },
    { id: "history", label: "History" },
    { id: "details", label: "Details & access" },
  ];
  const label = tabs.find((t) => t.id === tab)!.label;

  return (
    <section>
      <PeopleStyles />
      <PageHead title="People"><HeadActions onAdd={() => setAdd(true)} /></PageHead>
      <Crumb name={fullName(st)} />
      <Summary st={st} editHref={`${base}?tab=details&edit=1`} />
      <div className="tc-people-tabs">
        <Tabs label="Staff record" tabs={tabs} value={tab} hrefFor={hrefFor} />
      </div>
      <ErrorLine msg={err} />
      <div role="tabpanel" aria-label={label} style={{ marginTop: err ? 16 : 0 }}>
        {tab === "uniform" && <UniformTab st={st} act={act} setErr={setErr} />}
        {tab === "requests" && <RequestsTab st={st} req={req} />}
        {tab === "history" && <HistoryTab st={st} act={act} setErr={setErr} req={req} />}
        {tab === "details" && <DetailsTab st={st} act={act} edit={edit} base={base} />}
      </div>
      {add && <StaffDialog staff={null} onClose={() => setAdd(false)} />}
    </section>
  );
}
