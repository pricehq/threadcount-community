"use client";
/* Count a shelf: every location holding garments, plus the unplaced bucket, each shelf with a
   shelf-label print chip. Mounted by app/m/(app)/count/page.tsx (a Stock detail, no tab bar). */
import { useMemo } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { UNPLACED, daysBetween } from "@/lib/compute";
import { printShelfLabel } from "@/lib/nativeprint";
import { isNative } from "@/lib/nativescan";
import { INK, MBody, MEmpty, MRow, MRule, MSection, MTop, MTopCount, useToast } from "@/components/m";
import { countRows } from "@/components/m/stock/stockdata";

function lastCounted(last: string | undefined, today: string): string {
  if (!last) return "Never counted";
  const n = daysBetween(last, today);
  if (n <= 0) return "Counted today";
  if (n === 1) return "Counted yesterday";
  return `Counted ${n} days ago`;
}

export default function CountList() {
  const { s } = useSnap();
  const { L, variants } = useDerived();
  const toast = useToast();
  const rows = useMemo(() => countRows(s, L, variants), [s, L, variants]);

  const print = async (id: string, name: string) => {
    const r = await printShelfLabel({ locationId: id, copies: 1 });
    if (!r.ok) toast(r.error);
    else if (isNative()) toast(`${name} label sent to the shelf printer`);
  };

  const chip: React.CSSProperties = {
    minHeight: 44, minWidth: 64, padding: "0 12px", border: "2px solid " + INK, background: "transparent", color: INK,
    fontFamily: "inherit", fontSize: 13, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", cursor: "pointer", flex: "none",
  };

  return (
    <>
      <MTop title="Count a shelf" back right={<MTopCount>{rows.length}</MTopCount>} />
      <MRule />
      <MBody pad>
        {rows.length === 0 ? (
          <MEmpty title="Nothing to count yet" sub="Place garments on a shelf in the portal." />
        ) : (
          <>
            <MSection label="Shelves" right="lines · units" />
            {rows.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid var(--color-divider)" }}>
                <div style={{ flex: 1, minWidth: 0, marginBottom: -1 }}>
                  <MRow href={`/m/count/${r.id}`} mark={r.id === UNPLACED ? "mute" : "ink"}
                    title={<span style={{ paddingLeft: r.depth * 14 }}>{r.name}</span>}
                    sub={<span style={{ paddingLeft: r.depth * 14 }}>{lastCounted(r.last, s.today)}</span>}
                    right={`${r.lines} · ${r.units}`} />
                </div>
                {r.id !== UNPLACED && (
                  <button type="button" style={chip} onClick={() => print(r.id, r.name)} aria-label={`Print a shelf label for ${r.name}`}>Label</button>
                )}
              </div>
            ))}
          </>
        )}
      </MBody>
    </>
  );
}
