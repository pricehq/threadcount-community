"use client";
import Link from "next/link";
import { Fragment } from "react";
import { useSnap } from "@/lib/client";
import { Meter, Tag } from "@/components/portal";
import { allowanceRouteOf, capCheck, ccOf, fmtDate, type StaffRec } from "@/lib/compute";
import { fullName, pl } from "./shared";

const dot = (parts: React.ReactNode[]) => parts.map((p, i) => <Fragment key={i}>{i > 0 && " · "}{p}</Fragment>);

export default function Summary({ st, editHref }: { st: StaffRec; editHref: string }) {
  const { s, isAdmin } = useSnap();
  /* The counter's own question, so the meters and the counter never quote two figures. */
  const held = capCheck(s, st);
  const owed = held.owed.tops + held.owed.pants + held.owed.other;
  const route = allowanceRouteOf(s, st);
  const cc = ccOf(s, st);

  const details: React.ReactNode[] = [];
  if (st.group) details.push(st.group);
  if (st.dept) details.push(st.dept);
  if (cc) details.push(<span className="tc-mono">{cc}</span>);
  if (st.uniformStyle) details.push(`${st.uniformStyle.replace("'", "’")} cut`);
  if (st.top || st.pants) details.push(<><span className="tc-mono">{st.top || "–"}</span> / <span className="tc-mono">{st.pants || "–"}</span></>);
  if (route === "fte" && st.fte) details.push(<>FTE <span className="tc-mono">{st.fte}</span></>);
  if (st.start) details.push(`started ${fmtDate(st.start)}`);

  const reports = s.staff.filter((x) => x.managerId === st.id && !x.inactive);
  const mgr = st.managerId ? s.staff.find((x) => x.id === st.managerId) : undefined;
  const people: React.ReactNode[] = [];
  if (reports.length) {
    people.push(<>Approves requests for {pl(reports.length, "person", "people")}{st.dept && <> on <Link href={`/app/requests?ward=${encodeURIComponent(st.dept)}`}>{st.dept}</Link></>}</>);
  }
  if (mgr) {
    people.push(<>Manager {fullName(mgr)}{mgr.id === st.id && <> <Tag tone="accent">Self-approved</Tag></>}{mgr.inactive && <> <Tag>Inactive</Tag></>}</>);
  }
  if (st.phone) people.push(<span className="tc-mono">{st.phone}</span>);

  return (
    <div className="tc-pp tc-people-summary">
      <div style={{ minWidth: 0 }}>
        <div className="tc-people-name">
          <p className="nm">{fullName(st)}</p>
          <span className="tc-mono" style={{ fontSize: 12, color: "#57534f" }}>{st.num}</span>
          {st.selfEmail && <Tag>Staff app</Tag>}
          {st.wardDesk && <Tag>{st.dept ? `Ward desk · ${st.dept}` : "Ward desk"}</Tag>}
          {st.inactive && <Tag tone="accent">Inactive</Tag>}
        </div>
        {details.length > 0 && <div className="tc-people-sumline">{dot(details)}</div>}
        {people.length > 0 && <div className="tc-people-sumline2"><span>{dot(people)}</span></div>}
      </div>
      <div className="tc-people-meters">
        <Meter label="Tops" value={held.tops} of={held.cap} />
        <Meter label="Pants" value={held.pants} of={held.cap} />
        {held.other > 0 && <Meter label="Other" value={held.other} of={held.otherCap} />}
        {owed > 0 && <div className="tc-meta-line">{owed} still on order or waiting</div>}
      </div>
      <div className="tc-people-actions">
        {!st.inactive && <Link href={`/app/counter?staff=${encodeURIComponent(st.id)}`} className="btn btn-primary">Open at the counter</Link>}
        {isAdmin && <Link href={editHref} scroll={false} className="btn btn-ghost tc-people-ghost">Edit details</Link>}
      </div>
    </div>
  );
}
