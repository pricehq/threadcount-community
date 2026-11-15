"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { QueueGroup, QueueRow } from "@/components/portal";
import { countRows } from "@/lib/today";

export default function CountsGroup() {
  const { s } = useSnap();
  const { byId } = useDerived();
  const rows = useMemo(() => countRows(s, byId), [s, byId]);

  return (
    <QueueGroup id="counts" icon="doc" title="Counts due" count={rows.length}>
      {rows.map((r) => (
        <QueueRow
          key={r.loc.id}
          age={r.age}
          ageLabel={r.ageLabel}
          title={r.trail}
          meta={<>{r.garments.length ? `${r.garments.join(", ")} · ` : ""}{r.last} · {r.sizes} line{r.sizes === 1 ? "" : "s"}</>}
          actions={<Link href={r.href} className="btn btn-secondary" aria-label={`Start the count of ${r.trail}`}>Start the count</Link>}
        />
      ))}
    </QueueGroup>
  );
}
