"use client";
/* The Work tab: the queue at the window. Approved requests to pick, deliveries to receive, pickups to
   call and ward rounds, counted by the same useWorkCount() as the tab badge and Today. */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDerived, useSnap } from "@/lib/client";
import { collectRows, plural, receiveRows, relativeDay, roundSheet } from "@/lib/today";
import { PICK_STATUSES, useWorkCount } from "@/lib/workcount";
import { useRequests } from "@/components/requests/RequestList";
import {
  MBody, MButton, MCard, MCardChip, MEmpty, MError, MKick, MPill, MRow, MRule, MSection, MSeg, MTabs, MTop, MTopCount, useToast,
} from "@/components/m";
import { openReceivable, orderWhen, outstandingTotal } from "@/components/m/work/util";

type Seg = "picks" | "in" | "pickups" | "rounds";
const SEGS: readonly Seg[] = ["picks", "in", "pickups", "rounds"];
const asSeg = (v: string | null): Seg => (SEGS.includes(v as Seg) ? (v as Seg) : "picks");

export default function Work() {
  const sp = useSearchParams();
  const [seg, setSeg] = useState<Seg>(() => asSeg(sp.get("seg")));
  const w = useWorkCount();
  const [err, setErr] = useState("");

  // A link from Today (?seg=in) lands on its segment even when Work is already mounted.
  useEffect(() => { setSeg(asSeg(sp.get("seg"))); }, [sp]);

  const pick = (k: Seg) => {
    setSeg(k);
    setErr("");
    // Shallow: the segment is only a view of the snapshot already on the phone. null state, so Next's
    // router takes the new URL as canonical and a later refresh doesn't put the old segment back.
    try { window.history.replaceState(null, "", `/m/work?seg=${k}`); } catch { /* not fatal */ }
  };

  return (
    <>
      <MTop title="Work" right={<MTopCount>{w.total} open</MTopCount>} />
      <MRule />
      <MError msg={err} onDismiss={() => setErr("")} />
      <MBody pad>
        <MSeg label="Work" value={seg} onPick={pick} options={[
          { key: "picks", label: "Picks", n: w.picks },
          { key: "in", label: "In", n: w.in },
          { key: "pickups", label: "Pickups", n: w.pickups },
          { key: "rounds", label: "Rounds", n: w.rounds },
        ]} />
        {seg === "picks" && <Picks />}
        {seg === "in" && <Inbound />}
        {seg === "pickups" && <Pickups onError={setErr} />}
        {seg === "rounds" && <Rounds />}
      </MBody>
      <MTabs active="work" workBadge={w.total} />
    </>
  );
}

const line = (text: string) => <span style={{ display: "block" }}>{text}</span>;

function Picks() {
  const { s } = useSnap();
  const { staffById } = useDerived();
  const { data, error, reload } = useRequests();

  const rows = useMemo(() => (data?.requests ?? [])
    .filter((r) => PICK_STATUSES.has(r.status))
    .sort((a, b) => (a.decidedAt || a.createdAt).localeCompare(b.decidedAt || b.createdAt)), [data]);

  if (!data) {
    if (error) return (
      <div style={{ marginTop: 14 }}>
        <MError msg="Requests couldn’t be loaded." />
        <MButton small label="Try again" onClick={() => void reload()} />
      </div>
    );
    return <div style={{ marginTop: 14 }}><MKick>Loading</MKick></div>;
  }
  if (!rows.length) return <MEmpty title="Nothing to pick" sub="Approved requests land here." />;

  return (
    <>
      {rows.map((r) => {
        const st = staffById[r.staffId];
        const what = r.bag.map((l) => `${l.item.toLowerCase()} ${l.size}`).join(", ");
        const when = relativeDay(r.decidedAt, s);
        const approved = [when ? `Approved ${when}` : "Approved", r.managerName].filter(Boolean).join(" · ")
          + (r.status === "ready" && r.collectCode ? ` · ready, code ${r.collectCode}` : "");
        return (
          <MRow key={r.id} mark="ink" chev href={`/m/request/${r.id}`} title={r.staffName}
            sub={<>{line([st?.group || r.ward, what].filter(Boolean).join(" · "))}{line(approved)}</>}
            right={r.garments} />
        );
      })}
    </>
  );
}

