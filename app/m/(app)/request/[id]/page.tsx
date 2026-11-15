"use client";
/* Pick an approved staff request: tick or scan each garment in the bag, then hand it over. The first
   pick moves the request to "picking" through request.pick, so the desktop queue shows it as being
   picked. Ticks live in the basket (this phone only) until the hand-over is signed. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { wasSpent } from "@/components/SignFlow";
import { useDerived, useSnap } from "@/lib/client";
import { bcParse, key, onhand } from "@/lib/compute";
import { scanReject } from "@/lib/feedback";
import { relativeDay } from "@/lib/today";
import { PICK_STATUSES } from "@/lib/workcount";
import { useRequests } from "@/components/requests/RequestList";
import { useBasket } from "@/components/MBasket";
import MScan from "@/components/MScan";
import {
  MBar, MBody, MButton, MEmpty, MError, MHead, MKick, MPickRow, MRow, MRule, MSection, MTop, useScanFlash, useToast,
} from "@/components/m";
import { garmentSize, locMap, personMeta, segment, shelfOf } from "@/components/m/work/util";

export default function PickRequest() {
  const id = segment(useParams<{ id: string }>().id);
  const { s, mutate } = useSnap();
  const { L, byId, staffById } = useDerived();
  const { data, error, reload } = useRequests();
  const basket = useBasket();
  const toast = useToast();
  const flash = useScanFlash();
  const [err, setErr] = useState("");
  const [scanning, setScanning] = useState(false);
  const pickFired = useRef(false);
  const locs = useMemo(() => locMap(s), [s]);

  const r = data?.requests.find((x) => x.id === id);
  const lines = useMemo(() => r?.bag ?? [], [r]);
  const stored = basket.picked(id);
  const router = useRouter();
  const gone = !!data && (!r || !PICK_STATUSES.has(r.status) || !lines.length);
  const spent = gone && wasSpent(`/m/request/${id}`);
  // Back from this request's own Done screen: the list is spent, so carry on to the queue.
  useEffect(() => { if (spent) router.replace("/m/work?seg=picks"); }, [spent, router]);
  // A ready bag was packed at the counter already: every line starts ticked.
  const got = useCallback((lineId: string, q: number) => {
    const v = stored[lineId];
    if (v === undefined) return r?.status === "ready" ? q : 0;
    return Math.max(0, Math.min(q, v));
  }, [stored, r]);
  const total = lines.reduce((t, l) => t + l.qty, 0);
  const picked = lines.reduce((t, l) => t + got(l.id, l.qty), 0);

  const setLine = (lineId: string, n: number) => {
    const prev = stored;
    basket.setPicked(id, { ...prev, [lineId]: n });
    return () => basket.setPicked(id, prev);
  };

  /** The first garment picked off an approved request tells the queue it is being picked. */
  const firstPick = async (undo: () => void) => {
    if (!r || r.status !== "accepted" || pickFired.current) return;
    pickFired.current = true;
    const res = await mutate("request.pick", { id: r.id });
    if (!res.ok) { pickFired.current = false; undo(); setErr(res.error); void reload(); return; }
    void reload();
  };

  const toggle = (lineId: string, q: number) => {
    const cur = got(lineId, q);
    const undo = setLine(lineId, cur >= q ? 0 : q);
    if (cur < q) void firstPick(undo);
  };

  const onScan = (raw: string) => {
    setScanning(false);
    const hit = bcParse(s, raw);
    if (!hit) { scanReject(); toast("That code isn’t a garment"); return; }
    const it = byId[hit.itemId];
    const name = garmentSize(it, "Garment", it?.sizes[hit.si] ?? hit.si);
    const match = lines.filter((l) => l.itemId === hit.itemId && l.si === hit.si);
    if (!match.length) { scanReject(); toast(`${name} isn’t on this request`); return; }
    const next = match.find((l) => got(l.id, l.qty) < l.qty);
    if (!next) { toast("Everything is picked"); return; }
    const n = got(next.id, next.qty) + 1;
    flash("Garment", name, () => { const undo = setLine(next.id, n); void firstPick(undo); });
  };

  const shell = (body: React.ReactNode, bar?: React.ReactNode) => (
    <>
      <MTop title="Pick request" back />
      <MRule />
      <MError msg={err} onDismiss={() => setErr("")} />
      <MBody pad>{body}</MBody>
      {bar}
    </>
  );

  if (!data) {
    return shell(error
      ? <><MError msg="Requests couldn’t be loaded." /><MButton small label="Try again" onClick={() => void reload()} /></>
      : <MKick>Loading</MKick>);
  }
  if (!r || !PICK_STATUSES.has(r.status) || !lines.length) {
    if (spent) return shell(<MKick>Loading</MKick>);
    return shell(<><MEmpty title="That request has moved on" /><MButton label="Back to Work" href="/m/work?seg=picks" /></>);
  }

  const st = staffById[r.staffId];
  const when = relativeDay(r.decidedAt, s);
  return (
    <>
      {shell(
        <>
          <MHead name={r.staffName} meta={personMeta(s, st, r.ward)} />
          <MButton tone="ink" icon="scan" label="Scan to pick"
            onClick={() => (picked >= total ? toast("Everything is picked") : setScanning(true))} />
          <MSection label="Pick list" right={`${picked} of ${total}`} />
          {lines.map((l, i) => {
            const n = got(l.id, l.qty);
            const onShelf = Math.max(0, onhand(s, L, key(l.itemId, l.si)));
            const sub = [shelfOf(s, locs, l.itemId, l.si), `${onShelf} on shelf`, r.status === "ready" && i === 0 && r.collectCode ? `code ${r.collectCode}` : ""]
              .filter(Boolean).join(" · ");
            return (
              <MPickRow key={l.id} done={n >= l.qty} onToggle={() => toggle(l.id, l.qty)}
                title={garmentSize(byId[l.itemId], l.item, l.size)} sub={sub} right={`${n}/${l.qty}`} />
            );
          })}
          <MSection label="Approved" />
          <MRow mark="ok" title={r.managerName || "Manager"} sub={when ? `Approved ${when}` : "Approved"} />
        </>,
        <MBar label="Hand over" small={`${picked} of ${total} picked`} disabled={picked < total}
          offReason="Pick every line first" href={`/m/request/${r.id}/sign`} />,
      )}
      {scanning && <MScan title="Scan to pick" onHit={onScan} onClose={() => setScanning(false)} />}
    </>
  );
}
