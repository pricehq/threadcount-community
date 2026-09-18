"use client";
/* Places & cost centres: a link to the locations editor (now in Stock) and the departments editor. */
import { useState } from "react";
import Link from "next/link";
import { useSnap } from "@/lib/client";
import { Field } from "@/components/ui";
import { Panel } from "@/components/portal";
import { csvOf, type DeptRec } from "@/lib/compute";
import { downloadCsv } from "@/lib/print";
import { Msg, SectionHead, useSaver } from "./common";
import { cap } from "@/lib/terms";

export default function PlacesSection() {
  const { s, isAdmin, mutate } = useSnap();
  const t = s.settings.terms;
  const { msg, say, draft, setDraft, draftNow, forgetDraft, debounced, schedule } = useSaver();
  const [nd, setNd] = useState({ name: "", cc: "" });
  const nLocs = s.locations.filter((l) => !l.archived).length;
  const deptStaff: Record<string, number> = {};
  for (const st of s.staff) deptStaff[st.dept] = (deptStaff[st.dept] || 0) + 1;

  /* The row's cost centre and name as typed, so one box saving the row never undoes the other. */
  const deptCc = (d: DeptRec, from = draft) => from["dept:" + d.id] ?? d.cc;
  const deptName = (d: DeptRec) => draft["deptname:" + d.id] ?? d.name;
  function deptNameRefusal(d: DeptRec, name: string) {
    if (!name) return `Each of the ${t.teams} needs a name — ${d.name} hasn’t been changed.`;
    const clash = s.depts.find((o) => o.id !== d.id && o.name.trim().toLowerCase() === name.toLowerCase());
    return clash ? `${clash.name} is already on the list.` : "";
  }
  const deptSaveName = (d: DeptRec) => { const n = deptName(d).trim(); return deptNameRefusal(d, n) ? d.name : n; };

  /* dept.save carries the old name forward, so staff and orders filed under it move with it. The
     check waits for the typing to stop; half a name is not a refusal. */
  function renameDept(d: DeptRec, v: string) {
    const k = "deptname:" + d.id;
    setDraft((x) => ({ ...x, [k]: v }));
    schedule(k, async () => {
      const name = v.trim();
      const no = deptNameRefusal(d, name);
      if (no) { forgetDraft(k, v); say("depts", no); return; }
      if (name === d.name) return;
      const r = await mutate("dept.save", { id: d.id, name, cc: deptCc(d, draftNow.current).trim() });
      if (!r.ok) { forgetDraft(k, v); say("depts", r.error); return; }
      say("depts", `Renamed to ${name}; its staff and orders moved with it.`);
    }, 600);
  }
  // The name the register holds (not a rename still settling) and the cost centre as typed.
  function exportDepts() {
    downloadCsv(`threadcount-departments-${s.today}.csv`, csvOf(["dept", "cc", "staff"], s.depts.map((d) => [d.name, deptCc(d).trim(), deptStaff[d.name] || 0])));
  }

  return (
    <>
      <Panel title="Locations" aside={<><span className="tc-mono">{nLocs}</span> location{nLocs === 1 ? "" : "s"}</>}>
        <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="tc-meta-line">Rooms, shelves and bays are kept in Stock.</span>
          <Link href="/app/stock?tab=locations" className="btn btn-secondary" style={{ marginLeft: "auto" }}>Open Stock › Locations</Link>
        </div>
      </Panel>

      <SectionHead meta={`${cap(t.teams)} with staff on them can’t be removed.`}
        right={<button className="btn btn-ghost" onClick={exportDepts} disabled={s.depts.length === 0}>Export CSV</button>}>
        {cap(t.teams)} &amp; cost centres
      </SectionHead>
      {s.depts.length > 0 && (
        <div className="table-wrap" style={{ border: "2px solid var(--color-text)" }}>
          <table className="tc-table" style={{ minWidth: 520 }}>
            <thead><tr><th>{cap(t.team)}</th><th style={{ width: 180 }}>Cost centre</th><th className="num" style={{ width: 80 }}>Staff</th><th style={{ width: 44 }}><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>
              {s.depts.map((d) => {
                const n = deptStaff[d.name] || 0;
                return (
                  <tr key={d.id}>
                    <td><input className="input" style={{ width: "100%", fontWeight: 600 }} aria-label={`Name of ${d.name}`} value={deptName(d)} onChange={(e) => renameDept(d, e.target.value)} disabled={!isAdmin} /></td>
                    <td><input className="input tc-mono" style={{ width: "100%" }} aria-label={`Cost centre for ${d.name}`} value={deptCc(d)} disabled={!isAdmin}
                      onChange={(e) => debounced("dept:" + d.id, e.target.value, "dept.save", { id: d.id, name: deptSaveName(d), cc: e.target.value.trim() }, "depts")} /></td>
                    <td className="num">{n}</td>
                    <td>{isAdmin && !n && <button className="btn btn-ghost btn-icon" title="Remove — no staff assigned" aria-label={`Remove ${d.name}`} onClick={async () => { const r = await mutate("dept.delete", { id: d.id }); say("depts", r.ok ? `${d.name} removed.` : r.error); }}>×</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {s.depts.length === 0 && <div className="tc-meta-line">No {t.teams} yet.</div>}
      {isAdmin && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label={`New ${t.team}`} style={{ width: 280, maxWidth: "100%" }}>{(c) => <input {...c} className="input" value={nd.name} onChange={(e) => setNd({ ...nd, name: e.target.value })} placeholder={`e.g. ${cap(t.team)} 5C`} />}</Field>
          <Field label="Cost centre" style={{ width: 180 }}>{(c) => <input {...c} className="input tc-mono" value={nd.cc} onChange={(e) => setNd({ ...nd, cc: e.target.value })} placeholder="e.g. CC-5090" />}</Field>
          <button className="btn btn-secondary" disabled={!nd.name.trim() || !nd.cc.trim()} onClick={async () => { const r = await mutate("dept.save", nd); say("depts", r.ok ? "Added." : r.error); if (r.ok) setNd({ name: "", cc: "" }); }}>Add</button>
        </div>
      )}
      <Msg text={msg.depts} />
    </>
  );
}
