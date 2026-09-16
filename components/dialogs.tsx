"use client";
import { useCallback, useId, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useDerived, useSnap } from "@/lib/client";
import { Dialog, ErrorLine, Field, ItemSizePicker, Stepper } from "@/components/ui";
import Camera from "@/components/Camera";
import { addDays, ALL_GROUPS, bcParse, ccBudgetNote, facilityToday, FTE_OPTIONS, PRODUCT_TYPES, UNIFORM_STYLES, ccOf, fmtDate, garmentGroups, groupKey, isNursing, key, label, leadDaysOf, money, onhand, plOf, setHalf, staffName, type ApprovalRec, type HandInRec, type IssueRec, type Item, type OrderRec, type StaffRec, SIZE_SETS } from "@/lib/compute";
import { gtinInfo, gtinNote } from "@/lib/compute";
import { esc, openPrintWindow } from "@/lib/print";
import { takePhoto, uploadPhoto, viewPhoto } from "@/lib/photo";
import { useEffect, useRef } from "react";
import { daysBetween, telHref, type PickupRec } from "@/lib/compute";

// ---------------------------------------------------------------- Adjust quantity
export function AdjustDialog({ init, onClose }: { init?: { itemId: string; si: number; preloved?: boolean } | null; onClose: () => void }) {
  const { s, isAdmin, mutate } = useSnap();
  const { L, byId } = useDerived();
  // "Set on hand" is what someone almost always means by adjusting a line, so it leads for admins;
  // issuers can't correct counts (same rule as Adjust) and start on Receive.
  const [mode, setMode] = useState<"Set" | "Pre-loved" | "Receive" | "Adjust" | "Opening">(init?.preloved ? "Pre-loved" : isAdmin ? "Set" : "Receive");
  const [pick, setPick] = useState(init?.itemId || "");
  const [lines, setLines] = useState<{ itemId: string; si: number; qty: string }[]>(init?.itemId ? [{ itemId: init.itemId, si: init.si, qty: "" }] : []);
  const [reason, setReason] = useState("Correction");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const MODES: [typeof mode, string, string][] = [
    ["Set", "Set on hand", "Enter what you actually counted and ThreadCount works out the difference."],
    ["Receive", "Receive", "Stock that arrived without an order. Adds to what’s already there."],
    ["Adjust", "Adjust", "Add or subtract a number with a reason. Negative quantities write stock off."],
    ["Pre-loved", "Pre-loved", "Add garments to the pre-loved pool. Negative quantities correct it."],
    ["Opening", "Opening balance", "Overwrite a line’s opening balance — start-up only."],
  ];
  const now = (l: { itemId: string; si: number }) => (mode === "Pre-loved" ? plOf(s, key(l.itemId, l.si)) : onhand(s, L, key(l.itemId, l.si)));
  /** What the line will read once this is saved — shown per line so no mode can surprise anyone. */
  const after = (l: { itemId: string; si: number; qty: string }) => {
    const q = parseInt(l.qty, 10);
    if (!Number.isFinite(q)) return null;
    if (mode === "Set") return Math.max(0, q);
    if (mode === "Opening") return null; // opening is one component of on-hand, not the total
    if (mode === "Receive") return now(l) + Math.abs(q);
    if (mode === "Pre-loved") return Math.max(0, now(l) + q);
    return now(l) + q;
  };
  /** A line nobody has finished filling in — blank, a lone minus sign, or a counted figure below
   *  zero. Nothing can be filed from one of these, so they hold the save back. */
  const unusable = (l: { itemId: string; si: number; qty: string }) => {
    if (l.qty === "" || l.qty === "-") return true;
    const q = parseInt(l.qty, 10);
    if (!Number.isFinite(q)) return true;
    if (mode === "Set") return q < 0;
    return q === 0 && mode !== "Opening";
  };
  /** A counted figure that already agrees with the shelf is not a mistake — it is a line with
   *  nothing to file, and stock.moves skips a zero delta at the other end anyway. Treating it as
   *  invalid used to kill the whole dialog: count three sizes after a delivery, get one of them
   *  right, and the two genuine corrections could not be saved at all until the coordinator guessed
   *  that the *correct* line was the obstacle and removed it. Only a set of lines where nothing
   *  whatsoever would change still blocks the save. */
  const noChange = (l: { itemId: string; si: number; qty: string }) => mode === "Set" && parseInt(l.qty, 10) === now(l);
  const allMatch = lines.length > 0 && lines.every(noChange);
  const invalid = lines.length === 0 || lines.some(unusable) || allMatch;
  async function save() {
    if (invalid) return;
    setBusy(true); setErr("");
    const r = await mutate("stock.moves", { mode, reason: mode === "Set" ? "Counted correction" : reason, lines: lines.map((l) => ({ itemId: l.itemId, si: l.si, qty: parseInt(l.qty, 10) || 0 })) });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onClose();
  }
  const cta = mode === "Set" ? "Save counted quantity" : mode === "Pre-loved" ? "Add to pre-loved pool" : mode === "Receive" ? "Receive into stock" : mode === "Adjust" ? "Apply adjustment" : "Set opening balance";
  return (
    <Dialog title="Adjust quantity" width={640} onClose={onClose} foot={<>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" onClick={save} disabled={invalid || busy}>{cta}</button>
    </>}>
      <div className="seg" style={{ marginTop: "var(--space-3)", flexWrap: "wrap" }}>
        {MODES.filter((m) => ((m[0] !== "Opening" && m[0] !== "Set" && m[0] !== "Adjust") || isAdmin)).map(([m, lbl]) => <button key={m} className={"seg-opt" + (mode === m ? " btn-primary" : "")} onClick={() => setMode(m)}>{lbl}</button>)}
      </div>
      <div style={{ fontSize: 12, color: "var(--color-neutral-700)", marginTop: "var(--space-2)" }}>{MODES.find((m) => m[0] === mode)![2]}</div>
      <div style={{ marginTop: "var(--space-3)" }}>
        <ItemSizePicker s={s} itemId={pick} onItem={setPick} placeholder="Add an item…" onSize={(it, si) => { if (!lines.find((l) => l.itemId === it.id && l.si === si)) setLines([...lines, { itemId: it.id, si, qty: "" }]); }} />
      </div>
      {lines.map((l, i) => {
        const it = byId[l.itemId];
        const to = after(l);
        const cur = now(l);
        return (
          <div key={l.itemId + l.si} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-2) 0", borderBottom: "1px solid var(--color-divider)", fontSize: 13, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>{label(it)} · size {it?.sizes[l.si]} <span style={{ color: "var(--color-neutral-600)" }}>(now {cur}{mode === "Pre-loved" ? " pre-loved" : " on hand"})</span></div>
            {/* Named after the line it belongs to, not "quantity".
                These boxes stack up — one per size added to the adjustment — and every one of them
                is an unlabelled 80px box in a row of identical rows. A screen reader announced five
                blank edit boxes with nothing to tell them apart, and typing into the wrong one
                writes the wrong stock figure against the wrong size without anything ever looking
                out of place. A Field can't be used here: the label the eye reads is the garment
                name to the left, which is shared with the running total and the Remove button. */}
            <input className="input" style={{ width: 80, textAlign: "right", minHeight: 28, padding: "2px 8px" }} inputMode="numeric"
              aria-label={`${label(it)} size ${it?.sizes[l.si] ?? l.si} — ${mode === "Set" ? "counted quantity" : mode === "Opening" ? "opening balance" : "quantity"}`}
              placeholder={mode === "Set" ? String(cur) : "0"} value={l.qty}
              onChange={(e) => { const v = e.target.value.replace(mode === "Set" || mode === "Receive" || mode === "Opening" ? /[^0-9]/g : /[^0-9-]/g, ""); setLines(lines.map((x, j) => j === i ? { ...x, qty: v } : x)); }} />
            <div style={{ width: 96, textAlign: "right", color: to === null ? "var(--color-neutral-400)" : to === cur ? "var(--color-neutral-600)" : "var(--color-text)", fontWeight: to !== null && to !== cur ? 700 : 400 }}>
              {to === null ? "—" : `${cur} → ${to}`}
            </div>
            <button className="btn btn-ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</button>
          </div>
        );
      })}
      {/* Rule, weight and mark, not just red: the Save button below is the same colour, and this
          line is the only thing on screen explaining why it will not do anything. */}
      {allMatch && <div className="tc-flag" style={{ fontSize: 13, color: "var(--color-accent-700)", fontWeight: 700, marginTop: "var(--space-3)", padding: "var(--space-2) var(--space-3)" }}><span className="tc-mark" aria-hidden="true" />Every line already matches what ThreadCount holds, so there is nothing to correct. Change a figure, or remove the lines that were right.</div>}
      {mode === "Adjust" && (
        <Field style={{ marginTop: "var(--space-3)" }} label="Reason">
          {(c) => (
            <select {...c} className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
              {["Correction", "Damaged — write off", "Found", "Donated", "Other"].map((o) => <option key={o}>{o}</option>)}
            </select>
          )}
        </Field>
      )}
      <ErrorLine msg={err} />
    </Dialog>
  );
}

// ---------------------------------------------------------------- A garment's staff groups
/** The staff groups a garment is for, as a tick-list of the facility's groups. EMPTY MEANS EVERY
 *  GROUP, and "All groups" is its own tick, so there is one way to say it. A group the garment is
 *  tagged with that is no longer on the facility's list still shows, ticked, so it can come off.
 *  Not a Field: the .field label style would turn every tick's label into a column heading. */
export const GROUPS_HINT = "Other groups can't request it, and need the override at the counter.";
export function GroupsPicker({ value, onChange, groups, hint, style }: { value: string[]; onChange: (groups: string[]) => void; groups: string[]; hint?: string; style?: CSSProperties }) {
  const hintId = useId();
  const on = (g: string) => value.some((x) => groupKey(x) === groupKey(g));
  // "All" on the facility's list would make garmentGroups() read the whole list as every group.
  const opts = garmentGroups([...groups, ...value].filter((g) => groupKey(g) !== "all" && groupKey(g) !== groupKey(ALL_GROUPS)));
  const toggle = (g: string) => onChange(on(g) ? value.filter((x) => groupKey(x) !== groupKey(g)) : [...value, g]);
  const tick: CSSProperties = { display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer", minHeight: 28 };
  const box: CSSProperties = { width: 15, height: 15, accentColor: "var(--color-accent)", margin: 0 };
  return (
    <fieldset aria-describedby={hint ? hintId : undefined} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "flex", flexDirection: "column", gap: 4, ...style }}>
      <legend style={{ padding: 0, marginBottom: 4, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}>Staff groups</legend>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0 var(--space-4)" }}>
        <label style={tick}><input type="checkbox" style={box} checked={value.length === 0} onChange={() => onChange([])} />All groups</label>
        {opts.map((g) => <label key={groupKey(g)} style={tick}><input type="checkbox" style={box} checked={on(g)} onChange={() => toggle(g)} />{g}</label>)}
      </div>
      {hint && <div id={hintId} style={{ fontSize: 11, color: "var(--color-neutral-700)" }}>{hint}</div>}
    </fieldset>
  );
}
/** Two group lists hold the same groups, in any order — the test catalog.duplicate applies. */
const sameGroups = (a: readonly string[], b: readonly string[]) => {
  const k = (l: readonly string[]) => garmentGroups(l).map(groupKey).sort().join("\n");
  return k(a) === k(b);
};

