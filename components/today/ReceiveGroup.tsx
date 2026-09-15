"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { QueueGroup, QueueRow } from "@/components/portal";
import { ReceiveDialog } from "@/components/dialogs";
import type { OrderRec } from "@/lib/compute";
import { receiveRows } from "@/lib/today";

export default function ReceiveGroup() {
  const { s } = useSnap();
  const { staffById } = useDerived();
  const rows = useMemo(() => receiveRows(s, staffById), [s, staffById]);
  const [receive, setReceive] = useState<OrderRec | null>(null);

  return (
    <>
      <QueueGroup id="receive" icon="truck" title="Receive" count={rows.length}>
        {rows.map((r) => (
          <QueueRow
            key={r.o.id}
            age={r.age}
            ageLabel={r.ageLabel}
            urgent={r.overdue}
            title={<>{r.o.supplier} · <Link href={`/app/orders/${r.o.id}`} style={{ color: "inherit" }}>{r.o.code}</Link></>}
            meta={<>{r.lines} line{r.lines === 1 ? "" : "s"}{r.expected ? ` · expected ${r.expected}` : ""}{r.forName ? ` · for ${r.forName}` : ""}</>}
            actions={<>
              {r.chase && <a href={r.chase} className="btn btn-ghost" aria-label={`Chase ${r.o.supplier} about ${r.o.code}`}>Chase</a>}
              <button type="button" className={"btn " + (r.overdue ? "btn-primary" : "btn-secondary")} aria-label={`Receive delivery for ${r.o.code}`} onClick={() => setReceive(r.o)}>Receive delivery</button>
            </>}
          />
        ))}
      </QueueGroup>
      {receive && <ReceiveDialog order={receive} onClose={() => setReceive(null)} />}
    </>
  );
}
