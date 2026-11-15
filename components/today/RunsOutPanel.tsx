"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { Panel } from "@/components/portal";
import { atReorderVariants } from "@/lib/portalcounts";
import { runsOutRows } from "@/lib/today";

const MAX_ROWS = 6;
const ACCENT = "var(--color-accent-700)";

export default function RunsOutPanel() {
  const { s, isAdmin } = useSnap();
  const { L, byId } = useDerived();
  const rows = useMemo(() => runsOutRows(s, L, byId), [s, L, byId]);
  const atReorder = useMemo(() => atReorderVariants(s, L).length, [s, L]);
  if (rows.length === 0) return null;

  return (
    <Panel
      id="runs-out"
      title="Runs out before a delivery"
      aside={`${rows.length} line${rows.length === 1 ? "" : "s"}`}
      foot={<>
        <span className="tc-meta-line" style={{ marginRight: "auto" }}>{atReorder} line{atReorder === 1 ? "" : "s"} at reorder</span>
        {isAdmin
          ? <Link href="/app/orders" className="btn btn-primary">Open the order list</Link>
          : <Link href="/app/stock?filter=reorder" className="btn btn-secondary">Open stock</Link>}
      </>}
    >
      <div style={{ overflowX: "auto" }}>
        <table className="tc-table">
          <thead>
            <tr><th scope="col">Garment</th><th scope="col" className="num">On hand</th><th scope="col" className="num">Cover</th></tr>
          </thead>
          <tbody>
            {rows.slice(0, MAX_ROWS).map((r) => (
              <tr key={r.key}>
                <td>
                  <Link href={`/app/stock/${r.itemId}`} style={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}>{r.name}</Link>
                  <div className="tc-meta-line tc-mono">{r.size} · {r.out ? `reorder at ${r.ro}` : `lead ${r.leadDays} days`}</div>
                </td>
                <td className="num" style={r.oh <= 0 ? { color: ACCENT, fontWeight: 600 } : undefined}>{r.oh}</td>
                <td className="num" style={r.out || r.short ? { color: ACCENT } : undefined}>
                  {r.out ? "out" : r.coverDays === null ? "—" : `${r.coverDays} day${r.coverDays === 1 ? "" : "s"}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
