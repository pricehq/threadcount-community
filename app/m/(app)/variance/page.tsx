"use client";
/* Variance over time: the pattern, not the number. A line short at every count is a different
   problem from one short once, so the chart is the point and the latest gap is the figure. */
import { useMemo, useState } from "react";
import { useSnap } from "@/lib/client";
import { itemMap, label, monthLabel } from "@/lib/compute";
import { INK, MBody, MButton, MEmpty, MKick, MONO, MRule, MSection, MTop, MTopCount } from "@/components/m";

const MAX_BAR = 56;
const PAGE = 40;

export default function MVarianceOverTime() {
  const { s } = useSnap();
  const [shown, setShown] = useState(PAGE);

  const { rows, counts } = useMemo(() => {
    const byId = itemMap(s);
    // Oldest first, shelf counts only, the last six.
    const takes = s.stocktakes.filter((t) => t.mode !== "preloved").slice(0, 6).reverse();
    const seen: Record<string, { name: string; gaps: (number | null)[] }> = {};
    takes.forEach((t, col) => {
      for (const l of t.lines) {
        const k = `${l.itemId}:${l.si}`;
        const it = byId[l.itemId];
        if (!it) continue;
        (seen[k] ||= { name: `${label(it)} ${it.sizes[l.si] ?? l.si}`, gaps: takes.map(() => null) });
        seen[k].gaps[col] = l.counted - l.sys;
      }
    });
    const out = Object.entries(seen).map(([k, v]) => {
      const known = v.gaps.filter((g): g is number => g !== null);
      const latest = [...v.gaps].reverse().find((g) => g !== null) ?? 0;
      const shortEvery = known.length >= 2 && known.every((g) => g < 0);
      const worsening = known.length >= 3 && known[known.length - 1] < known[0] && known[known.length - 1] < 0;
      const verdict = known.every((g) => g === 0) ? "Steady"
        : shortEvery ? `Short at every count since ${monthLabel(takes[v.gaps.findIndex((g) => g !== null)]?.date.slice(0, 7) || "", { month: "long" })}`
        : worsening ? "Drifting short"
        : latest === 0 ? "Back in line" : "Occasional gap";
      return { key: k, name: v.name, gaps: v.gaps, latest, verdict, persistent: shortEvery || worsening };
    });
    // Worst pattern first: persistent problems, then the biggest gap.
    out.sort((a, b) => Number(b.persistent) - Number(a.persistent) || a.latest - b.latest || a.name.localeCompare(b.name));
    return { rows: out, counts: takes };
  }, [s]);

  const peak = Math.max(1, ...rows.flatMap((r) => r.gaps.map((g) => Math.abs(g ?? 0))));
  const month = (d: string, m: "short" | "long") => monthLabel(d.slice(0, 7), { month: m });

  return (
    <>
      <MTop title="Variance over time" back right={<MTopCount>{counts.length} count{counts.length === 1 ? "" : "s"}</MTopCount>} />
      <MRule />
      <MBody pad>
        {counts.length > 0 && <MKick>Gap at each count since {month(counts[0].date, "long")}</MKick>}

        {rows.length === 0 ? (
          <MEmpty title="No counts to compare yet" sub="Commit two shelf counts to see a pattern." />
        ) : (
          <>
            <MSection label="Lines" right={rows.length} />
            {rows.slice(0, shown).map((r) => (
              <div key={r.key} style={{ padding: "12px 0", borderBottom: "1px solid var(--color-divider)", boxShadow: r.persistent ? "inset 4px 0 0 var(--color-accent)" : undefined, paddingLeft: r.persistent ? 12 : 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{r.name}</div>
                    <div style={{ fontSize: 13, color: r.persistent ? "var(--color-accent-700)" : "var(--color-neutral-600)", fontWeight: r.persistent ? 800 : 400, marginTop: 1 }}>{r.verdict}</div>
                  </div>
                  <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 14, color: r.latest === 0 ? INK : "var(--color-accent-700)", whiteSpace: "nowrap" }}>
                    {r.latest === 0 ? "Match" : r.latest > 0 ? `+${r.latest}` : `−${-r.latest}`}
                  </div>
                </div>
                <div className="tcx-chart" style={{ marginTop: 12 }} role="img"
                  aria-label={`Gap at each count: ${r.gaps.map((g, i) => `${counts[i] ? month(counts[i].date, "short") : ""} ${g === null ? "not counted" : g}`).join(", ")}`}>
                  {r.gaps.map((g, i) => {
                    const mag = Math.abs(g ?? 0);
                    const h = g === null ? 4 : Math.max(4, Math.round((mag / peak) * MAX_BAR));
                    const col = g === null ? "var(--color-neutral-300)" : mag === 0 ? "var(--color-divider)" : mag >= 3 ? "var(--color-accent)" : INK;
                    return <i key={i} style={{ height: h, background: col }} />;
                  })}
                </div>
                <div aria-hidden="true" style={{ display: "flex", gap: 5, marginTop: 6 }}>
                  {counts.map((t, i) => (
                    <span key={i} style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>
                      {month(t.date, "short")}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {rows.length > shown && (
              <>
                <div style={{ fontSize: 13, color: "var(--color-neutral-600)", marginTop: 10 }}>Showing {shown} of {rows.length}</div>
                <MButton small label="Show more" onClick={() => setShown((n) => n + PAGE)} />
              </>
            )}
          </>
        )}
      </MBody>
    </>
  );
}
