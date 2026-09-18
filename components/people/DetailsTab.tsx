"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSnap } from "@/lib/client";
import { ErrorLine, Field, LiveRegion } from "@/components/ui";
import { Panel, Tag } from "@/components/portal";
import { FTE_OPTIONS, UNIFORM_STYLES, ccOf, entOf, fmtDate, isNursing, type StaffRec } from "@/lib/compute";
import ManagerBox from "./ManagerBox";
import ReportsBox from "./ReportsBox";
import SelfService from "./SelfService";
import { fullName, type Act } from "./shared";
import { cap } from "@/lib/terms";

export default function DetailsTab({ st, act, edit, base }: { st: StaffRec; act: Act; edit: boolean; base: string }) {
  const { s, isAdmin, mutate } = useSnap();
  const t = s.settings.terms;
  const [offMsg, setOffMsg] = useState("");
  const reports = s.staff.filter((x) => x.managerId === st.id && !x.inactive)
    .sort((a, b) => `${a.last} ${a.first}`.localeCompare(`${b.last} ${b.first}`));
  const hasHistory = s.issues.some((i) => i.staffId === st.id) || s.orders.some((o) => o.staffId === st.id);

  /* Taking somebody off the register also closes the requests still waiting on approval (staff.patch,
     same transaction). Nobody is emailed, so the count is said out loud here. */
  async function deactivate() {
    setOffMsg("");
    const r = await mutate<{ closedRequests?: number }>("staff.patch", { id: st.id, inactive: true });
    if (!r.ok) { setOffMsg(r.error); return; }
    const n = r.result?.closedRequests ?? 0;
    if (n) setOffMsg(`${n} ${n === 1 ? "request was" : "requests were"} waiting on approval and ${n === 1 ? "has" : "have"} been closed.`);
  }

  return (
    <div className="tc-people-two">
      <div className="tc-people-stack">
        {edit ? <EditDetails st={st} base={base} /> : <ReadDetails st={st} act={act} isAdmin={isAdmin} base={base} />}
        <Panel title="Manager">
          <div className="tc-people-pad">
            <ManagerBox people={s.staff} subject={st} isAdmin={isAdmin} act={act} />
          </div>
        </Panel>
      </div>
      <div className="tc-people-stack">
        <Panel title={`Whose requests ${st.first || "they"} approves`} aside={reports.length ? `${reports.length} ${reports.length === 1 ? "person" : "people"}` : undefined}
          foot={st.dept ? <Link href={`/app/requests?ward=${encodeURIComponent(st.dept)}`} className="btn btn-ghost tc-people-ghost">Requests from {st.dept}</Link> : undefined}>
          <ReportsBox subject={st} reports={reports} people={s.staff} isAdmin={isAdmin} act={act} />
        </Panel>
        <Panel title="Staff app">
          <div className="tc-people-pad">
            {isAdmin ? (
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                <input type="checkbox" checked={st.wardDesk} onChange={(e) => act("staff.patch", { id: st.id, wardDesk: e.target.checked })} style={{ width: 18, height: 18, flex: "none" }} />
                <span><b>On the {t.desk}</b>{st.dept ? ` · signs for ${st.dept} ${t.round} bags` : ` · no ${t.team} recorded`}</span>
              </label>
            ) : (
              <div style={{ fontSize: 13 }}>{st.wardDesk ? <Tag>{st.dept ? `${cap(t.desk)} · ${st.dept}` : cap(t.desk)}</Tag> : `Not on the ${t.desk}.`}</div>
            )}
            <SelfService st={st} act={act} mutate={mutate} isAdmin={isAdmin} facility={s.settings.facility} terms={t} tz={s.settings.timezone} />
          </div>
        </Panel>
        {isAdmin && (
          <Panel title="Register">
            <div className="tc-people-pad" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {!st.inactive
                ? <button type="button" className="btn btn-secondary" onClick={deactivate}>Deactivate</button>
                : <button type="button" className="btn btn-secondary" onClick={() => { setOffMsg(""); act("staff.patch", { id: st.id, inactive: false }); }}>Reactivate</button>}
              {!hasHistory && (
                <button type="button" className="btn btn-ghost" style={{ color: "var(--color-accent-700)" }}
                  onClick={() => { if (confirm(`Delete ${fullName(st)} from the register?`)) act("staff.delete", { id: st.id }).then((ok) => { if (ok) window.location.href = "/app/staff"; }); }}>Delete</button>
              )}
            </div>
            <LiveRegion msg={offMsg} className="tc-people-pad" style={{ paddingTop: 0, fontSize: 13, fontWeight: 600 }} />
          </Panel>
        )}
      </div>
    </div>
  );
}

