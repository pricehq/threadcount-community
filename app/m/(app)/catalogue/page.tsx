"use client";
/* The whole catalogue on the phone, not just what's on the shelf: Stock lists only sizes with
 * history, so a garment created five minutes ago lives here. `?bind=<code>` arrives from a scan that
 * found nothing; picking a garment carries the code to its product card (admins only). */
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDerived, useSnap } from "@/lib/client";
import { label, money, type Item } from "@/lib/compute";
import { MBody, MButton, MEmpty, MPill, MRow, MRule, MSearch, MSection, MTop, MTopCount } from "@/components/m";

const PAGE = 300;

export default function MCatalogue() {
  const { s, isAdmin } = useSnap();
  const { byId } = useDerived();
  const router = useRouter();
  const sp = useSearchParams();
  const bindRaw = (sp.get("bind") || "").trim().slice(0, 80);
  const bind = isAdmin ? bindRaw : "";
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [shown, setShown] = useState(PAGE);

  // Binding is an admin job; an Issuer arriving with a code just gets the catalogue.
  useEffect(() => { if (bindRaw && !isAdmin) router.replace("/m/catalogue"); }, [bindRaw, isAdmin, router]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return s.catalog
      .filter((i: Item) => (showArchived ? i.archived : !i.archived))
      .map((i: Item) => ({
        ...i,
        name: label(byId[i.id] ?? i),
        sub: [i.sizes.length ? `${i.sizes.length} size${i.sizes.length === 1 ? "" : "s"}` : "No sizes", i.supplier, i.sku].filter(Boolean).join(" · "),
      }))
      .filter((i) => !needle || `${i.name} ${i.sku} ${i.supplier} ${i.type} ${i.group}`.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [s.catalog, byId, q, showArchived]);

  const archivedCount = s.catalog.filter((i: Item) => i.archived).length;
  const cardHref = (id: string) => `/m/catalogue/${encodeURIComponent(id)}${bind ? `?bind=${encodeURIComponent(bind)}` : ""}`;

  return (
    <>
      <MTop title="Catalogue" back right={<MTopCount>{rows.length}</MTopCount>} />
      <MRule />
      <MBody pad>
        <MSearch value={q} onChange={(v) => { setQ(v); setShown(PAGE); }} placeholder="Garment, code, supplier" label="Filter the catalogue" />
        {bind && <div style={{ marginTop: 10 }}><MPill tone="accent" mono>Binding {bind}</MPill></div>}

        {isAdmin && !bind && <MButton icon="plus" label="New garment" href="/m/catalogue/new" />}

        <MSection label={showArchived ? "Archived" : "Garments"} right={rows.length} />
        {rows.length === 0
          ? <MEmpty title={q ? "Nothing matches" : showArchived ? "Nothing archived" : "No garments yet"}
              sub={q ? "Try a shorter search." : undefined} />
          : rows.slice(0, shown).map((i) => (
              <MRow key={i.id} href={isAdmin ? cardHref(i.id) : undefined} chev={isAdmin}
                mark={i.archived ? "mute" : "ink"} title={i.name} sub={i.sub}
                right={i.cost ? money(i.cost) : undefined} />
            ))}
        {rows.length > shown && (
          <>
            <div style={{ fontSize: 13, color: "var(--color-neutral-600)", marginTop: 10 }}>Showing {shown} of {rows.length}</div>
            <MButton small label="Show more" onClick={() => setShown((n) => n + PAGE)} />
          </>
        )}

        {archivedCount > 0 && (
          <MButton small label={showArchived ? "Current catalogue" : `Show ${archivedCount} archived`}
            onClick={() => { setShowArchived(!showArchived); setShown(PAGE); }} />
        )}
      </MBody>
    </>
  );
}
