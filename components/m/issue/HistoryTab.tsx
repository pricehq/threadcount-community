"use client";
/* Person › History: what was issued, handed back and handed in, grouped per day, newest first; and
 * their staff app account, with the admin-only code. */
import { useEffect, useMemo, useState } from "react";
import { useSnap } from "@/lib/client";
import { fmtDate, itemMap, label, type IssueRec } from "@/lib/compute";
import { MButton, MEmpty, MONO, MPill, MRow, MSection } from "@/components/m";
import type { PersonTabProps } from "@/components/m/handback/HandBackTab";

type Group = { key: string; date: string; kind: number; verb: string; parts: Record<string, { name: string; qty: number }>; signed: boolean; at: string };

const COND_NOTE: Record<string, string> = { "Returned - Damaged": " (damaged)", "Written Off": " (condemned)", Lost: " (lost)" };
/** "Today", "12 Aug", or "12 Aug 2025" for another year (the mockup's short date). */
function dayLabel(iso: string, today: string): string {
  if (!iso || iso.length < 10) return fmtDate(iso);
  if (iso.slice(0, 10) === today) return "Today";
  const d = new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  if (Number.isNaN(d.getTime())) return fmtDate(iso);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
  const short = `${d.getDate()} ${mon}`;
  return iso.slice(0, 4) === (today || "").slice(0, 4) ? short : `${short} ${iso.slice(0, 4)}`;
}
const lower = (t: string) => t; // catalogue names keep their own casing (acronyms such as RN)

export default function HistoryTab({ staffId, setBar, onError }: PersonTabProps) {
  const { s, isAdmin, mutate } = useSnap();
  const st = s.staff.find((x) => x.id === staffId);
  // Shown once, then gone: the code is a credential and is never in the snapshot.
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setBar(null); }, [setBar]);

  const groups = useMemo(() => {
    const byId = itemMap(s);
    const m: Record<string, Group> = {};
    const put = (date: string, kind: number, verb: string, i: IssueRec, note = "") => {
      const gk = `${date}|${kind}`;
      const g = (m[gk] ||= { key: gk, date, kind, verb, parts: {}, signed: false, at: "" });
      const it = byId[i.itemId];
      const pk = `${i.itemId}:${i.si}${note}`;
      const p = (g.parts[pk] ||= { name: `${lower(label(it))} ${String(it?.sizes[i.si] ?? i.si)}${note}`, qty: 0 });
      p.qty += i.qty;
      if (kind === 0) { if (i.receipt) g.signed = true; if ((i.createdAt || "") > g.at) g.at = i.createdAt || ""; }
    };
    for (const i of s.issues) {
      if (i.staffId !== staffId) continue;
      put(i.date, 0, "Issued", i);
      if (i.returned) put(i.returned.date, 1, "Handed back", i, COND_NOTE[i.returned.cond] || "");
      if (i.handedIn) put(i.handedIn, 2, "Handed in", i);
    }
    return Object.values(m)
      .sort((a, b) => b.date.localeCompare(a.date) || a.kind - b.kind)
      .slice(0, 25)
      .map((g) => ({
        key: g.key, date: g.date, signed: g.signed,
        title: `${g.verb} ${Object.values(g.parts).map((p) => {
          // A condition note sits after the count: "fleece L ×1 (damaged)".
          const at = p.name.indexOf(" (");
          return at > 0 ? `${p.name.slice(0, at)} ×${p.qty}${p.name.slice(at)}` : `${p.name} ×${p.qty}`;
        }).join(", ")}`,
      }));
  }, [s, staffId]);

  if (!st) return null;
  const account = st.selfEmail ? `Signed up · ${st.selfEmail}` : st.selfCode ? "Code out, not used" : "No account";

  const generate = async () => {
    setBusy(true);
    const r = await mutate<{ code: string }>("staff.selfCode", { id: st.id });
    setBusy(false);
    if (!r.ok) { onError(r.error); return; }
    setCode(r.result.code);
  };

  return (
    <>
      <MSection label="History" />
      {groups.length === 0
        ? <MEmpty title="Nothing recorded yet" />
        : groups.map((g) => <MRow key={g.key} mark="mute" title={g.title} sub={dayLabel(g.date, s.today)} right={g.signed ? <MPill tone="ok">Signed</MPill> : undefined} />)}

      <MSection label="Staff app" />
      <MRow title="Staff app" sub={account} />
      {code ? (
        <>
          <div aria-live="polite" style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600, letterSpacing: "0.06em", marginTop: 14 }}>{code}</div>
          <MButton small label="Done" onClick={() => setCode(null)} />
        </>
      ) : isAdmin && !st.selfEmail ? (
        <MButton small tone="ink" label={busy ? "Generating…" : st.selfCode ? "New code" : "Generate a code"} disabled={busy} onClick={generate} />
      ) : null}
    </>
  );
}