function ReadDetails({ st, act, isAdmin, base }: { st: StaffRec; act: Act; isAdmin: boolean; base: string }) {
  const { s } = useSnap();
  const t = s.settings.terms;
  const of = entOf(s, st), limited = Number.isFinite(of);
  const fte = st.fte || "";
  const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <div className="tc-people-kv"><span className="k muted">{k}</span><span className="v">{children}</span></div>
  );
  return (
    <Panel title="Details" aside={isAdmin ? <Link href={`${base}?tab=details&edit=1`} scroll={false} className="btn btn-ghost tc-people-ghost">Edit details</Link> : undefined}>
      <div>
        <Row k="Phone">{st.phone ? <span className="tc-mono">{st.phone}</span> : "–"}</Row>
        <Row k={cap(t.team)}>{st.dept || "–"}</Row>
        <Row k="Cost centre"><span className="tc-mono">{ccOf(s, st) || "–"}</span> <span className="tc-meta-line">{st.ccOverride ? "override" : `from ${t.team}`}</span></Row>
        <Row k="Sizes"><span className="tc-mono">{st.top || "–"} / {st.pants || "–"}</span></Row>
        <Row k="Uniform style">{st.uniformStyle || "Not set (every style)"}</Row>
        <Row k="Start date">{st.start ? fmtDate(st.start) : "–"}</Row>
        <Row k="Yearly report figure">{limited ? <><span className="tc-mono">{of}</span> garments</> : "Not measured"}</Row>
        <div className="tc-people-kv">
          <span className="k muted">Combined FTE</span>
          {isAdmin ? (
            <select className="input" aria-label="Combined FTE" value={fte} style={{ width: 150 }} onChange={(e) => act("staff.patch", { id: st.id, fte: e.target.value })}>
              <option value="">Not recorded</option>
              {fte && !FTE_OPTIONS.includes(fte) && <option value={fte}>{fte}</option>}
              {FTE_OPTIONS.map((v) => <option key={v}>{v}</option>)}
            </select>
          ) : <span className="v tc-mono">{fte || "Not recorded"}</span>}
        </div>
      </div>
    </Panel>
  );
}

function EditDetails({ st, base }: { st: StaffRec; base: string }) {
  const { s, mutate } = useSnap();
  const t = s.settings.terms;
  const router = useRouter();
  const [f, setF] = useState({ first: st.first, last: st.last, phone: st.phone, top: st.top, pants: st.pants, ent: st.ent === null ? "" : String(st.ent), group: st.group, dept: st.dept, ccOverride: st.ccOverride, start: st.start, uniformStyle: st.uniformStyle });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const ccCodes = [...new Set(s.depts.map((d) => d.cc).filter(Boolean))];
  const nursing = isNursing(s, { ...st, group: f.group });
  const close = () => router.replace(`${base}?tab=details`, { scroll: false });
  async function save() {
    if (!f.first.trim() || !f.last.trim()) return;
    setBusy(true); setErr("");
    const r = await mutate("staff.save", { id: st.id, num: st.num, ...f, ent: f.ent === "" ? null : parseInt(f.ent, 10) || 0, notes: st.notes });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    close();
  }
  return (
    <Panel title="Details" aside="Editing" foot={<>
      <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !f.first.trim() || !f.last.trim()}>Save</button>
      <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
      <span className="tc-meta-line" style={{ marginLeft: "auto" }}>Staff no. <span className="tc-mono">{st.num}</span> can&apos;t change</span>
    </>}>
      <div className="tc-people-pad">
        <div className="tc-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {([["first", "First name"], ["last", "Last name"], ["phone", "Phone"], ["top", "Top size"], ["pants", "Pants size"]] as const).map(([k, lbl]) => (
            <Field key={k} label={lbl} error={(k === "first" || k === "last") && !f[k].trim() ? "A record needs a name." : undefined}>
              {(c) => <input {...c} className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
            </Field>
          ))}
          <Field label="Uniform style" hint="Which cut the counter offers.">
            {(c) => (
              <select {...c} className="input" value={f.uniformStyle} onChange={(e) => setF({ ...f, uniformStyle: e.target.value })}>
                <option value="">Not set (every style)</option>
                {f.uniformStyle && !UNIFORM_STYLES.includes(f.uniformStyle) && <option value={f.uniformStyle}>{f.uniformStyle}</option>}
                {UNIFORM_STYLES.map((v) => <option key={v}>{v}</option>)}
              </select>
            )}
          </Field>
          <Field label="Yearly report figure (garments)" hint={nursing ? undefined : "Reports only; the counter ignores it."}>
            {(c) => nursing
              ? <input {...c} className="input" value="Not measured on the FTE table" disabled />
              : <input {...c} className="input" inputMode="numeric" value={f.ent} placeholder={`Default ${s.settings.defaultEntitlement}`} onChange={(e) => setF({ ...f, ent: e.target.value.replace(/[^0-9]/g, "") })} />}
          </Field>
          <Field label="Staff group">
            {(c) => <select {...c} className="input" value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })}>{!s.settings.staffGroups.includes(f.group) && <option value={f.group}>{f.group || "–"}</option>}{s.settings.staffGroups.map((g) => <option key={g}>{g}</option>)}</select>}
          </Field>
          <Field label={cap(t.team)}>
            {(c) => <select {...c} className="input" value={f.dept} onChange={(e) => setF({ ...f, dept: e.target.value })}>{!s.depts.find((d) => d.name === f.dept) && <option value={f.dept}>{f.dept || "–"}</option>}{s.depts.map((d) => <option key={d.id} value={d.name}>{d.name}{d.cc ? ` (${d.cc})` : ""}</option>)}</select>}
          </Field>
          <Field label="Start date">{(c) => <input {...c} className="input" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />}</Field>
          <Field label="Cost centre override">
            {(c) => <select {...c} className="input" value={f.ccOverride} onChange={(e) => setF({ ...f, ccOverride: e.target.value })}><option value="">{`None (from ${t.team})`}</option>{ccCodes.map((x) => <option key={x} value={x}>{x}</option>)}{f.ccOverride && !ccCodes.includes(f.ccOverride) && <option value={f.ccOverride}>{f.ccOverride}</option>}</select>}
          </Field>
        </div>
        <ErrorLine msg={err} />
      </div>
    </Panel>
  );
}
