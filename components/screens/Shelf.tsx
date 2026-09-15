"use client";
/* 1H — Shelf check. Kill the "have you got any size 12s?" message before it is sent.
 *
 * Words, never counts. Wards see In stock / Low / None on shelf; the number stays in the linen
 * room. That is partly the product rule and partly honesty — the count here is as fresh as the
 * last stocktake of that garment, which is why each row says when it was counted rather than
 * implying a live figure.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { MBody, MRule, MTop, inputStyle } from "@/components/m";
import { INK, N600, N700, StockTag } from "@/components/staffui";
import StaffNav from "@/components/staffnav";
import { fmtDate } from "@/lib/compute";

type Size = { size: string; si: number; word: string; countedOn: string };
type Item = { id: string; item: string; type: string; gender: string; sizes: Size[]; recorded: string };

export default function ShelfScreen({ items }: { items: Item[] }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) =>
      i.item.toLowerCase().includes(needle) ||
      i.type.toLowerCase().includes(needle) ||
      i.sizes.some((s) => String(s.size).toLowerCase() === needle));
  }, [items, q]);

  return (
    <>
      <MTop title="On the shelf" back />
      <MRule />
      <MBody>
        <div style={{ background: "#fff", padding: 16, borderBottom: "2px solid " + INK }}>
          {/* Named, not just placeheld: the placeholder is gone as soon as anyone types, and a
              box that then announces itself as "edit, blank" is a box nobody can come back to. */}
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search garments or a size"
            aria-label="Search garments or a size"
            autoComplete="off" style={{ ...inputStyle, width: "100%" }}
          />
        </div>

        {shown.length === 0 && (
          <div style={{ padding: "28px 16px", fontSize: 14, color: N600, lineHeight: 1.6 }}>
            Nothing matches &ldquo;{q}&rdquo;.
          </div>
        )}

        {shown.map((it) => (
          <div key={it.id}>
            <div style={{ padding: "18px 16px 8px", background: "var(--color-bg)", borderBottom: "2px solid " + INK }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: N600 }}>
                {it.item}{it.gender && it.gender !== "Unisex" ? ` · ${it.gender}` : ""}
              </span>
            </div>
            {it.sizes.map((s) => {
              const row = (
                <>
                  <span style={{ flex: 1, fontSize: 16, fontWeight: 800, textAlign: "left" }}>
                    {s.size}
                    {it.recorded && String(it.recorded) === String(s.size) && (
                      <span style={{ fontSize: 12, fontWeight: 600, color: N600, marginLeft: 8 }}>your size</span>
                    )}
                  </span>
                  <StockTag word={s.word} />
                </>
              );
              const style: React.CSSProperties = {
                display: "flex", gap: 12, alignItems: "center", padding: "14px 16px", background: "#fff",
                borderTop: "1px solid var(--color-divider)", borderRight: 0, borderBottom: 0, width: "100%",
                borderLeft: s.word === "none" ? "6px solid var(--color-accent)" : "6px solid transparent",
                font: "inherit", color: INK, borderRadius: 0, textDecoration: "none",
              };
              // A size that isn't there is the one row worth tapping: it leads to the waitlist
              // rather than a dead end, which is the whole point of 2B.
              return s.word === "none" ? (
                <Link key={s.si} href={`/my/waitlist?item=${it.id}&si=${s.si}`} style={style} className="tcx-bar">{row}</Link>
              ) : (
                <div key={s.si} style={style}>{row}</div>
              );
            })}
          </div>
        ))}

        <p style={{ fontSize: 13, lineHeight: 1.6, color: N700, padding: 16, margin: 0 }}>
          Availability comes from the last linen-room stocktake
          {shown[0]?.sizes.find((s) => s.countedOn) ? ` — most recently ${fmtDate(shown.flatMap((i) => i.sizes).map((s) => s.countedOn).filter(Boolean).sort().reverse()[0] || "")}` : ""}.
          Wards see words, not counts.
        </p>
        <div style={{ height: 12 }} />
      </MBody>
      <StaffNav />
    </>
  );
}
