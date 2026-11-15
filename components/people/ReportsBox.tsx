"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Empty, Field } from "@/components/ui";
import type { StaffRec } from "@/lib/compute";
import { fullName, type Act } from "./shared";

/* Who this person approves for: the Manager arrow drawn from the manager's end. Adding somebody here
 * rewrites THEIR record, so the confirm card names that person and the manager they leave first. */
export default function ReportsBox({ subject, reports, people, isAdmin, act }: { subject: StaffRec; reports: StaffRec[]; people: StaffRec[]; isAdmin: boolean; act: Act }) {
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<StaffRec | null>(null);
  const needle = q.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!needle) return [];
    return people.filter((x) => !x.inactive && x.id !== subject.id && x.managerId !== subject.id
      && (`${x.first} ${x.last}`.toLowerCase().includes(needle) || x.num.toLowerCase().includes(needle))).slice(0, 8);
  }, [people, subject.id, needle]);
  const from = pick ? people.find((x) => x.id === pick.managerId) : undefined;

  return (
    <div>
      {reports.length === 0
        ? <div className="tc-people-pad"><Empty pad={1}>Nobody reports to {subject.first || "them"} yet.</Empty></div>
        : (
          <div className="tc-people-list">
            {reports.map((x) => (
              <div key={x.id} className="tc-people-item">
                <Link href={`/app/staff/${x.id}`} className="link-name" style={{ fontWeight: 600 }}>{fullName(x)}</Link>{x.id === subject.id ? " (themselves)" : ""}
                <span className="grow tc-meta-line">{[x.num, x.dept].filter(Boolean).join(" · ") || "–"}</span>
                {isAdmin && (
                  <button type="button" className="btn btn-ghost tc-people-ghost" aria-label={`Take ${fullName(x)} off ${subject.first}’s list, they will have no approver`}
                    onClick={() => { if (confirm(`Take ${fullName(x)} off ${subject.first}'s list? They'll have no manager, so they can't raise requests until one is set.`)) act("staff.patch", { id: x.id, managerId: "" }); }}>
                    Remove from list
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      {isAdmin && (
        <div className="tc-people-pad" style={{ borderTop: reports.length ? "1px solid #cfcccb" : undefined }}>
          {subject.inactive ? (
            <div className="tc-meta-line">Reactivate {subject.first} to give them reports.</div>
          ) : pick ? (
            <div className="tc-people-confirm" style={{ marginTop: 0 }}>
              Send <b>{fullName(pick)}</b>’s requests to {fullName(subject)}{from ? <> instead of {fullName(from)}</> : null}?
              <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-secondary" onClick={async () => { if (await act("staff.patch", { id: pick.id, managerId: subject.id })) { setPick(null); setQ(""); } }}>Change {pick.first}’s record</button>
                <button type="button" className="btn btn-ghost" onClick={() => setPick(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <Field label="Add somebody who reports to them">
                {(c) => <input {...c} className="input" value={q} autoComplete="off" placeholder="Name or staff number" onChange={(e) => setQ(e.target.value)} />}
              </Field>
              {needle !== "" && (
                <div role="group" aria-label="Matching staff" className="tc-people-pick">
                  {matches.map((x) => (
                    <button key={x.id} type="button" onClick={() => setPick(x)} aria-label={`Send ${fullName(x)}’s requests to ${fullName(subject)}`}>
                      <b>{fullName(x)}</b>
                      <span style={{ color: "#57534f", marginLeft: 8 }}>{[x.num, x.dept].filter(Boolean).join(" · ")}</span>
                    </button>
                  ))}
                  {matches.length === 0 && <div className="tc-meta-line">Nobody else on the register matches that.</div>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
