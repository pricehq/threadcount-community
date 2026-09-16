"use client";
/* 1H — Shelf check. Kill the "have you got any size 12s?" message before it is sent.
 *
 * Words, never counts. Wards see In stock / Low / None on shelf; the number stays in the linen
 * room. That is partly the product rule and partly honesty — the word here is as fresh as the last
 * stocktake of that garment, which is what the one closing line says and why no row implies a live
 * figure.
 *
 * Every row is a way on. A size that is not there leads to the waitlist; a size that is leads to
 * the request screen with the garment and size already chosen. A row that did neither left somebody
 * who had just found their size with nothing to tap.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { MBody, MRule, MSection, MTop, inputStyle } from "@/components/m";
import { DIVIDER, INK, Kicker, N600, N700, StockTag } from "@/components/staffui";
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

  // The most recent stocktake anywhere in what is on screen: one date, in one line, at the foot.
  const counted = shown.flatMap((i) => i.sizes).map((s) => s.countedOn).filter(Boolean).sort().reverse()[0] || "";

  return (
    <>
      {/* A detail screen: a chevron, and no tab bar. The bar belongs to the five tab roots, and on
          this screen it marked none of them as current — five unselected tabs and no aria-current
          tell a screen reader the app is on no tab at all, and eat 66px of a shelf list. */}
      <MTop title="On the shelf" back backHref="/my" />
      <MRule />
      <MBody>
        <div style={{ padding: "16px 16px 0" }}>
          <Kicker>Wards see words, not counts</Kicker>
          {/* Named, not just placeheld: the placeholder is gone as soon as anyone types, and a
              box that then announces itself as "edit, blank" is a box nobody can come back to. */}
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search garments or a size"
            aria-label="Search garments or a size"
            autoComplete="off" style={{ ...inputStyle, width: "100%", marginTop: 12 }}
          />
        </div>

        <div style={{ padding: "0 16px" }}>
          {shown.length === 0 && (
            <div style={{ padding: "26px 0", fontSize: 14, color: N600, lineHeight: 1.6 }}>
              Nothing matches “{q}”.
            </div>
          )}

          {shown.map((it) => (
            <div key={it.id}>
              <MSection label={`${it.item}${it.gender && it.gender !== "Unisex" ? ` · ${it.gender}` : ""}`} />
              {it.sizes.map((s) => {
                const mine = !!it.recorded && String(it.recorded) === String(s.size);
                const none = s.word === "none";
                const href = none
                  ? `/my/waitlist?item=${encodeURIComponent(it.id)}&si=${s.si}`
                  : `/my/request?item=${encodeURIComponent(it.id)}&si=${s.si}`;
                return (
                  <Link
                    key={s.si}
                    href={href}
                    className="tcx-bar"
                    aria-label={`${it.item}, size ${s.size}${mine ? ", your size" : ""}. ${none ? "None on shelf — join the waitlist" : "Ask for one"}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, minHeight: 60, padding: "9px 0",
                      width: "100%", borderBottom: `1px solid ${DIVIDER}`, color: INK,
                      textDecoration: "none", font: "inherit", background: "none",
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700 }}>
                      {s.size}{mine ? " · your size" : ""}
                    </span>
                    <StockTag word={s.word} />
                  </Link>
                );
              })}
            </div>
          ))}

          <p style={{ fontSize: 13, lineHeight: 1.6, color: N700, padding: "16px 0 0", margin: 0 }}>
            Availability comes from the last linen-room stocktake{counted ? ` — most recently ${fmtDate(counted)}` : ""}.
          </p>
        </div>
        <div style={{ height: 12 }} />
      </MBody>
    </>
  );
}
