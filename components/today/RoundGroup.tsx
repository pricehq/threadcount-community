"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { QueueGroup, QueueRow } from "@/components/portal";
import { roundRows } from "@/lib/today";

export default function RoundGroup() {
  const { s } = useSnap();
  const t = s.settings.terms;
  const { staffById } = useDerived();
  const rows = useMemo(() => roundRows(s, staffById), [s, staffById]);
  const bags = rows.reduce((n, r) => n + r.bags, 0);

  return (
    <QueueGroup id="round" icon="truck" title={`Deliver on the ${t.round}`} count={bags}>
      {rows.map((r) => (
        <QueueRow
          key={r.ward}
          age={r.bags}
          ageLabel={r.bags === 1 ? "bag" : "bags"}
          title={r.ward}
          meta={<>
            {r.names.join(" · ")}{r.moreNames > 0 ? ` +${r.moreNames}` : ""}
            {` · ${r.garments} garment${r.garments === 1 ? "" : "s"}`}
            {r.desk ? ` · signed for at the ${t.desk}` : ""}
          </>}
          actions={<Link href={r.href} className="btn btn-secondary" aria-label={`Start the ${t.round} for ${r.ward}`}>Start the {t.round}</Link>}
        />
      ))}
    </QueueGroup>
  );
}
