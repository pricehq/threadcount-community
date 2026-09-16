"use client";
import { useMemo, useState } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { QueueGroup, QueueRow } from "@/components/portal";
import { ErrorLine } from "@/components/ui";
import { openSlip } from "@/components/dialogs";
import { collectRows, collectionSlip } from "@/lib/today";
import { Lines } from "./Lines";

export default function CollectGroup() {
  const { s, mutate } = useSnap();
  const { byId, staffById } = useDerived();
  const [err, setErr] = useState("");
  const rows = useMemo(() => collectRows(s, byId, staffById), [s, byId, staffById]);

  // Two people can work this list at once; a refusal has to be said, or the second click reads as
  // the first one not having taken.
  async function act(op: string, payload: unknown) { setErr(""); const r = await mutate(op, payload); if (!r.ok) setErr(r.error); }

  return (
    <QueueGroup id="collect" icon="phone" title="Call to collect" count={rows.length}>
      {err && <div style={{ padding: "0 16px 10px" }}><ErrorLine msg={err} /></div>}
      {rows.map((r) => (
        <QueueRow
          key={r.p.id}
          age={`${r.days}d`}
          ageLabel="waiting"
          urgent={r.late}
          title={r.name}
          titleMeta={r.phone ? (r.tel ? <a href={r.tel} style={{ color: "inherit" }}>{r.phone}</a> : r.phone) : undefined}
          meta={<><Lines lines={r.lines} /> · {r.p.orderCode}{r.p.contacted ? " · contacted" : ""}</>}
          actions={<>
            {!r.p.contacted && <button type="button" className="btn btn-ghost" aria-label={`Mark ${r.name} called`} onClick={() => act("pickup.contacted", { id: r.p.id })}>Mark called</button>}
            <button type="button" className="btn btn-ghost" aria-label={`Collection slip for ${r.name}`} onClick={() => openSlip("collection", collectionSlip(s, r.p, r.st))}>Slip</button>
            <button type="button" className="btn btn-secondary" aria-label={`${r.name} picked up`} onClick={() => act("pickup.pickedUp", { id: r.p.id })}>Picked up</button>
          </>}
        />
      ))}
    </QueueGroup>
  );
}
