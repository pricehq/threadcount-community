"use client";
import { useMemo, useRef, useState } from "react";
import { Field } from "@/components/ui";
import { Tag } from "@/components/portal";
import type { StaffRec } from "@/lib/compute";
import { fullName, type Act } from "./shared";

/* The person's manager: approves their requests in the staff app and signs their paper form. One box,
 * found by search and saved on the pick. Anyone may be their own manager, marked Self-approved. */
export default function ManagerBox({ people, subject, isAdmin, act }: { people: StaffRec[]; subject: StaffRec; isAdmin: boolean; act: Act }) {
  const [q, setQ] = useState("");
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const results = useRef<(HTMLButtonElement | null)[]>([]);
  const needle = q.trim().toLowerCase();
  const mgr = subject.managerId ? people.find((x) => x.id === subject.managerId) : undefined;
  const matches = useMemo(() => {
    if (!needle) return [];
    return people.filter((x) => !x.inactive && (`${x.first} ${x.last}`.toLowerCase().includes(needle) || x.num.toLowerCase().includes(needle))).slice(0, 8);
  }, [people, needle]);

  function onListKey(e: React.KeyboardEvent) {
    const fwd = e.key === "ArrowDown", back = e.key === "ArrowUp";
    if ((!fwd && !back) || matches.length === 0) return;
    e.preventDefault();
    const at = results.current.findIndex((el) => el === document.activeElement);
    const next = at < 0 ? 0 : at + (fwd ? 1 : -1);
    results.current[Math.max(0, Math.min(matches.length - 1, next))]?.focus();
  }

  async function save(managerId: string) {
    setBusy(true);
    const ok = await act("staff.patch", { id: subject.id, managerId });
    setBusy(false);
    if (ok) { setQ(""); setChanging(false); }
  }

  if (mgr && !changing) {
    const self = mgr.id === subject.id;
    const name = fullName(mgr);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 14 }}>
        <b>{name}{self ? " (themselves)" : ""}</b>
        {mgr.num && <span className="tc-mono" style={{ fontSize: 12, color: "#57534f" }}>{mgr.num}</span>}
        {self && <Tag tone="accent">Self-approved</Tag>}
        {mgr.inactive && <Tag>Inactive</Tag>}
        {isAdmin && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 14 }}>
            <button type="button" className="btn btn-ghost tc-people-ghost" disabled={busy} aria-label={`Change ${subject.first}’s manager, ${name} is set`} onClick={() => { setQ(""); setChanging(true); }}>Change</button>
            <button type="button" className="btn btn-ghost tc-people-ghost" disabled={busy} aria-label={`Remove ${name} as ${subject.first}’s manager`}
              onClick={() => { if (confirm(`Remove ${name} as ${subject.first}'s manager? ${subject.first} can't raise requests until one is set.`)) save(""); }}>Remove</button>
          </span>
        )}
      </div>
    );
  }

  if (!isAdmin) return <div className="tc-meta-line" style={{ fontSize: 13 }}>None set.</div>;

  return (
    <div>
      <Field label="Manager" hint={changing ? undefined : "Approves requests and signs order forms."}>
        {(c) => (
          <input {...c} className="input" value={q} autoComplete="off" placeholder="Name or staff number" onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && matches.length) { e.preventDefault(); results.current[0]?.focus(); }
              else if (e.key === "Escape" && changing) { e.preventDefault(); setQ(""); setChanging(false); }
            }} />
        )}
      </Field>
      {changing && <button type="button" className="btn btn-ghost tc-people-ghost" style={{ marginTop: 8 }} onClick={() => { setQ(""); setChanging(false); }}>Cancel</button>}
      {needle !== "" && (
        <div role="group" aria-label="Matching staff" className="tc-people-pick" onKeyDown={onListKey}>
          {matches.map((x, i) => {
            const self = x.id === subject.id;
            return (
              <button key={x.id} type="button" ref={(el) => { results.current[i] = el; }} disabled={busy}
                aria-label={`Set ${x.first} ${x.last}${self ? " (themselves)" : ""}${x.num ? `, staff number ${x.num}` : ""} as ${subject.first}’s manager`}
                onClick={() => save(x.id)}>
                <b>{x.first} {x.last}</b>{self ? " (themselves)" : ""}
                <span style={{ color: "#57534f", marginLeft: 8 }}>{[x.num, x.dept].filter(Boolean).join(" · ")}</span>
              </button>
            );
          })}
          {matches.length === 0 && <div className="tc-meta-line">Nobody on the register matches that.</div>}
        </div>
      )}
    </div>
  );
}
