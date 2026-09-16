"use client";
/* The audit log, moved from /app/activity into Data & audit log. Reads /api/activity page by page
 * (the trail is not in the snapshot) and names each record from the snapshot instead of showing ids. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSnap } from "@/lib/client";
import { LiveRegion } from "@/components/ui";
import { Panel } from "@/components/portal";
import { csvEsc, csvOf, facilityDate, formatInZone } from "@/lib/compute";
import { downloadCsv } from "@/lib/print";
import { LABELS, NOTABLE } from "./auditLabels";
import { buildNameIndex, recordParts, recordText } from "./names";

type Event = { id: string; at: string; who: string; op: string; target: string };

/* In the facility's zone, so the times agree with the linen-room clock wherever the log is read. */
function when(iso: string, tz: string) {
  return formatInZone(iso, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function AuditLog({ scrollTo }: { scrollTo?: boolean }) {
  const { s } = useSnap();
  const [events, setEvents] = useState<Event[]>([]);
  const [before, setBefore] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const scrolled = useRef(false);
  const ix = useMemo(() => buildNameIndex(s), [s]);

  const load = useCallback(async (cursor: string | null) => {
    setLoading(true);
    try {
      const r = await fetch("/api/activity" + (cursor ? `?before=${encodeURIComponent(cursor)}` : ""));
      const j = await r.json();
      if (!r.ok) { setErr(j.error || "Couldn’t load the log."); return; }
      setErr("");
      setEvents((prev) => (cursor ? [...prev, ...j.events] : j.events));
      setBefore(j.nextBefore);
      setMore(!!j.nextBefore);
    } catch {
      setErr("Couldn’t load the log.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(null); }, [load]);

  // Old /app/activity links land here: bring the log into view once its first page is in.
  useEffect(() => {
    if (!scrollTo || loading || scrolled.current) return;
    scrolled.current = true;
    requestAnimationFrame(() => document.getElementById("audit")?.scrollIntoView({ block: "start" }));
  }, [scrollTo, loading]);

  /* What is loaded, and no more: the file says on its face how far back it reaches. */
  function exportCsv() {
    const stamp = (iso: string) =>
      `${facilityDate(iso, s.tz)} ${formatInZone(iso, s.tz, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, hourCycle: "h23" })}`;
    const reach = more ? `${events.length} (older events not loaded)` : `${events.length} (the whole log)`;
    downloadCsv(`threadcount-activity-${s.today}.csv`,
      `Audit log,${csvEsc(s.today)}\nTimes shown in,${csvEsc(s.tz)}\nEvents in this file,${csvEsc(reach)}\n\n`
      + csvOf(["When", "Who", "What", "Record", "Record id"], events.map((e) => [stamp(e.at), e.who, LABELS[e.op] || e.op, recordText(recordParts(ix, e.target)), e.target])));
  }

  return (
    <Panel id="audit" title="Audit log"
      aside={<>
        <span>{events.length} shown{more ? " · older not loaded" : ""}</span>
        <button className="btn btn-ghost" style={{ marginLeft: 12 }} onClick={exportCsv} disabled={events.length === 0}>Export CSV</button>
      </>}
      foot={more ? <button className="btn btn-secondary" onClick={() => load(before)} disabled={loading}>{loading ? "Loading…" : "Load older"}</button> : undefined}>
      <LiveRegion tone="alert" msg={err} className="tc-flag" style={{ margin: "12px 16px 0", padding: "8px 12px", fontWeight: 700, color: "var(--color-accent-700)" }} />
      <div className="table-wrap">
        <table className="tc-table" style={{ minWidth: 640 }}>
          <thead>
            <tr><th style={{ width: 130 }}>When</th><th style={{ width: 170 }}>Who</th><th>What</th><th style={{ width: 260 }}>Record</th></tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const notable = NOTABLE.has(e.op);
              const parts = recordParts(ix, e.target);
              return (
                <tr key={e.id}>
                  <td className="tc-mono" style={{ whiteSpace: "nowrap", fontSize: 12 }}>{when(e.at, s.tz)}</td>
                  <td>{e.who}</td>
                  <td style={{ fontWeight: notable ? 700 : 400, color: notable ? "var(--color-accent-700)" : undefined }}>
                    {notable && <span className="tc-mark" aria-hidden="true" />}
                    {LABELS[e.op] || e.op}
                  </td>
                  <td style={{ overflowWrap: "anywhere" }}>
                    {!parts.length && <span style={{ color: "var(--color-neutral-700)" }}>—</span>}
                    {parts.map((p, i) => (
                      <span key={i}>
                        {i > 0 && " · "}
                        {p.missing ? <span className="tc-mono" style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{p.text}</span> : p.text}
                      </span>
                    ))}
                  </td>
                </tr>
              );
            })}
            {!events.length && !loading && (
              <tr><td colSpan={4} style={{ color: "var(--color-neutral-700)" }}>Nothing recorded yet.</td></tr>
            )}
            {!events.length && loading && (
              <tr><td colSpan={4} style={{ color: "var(--color-neutral-700)" }}>Loading…</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