function Inbound() {
  const { s } = useSnap();
  const { byId, staffById } = useDerived();
  const soon = useMemo(() => receiveRows(s, staffById), [s, staffById]);
  const later = useMemo(() => {
    const ids = new Set(soon.map((r) => r.o.id));
    return openReceivable(s, byId).filter((o) => !ids.has(o.id));
  }, [s, byId, soon]);

  const row = (o: (typeof later)[number], forName: string) => (
    <MRow key={o.id} mark="ink" chev href={`/m/receive/${o.id}`} title={`${o.code} · ${o.supplier || "Supplier"}`}
      sub={[orderWhen(s, o), plural(o.lines.length, "line"), forName ? `for ${forName}` : ""].filter(Boolean).join(" · ")}
      right={outstandingTotal(o, byId)} />
  );

  if (!soon.length && !later.length) return <MEmpty title="Nothing to receive" sub="Open orders show here when they arrive." />;
  return (
    <>
      {soon.map((r) => row(r.o, r.forName))}
      {later.length > 0 && (
        <>
          <MSection label="Later" right={later.length} />
          {later.map((o) => row(o, o.staffId ? (staffById[o.staffId] ? `${staffById[o.staffId].first} ${staffById[o.staffId].last}`.trim() : "") : ""))}
        </>
      )}
    </>
  );
}

function Pickups({ onError }: { onError: (msg: string) => void }) {
  const { s, mutate } = useSnap();
  const { byId, staffById } = useDerived();
  const toast = useToast();
  const rows = useMemo(() => collectRows(s, byId, staffById, { includeRound: true }), [s, byId, staffById]);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (id: string, op: string, payload: Record<string, unknown>, then?: () => void) => {
    if (busy) return;
    setBusy(id);
    onError("");
    const r = await mutate(op, payload);
    setBusy(null);
    if (!r.ok) { onError(r.error); return; }
    then?.();
  };

  if (!rows.length) return <MEmpty title="No one waiting" sub="Orders in for a person show here when they arrive." />;
  return (
    <>
      {rows.map((r) => {
        const items = r.lines.map((l) => `${l.garment} ${l.size} ×${l.qty}`).join(", ");
        const id = r.p.id;
        return (
          <MCard key={id} title={r.name} sub={[r.st?.dept, items].filter(Boolean).join(" · ")}
            pill={<MPill tone={r.late ? "accent" : "mute"}>{r.days}d</MPill>}
            actions={
              <>
                <MCardChip label="Call" href={r.tel || undefined} disabled={!r.tel} />
                <MCardChip label={r.p.contacted ? "Contacted" : "Contacted?"} on={r.p.contacted} disabled={busy === id}
                  onClick={() => void run(id, "pickup.contacted", { id, contacted: !r.p.contacted })} />
                <MCardChip label="Collected" disabled={busy === id}
                  onClick={() => void run(id, "pickup.pickedUp", { id }, () => toast(`${r.name} collected ${items}`))} />
              </>
            } />
        );
      })}
    </>
  );
}

function Rounds() {
  const { s } = useSnap();
  const { byId, staffById } = useDerived();
  const wards = useMemo(() => roundSheet(s, byId, staffById), [s, byId, staffById]);
  if (!wards.length) return <MEmpty title="No rounds today" sub="Delivered rounds are in History on the desktop." />;
  return (
    <>
      {wards.map((w) => {
        const people = new Set(w.rows.map((r) => r.p.staffId)).size;
        return (
          <MRow key={w.ward} mark="ink" chev href={`/m/round/${encodeURIComponent(w.ward)}`} title={w.ward}
            sub={`${plural(people, "person", "people")} · ${plural(w.rows.length, "bag")}`} right={w.garments} />
        );
      })}
    </>
  );
}
