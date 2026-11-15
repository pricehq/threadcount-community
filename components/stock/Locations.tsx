"use client";
import { useState } from "react";
import { useSnap } from "@/lib/client";
import { Empty, Field, LiveRegion } from "@/components/ui";
import { Panel } from "@/components/portal";
import { LOCATION_KINDS, csvOf, locMap, locPath, locTree } from "@/lib/compute";
import { downloadCsv } from "@/lib/print";

/* Where garments live: rooms hold shelves, shelves hold bays. Moved here from Settings. Editing is
   admin-only on the server (location.save / location.delete); issuers see the tree read-only. */
export default function Locations() {
  const { s, isAdmin, mutate } = useSnap();
  const [nl, setNl] = useState({ name: "", kind: "Shelf", parentId: "" });
  const [msg, setMsg] = useState<{ text: string; err: boolean }>({ text: "", err: false });
  const say = (r: { ok: true } | { ok: false; error: string }, ok: string) => setMsg(r.ok ? { text: ok, err: false } : { text: r.error, err: true });

  const tree = locTree(s, true);
  // How many sizes sit on each location, so an empty shelf is obvious before it is removed.
  const locCounts: Record<string, number> = {};
  for (const k in s.placed) locCounts[s.placed[k]] = (locCounts[s.placed[k]] || 0) + 1;

  function exportLocations() {
    const byId = locMap(s);
    // Each row carries its full path as well as its own name: "Bay B3" alone is on every shelf.
    const rows = tree.map(({ loc }) => [loc.name, loc.kind, loc.parentId ? byId[loc.parentId]?.name ?? "" : "", locPath(byId, loc.id).map((l) => l.name).join(" · "), locCounts[loc.id] || 0]);
    downloadCsv(`threadcount-locations-${s.today}.csv`, csvOf(["Location", "Kind", "Inside", "Full path", "Sizes"], rows));
  }

  const parentOpts = (exclude?: string) => tree.filter(({ loc }) => loc.id !== exclude).map(({ loc, depth }) => <option key={loc.id} value={loc.id}>{" ".repeat(depth * 2)}{loc.name}</option>);

  return (
    <div className="tc-stk">
      <LiveRegion msg={msg.text} tone={msg.err ? "alert" : "status"} className={msg.err ? "notice tc-flag" : "notice"} />
      <Panel
        title="Where garments live"
        aside={<span className="tc-stk-row" style={{ gap: 16 }}><span className="tc-mono">{s.locations.length} location{s.locations.length === 1 ? "" : "s"}</span><button type="button" className="btn btn-ghost" onClick={exportLocations} disabled={s.locations.length === 0}>Export CSV</button></span>}
        foot={isAdmin ? (
          <div className="tc-stk-row" style={{ alignItems: "flex-end", width: "100%" }}>
            <Field label="New location" style={{ flex: 1, minWidth: 160 }}>{(c) => <input {...c} className="input" value={nl.name} onChange={(e) => setNl({ ...nl, name: e.target.value })} placeholder="e.g. Shelf B" />}</Field>
            <Field label="Kind" style={{ width: 140 }}>{(c) => <select {...c} className="input" value={nl.kind} onChange={(e) => setNl({ ...nl, kind: e.target.value })}>{LOCATION_KINDS.map((k) => <option key={k}>{k}</option>)}</select>}</Field>
            <Field label="Inside" style={{ width: 220 }}>{(c) => <select {...c} className="input" value={nl.parentId} onChange={(e) => setNl({ ...nl, parentId: e.target.value })}><option value="">— top level —</option>{parentOpts()}</select>}</Field>
            <button type="button" className="btn btn-secondary" disabled={!nl.name.trim()} onClick={async () => { const r = await mutate("location.save", nl); say(r, "Added."); if (r.ok) setNl({ name: "", kind: nl.kind, parentId: nl.parentId }); }}>Add</button>
          </div>
        ) : undefined}
      >
        {tree.length === 0 ? <div className="tc-stk-pad"><Empty pad={2}>No locations yet.</Empty></div> : (
          <div className="table-wrap">
            <table className="tc-table">
              <thead>
                <tr><th>Location</th><th>Kind</th><th>Inside</th><th className="num">Sizes</th>{isAdmin && <th><span className="sr-only">Remove</span></th>}</tr>
              </thead>
              <tbody>
                {tree.map(({ loc, depth }) => (
                  <tr key={loc.id}>
                    <td style={{ fontWeight: 600, paddingLeft: 12 + depth * 18 }}>{loc.name}</td>
                    <td>{loc.kind}</td>
                    <td>
                      <select className="input tc-stk-tight" aria-label={`What ${loc.name} sits inside`} value={loc.parentId || ""} disabled={!isAdmin}
                        onChange={async (e) => { const r = await mutate("location.save", { id: loc.id, name: loc.name, kind: loc.kind, parentId: e.target.value }); say(r, "Moved."); }}>
                        <option value="">— top level —</option>
                        {parentOpts(loc.id)}
                      </select>
                    </td>
                    <td className="num">{locCounts[loc.id] || 0}</td>
                    {isAdmin && (
                      <td style={{ width: 40, textAlign: "right" }}>
                        <button type="button" className="btn btn-ghost btn-icon" title="Remove — anything on it becomes unplaced" aria-label={`Remove ${loc.name}`}
                          onClick={async () => { const r = await mutate("location.delete", { id: loc.id }); say(r, "Removed."); }}>×</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
