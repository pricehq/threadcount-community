"use client";
/* The People tab: the staff register, served-recently first, each row showing how near they are to
   the sets one person holds (capCheck, the same check the counter uses). */
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSnap } from "@/lib/client";
import { capCheck, staffName } from "@/lib/compute";
import { MBody, MEmpty, MRow, MRule, MSearch, MSection, MTabs, MTop, MTopCount } from "@/components/m";

export default function People() {
  const { s } = useSnap();
  const sp = useSearchParams();
  const [q, setQ] = useState(() => (sp.get("q") || "").slice(0, 80));
  const active = useMemo(() => s.staff.filter((x) => !x.inactive), [s]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) {
      const seen: Record<string, string> = {};
      for (const i of s.issues) if (i.date > (seen[i.staffId] || "")) seen[i.staffId] = i.date;
      return [...active].sort((a, b) => (seen[b.id] || "").localeCompare(seen[a.id] || "") || staffName(a).localeCompare(staffName(b))).slice(0, 12);
    }
    return s.staff
      .filter((x) => `${x.first} ${x.last} ${x.num} ${x.dept} ${x.group}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(a.inactive) - Number(b.inactive) || staffName(a).localeCompare(staffName(b)))
      .slice(0, 40);
  }, [s, q, active]);

  return (
    <>
      <MTop title="People" right={<MTopCount>{active.length}</MTopCount>} />
      <MRule />
      <MBody pad>
        <MSearch value={q} onChange={setQ} placeholder="Name or staff number" label="Search the staff register" scanHref="/m/scan" />
        {s.staff.length === 0 ? (
          <MEmpty title="No staff yet" sub="Staff are added in the portal." />
        ) : (
          <>
            <MSection label={q.trim() ? "Matches" : "Served recently"} right={list.length} />
            {list.map((st) => {
              const cap = capCheck(s, st);
              const most = Math.max(cap.tops, cap.pants);
              return (
                <MRow key={st.id} href={`/m/person/${st.id}`} title={staffName(st)}
                  sub={[st.group, st.num, st.dept].filter((x) => x && x.trim()).join(" · ")}
                  right={`${most}/${cap.cap}`} mark={st.inactive ? "mute" : most >= cap.cap ? "accent" : "ink"} />
              );
            })}
            {q.trim() && list.length === 0 && <MEmpty title={`No one matches “${q.trim()}”`} sub="Check the spelling, or scan their badge." />}
          </>
        )}
      </MBody>
      <MTabs active="people" />
    </>
  );
}
