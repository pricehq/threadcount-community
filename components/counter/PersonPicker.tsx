"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useSnap } from "@/lib/client";
import { Meter, Panel } from "@/components/portal";
import { heldByStaff, setsCap } from "@/lib/compute";
import styles from "./counter.module.css";

/* No person chosen yet: find one by name or staff number (a badge scan types the number). */
export default function PersonPicker({ onPick }: { onPick: (id: string) => void }) {
  const { s } = useSnap();
  const [q, setQ] = useState("");
  // One walk of the issues for the whole register, not one per row.
  const held = useMemo(() => heldByStaff(s), [s]);
  const cap = setsCap(s.settings.capSets);
  const qq = q.trim().toLowerCase();
  const active = s.staff.filter((st) => !st.inactive);
  const matches = active
    .filter((st) => !qq || `${st.first} ${st.last}`.toLowerCase().includes(qq) || `${st.last} ${st.first}`.toLowerCase().includes(qq) || st.num.toLowerCase().includes(qq))
    .slice(0, 8);

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const exact = qq ? s.staff.find((st) => st.num.toLowerCase() === qq) : undefined;
    const first = exact || matches[0];
    if (first) { e.preventDefault(); onPick(first.id); }
  }

  return (
    <Panel title="Find a person" aside={s.staff.length ? `${active.length} on the register` : undefined}>
      <div className={styles.search}>
        <input className={`input ${styles.searchInput}`} aria-label="Search the register by name or staff number" placeholder="Name or staff number, or scan a badge"
          value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} autoFocus />
      </div>
      {s.staff.length === 0 ? (
        <div className={styles.empty}>No staff on the register yet. <Link href="/app/staff">Add staff</Link></div>
      ) : matches.length === 0 ? (
        <div className={styles.empty}>Nobody matches “{q.trim()}”.</div>
      ) : (
        <div>
          {matches.map((st) => {
            const h = held[st.id] || { tops: 0, pants: 0, other: 0, sets: 0 };
            return (
              <button type="button" key={st.id} className={styles.pickRow} onClick={() => onPick(st.id)}>
                <span className={styles.pickMain}>
                  <span style={{ display: "block", fontWeight: 700 }}>{st.first} {st.last} <span className="tc-mono" style={{ fontWeight: 400, color: "#57534f", fontSize: 12 }}>{st.num}</span></span>
                  <span className={styles.meta} style={{ display: "block" }}>{[st.group, st.dept].filter(Boolean).join(" · ") || "—"}</span>
                </span>
                <span className={styles.pickMeters}>
                  <Meter label="Tops" value={h.tops} of={cap} size="sm" />
                  <Meter label="Pants" value={h.pants} of={cap} size="sm" />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