// ---------------------------------------------------------------- Catalogue item (add / edit)
export function ItemDialog({ item, onClose, onSaved, barcode = "", initName = "" }: { item?: Item | null; onClose: () => void; onSaved?: (id: string, name?: string) => void; barcode?: string; initName?: string }) {
  const { s, mutate } = useSnap();
  const editing = !!item;
  const [f, setF] = useState({
    name: item?.item || initName, gender: item ? (item.gender === "Male" ? "Men's" : item.gender === "Female" ? "Women's" : "Unisex") : "Unisex",
    type: item?.type || "", groups: item ? garmentGroups(item.groups) : [] as string[], sku: item?.sku || "", supplier: item?.supplier || s.settings.suppliers[0] || "",
    cost: item ? String(item.cost) : "", notes: item?.notes || "", sizeSet: Object.keys(SIZE_SETS)[0], sizes: item ? [...item.sizes] : [] as string[], custom: "",
  });
  // One row per size on a new item: the barcode printed on that size's label, and what's on the shelf now.
  const [rows, setRows] = useState<Record<string, { code: string; opening: string }>>(() => (barcode ? {} : {}));
  const [scanAt, setScanAt] = useState<string | null>(null);
  const [cam, setCam] = useState(false);
  const [camMsg, setCamMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const row = (sz: string) => rows[sz] || { code: "", opening: "" };
  const setRow = (sz: string, p: Partial<{ code: string; opening: string }>) => setRows((r) => ({ ...r, [sz]: { ...(r[sz] || { code: "", opening: "" }), ...p } }));

  // A barcode arriving from "Scan to add" belongs to whichever size the coordinator picks below.
  const scannedSizes = f.sizes.filter((sz) => row(sz).code === barcode && !!barcode);
  const bcPick = barcode && !editing ? (scannedSizes[0] || "") : "";
  const dupCode = (() => {
    const seen: Record<string, string> = {};
    for (const sz of f.sizes) { const c = row(sz).code.trim(); if (!c) continue; if (seen[c]) return c; seen[c] = sz; }
    return "";
  })();
  const invalid = !f.name.trim() || f.sizes.length === 0 || !(parseFloat(f.cost) >= 0) || f.cost === "" || (!!barcode && !editing && !bcPick) || !!dupCode;
  // The type is what the ceiling reads, and for every staff group, not only nursing: a top or a pair
  // of trousers counts toward the sets one person holds, and anything else toward a ceiling of its
  // own, counted in garments. It is a free-text field, and a type typed by hand that isn't on the
  // list matches neither half — a scrub top saved as "scrubs" quietly stops counting toward
  // anybody's six, and nothing at the counter would ever say so. So the form says which it will be,
  // and warns when the list doesn't know the type.
  const typeHalf = f.type ? setHalf({ type: f.type, item: f.name }) : null;
  const typeListed = PRODUCT_TYPES.some((t) => t.toLowerCase() === f.type.toLowerCase());

  async function save() {
    if (invalid) return;
    setBusy(true); setErr("");
    const gender = f.gender === "Men's" ? "Male" : f.gender === "Women's" ? "Female" : "Unisex";
    const payload = { item: f.name, gender, type: f.type, groups: f.groups, sku: f.sku, supplier: f.supplier, cost: parseFloat(f.cost), notes: f.notes, sizes: f.sizes };
    const barcodes = f.sizes.map((sz, si) => ({ si, code: row(sz).code.trim() })).filter((b) => b.code);
    const opening = f.sizes.map((sz, si) => ({ si, qty: parseInt(row(sz).opening, 10) || 0 })).filter((o) => o.qty > 0);
    const r = editing
      ? await mutate("catalog.update", { id: item!.id, ...payload })
      : await mutate<{ id: string }>("catalog.add", { ...payload, barcodes, opening });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onSaved?.(editing ? item!.id : (r.result as { id: string }).id, f.name.trim());
    onClose();
  }

  const addSize = (sz: string) => {
    const v = sz.trim(); if (!v) return;
    if (f.sizes.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    const next = [...f.sizes, v];
    set({ sizes: next, custom: "" });
  };
  const dropSize = (sz: string) => { set({ sizes: f.sizes.filter((x) => x !== sz) }); setRows((r) => { const n = { ...r }; delete n[sz]; return n; }); };

  /** Scan straight down the size list: fill the targeted row, then jump to the next one still empty. */
  function camHit(raw: string) {
    const code = String(raw).trim().slice(0, 64);
    if (!code || !scanAt) return;
    if (f.sizes.some((sz) => sz !== scanAt && row(sz).code.trim() === code)) { setCamMsg(`${code} is already on size ${f.sizes.find((sz) => row(sz).code.trim() === code)} — scan a different label`); return; }
    setRow(scanAt, { code });
    const next = f.sizes.find((sz) => sz !== scanAt && !row(sz).code.trim());
    setScanAt(next || null);
    setCamMsg(next ? `${code} → size ${scanAt}. Next: size ${next}` : `${code} → size ${scanAt}. Every size has a barcode.`);
  }

  return (
    <>
    <Dialog title={editing ? "Edit catalogue item" : "Add catalogue item"} width={720} onClose={onClose} sub={editing ? "Sizes with history can be added to but not removed." : "Enter the garment once, then give each size its barcode and what’s on the shelf now."}
      foot={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={invalid || busy}>{editing ? "Save changes" : "Add to catalogue"}</button>
      </>}>
      <div className="tc-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
        <Field style={{ gridColumn: "1 / -1" }} label="Item name">{(c) => <input {...c} className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Unisex Softshell Jacket" />}</Field>
        <Field label="Gender">{(c) => <select {...c} className="input" value={f.gender} onChange={(e) => set({ gender: e.target.value })}><option>Unisex</option><option>Men&apos;s</option><option>Women&apos;s</option></select>}</Field>
        <Field label="SKU">{(c) => <input {...c} className="input" value={f.sku} onChange={(e) => set({ sku: e.target.value })} />}</Field>
        <Field label="Supplier">
          {(c) => (s.settings.suppliers.length
            ? <select {...c} className="input" value={f.supplier} onChange={(e) => set({ supplier: e.target.value })}>{s.settings.suppliers.map((o) => <option key={o}>{o}</option>)}{f.supplier && !s.settings.suppliers.includes(f.supplier) && <option>{f.supplier}</option>}</select>
            : <input {...c} className="input" value={f.supplier} onChange={(e) => set({ supplier: e.target.value })} placeholder="Add suppliers in Settings" />)}
        </Field>
        <Field label="Unit cost ($)">{(c) => <input {...c} className="input" value={f.cost} onChange={(e) => set({ cost: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" />}</Field>
        <Field label="Product type">
          {(c) => (
            <>
              <input {...c} className="input" list="tc-producttypes" value={f.type} onChange={(e) => set({ type: e.target.value })} placeholder="e.g. Shirt, Pants, Jacket" />
              <datalist id="tc-producttypes">{PRODUCT_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
            </>
          )}
        </Field>
        <GroupsPicker style={{ gridColumn: "1 / -1" }} value={f.groups} onChange={(groups) => set({ groups })} groups={s.settings.staffGroups} hint={GROUPS_HINT} />
        <Field style={{ gridColumn: "1 / -1" }} label="Notes">{(c) => <input {...c} className="input" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />}</Field>
      </div>
      {!!f.type && (
        <div style={{ fontSize: 12, color: "var(--color-neutral-700)", marginTop: "var(--space-2)" }}>
          {typeHalf
            ? <>Counts as {typeHalf === "top" ? <>a <b>top</b></> : <><b>trousers</b></>} — half a set.</>
            : <>Not part of a set.{!typeListed && <> If it is a top or trousers, pick the type from the list.</>}</>}
        </div>
      )}

      <div style={{ marginTop: "var(--space-5)" }}>
        {/* .sec is the app's section rule. Hand-drawing it here is how two of them end up a pixel
            and a letter-space apart, which is the drift this codebase keeps being bitten by. */}
        <div className="sec">Sizes</div>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
          <Field style={{ flex: 1, minWidth: 150 }} label="Add a size">
            {(c) => (
              <input {...c} className="input" value={f.custom} placeholder="S, M, L or 6, 8, 12 — Enter to add"
                onChange={(e) => set({ custom: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSize(f.custom); } }} />
            )}
          </Field>
          <button className="btn btn-secondary" onClick={() => addSize(f.custom)} disabled={!f.custom.trim()}>Add size</button>
        </div>
        <div style={{ fontSize: 12, color: "var(--color-neutral-700)", marginTop: "var(--space-2)" }}>Or add a whole run at once:</div>
        <div className="seg" style={{ marginTop: "var(--space-2)" }}>{Object.keys(SIZE_SETS).map((k) => <button key={k} className={"seg-opt" + (f.sizeSet === k ? " btn-primary" : "")} onClick={() => set({ sizeSet: k })}>{k}</button>)}</div>
        <div style={{ display: "flex", gap: "var(--space-1)", flexWrap: "wrap", marginTop: "var(--space-2)" }}>
          {SIZE_SETS[f.sizeSet].map((sz) => <button key={sz} className={"btn " + (f.sizes.some((x) => x.toLowerCase() === sz.toLowerCase()) ? "btn-primary" : "btn-ghost")} style={{ minHeight: 30, padding: "2px 10px" }} onClick={() => (f.sizes.some((x) => x.toLowerCase() === sz.toLowerCase()) ? dropSize(f.sizes.find((x) => x.toLowerCase() === sz.toLowerCase())!) : addSize(sz))}>{sz}</button>)}
        </div>
      </div>

      {!!barcode && !editing && f.sizes.length > 0 && (
        <div style={{ marginTop: "var(--space-4)", border: "2px solid var(--color-text)", padding: "var(--space-3)" }}>
          <div className="tc-meta" style={{ fontWeight: 700, color: "var(--color-text)" }}>Scanned barcode {barcode}</div>
          <div style={{ fontSize: 12, color: "var(--color-neutral-700)", margin: "var(--space-1) 0 var(--space-2)" }}>Which size did you scan?</div>
          <div style={{ display: "flex", gap: "var(--space-1)", flexWrap: "wrap" }}>
            {f.sizes.map((sz) => (
              <button key={sz} className={"btn " + (bcPick === sz ? "btn-primary" : "btn-ghost")} style={{ minHeight: 30, padding: "2px 10px" }}
                onClick={() => setRows((r) => { const n = { ...r }; for (const k of Object.keys(n)) if (n[k].code === barcode) n[k] = { ...n[k], code: "" }; n[sz] = { ...(n[sz] || { code: "", opening: "" }), code: barcode }; return n; })}>{sz}</button>
            ))}
          </div>
        </div>
      )}

      {f.sizes.length > 0 && (
        <div style={{ marginTop: "var(--space-5)" }}>
          <div className="sec">{editing ? "Sizes on this item" : "Barcode and opening stock"}</div>
          {editing ? (
            <div style={{ fontSize: 12, color: "var(--color-neutral-700)", marginTop: "var(--space-2)" }}>{f.sizes.join(", ")} — bind barcodes with <b>Scan sizes</b> on the product page, and set quantities with <b>Adjust quantity</b>.</div>
          ) : (
            <>
              <div className="table-wrap">
                <div className="tc-meta" style={{ display: "grid", gridTemplateColumns: "72px 1fr 96px 110px 40px", gap: "var(--space-2)", padding: "var(--space-3) 0 var(--space-1)", minWidth: 460 }}>
                  <div>Size</div><div>Barcode on the label</div><div></div><div style={{ textAlign: "right" }}>Opening stock</div><div></div>
                </div>
                {f.sizes.map((sz) => (
                  <div key={sz} style={{ display: "grid", gridTemplateColumns: "72px 1fr 96px 110px 40px", gap: "var(--space-2)", alignItems: "center", padding: "var(--space-1) 0", borderBottom: "1px solid var(--color-divider)", minWidth: 460, background: scanAt === sz ? "var(--color-neutral-200)" : undefined }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{sz}</div>
                    {/* The size is printed at the head of the row and nowhere else, so the only name
                        these boxes had was a placeholder repeated down the column: "scan or type,
                        edit" four times over with nothing separating S from M. A supplier barcode
                        typed one row off makes that size scan as another one for the rest of its
                        life — the M label scans as nothing and an L hands the wearer an M. */}
                    <input className="input" style={{ minHeight: 30, padding: "2px 8px", fontSize: 13, width: "100%" }} inputMode="numeric" aria-label={`Size ${sz} — barcode on the label`} placeholder="scan or type" value={row(sz).code} onChange={(e) => setRow(sz, { code: e.target.value.slice(0, 64) })} />
                    <button className="btn btn-ghost" style={{ minHeight: 28, padding: "2px 8px" }} onClick={() => { setScanAt(sz); setCamMsg(`Scan the barcode for size ${sz}`); setCam(true); }}>Scan</button>
                    <input className="input" style={{ minHeight: 30, padding: "2px 8px", fontSize: 13, width: "100%", textAlign: "right" }} inputMode="numeric" aria-label={`Size ${sz} — opening stock on the shelf`} placeholder="0" value={row(sz).opening} onChange={(e) => setRow(sz, { opening: e.target.value.replace(/[^0-9]/g, "") })} />
                    <button className="btn btn-ghost" style={{ minHeight: 28, padding: "2px 6px" }} title={`Remove size ${sz}`} onClick={() => dropSize(sz)}>×</button>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-neutral-700)", marginTop: "var(--space-2)" }}>
                Barcodes are optional. Leave opening stock at 0 if it&apos;s arriving on an order.
                {!!barcode && <> The code you scanned is on <b>{bcPick || "— pick a size"}</b>.</>}
              </div>
            </>
          )}
        </div>
      )}
      {/* The same barcode on two sizes means the M label scans as an L for the rest of its life, so
          this gets the rule and the mark rather than a red sentence among grey ones. */}
      {!!dupCode && <div className="tc-flag" style={{ fontSize: 13, color: "var(--color-accent-700)", fontWeight: 700, marginTop: "var(--space-3)", padding: "var(--space-2) var(--space-3)" }}><span className="tc-mark" aria-hidden="true" />{dupCode} is on more than one size — each size needs its own barcode.</div>}
      <ErrorLine msg={err} />
    </Dialog>
    {cam && <Camera onHit={camHit} message={camMsg} onClose={() => setCam(false)} />}
    </>
  );
}

// ---------------------------------------------------------------- New order
export function NewOrderDialog({ onClose, initLines, initNotes, initOrderFor, initStaffId, initSupplier }: { onClose: () => void; initLines?: { itemId: string; size: string; qty: number }[]; initNotes?: string; initOrderFor?: "Stock" | "Staff Member"; initStaffId?: string; initSupplier?: string }) {
  const { s, mutate } = useSnap();
  const { byId, staffById } = useDerived();
  const router = useRouter();
  const [orderFor, setOrderFor] = useState<"Stock" | "Staff Member">(initOrderFor || "Stock");
  const [staffId, setStaffId] = useState(initStaffId || "");
  const firstSupplier = initSupplier || s.settings.suppliers[0] || "";
  const [supplier, setSupplierRaw] = useState(firstSupplier);
  const [expected, setExpected] = useState(addDays(s.today, leadDaysOf(s, firstSupplier) || 14));
  const setSupplier = (sup: string) => { setSupplierRaw(sup); const ld = leadDaysOf(s, sup); if (ld > 0) setExpected(addDays(s.today, ld)); };
  const budgetNote = staffId && staffById[staffId] ? ccBudgetNote(s, byId, staffById, ccOf(s, staffById[staffId])) : "";
  const [pick, setPick] = useState("");
  const [lines, setLines] = useState(initLines || []);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const total = lines.reduce((t, l) => t + l.qty * (byId[l.itemId]?.cost || 0), 0);
  const invalid = lines.length === 0 || (orderFor === "Staff Member" && !staffId) || !supplier;
  async function create() {
    if (invalid) return;
    setBusy(true); setErr("");
    const r = await mutate<{ id: string }>("order.create", { orderFor, staffId, supplier, expected, lines, notes: initNotes || "" });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onClose();
    router.push(`/app/orders/${r.result.id}`);
  }
  // The running total belongs beside the button that commits it, so it goes in the foot, on the
  // left. marginRight:auto rather than space-between: the foot is a right-aligned row, and one item
  // opting out of that is cheaper than giving this one dialog a second layout.
  return (
    <Dialog title="New order" width={640} onClose={onClose} foot={<>
      <div style={{ fontSize: 13, marginRight: "auto" }}>{lines.length} lines · <b>{money(total)}</b></div>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" onClick={create} disabled={invalid || busy}>Create order</button>
    </>}>
      <div className="tc-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
        <Field label="Order for">{(c) => <select {...c} className="input" value={orderFor} onChange={(e) => setOrderFor(e.target.value as "Stock" | "Staff Member")}><option value="Stock">Stock (linen room)</option><option value="Staff Member">Staff member</option></select>}</Field>
        {orderFor === "Staff Member" && (
          <Field label="Staff member">{(c) => <select {...c} className="input" value={staffId} onChange={(e) => setStaffId(e.target.value)}><option value="">Choose…</option>{s.staff.filter((st) => !st.inactive).map((st) => <option key={st.id} value={st.id}>{st.first} {st.last} ({st.num})</option>)}</select>}</Field>
        )}
        {budgetNote && <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--color-neutral-700)", borderLeft: "4px solid var(--color-text)", paddingLeft: "var(--space-2)" }}>{budgetNote}</div>}
        <Field label="Supplier">
          {(c) => (s.settings.suppliers.length
            ? <select {...c} className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)}>{s.settings.suppliers.map((o) => <option key={o}>{o}</option>)}</select>
            : <input {...c} className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Supplier name" />)}
        </Field>
        <Field label="Expected delivery">{(c) => <input {...c} className="input" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />}</Field>
      </div>
      <div style={{ marginTop: "var(--space-4)", borderTop: "2px solid var(--color-text)", paddingTop: "var(--space-3)" }}>
        <ItemSizePicker s={s} itemId={pick} onItem={setPick} placeholder="Add an item…" maxWidth={300} onSize={(it, si) => { const size = it.sizes[si]; const f = lines.find((l) => l.itemId === it.id && l.size === size); setLines(f ? lines.map((l) => l === f ? { ...l, qty: l.qty + 1 } : l) : [...lines, { itemId: it.id, size, qty: 1 }]); }} />
        {lines.map((l, i) => (
          <div key={l.itemId + l.size} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-2) 0", borderBottom: "1px solid var(--color-divider)", fontSize: 13 }}>
            <div style={{ flex: 1 }}>{label(byId[l.itemId])} · size {l.size}</div>
            <Stepper value={l.qty} width={22} onDec={() => setLines(l.qty <= 1 ? lines.filter((_, j) => j !== i) : lines.map((x, j) => j === i ? { ...x, qty: x.qty - 1 } : x))} onInc={() => setLines(lines.map((x, j) => j === i ? { ...x, qty: x.qty + 1 } : x))} />
            <button className="btn btn-ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
      </div>
      <ErrorLine msg={err} />
    </Dialog>
  );
}

// ---------------------------------------------------------------- Receive delivery
export function ReceiveDialog({ order, onClose }: { order: OrderRec; onClose: () => void }) {
  const { s, isAdmin, mutate } = useSnap();
  const { byId, staffById } = useDerived();
  const st = order.staffId ? staffById[order.staffId] : undefined;
  const received = (itemId: string, size: string) => order.receipts.reduce((t, r) => t + r.lines.filter((x) => x.itemId === itemId && x.size === size).reduce((a, x) => a + x.qty, 0), 0);
  const [invoice, setInvoice] = useState(order.invoice);
  // Read off the clock as the dialog opens, not out of the snapshot. The linen-room PC stays signed
  // in overnight and s.today only moves when something else in the facility does, so the morning's
  // first delivery was pre-filled with yesterday — and over a month boundary that stamps the
  // receipt, the order and the pickup into the previous month's supplier report and spend.
  const [date, setDate] = useState(() => facilityToday(s.tz));
  const [note, setNote] = useState("");
  const [cam, setCam] = useState(false);
  const [camMsg, setCamMsg] = useState("");
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [lines, setLines] = useState(order.lines.map((l) => { const it = byId[l.itemId]; const outstanding = Math.max(0, l.qty - received(l.itemId, l.size)); return { lineId: l.id, itemId: l.itemId, size: l.size, ordered: outstanding, arrived: String(outstanding), dest: order.orderFor === "Staff Member" ? "pickup" : "shelf", cost: String(it ? it.cost : 0), exp: it ? it.cost : 0, priceAction: "keep" as "keep" | "update" }; }));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const setL = (i: number, p: Partial<(typeof lines)[number]>) => setLines(lines.map((l, j) => j === i ? { ...l, ...p } : l));
  const invalid = lines.every((l) => (parseInt(l.arrived, 10) || 0) === 0);
  async function save() {
    if (invalid) return;
    setBusy(true); setErr("");
    const r = await mutate("order.receive", { id: order.id, invoice, date, note, photoId, lines: lines.map((l) => ({ lineId: l.lineId, itemId: l.itemId, size: l.size, arrived: parseInt(l.arrived, 10) || 0, dest: l.dest, cost: l.cost, priceAction: l.priceAction })) });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onClose();
  }
  function camHit(raw: string) {
    const p = bcParse(s, raw);
    if (!p) { setCamMsg("Unknown barcode " + raw); return; }
    const it = byId[p.itemId]; const size = String(it.sizes[p.si]);
    const i = lines.findIndex((l) => l.itemId === p.itemId && l.size === size);
    if (i < 0) { setCamMsg(label(it) + " · " + size + " isn’t on this order"); return; }
    const a = (parseInt(lines[i].arrived, 10) || 0) + 1;
    setLines(lines.map((l, j) => j === i ? { ...l, arrived: String(a) } : l));
    setCamMsg(label(it) + " · " + size + " → " + a);
  }
  const cols = "1fr 60px 80px 170px 130px";
  return (
    <>
      <Dialog title={`Receive delivery — ${order.code}`} width={780} onClose={onClose} sub={(order.ref ? "Supplier ref " + order.ref + " · " : "") + order.supplier + " · ordered " + fmtDate(order.date) + " · " + (order.orderFor === "Stock" ? "for stock" : "for " + staffName(st, "staff member"))}
        foot={<>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={invalid || busy}>Receive</button>
        </>}>
        <div className="tc-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
          <Field label="Invoice number">{(c) => <input {...c} className="input" value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="e.g. INV-102938" />}</Field>
          <Field label="Arrival date">{(c) => <input {...c} className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Field label="Note">{(c) => <input {...c} className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. wrong size sent" />}</Field>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginTop: "var(--space-2)" }}>
          <button className="btn btn-ghost" onClick={() => { setCamMsg(""); setCam(true); }}>Scan items off the box (camera)</button>
        </div>
        <div className="table-wrap">
          <div className="tc-meta" style={{ display: "grid", gridTemplateColumns: cols, gap: "var(--space-2)", borderBottom: "2px solid var(--color-text)", paddingBottom: "var(--space-1)", marginTop: "var(--space-4)", minWidth: 560 }}>
            <div>Line</div><div style={{ textAlign: "right" }}>Outstanding</div><div style={{ textAlign: "right" }}>Arrived</div><div>Destination</div><div style={{ textAlign: "right" }}>Invoiced cost</div>
          </div>
          {lines.map((l, i) => {
            const costN = parseFloat(l.cost); const mismatch = !isNaN(costN) && Math.abs(costN - l.exp) > 0.004;
            return (
              <div key={l.lineId}>
                <div style={{ display: "grid", gridTemplateColumns: cols, gap: "var(--space-2)", alignItems: "center", padding: "var(--space-2) 0", borderBottom: "1px solid var(--color-divider)", fontSize: 13, minWidth: 560 }}>
                  <div style={{ fontWeight: 600 }}>{label(byId[l.itemId])} <span style={{ color: "var(--color-neutral-700)", fontWeight: 400 }}>size {l.size}</span></div>
                  <div style={{ textAlign: "right" }}>{l.ordered}</div>
                  {/* The heading names the column; only the garment cell to the left says which
                      size the row is, and nothing tied the two together. Read aloud, a four-line PO
                      was eight blank edit boxes in a row, and a count typed one row off writes the
                      arrivals against the wrong size — a dozen smalls on the shelf that do not
                      exist, and no mediums for the next wearer who needs one. */}
                  <input className="input" style={{ minHeight: 30, padding: "2px 8px", textAlign: "right" }} inputMode="numeric" aria-label={`${label(byId[l.itemId])} size ${l.size} — quantity arrived`} value={l.arrived} onChange={(e) => setL(i, { arrived: e.target.value.replace(/[^0-9]/g, "") })} />
                  {/* Which destination is in force was an ink fill and nothing else, repeated down
                      every line of the order. aria-pressed says it in words and the group names the
                      line, so a coordinator can tell whether their tap landed before they press
                      Receive: a line sent to Pickup instead of Shelf never reaches the shelf. */}
                  <div className="seg" role="group" aria-label={`${label(byId[l.itemId])} size ${l.size} — destination`}><button className={"seg-opt" + (l.dest === "shelf" ? " btn-primary" : "")} aria-pressed={l.dest === "shelf"} onClick={() => setL(i, { dest: "shelf" })}>Shelf</button>{!!order.staffId && <button className={"seg-opt" + (l.dest === "pickup" ? " btn-primary" : "")} aria-pressed={l.dest === "pickup"} onClick={() => setL(i, { dest: "pickup" })}>Pickup</button>}</div>
                  <div style={{ display: "flex", gap: "var(--space-1)", alignItems: "center", justifyContent: "flex-end" }}>
                    <span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>$</span>
                    <input className="input" style={{ minHeight: 30, padding: "2px 8px", width: 70, textAlign: "right" }} inputMode="decimal" aria-label={`${label(byId[l.itemId])} size ${l.size} — invoiced unit cost in dollars`} value={l.cost} onChange={(e) => setL(i, { cost: e.target.value.replace(/[^0-9.]/g, "") })} />
                  </div>
                </div>
                {mismatch && (
                  // A price that disagrees with the catalogue is the one thing on this screen that
                  // costs money if it goes past unread, and it appears mid-table between rows that
                  // are already ink and red. The rule down its edge is what picks it out of the run.
                  <div className="tc-flag" style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap", padding: "var(--space-2) 0 var(--space-2) var(--space-3)", borderBottom: "1px solid var(--color-divider)", fontSize: 12 }}>
                    <span style={{ color: "var(--color-accent-700)", fontWeight: 700 }}><span className="tc-mark" aria-hidden="true" />Invoiced {money(costN)} vs catalogue {money(l.exp)}</span>
                    {isAdmin && <button className={"btn " + (l.priceAction === "update" ? "btn-primary" : "btn-ghost")} style={{ minHeight: 26, padding: "2px 8px" }} onClick={() => setL(i, { priceAction: "update" })}>Update catalogue cost</button>}
                    <button className={"btn " + (l.priceAction === "update" ? "btn-ghost" : "btn-secondary")} style={{ minHeight: 26, padding: "2px 8px" }} onClick={() => setL(i, { priceAction: "keep" })}>Keep {money(l.exp)}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: "var(--space-3)" }}><PhotoButton kind="receipt" label="Photo the invoice" attached="Invoice photo attached" value={photoId} onChange={setPhotoId} onError={setErr} /></div>
        <div style={{ fontSize: 12, color: "var(--color-neutral-700)", marginTop: "var(--space-3)" }}>Shelf lines go into stock; Pickup lines join the call list. Anything short is back-ordered.</div>
        <ErrorLine msg={err} />
      </Dialog>
      {cam && <Camera onHit={camHit} message={camMsg} onClose={() => setCam(false)} />}
    </>
  );
}

// ---------------------------------------------------------------- Bind unknown barcode
export function BindDialog({ code, onClose, onBound }: { code: string; onClose: () => void; onBound?: (itemId: string, si: number) => void }) {
  const { s, isAdmin, mutate } = useSnap();
  const [pick, setPick] = useState("");
  const [err, setErr] = useState("");
  const [newItem, setNewItem] = useState(false);
  const it = s.catalog.find((x) => x.id === pick);
  const g = gtinInfo(code);
  async function bind(si: number) {
    const r = await mutate("barcode.bind", { code, itemId: pick, si });
    if (!r.ok) { setErr(r.error); return; }
    onBound?.(pick, si);
    onClose();
  }
  return (
    <>
    <Dialog title="Unknown barcode" width={540} onClose={onClose} foot={<>
      {isAdmin && <button className="btn btn-secondary" style={{ marginRight: "auto" }} onClick={() => setNewItem(true)}>New product from this barcode</button>}
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
    </>}>
      <div style={{ fontSize: 13, marginTop: "var(--space-2)" }}>Scanned <b>{code}</b> — not matched to the catalogue yet.{isAdmin ? " Bind it to a garment and size." : " Only an admin can bind it — note the code, or pick the item from the list instead."}</div>
      {/* A failed check digit is advice, not a blocker — so it takes the mark and the weight but
          not the left rule, which is reserved for what actually stops the work. */}
      <div style={{ fontSize: 12, color: g.kind && !g.valid ? "var(--color-accent-700)" : "var(--color-neutral-700)", fontWeight: g.kind && !g.valid ? 700 : 400, marginTop: "var(--space-1)" }}>{g.kind && !g.valid && <span className="tc-mark" aria-hidden="true" />}{gtinNote(g)}</div>
      {isAdmin && <div style={{ marginTop: "var(--space-3)" }}>
        <ItemSizePicker s={s} itemId={pick} onItem={setPick} placeholder="Choose the garment…" btnClass="btn btn-secondary" onSize={(_, si) => bind(si)} />
      </div>}
      {isAdmin && !it && <div style={{ fontSize: 12, color: "var(--color-neutral-700)", marginTop: "var(--space-2)" }}>Pick the garment, then click the size to save the binding.</div>}
      <ErrorLine msg={err} />
    </Dialog>
    {newItem && <ItemDialog barcode={code} onClose={() => setNewItem(false)} onSaved={() => { setNewItem(false); onClose(); }} />}
    </>
  );
}

// ---------------------------------------------------------------- Return item
export function ReturnDialog({ issue, onClose }: { issue: IssueRec; onClose: () => void }) {
  const { mutate } = useSnap();
  const { byId } = useDerived();
  const [err, setErr] = useState("");
  const [photoId, setPhotoId] = useState<string | null>(null);
  // An issue line can be three garments and they don't all come back on the same day. Returning
  // the whole line when one pair is on the counter credits two garments that are still on a ward
  // back onto the shelf, so the count says how many actually came back.
  const [qty, setQty] = useState(issue.qty);
  const it = byId[issue.itemId];
  async function pick(cond: string) {
    const r = await mutate("issue.return", { id: issue.id, cond, qty, photoId });
    if (!r.ok) { setErr(r.error); return; }
    onClose();
  }
  return (
    // No primary here on purpose: the four condition buttons are the action, and a Save beside them
    // would be a fifth thing to press that does nothing.
    <Dialog title="Return item" width={420} onClose={onClose} foot={<button className="btn btn-ghost" onClick={onClose}>Cancel</button>}>
      <div style={{ fontSize: 13, margin: "var(--space-2) 0 var(--space-4)" }}>{label(it)} · size {it?.sizes[issue.si]} ×{issue.qty} — issued {fmtDate(issue.date)}</div>
      {issue.qty > 1 && (
        <div role="group" aria-label="How many are coming back" style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <span style={{ fontSize: 13 }}>How many are coming back?</span>
          <Stepper value={qty} onDec={() => setQty(Math.max(1, qty - 1))} onInc={() => setQty(Math.min(issue.qty, qty + 1))} />
          <span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>of {issue.qty}{qty < issue.qty ? ` — ${issue.qty - qty} stays out` : ""}</span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {["Returned - Good", "Returned - Damaged", "Lost", "Written Off"].map((c) => <button key={c} className="btn btn-secondary btn-block" onClick={() => pick(c)}>{c.replace("Returned - ", "Returned – ")}</button>)}
      </div>
      <div style={{ marginTop: "var(--space-3)" }}><PhotoButton kind="return" label="Photo the garment (damage evidence)" attached="Photo attached (saved with the return)" value={photoId} onChange={setPhotoId} onError={setErr} /></div>
      <div style={{ fontSize: 12, color: "var(--color-neutral-700)", marginTop: "var(--space-3)" }}>“Returned – Good” goes back into stock; other conditions are written off. Returns free up entitlement.</div>
      <ErrorLine msg={err} />
    </Dialog>
  );
}

// ---------------------------------------------------------------- Staff add / edit
export function StaffDialog({ staff, onClose }: { staff?: StaffRec | null; onClose: () => void }) {
  const { s, mutate } = useSnap();
  // fte is seeded from the record so the picker shows what is on file, but it is sent only when
  // somebody changes it here. The profile has its own FTE control, which saves the moment it
  // changes, and this form open beside it would otherwise write the figure it was opened with back
  // over the one just chosen — and the nurse's proposed initial kit would go back with it.
  const fte0 = staff?.fte || "";
  const [f, setF] = useState({ num: staff?.num || "", first: staff?.first || "", last: staff?.last || "", phone: staff?.phone || "", top: staff?.top || "", pants: staff?.pants || "", ent: staff ? (staff.ent === null ? "" : String(staff.ent)) : "", fte: fte0, group: staff?.group || s.settings.staffGroups[0] || "", dept: staff?.dept || s.depts[0]?.name || "", ccOverride: staff?.ccOverride || "", start: staff?.start || s.today, notes: staff?.notes || "", uniformStyle: staff?.uniformStyle || "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  const invalid = !f.num.trim() || !f.first.trim() || !f.last.trim();
  const nursing = isNursing(s, { group: f.group });
  const FIELDS: [keyof typeof f, string][] = [["num", "Staff number"], ["first", "First name"], ["last", "Last name"], ["phone", "Phone"], ["top", "Top size"], ["pants", "Pants size"]];
  const ccCodes = [...new Set(s.depts.map((d) => d.cc).filter(Boolean))];
  async function save() {
    if (invalid) return;
    setBusy(true); setErr("");
    const { fte, ...rest } = f;
    const r = await mutate("staff.save", { id: staff?.id, ...rest, ent: f.ent === "" ? null : parseInt(f.ent, 10) || 0, ...(fte !== fte0 ? { fte } : {}) });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onClose();
  }
  async function remove() {
    if (!staff || !confirm(`Remove ${staff.first} ${staff.last} from the register?`)) return;
    const r = await mutate("staff.delete", { id: staff.id });
    if (!r.ok) { setErr(r.error); return; }
    onClose();
  }
  return (
    <Dialog title={staff ? "Edit staff member" : "Add staff member"} width={560} onClose={onClose} foot={<>
      {staff && <button className="btn btn-ghost" style={{ marginRight: "auto" }} onClick={remove}>Remove</button>}
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" onClick={save} disabled={invalid || busy}>Save</button>
    </>}>
      <div className="tc-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
        {FIELDS.map(([k, lbl]) => (
          <Field key={k} label={lbl}>{(c) => <input {...c} className="input" value={f[k]} onChange={(e) => set(k, e.target.value)} disabled={k === "num" && !!staff} title={k === "num" && staff ? "Staff number can’t be changed" : undefined} />}</Field>
        ))}
        {/* This read "Annual entitlement", and for a nurse "No limit — approved by a manager". Both
            were promises the counter would have broken: nothing typed here decides a hand-over, and
            nursing is under the same ceiling as every other group. What it sets is the figure the
            reports measure a year's drawing against, so the label says that and the hint says, once,
            what really decides what somebody may walk out with. */}
        <Field label="Yearly report figure (garments)"
          hint={nursing ? undefined : "For reports only — it doesn’t limit issuing."}>
          {(c) => (nursing ? <input {...c} className="input" value="Not measured for nursing" disabled /> : <input {...c} className="input" value={f.ent} onChange={(e) => set("ent", e.target.value.replace(/[^0-9]/g, ""))} placeholder={`Default ${s.settings.defaultEntitlement}`} />)}
        </Field>
        {/* On the form at the point of hire, not two screens away afterwards. A nurse's initial kit
            comes off the FTE table, so a record created without one proposes nothing at the counter
            — and until this was here the only way to set it was to reopen the profile, which is how
            a whole intake ends up with no FTE on any of them. */}
        <Field label="Combined FTE">
          {(c) => (
            <select {...c} className="input" value={f.fte} onChange={(e) => set("fte", e.target.value)}>
              <option value="">Not recorded</option>
              {f.fte && !FTE_OPTIONS.includes(f.fte) && <option value={f.fte}>{f.fte}</option>}
              {FTE_OPTIONS.map((v) => <option key={v}>{v}</option>)}
            </select>
          )}
        </Field>
        {/* Set at the point of hire, beside the sizes and the FTE, because it decides what the
            counter will offer this person on the day they first walk down. Not set is the default
            and offers every style, which is how every record already on the register reads. */}
        <Field label="Uniform style">
          {(c) => (
            <select {...c} className="input" value={f.uniformStyle} onChange={(e) => set("uniformStyle", e.target.value)}>
              <option value="">Not set — every style</option>
              {f.uniformStyle && !UNIFORM_STYLES.includes(f.uniformStyle) && <option value={f.uniformStyle}>{f.uniformStyle}</option>}
              {UNIFORM_STYLES.map((v) => <option key={v}>{v}</option>)}
            </select>
          )}
        </Field>
        <Field label="Staff group">
          {(c) => (
            <select {...c} className="input" value={f.group} onChange={(e) => set("group", e.target.value)}>
              {!s.settings.staffGroups.includes(f.group) && <option value={f.group}>{f.group || "—"}</option>}
              {s.settings.staffGroups.map((g) => <option key={g}>{g}</option>)}
            </select>
          )}
        </Field>
        <Field label="Department">
          {(c) => (
            <select {...c} className="input" value={f.dept} onChange={(e) => set("dept", e.target.value)}>
              {!s.depts.find((d) => d.name === f.dept) && <option value={f.dept}>{f.dept || "—"}</option>}
              {s.depts.map((d) => <option key={d.id} value={d.name}>{d.name}{d.cc ? ` (${d.cc})` : ""}</option>)}
            </select>
          )}
        </Field>
        <Field label="Cost centre override">
          {(ctl) => (
            <select {...ctl} className="input" value={f.ccOverride} onChange={(e) => set("ccOverride", e.target.value)}>
              <option value="">None — derived from department</option>
              {ccCodes.map((c) => <option key={c} value={c}>{c}</option>)}
              {f.ccOverride && !ccCodes.includes(f.ccOverride) && <option value={f.ccOverride}>{f.ccOverride}</option>}
            </select>
          )}
        </Field>
        <Field label="Start date">{(c) => <input {...c} className="input" type="date" value={f.start} onChange={(e) => set("start", e.target.value)} />}</Field>
        <Field style={{ gridColumn: "1 / -1" }} label="Notes">{(c) => <input {...c} className="input" value={f.notes} onChange={(e) => set("notes", e.target.value)} />}</Field>
      </div>
      {nursing && !f.fte && <div style={{ fontSize: 12, color: "var(--color-neutral-700)", marginTop: "var(--space-2)" }}>No combined FTE, so no initial kit will be proposed.</div>}
      {!s.depts.length && <div style={{ fontSize: 12, color: "var(--color-neutral-700)", marginTop: "var(--space-2)" }}>No departments yet — add them in Settings.</div>}
      <ErrorLine msg={err} />
    </Dialog>
  );
}

/** Opens the slip print page in a new window.
 *
 *  Everything the slip prints travels as query parameters, so callers with a garment list — a ward
 *  request covers several under one collection code — pass `lines` as one garment per newline and
 *  `code` as the collection code. Both are optional: the counter's own issue slip sends neither and
 *  the slip prints as it always did. */
export function openSlip(type: "collection" | "delivery", v: Record<string, string | boolean | number | undefined>) {
  const q = new URLSearchParams({ type });
  for (const k in v) { const val = v[k]; if (val === undefined || val === "" || val === false) continue; q.set(k, val === true ? "1" : String(val)); }
  window.open("/print?" + q.toString(), "_blank", "width=900,height=760");
}

export function useStaffPickList() {
  const { s } = useSnap();
  return useMemo(() => s.staff.map((st) => ({ v: st.id, label: `${st.first} ${st.last} (${st.num})` })), [s.staff]);
}

/** A5 landscape credit slip for a manager’s approval: "X of Y sets remaining". */
export function printCreditSlip(s: { settings: { facility: string; coordinator: string }; today: string }, st: StaffRec, ap: ApprovalRec) {
  const remaining = ap.sets - ap.used;
  const css = ".slip{border:2px solid #201e1d;padding:8mm;height:100%;box-sizing:border-box;font-size:13px}.hd{display:flex;align-items:center;gap:8px;border-bottom:2px solid #201e1d;padding-bottom:6px;font-size:15px}.hd .sq{width:10px;height:10px}.big{font-size:34px;font-weight:800;margin:10px 0 2px}.meta{font-size:12px;line-height:1.9;margin-top:6px}.ft{font-size:11px;color:#555;margin-top:10px;border-top:1px solid #999;padding-top:6px}";
  const body = `<div class="slip"><div class="hd"><span class="sq"></span><b>Uniform Credit — ${esc(s.settings.facility || "Linen Room")}</b></div><div class="big">${remaining} of ${ap.sets} sets remaining</div><div class="meta">Staff: <b>${esc(st.first + " " + st.last)}</b> (${esc(st.num)}) · ${esc(st.dept || "")}<br>Approved by <b>${esc(ap.by || "Manager")}</b> on ${esc(fmtDate(ap.date))}${ap.fte ? " · FTE " + esc(ap.fte) : ""}${ap.notes ? "<br>Notes: " + esc(ap.notes) : ""}</div><div class="ft">Bring this slip (or just your payroll number) to the linen room to collect the remaining sets — no new form needed. Printed ${esc(fmtDate(s.today))}${s.settings.coordinator ? " · " + esc(s.settings.coordinator) : ""}</div></div>`;
  openPrintWindow("Uniform credit", body, { page: "size:A5 landscape;margin:10mm", css, width: 700, height: 560 });
}

/** The slip a coordinator hands over with a self-service code.
 *
 * Printed rather than emailed: the linen room holds payroll numbers and phone numbers, not personal
 * email addresses, and the person is standing at the counter anyway. The code is on paper for
 * exactly as long as it takes them to use it — it is spent on first use, so a slip left on a desk
 * afterwards is worthless. */
export function printAccessSlip(s: { settings: { facility: string } }, st: StaffRec, code: string) {
  const url = (typeof window === "undefined" ? "https://threadcount.tech" : window.location.origin) + "/my";
  const css = ".slip{border:2px solid #201e1d;padding:8mm;height:100%;box-sizing:border-box;font-size:13px}.hd{display:flex;align-items:center;gap:8px;border-bottom:2px solid #201e1d;padding-bottom:6px;font-size:15px}.hd .sq{width:10px;height:10px}.code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:30px;font-weight:800;letter-spacing:0.06em;margin:10px 0 2px}.meta{font-size:12px;line-height:1.9;margin-top:6px}.steps{font-size:12px;line-height:1.7;margin-top:8px;padding-left:16px}.ft{font-size:11px;color:#555;margin-top:10px;border-top:1px solid #999;padding-top:6px}";
  const body = `<div class="slip"><div class="hd"><span class="sq"></span><b>Your uniform record — ${esc(s.settings.facility || "Linen Room")}</b></div>`
    + `<div class="meta">For <b>${esc(st.first + " " + st.last)}</b> (${esc(st.num)})</div>`
    + `<div class="code">${esc(code)}</div>`
    + `<ol class="steps"><li>Go to <b>${esc(url)}</b> on your phone.</li><li>Choose <b>I have a code</b> and type the code above.</li><li>Set an email and password — that&rsquo;s how you get back in.</li></ol>`
    + `<div class="ft">The code works once and only for you. It shows what you have out, what you&rsquo;re still owed and what&rsquo;s on order — you can&rsquo;t change anything from there. Lost it? Ask for a new one.</div></div>`;
  openPrintWindow("Uniform record access", body, { page: "size:A5 landscape;margin:10mm", css, width: 700, height: 560 });
}

// ---------------------------------------------------------------- Uniform hand-in (pre-loved pool)
type HiLine = { itemId: string; si: number; qty: number; cond: "Good" | "Rag"; laundered: boolean };
export function HandInDialog({ staff, onClose, onDone }: { staff: StaffRec; onClose: () => void; onDone?: (msg: string) => void }) {
  const { s, mutate } = useSnap();
  const { byId } = useDerived();
  const [pick, setPick] = useState("");
  const [lines, setLines] = useState<HiLine[]>([]);
  const [credit, setCredit] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const setL = (i: number, p: Partial<HiLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  async function save(print: boolean) {
    if (!lines.length || busy) return;
    setBusy(true); setErr("");
    const r = await mutate<{ id: string; message: string }>("handin.add", { staffId: staff.id, credit, lines });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    // The same stale-snapshot trap as the arrival date: on a tab left open overnight the receipt
    // printed yesterday while the HandIn row the server had just written was dated today.
    if (print) printHandInReceipt(s, staff, { id: r.result.id, date: facilityToday(s.tz), staffId: staff.id, by: s.session.name, credit, lines: lines.map((l) => ({ ...l, credited: 0 })) }, byId);
    onDone?.(r.result.message);
    onClose();
  }
  return (
    <Dialog title={`Uniform hand-in — ${staffName(staff)}`} width={640} onClose={onClose} sub="Good garments join the pre-loved pool (reissued free). Rags are counted for disposal."
      foot={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-secondary" onClick={() => save(true)} disabled={!lines.length || busy}>Record &amp; print receipt</button>
        <button className="btn btn-primary" onClick={() => save(false)} disabled={!lines.length || busy}>Record hand-in</button>
      </>}>
      <div style={{ marginTop: "var(--space-3)" }}>
        <ItemSizePicker s={s} itemId={pick} onItem={setPick} placeholder="Add garment…" onSize={(it, si) => { const f = lines.find((l) => l.itemId === it.id && l.si === si); if (f) setLines(lines.map((l) => (l === f ? { ...l, qty: l.qty + 1 } : l))); else setLines([...lines, { itemId: it.id, si, qty: 1, cond: "Good", laundered: true }]); }} />
      </div>
      {lines.map((l, i) => {
        const it = byId[l.itemId];
        return (
          <div key={l.itemId + l.si} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-2) 0", borderBottom: "1px solid var(--color-divider)", fontSize: 13, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 150, fontWeight: 600 }}>{label(it)} <span style={{ color: "var(--color-neutral-700)", fontWeight: 400 }}>size {it?.sizes[l.si]}</span></div>
            <Stepper value={l.qty} onDec={() => (l.qty <= 1 ? setLines(lines.filter((_, j) => j !== i)) : setL(i, { qty: l.qty - 1 }))} onInc={() => setL(i, { qty: l.qty + 1 })} />
            {/* The fill was the only thing saying which of the two was chosen, on every line of a
                six-garment hand-in, so a tap that had not landed looked exactly like one that had.
                aria-pressed puts the choice in words and the group names the garment — a rag
                recorded as Good joins the pre-loved pool and is reissued as serviceable uniform. */}
            <div className="seg" role="group" aria-label={`${label(it)} size ${it?.sizes[l.si] ?? l.si} — condition`}>
              <button className={"seg-opt" + (l.cond === "Good" ? " btn-primary" : "")} aria-pressed={l.cond === "Good"} style={{ minHeight: 26, padding: "2px 8px" }} onClick={() => setL(i, { cond: "Good" })}>Good</button>
              <button className={"seg-opt" + (l.cond === "Rag" ? " btn-primary" : "")} aria-pressed={l.cond === "Rag"} style={{ minHeight: 26, padding: "2px 8px" }} onClick={() => setL(i, { cond: "Rag" })}>Rag</button>
            </div>
            <button className={"btn " + (l.laundered ? "btn-ghost" : "btn-secondary")} style={{ minHeight: 26, padding: "2px 8px" }} onClick={() => setL(i, { laundered: !l.laundered })}>{l.laundered ? "Laundered" : "Unlaundered"}</button>
          </div>
        );
      })}
      {lines.length === 0 && <div style={{ fontSize: 13, color: "var(--color-neutral-700)", padding: "var(--space-3) 0" }}>Pick an item, then tap a size for each garment handed in.</div>}
      {/* This used to say the tick "frees entitlement", so a coordinator who left it off could fairly
          expect the wearer to be turned away for the replacement. They won't be: handing a garment
          in takes it off what they hold, ticked or not. The tick only puts new garments back on the
          year's report figure and on the manager's approval they were drawn from. */}
      <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: "var(--space-4)", fontSize: 13, cursor: "pointer" }}>
        <input type="checkbox" checked={credit} onChange={() => setCredit(!credit)} style={{ width: 15, height: 15, accentColor: "var(--color-accent)" }} />
        <span>Credit the good garments back <span style={{ color: "var(--color-neutral-700)" }}>(to the yearly report figure and the manager&apos;s approval)</span></span>
      </label>
      <ErrorLine msg={err} />
    </Dialog>
  );
}

/** A5 landscape hand-in receipt: what came in, condition, and whether the allowance was credited. */
export function printHandInReceipt(s: { settings: { facility: string; coordinator: string }; today: string }, st: StaffRec, h: HandInRec, byId: Record<string, Item>) {
  const rows = h.lines.map((l) => { const it = byId[l.itemId]; return `<tr><td>${esc(label(it))}</td><td>${esc(it ? String(it.sizes[l.si]) : "")}</td><td style="text-align:right">${l.qty}</td><td>${esc(l.cond)}${l.laundered === false ? " · unlaundered" : ""}</td></tr>`; }).join("");
  const good = h.lines.filter((l) => l.cond === "Good").reduce((t, l) => t + l.qty, 0), rag = h.lines.filter((l) => l.cond === "Rag").reduce((t, l) => t + l.qty, 0);
  const css = ".slip{border:2px solid #201e1d;padding:7mm;box-sizing:border-box;font-size:12px}.hd{display:flex;align-items:center;gap:8px;border-bottom:2px solid #201e1d;padding-bottom:6px;font-size:14px}.hd .sq{width:10px;height:10px}table{width:100%;border-collapse:collapse;margin-top:6px}th,td{border-bottom:1px solid #999;padding:4px 6px;text-align:left;font-size:11px}th{border-bottom:2px solid #201e1d;font-size:9px;letter-spacing:.06em;text-transform:uppercase}.ft{font-size:10px;color:#555;margin-top:8px}";
  const body = `<div class="slip"><div class="hd"><span class="sq"></span><b>Uniform Hand-in Receipt — ${esc(s.settings.facility || "Linen Room")}</b></div><div style="font-size:11px;margin-top:5px">Staff: <b>${esc(st.first + " " + st.last)}</b> (${esc(st.num)}) · ${esc(st.dept || "")} · Received ${esc(fmtDate(h.date))} by ${esc(h.by)}</div><table><tr><th>Garment</th><th>Size</th><th style="text-align:right">Qty</th><th>Condition</th></tr>${rows}</table><div style="font-size:11px;margin-top:6px"><b>${good}</b> to the pre-loved pool · <b>${rag}</b> to rag disposal · Allowance ${h.credit ? "<b>credited</b>" : "not credited"}</div><div class="ft">Keep this receipt as your record of garments returned. ${esc(s.settings.coordinator || "")}</div></div>`;
  openPrintWindow("Hand-in receipt", body, { page: "size:A5 landscape;margin:10mm", css, width: 700, height: 620 });
}

// ---------------------------------------------------------------- Photos & delivery rounds
/** Camera capture → uploaded to the facility photo store; shows attached state. */
export function PhotoButton({ kind, label: lbl, attached, value, onChange, onError }: { kind: string; label: string; attached: string; value: string | null; onChange: (id: string | null) => void; onError?: (e: string) => void }) {
  const { mutate } = useSnap();
  const [busy, setBusy] = useState(false);
  async function go() {
    if (busy) return;
    const data = await takePhoto(); if (!data) return;
    setBusy(true);
    const r = await uploadPhoto(mutate, kind, data);
    setBusy(false);
    if ("error" in r) { onError?.(r.error); return; }
    onChange(r.id);
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className={"btn " + (value ? "btn-secondary" : "btn-ghost")} onClick={go} disabled={busy}>{busy ? "Saving photo…" : value ? attached : lbl}</button>
      {value && <button type="button" className="btn btn-ghost" style={{ minHeight: 26, padding: "2px 8px" }} onClick={() => viewPhoto(value)}>View</button>}
      {value && <button type="button" className="btn btn-ghost" style={{ minHeight: 26, padding: "2px 8px" }} onClick={() => onChange(null)}>Retake</button>}
    </span>
  );
}

/** Pointer-drawn signature; exposes a ref API through onReady. */
export function SignaturePad({ onReady }: { onReady: (api: { clear: () => void; dataUrl: () => string | null }) => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const dirty = useRef(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ctx = el.getContext("2d")!; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = "#201e1d";
    let draw = false;
    const pos = (ev: PointerEvent) => { const r = el.getBoundingClientRect(); return [(ev.clientX - r.left) * (el.width / r.width), (ev.clientY - r.top) * (el.height / r.height)] as const; };
    const down = (ev: PointerEvent) => { ev.preventDefault(); draw = true; dirty.current = true; el.setPointerCapture(ev.pointerId); const [x, y] = pos(ev); ctx.beginPath(); ctx.moveTo(x, y); };
    const move = (ev: PointerEvent) => { if (!draw) return; const [x, y] = pos(ev); ctx.lineTo(x, y); ctx.stroke(); };
    const up = () => { draw = false; };
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    onReady({ clear: () => { ctx.clearRect(0, 0, el.width, el.height); dirty.current = false; }, dataUrl: () => (dirty.current ? el.toDataURL("image/png") : null) });
    return () => { el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <canvas ref={ref} width={400} height={140} style={{ border: "2px solid var(--color-text)", width: "100%", touchAction: "none", background: "#fff", boxSizing: "border-box", display: "block" }} />;
}

/** Delivery round hand-over: receiver’s name, on-screen signature, optional handover photo. */
export function DeliverDialog({ pickup, onClose, onDone }: { pickup: PickupRec; onClose: () => void; onDone?: (msg: string) => void }) {
  const { s, mutate } = useSnap();
  const { byId, staffById } = useDerived();
  const st = staffById[pickup.staffId];
  const [name, setName] = useState("");
  const [proofId, setProofId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const pad = useRef<{ clear: () => void; dataUrl: () => string | null } | null>(null);
  const items = pickup.lines.map((l) => `${label(byId[l.itemId])} ${l.size}${l.qty > 1 ? ` ×${l.qty}` : ""}`).join(", ");
  async function save() {
    if (busy) return;
    setBusy(true); setErr("");
    let sigId: string | null = null;
    const png = pad.current?.dataUrl() || null;
    if (png) { const r = await uploadPhoto(mutate, "sig", png); if ("error" in r) { setBusy(false); setErr(r.error); return; } sigId = r.id; }
    const r = await mutate("pickup.deliver", { id: pickup.id, deliveredTo: name, sigId, proofId });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone?.(`Delivered to ${staffName(st)}${name.trim() ? ` — signed for by ${name.trim()}` : ""}.`);
    onClose();
  }
  return (
    <Dialog title={`Delivered — ${staffName(st)}${st?.dept ? " · " + st.dept : ""}`} width={460} onClose={onClose} sub={`${items} · waiting ${daysBetween(pickup.received, s.today)}d${st?.phone ? " · " : ""}${st?.phone ? st.phone : ""}`}
      foot={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>Mark delivered</button>
      </>}>
      <Field style={{ marginTop: "var(--space-3)" }} label="Received by (name)">{(c) => <input {...c} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. J. Barnes, manager" />}</Field>
      {/* Names the pad below it the way a Field names its input — the pad is a bare canvas and has
          no label of its own. */}
      <div className="tc-meta" style={{ fontWeight: 700, marginTop: "var(--space-3)", marginBottom: "var(--space-1)" }}>Signature</div>
      <SignaturePad onReady={(api) => { pad.current = api; }} />
      <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-ghost" onClick={() => pad.current?.clear()}>Clear</button>
        <PhotoButton kind="proof" label="Add handover photo" attached="Photo attached" value={proofId} onChange={setProofId} onError={setErr} />
      </div>
      <ErrorLine msg={err} />
    </Dialog>
  );
}
export { telHref };

// ---------------------------------------------------------------- Quick add by scan
type LookupHit = { found: boolean; enabled: boolean; name?: string; brand?: string; category?: string; source?: string; note?: string };

/** Scan a garment barcode and either land on the product that already owns it, or turn it into a new
 *  catalogue item there and then. The barcode is bound as part of the create, so one pass over a rack
 *  of new stock leaves every code resolving. */
export function ScanAddDialog({ onClose }: { onClose: () => void }) {
  const { s, mutate } = useSnap();
  const { byId } = useDerived();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [manual, setManual] = useState("");
  const [known, setKnown] = useState<{ itemId: string; si: number } | null>(null);
  const [look, setLook] = useState<LookupHit | null>(null);
  const [looking, setLooking] = useState(false);
  const [cam, setCam] = useState(false);
  const [camMsg, setCamMsg] = useState("");
  const [err, setErr] = useState("");
  const [newItem, setNewItem] = useState(false);
  const [pick, setPick] = useState("");
  const [added, setAdded] = useState<string[]>([]);
  const seen = useRef("");

  const g = code ? gtinInfo(code) : null;

  const handle = useCallback(async (raw: string) => {
    const c = String(raw).trim().slice(0, 64);
    if (!c || c === seen.current) return;
    seen.current = c;
    setErr(""); setLook(null); setPick(""); setCode(c);
    const hit = bcParse(s, c);
    if (hit) {
      setKnown(hit);
      setCamMsg(`${label(byId[hit.itemId])} · size ${byId[hit.itemId]?.sizes[hit.si]} — already in the catalogue. Keep scanning, or press Done to open it.`);
      return;
    }
    setKnown(null);
    setCam(false); // an unknown code needs the form, so drop out of the camera
    setCamMsg("");
    setLooking(true);
    try {
      const r = await fetch(`/api/lookup?code=${encodeURIComponent(c)}`, { headers: { accept: "application/json" } });
      setLook(await r.json());
    } catch { setLook({ found: false, enabled: false, note: "Couldn’t reach the lookup service — type the details in." }); }
    setLooking(false);
  }, [s, byId]);

  async function bindTo(itemId: string, si: number) {
    setErr("");
    const r = await mutate("barcode.bind", { code, itemId, si });
    if (!r.ok) { setErr(r.error); return; }
    setAdded([`${code} → ${label(byId[itemId])} · size ${byId[itemId]?.sizes[si]}`, ...added]);
    reset();
  }
  function reset() { seen.current = ""; setCode(""); setKnown(null); setLook(null); setManual(""); setPick(""); setErr(""); }

  const it = known ? byId[known.itemId] : null;
  return (
    <>
      <Dialog title="Scan to add" width={640} onClose={onClose} sub="Scan a garment to find it, or add it to the catalogue here."
        foot={<button className="btn btn-ghost" onClick={onClose}>Done</button>}>
        <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-4)", flexWrap: "wrap" }}>
          <input className="input" style={{ flex: 1, minWidth: 200 }} autoFocus placeholder="Scan with a USB scanner, or type the code and press Enter" value={manual}
            onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && manual.trim()) { const v = manual.trim(); setManual(""); handle(v); } }} />
          <button className="btn btn-secondary" onClick={() => { setCamMsg("Point the camera at a garment barcode"); setCam(true); }}>Camera</button>
        </div>

        {looking && <div style={{ fontSize: 13, marginTop: "var(--space-3)" }}>Looking up {code}…</div>}

        {!!code && !looking && (
          <div style={{ marginTop: "var(--space-4)", border: "2px solid var(--color-text)", padding: "var(--space-3)" }}>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 20 }}>{code}</div>
            {g && <div style={{ fontSize: 12, color: g.kind && !g.valid ? "var(--color-accent-700)" : "var(--color-neutral-700)", fontWeight: g.kind && !g.valid ? 700 : 400, marginTop: 2 }}>{g.kind && !g.valid && <span className="tc-mark" aria-hidden="true" />}{gtinNote(g)}</div>}

            {known && it ? (
              <>
                <div style={{ fontSize: 14, marginTop: "var(--space-3)" }}>Already in the catalogue — <b>{label(it)}</b> · size {it.sizes[known.si]}</div>
                <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
                  <button className="btn btn-primary" onClick={() => { onClose(); router.push(`/app/stock/${it.id}`); }}>Open product</button>
                  <button className="btn btn-ghost" onClick={reset}>Scan another</button>
                </div>
              </>
            ) : (
              <>
                {look?.found
                  ? <div style={{ fontSize: 13, marginTop: "var(--space-3)" }}>Public listing: <b>{look.name}</b>{look.brand ? ` — ${look.brand}` : ""}<span style={{ color: "var(--color-neutral-600)" }}>{look.source ? ` · via ${look.source}` : ""}</span></div>
                  : <div style={{ fontSize: 13, color: "var(--color-neutral-700)", marginTop: "var(--space-3)" }}>{look?.note || "Not in the catalogue yet."}</div>}
                <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
                  <button className="btn btn-primary" onClick={() => setNewItem(true)}>New product from this barcode</button>
                  <button className="btn btn-ghost" onClick={reset}>Scan another</button>
                </div>
                <div style={{ marginTop: "var(--space-4)", borderTop: "1px solid var(--color-divider)", paddingTop: "var(--space-3)" }}>
                  <div className="tc-meta" style={{ fontWeight: 700, color: "var(--color-text)" }}>Or attach it to a product you already have</div>
                  <div style={{ marginTop: "var(--space-2)" }}>
                    <ItemSizePicker s={s} itemId={pick} onItem={setPick} placeholder="Choose the garment…" btnClass="btn btn-secondary" onSize={(item, si) => bindTo(item.id, si)} />
                  </div>
                  {!!pick && <div style={{ fontSize: 12, color: "var(--color-neutral-700)", marginTop: "var(--space-2)" }}>Click the size this barcode is on.</div>}
                </div>
              </>
            )}
          </div>
        )}

        {added.length > 0 && (
          <div style={{ marginTop: "var(--space-4)" }}>
            <div className="sec">Bound in this session</div>
            {added.map((a, i) => <div key={i} style={{ fontSize: 13, padding: "var(--space-2) 0", borderBottom: "1px solid var(--color-divider)" }}>{a}</div>)}
          </div>
        )}

        <ErrorLine msg={err} />
      </Dialog>
      {cam && <Camera onHit={handle} message={camMsg} onClose={() => setCam(false)} />}
      {newItem && <ItemDialog barcode={code} initName={look?.found ? look.name || "" : ""} onClose={() => setNewItem(false)} onSaved={(_id, name) => { setAdded([`${code} → new product ${name || ""}`.trim(), ...added]); reset(); }} />}
    </>
  );
}

// ---------------------------------------------------------------- Scan barcodes onto sizes
/** Walk a product's sizes and bind the supplier barcode printed on each one. Auto-advances to the next
 *  size without a bound code, so a full size run is one continuous pass with the camera open. */
export function ScanVariantsDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const { s, mutate } = useSnap();
  const boundCode = useCallback((si: number) => { const k = key(item.id, si); for (const c in s.barcodes) if (s.barcodes[c] === k) return c; return ""; }, [s, item.id]);
  const firstUnbound = () => { for (let i = 0; i < item.sizes.length; i++) if (!boundCode(i)) return i; return -1; };
  const [target, setTarget] = useState<number>(() => { for (let i = 0; i < item.sizes.length; i++) if (!boundCode(i)) return i; return item.sizes.length ? 0 : -1; });
  const [newSize, setNewSize] = useState("");
  const [manual, setManual] = useState("");
  const [cam, setCam] = useState(false);
  const [camMsg, setCamMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, setPending] = useState<{ code: string; si: number; size: string } | null>(null);
  const seen = useRef("");

  const targetLabel = target >= 0 && target < item.sizes.length ? String(item.sizes[target]) : "";
  const prompt = newSize.trim() ? `Scan the barcode for new size ${newSize.trim()}` : targetLabel ? `Scan the barcode for size ${targetLabel}` : "Pick a size to scan into";

  const handle = useCallback(async (raw: string, force = false) => {
    const c = String(raw).trim().slice(0, 64);
    if (!c) return;
    if (!force && c === seen.current) return;
    seen.current = c;
    setErr(""); setPending(null);
    const sz = newSize.trim();
    if (sz) {
      const r = await mutate<{ si: number; created: boolean }>("catalog.variantAdd", { itemId: item.id, size: sz, code: c, force });
      if (!r.ok) { setErr(r.error); setCamMsg(r.error); setPending({ code: c, si: -1, size: sz }); return; }
      setCamMsg(`${c} → size ${sz}. Type the next new size, or clear the box to work through the existing sizes.`);
      setNewSize("");
      return;
    }
    if (target < 0 || target >= item.sizes.length) { setCamMsg("Pick a size first."); return; }
    const si = target, size = String(item.sizes[si]);
    const r = await mutate("barcode.bind", { itemId: item.id, si, code: c, force });
    if (!r.ok) { setErr(r.error); setCamMsg(r.error); setPending({ code: c, si, size }); return; }
    // Advance past the size just done; the snapshot refresh lags a beat, so step forward locally.
    let next = -1;
    for (let i = si + 1; i < item.sizes.length; i++) if (!boundCode(i)) { next = i; break; }
    if (next < 0) for (let i = 0; i < si; i++) if (!boundCode(i)) { next = i; break; }
    setTarget(next);
    setCamMsg(next >= 0 ? `${c} → size ${size}. Next: size ${item.sizes[next]}` : `${c} → size ${size}. Every size now has a barcode.`);
    seen.current = "";
  }, [mutate, item, target, newSize, boundCode]);

  return (
    <>
      <Dialog title="Scan sizes" width={620} onClose={onClose} sub={`${item.item} — bind the supplier barcode printed on each size.`}
        foot={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
        <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-4)", flexWrap: "wrap" }}>
          <input className="input" style={{ flex: 1, minWidth: 200 }} autoFocus placeholder={prompt} value={manual}
            onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && manual.trim()) { const v = manual.trim(); setManual(""); handle(v); } }} />
          <button className="btn btn-secondary" onClick={() => { setCamMsg(prompt); setCam(true); }}>Camera</button>
        </div>
        <div style={{ fontSize: 12, color: "var(--color-neutral-700)", marginTop: "var(--space-2)" }}>{camMsg || prompt + "."}</div>

        {pending && (
          // The whole box used to be outlined in vermilion, which is also the colour of the button
          // inside it — an accent frame around an accent control reads as decoration, not a
          // warning. Ink frame, accent rule down the edge, mark on the sentence.
          <div className="tc-flag" style={{ marginTop: "var(--space-3)", border: "2px solid var(--color-text)", padding: "var(--space-3)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-accent-700)" }}><span className="tc-mark" aria-hidden="true" />{err}</div>
            <button className="btn btn-secondary" style={{ marginTop: "var(--space-2)" }} onClick={() => handle(pending.code, true)}>Move {pending.code} onto size {pending.size} anyway</button>
          </div>
        )}

        <div className="table-wrap" style={{ marginTop: "var(--space-4)" }}>
          <div className="tc-meta" style={{ display: "grid", gridTemplateColumns: "80px 1fr 120px", gap: "var(--space-2)", borderBottom: "2px solid var(--color-text)", padding: "var(--space-2) 0 var(--space-1)" }}>
            <div>Size</div><div>Barcode</div><div></div>
          </div>
          {item.sizes.map((sz, si) => {
            const bc = boundCode(si);
            const isTarget = si === target && !newSize.trim();
            return (
              <div key={si} style={{ display: "grid", gridTemplateColumns: "80px 1fr 120px", gap: "var(--space-2)", alignItems: "center", padding: "var(--space-2) 0", borderBottom: "1px solid var(--color-divider)", fontSize: 13, background: isTarget ? "var(--color-neutral-200)" : undefined }}>
                <div style={{ fontWeight: 700 }}>{String(sz)}</div>
                <div style={{ fontSize: 12, color: bc ? "var(--color-text)" : "var(--color-neutral-600)" }}>{bc || "Not bound"}</div>
                <div style={{ textAlign: "right" }}>
                  {isTarget ? <span className="tag tag-accent">Scanning</span> : <button className="btn btn-ghost" style={{ minHeight: 26, padding: "2px 8px" }} onClick={() => { setNewSize(""); setTarget(si); seen.current = ""; }}>{bc ? "Re-scan" : "Scan"}</button>}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end", marginTop: "var(--space-4)", flexWrap: "wrap" }}>
          <Field style={{ flex: 1, minWidth: 160 }} label="Size that isn&apos;t on the item yet">{(c) => <input {...c} className="input" value={newSize} onChange={(e) => { setNewSize(e.target.value); seen.current = ""; }} placeholder="e.g. 6XL or 127" />}</Field>
        </div>
        <div style={{ fontSize: 12, color: "var(--color-neutral-700)", marginTop: "var(--space-2)" }}>Type a size here, then scan to add it with its barcode.</div>

        {/* A clash prints the same sentence in the box above, next to the button that resolves it.
            Printing it here as well is the same warning marked twice on one screen, which reads as
            two problems. */}
        <ErrorLine msg={pending ? "" : err} />
      </Dialog>
      {cam && <Camera onHit={(raw) => handle(raw)} message={camMsg || prompt} onClose={() => setCam(false)} />}
    </>
  );
}

// ---------------------------------------------------------------- Duplicate a garment for another colour / role
/** The same garment in another colour is its own catalogue item: barcodes, stock and the Issue
 *  screen's staff-group routing are all per item. This copies everything that describes the garment
 *  so only the colour, the group and the barcodes are left to enter. */
export function DuplicateItemDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const { s, mutate } = useSnap();
  const router = useRouter();
  const [f, setF] = useState({ item: item.item, groups: garmentGroups(item.groups), sku: item.sku });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const unchanged = f.item.trim() === item.item && sameGroups(f.groups, item.groups);
  const invalid = !f.item.trim() || unchanged;

  async function save(thenScan: boolean) {
    if (invalid) return;
    setBusy(true); setErr("");
    const r = await mutate<{ id: string }>("catalog.duplicate", { id: item.id, item: f.item.trim(), groups: f.groups, sku: f.sku.trim() });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    const id = (r.result as { id: string }).id;
    onClose();
    router.push(`/app/stock/${id}${thenScan ? "?scan=1" : ""}`);
  }

  return (
    <Dialog title="Duplicate for another colour" width={560} onClose={onClose} sub={`Copies ${item.item} — type, gender, supplier, unit cost, notes, its ${item.sizes.length} size${item.sizes.length === 1 ? "" : "s"} and reorder levels.`}
      foot={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-secondary" onClick={() => save(false)} disabled={invalid || busy}>Create</button>
        <button className="btn btn-primary" onClick={() => save(true)} disabled={invalid || busy}>Create and scan sizes</button>
      </>}>
      <div style={{ marginTop: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <Field label="Item name" hint="Include the colour or role.">
          {(c) => <input {...c} className="input" value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} />}
        </Field>
        <GroupsPicker value={f.groups} onChange={(groups) => setF({ ...f, groups })} groups={s.settings.staffGroups} hint={GROUPS_HINT} />
        <Field label="SKU">{(c) => <input {...c} className="input" value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} placeholder="the supplier’s code for this colour" />}</Field>
      </div>
      <div style={{ fontSize: 12, color: "var(--color-neutral-700)", marginTop: "var(--space-3)" }}>Barcodes and quantities aren&apos;t copied.</div>
      {unchanged && <div style={{ fontSize: 12, color: "var(--color-neutral-700)", marginTop: "var(--space-2)" }}>Change the name or the staff groups to tell the copy apart from the original.</div>}
      <ErrorLine msg={err} />
    </Dialog>
  );
}
