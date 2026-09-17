"use client";
/* The Stock tab: on hand against par, worst first, in three segments, and the stock jobs underneath. */
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDerived, useSnap } from "@/lib/client";
import { atReorderVariants } from "@/lib/portalcounts";
import { bcBound, flaggedNeeds, label, locMap, locTrail, onhand, reorderAt, touched } from "@/lib/compute";
import { MBody, MButton, MEmpty, MRow, MRule, MSearch, MSection, MSeg, MTabs, MTop, MTopCount } from "@/components/m";
import { PAGE, byShortfall, countRows, placedOnOrder } from "@/components/m/stock/stockdata";

type Seg = "below" | "order" | "all";
const SEGS: Seg[] = ["below", "order", "all"];

export default function MStock() {
  const { s } = useSnap();
  const { L, byId, variants } = useDerived();
  const router = useRouter();
  const sp = useSearchParams();
  const [seg, setSeg] = useState<Seg>(() => {
    const v = sp.get("seg") as Seg | null;
    return v && SEGS.includes(v) ? v : "below";
  });
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);

  const data = useMemo(() => {
    const locs = locMap(s);
    const onOrd = placedOnOrder(s, byId);
    const below = new Set(atReorderVariants(s, L).map((v) => v.key));
    const all = variants.filter((v) => touched(s, L, v.key)).map((v) => ({
      key: v.key, itemId: v.itemId, si: v.si, size: v.size,
      name: label(v.item), oh: onhand(s, L, v.key), par: reorderAt(s, v.key),
      code: bcBound(s, v.item, v.si), shelf: locTrail(locs, s.placed[v.key], 0),
      below: below.has(v.key), onOrder: (onOrd[v.key] || 0) > 0,
    }));
    const order = variants.filter((v) => (onOrd[v.key] || 0) > 0).length;
    return { all, below: below.size, order, drafts: flaggedNeeds(s, L, byId).length };
  }, [s, L, byId, variants]);

  const shelves = useMemo(() => countRows(s, L, variants).length, [s, L, variants]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.all
      .filter((r) => seg === "all" || (seg === "below" ? r.below : r.onOrder))
      .filter((r) => !needle || `${r.name} ${r.size} ${r.code} ${r.shelf}`.toLowerCase().includes(needle))
      .sort(byShortfall);
  }, [data, seg, q]);

  const pick = (k: Seg) => {
    setSeg(k); setShown(PAGE);
    router.replace(`/m/stock?seg=${k}`, { scroll: false });
  };

  return (
    <>
      <MTop title="Stock" right={<MTopCount>{data.below} short</MTopCount>} />
      <MRule />
      <MBody pad>
        <MSearch value={q} onChange={(v) => { setQ(v); setShown(PAGE); }} placeholder="Garment or size" label="Filter stock" scanHref="/m/scan" scanLabel="Scan a garment" />
        <div style={{ marginTop: 10 }}>
          <MSeg label="Stock lines" value={seg} onPick={pick} options={[
            { key: "below", label: "Below par", n: data.below },
            { key: "order", label: "On order", n: data.order },
            { key: "all", label: "All", n: data.all.length },
          ]} />
        </div>

        {rows.length === 0
          ? <MEmpty title="Nothing here" sub="Try All, or clear the search." />
          : rows.slice(0, shown).map((r) => (
              <MRow key={r.key} href={`/m/line/${encodeURIComponent(r.itemId)}/${r.si}`}
                mark={r.oh <= 0 ? "accent" : r.oh <= r.par ? "ink" : "mute"}
                title={`${r.name} ${r.size}`} right={`${r.oh}/${r.par}`} />
            ))}
        {rows.length > shown && (
          <>
            <div style={{ fontSize: 13, color: "var(--color-neutral-600)", marginTop: 10 }}>Showing {shown} of {rows.length}</div>
            <MButton small label="Show more" onClick={() => setShown((n) => n + PAGE)} />
          </>
        )}

        <MSection label="Also in Stock" />
        <MRow mark="mute" chev href="/m/reorder" title={`Draft order · ${data.drafts} line${data.drafts === 1 ? "" : "s"}`} />
        <MRow mark="mute" chev href="/m/variance" title="Variance over time" />
        <MRow mark="mute" chev href="/m/catalogue" title="Catalogue" />
        <MRow mark="mute" chev href="/m/count" title={`Count a shelf · ${shelves} shel${shelves === 1 ? "f" : "ves"}`} />
      </MBody>
      <MTabs active="stock" />
    </>
  );
}
