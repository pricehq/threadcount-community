"use client";
/* Create a garment from the counter.
 *
 * The only genuinely required things are a name and at least one size — the server enforces exactly
 * that — so everything else can be filled in later from the product card. Sizes are entered as a
 * run rather than one at a time, because that is how they arrive. */
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useSnap } from "@/lib/client";
import type { Item } from "@/lib/compute";
import { INK, MBar, MBody, MEmpty, MError, MField, MRule, MTop, inputStyle } from "@/components/m";

const COMMON_RUNS: [string, string][] = [
  ["XS S M L XL", "XS · S · M · L · XL"],
  ["S M L XL 2XL", "S · M · L · XL · 2XL"],
  ["8 10 12 14 16 18", "8 – 18"],
  ["77R 82R 87R 92R", "77R – 92R"],
];

export default function MCatalogueNew() {
  const { s, isAdmin, mutate, busy } = useSnap();
  const router = useRouter();

  const [item, setItem] = useState("");
  const [type, setType] = useState("");
  const [group, setGroup] = useState("All");
  const [supplier, setSupplier] = useState("");
  const [sku, setSku] = useState("");
  const [cost, setCost] = useState("");
  const [sizeText, setSizeText] = useState("");
  const [err, setErr] = useState("");

  // Split on commas, slashes or whitespace so a run can be typed however it comes to hand.
  const sizes = useMemo(
    () => sizeText.split(/[,/\s]+/).map((x) => x.trim()).filter(Boolean),
    [sizeText],
  );
  const dupSize = useMemo(() => sizes.length !== new Set(sizes).size, [sizes]);

  /* The facility's configured groups are the vocabulary; groups already in use on the register or
   * the catalogue are folded in so none that predates the configured list vanishes. */
  const groups = useMemo(() => {
    const set = new Set<string>(["All", ...s.settings.staffGroups]);
    for (const st of s.staff) if (st.group) set.add(st.group);
    for (const i of s.catalog) if (i.group) set.add(i.group);
    return [...set].sort();
  }, [s.staff, s.catalog, s.settings.staffGroups]);

  const types = useMemo(() => [...new Set(s.catalog.map((i: Item) => i.type).filter(Boolean))].sort(), [s.catalog]);
  const suppliers = useMemo(() => s.supplierDir.map((x) => x.name).sort(), [s.supplierDir]);

  if (!isAdmin) {
    return (
      <>
        <MTop title="New garment" back />
        <MRule />
        <MBody pad><MEmpty title="Admins only" sub="An admin adds garments to the catalogue." /></MBody>
      </>
    );
  }

  async function save() {
    setErr("");
    if (!item.trim()) { setErr("Give the garment a name."); return; }
    if (!sizes.length) { setErr("Add at least one size."); return; }
    if (dupSize) { setErr("The same size is listed twice."); return; }
    const c = cost.trim() ? Number(cost) : 0;
    if (!(c >= 0) || Number.isNaN(c)) { setErr("Cost has to be a number, or left blank."); return; }

    const r = await mutate<{ id: string }>("catalog.add", {
      item: item.trim(), type: type.trim(), group, supplier: supplier.trim(),
      sku: sku.trim(), cost: c, sizes,
    });
    if (!r.ok) { setErr(r.error); return; }
    // Straight to the product card: the next thing anyone does is bind a barcode or set par.
    router.replace(`/m/catalogue/${r.result.id}`);
  }

  return (
    <>
      <MTop title="New garment" back />
      <MRule />
      <MError msg={err} onDismiss={() => setErr("")} />
      <MBody pad>
        <MField label="Garment">
          <input value={item} onChange={(e) => { setItem(e.target.value); setErr(""); }}
            placeholder="Scrub top" autoCapitalize="words" enterKeyHint="next" style={inputStyle} />
        </MField>

        <MField label="Sizes">
          <input value={sizeText} onChange={(e) => { setSizeText(e.target.value); setErr(""); }}
            placeholder="S M L XL" autoCapitalize="characters" autoCorrect="off" spellCheck={false} style={inputStyle} />
        </MField>
        <div role="group" aria-label="Common size runs" style={{ paddingBottom: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {COMMON_RUNS.map(([run, pretty]) => (
            <button key={run} type="button" aria-pressed={sizeText === run} onClick={() => { setSizeText(run); setErr(""); }}
              style={{ minHeight: 44, border: "2px solid " + INK, background: sizeText === run ? INK : "transparent", color: sizeText === run ? "var(--color-bg)" : INK, padding: "0 12px", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {pretty}
            </button>
          ))}
        </div>
        {sizes.length > 0 && (
          <div style={{ paddingBottom: 12, fontSize: 13, color: dupSize ? "var(--color-accent-700)" : "var(--color-neutral-700)", fontWeight: dupSize ? 700 : 400 }}>
            {dupSize ? "The same size is listed twice." : `${sizes.length} size${sizes.length === 1 ? "" : "s"}: ${sizes.join(" · ")}`}
          </div>
        )}

        <MField label="Type">
          <input list="tc-types" value={type} onChange={(e) => setType(e.target.value)} placeholder="Scrub top" style={inputStyle} />
          <datalist id="tc-types">{types.map((t) => <option key={t} value={t} />)}</datalist>
        </MField>

        <MField label="Who wears it">
          <select value={group} onChange={(e) => setGroup(e.target.value)} style={{ ...inputStyle, appearance: "none" }}>
            {groups.map((g) => <option key={g} value={g}>{g === "All" ? "Anyone" : g}</option>)}
          </select>
        </MField>

        <MField label="Supplier">
          <input list="tc-suppliers" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Optional" style={inputStyle} />
          <datalist id="tc-suppliers">{suppliers.map((x) => <option key={x} value={x} />)}</datalist>
        </MField>

        <MField label="Supplier code">
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Optional" autoCapitalize="characters" autoCorrect="off" spellCheck={false} style={inputStyle} />
        </MField>

        <MField label="Unit cost">
          <input value={cost} onChange={(e) => { setCost(e.target.value); setErr(""); }}
            inputMode="decimal" placeholder="0.00" style={inputStyle} />
        </MField>
      </MBody>
      <MBar label={busy ? "Saving…" : "Create garment"} onClick={save} disabled={busy} />
    </>
  );
}
