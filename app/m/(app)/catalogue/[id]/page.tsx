"use client";
/* The product card, on the phone.
 *
 * Two halves, because they are two different jobs. The top is the garment's description, which is
 * typed once and rarely changed. The bottom is per size — par level, barcode, what's on hand —
 * which is what someone standing at a shelf actually came here to adjust.
 *
 * The size index — a position in that list — is what every issue, order line and barcode points at,
 * so the order of the list is never offered for editing: shuffling it would silently repoint years
 * of records. One size can be taken off, though, and the server does the deciding: it shifts every
 * later size down across the ten tables that store a position, in one transaction, and refuses
 * outright when the size being removed has anything recorded against it. So this screen offers the
 * removal on every size and shows whatever comes back.
 *
 * `?bind=<code>` arrives from a scan that found nothing: each size offers to take that code. */
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useDerived, useSnap } from "@/lib/client";
import { bcBound, formatInZone, key as vkey, label, money, onhand, reorderAt, splitKey, type CostRec, type Item } from "@/lib/compute";
import { printItemLabels } from "@/lib/nativeprint";
import MScan from "@/components/MScan";
import {
  ACCENT, GROUND, INK, ON_DARK, MBar, MBody, MButton, MEmpty, MError, MField, MONO, MPill, MRule, MSection, MTop, MTopCount, inputStyle, useToast,
} from "@/components/m";

/* The two ways to get a code onto a size, side by side. Scanning stays the primary act, ink-filled:
   it is the fastest when the camera cooperates. Typing sits beside it rather than behind it — a
   label in your hand beats a camera that won't focus. */
const codeBtn: React.CSSProperties = {
  flex: 1, minHeight: 48, font: "inherit", fontFamily: "var(--font-heading)", fontWeight: 800,
  fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer",
};
/* Undoing rather than doing: the quieter kind of action on a size row. No border, so it reads as a
   link; 44px tall, so it is still a target you can hit with gloves on. */
const quietAction: React.CSSProperties = {
  display: "flex", alignItems: "center", width: "100%", minHeight: 44, background: "none", border: 0,
  padding: 0, font: "inherit", fontSize: 13, fontWeight: 700, color: "var(--color-neutral-700)",
  textAlign: "left", cursor: "pointer",
};

/* A freshly minted number exists in ThreadCount at once, but nothing is on the garment until it is
   printed, so the confirmation carries the print with it. */
function MMade({ made, labels, onPrint }: { made: { size: string; code: string }[]; labels: number; onPrint: () => void }) {
  if (!made.length) return null;
  return (
    <div style={{ margin: "10px 0 0", padding: 16, background: INK, color: GROUND, fontSize: 14 }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 16 }}>
        {made.length === 1 ? `Size ${made[0].size} has a barcode` : `${made.length} sizes have a barcode`}
      </div>
      <div style={{ marginTop: 8, color: ON_DARK, fontSize: 13, fontFamily: MONO }}>
        {made.map((m) => <div key={m.code}>{m.size} · {m.code}</div>)}
      </div>
      {labels > 0 && (
        <button onClick={onPrint}
          style={{ width: "100%", minHeight: 48, marginTop: 12, border: "2px solid " + GROUND, background: GROUND, color: INK, font: "inherit", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer" }}>
          Print {labels} label{labels === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
}

export default function MProductCard() {
  const { id } = useParams<{ id: string }>();
  const { s, isAdmin, mutate, busy } = useSnap();
  const { L, byId } = useDerived();
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const bindRaw = (sp.get("bind") || "").trim().slice(0, 80);
  const bindCode = isAdmin ? bindRaw : "";

  const it = s.catalog.find((x: Item) => x.id === id);

  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(() => ({
    item: it?.item ?? "", type: it?.type ?? "", group: it?.group ?? "All",
    supplier: it?.supplier ?? "", sku: it?.sku ?? "", cost: it ? String(it.cost) : "", notes: it?.notes ?? "",
  }));
  const [newSize, setNewSize] = useState("");
  const [scanFor, setScanFor] = useState<number | null>(null);
  const [typeFor, setTypeFor] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  /* Which run is in flight, so only the button that was pressed says so. -1 is the whole garment. */
  const [genFor, setGenFor] = useState<number | null>(null);
  const [made, setMade] = useState<{ si: number; size: string; code: string }[]>([]);

  // Binding is admin-only; an Issuer who arrives with a code goes back to the catalogue.
  useEffect(() => { if (bindRaw && !isAdmin) router.replace("/m/catalogue"); }, [bindRaw, isAdmin, router]);

  const groups = useMemo(() => {
    const set = new Set<string>(["All"]);
    for (const st of s.staff) if (st.group) set.add(st.group);
    for (const i of s.catalog) if (i.group) set.add(i.group);
    return [...set].sort();
  }, [s.staff, s.catalog]);

  if (!it) {
    return (
      <>
        <MTop title="Garment" back />
        <MRule />
        <MBody pad><MEmpty title="No such garment" sub="It isn’t in the catalogue any more." /></MBody>
      </>
    );
  }

  const name = label(byId[it.id] ?? it);
  // Newest first; the snapshot already caps how many it carries.
  const costs: CostRec[] = s.costs.filter((c) => c.itemId === it.id);
  const readOnly = !isAdmin;
  // How many sizes a whole-garment run would cover, and how many labels a print run would produce —
  // one per garment on the shelf in a size that carries a code.
  const unlabelled = it.sizes.filter((_: string, si: number) => !bcBound(s, it, si)).length;
  const labels = it.sizes.reduce((n: number, _: string, si: number) =>
    n + (bcBound(s, it, si) ? Math.max(0, onhand(s, L, vkey(it.id, si))) : 0), 0);

  /* Fill the boxes from the garment as it stands right now, not as it stood when the screen was
   * opened: the card refreshes underneath without remounting, and saving a stale form would put an
   * old price back in someone else's name. */
  function startEdit() {
    setErr("");
    setF({
      item: it!.item, type: it!.type, group: it!.group,
      supplier: it!.supplier, sku: it!.sku, cost: String(it!.cost), notes: it!.notes,
    });
    setEditing(true);
  }

  async function saveDetails() {
    setErr("");
    if (!f.item.trim()) { setErr("The garment needs a name."); return; }
    const c = f.cost.trim() ? Number(f.cost) : 0;
    if (!(c >= 0) || Number.isNaN(c)) { setErr("Cost has to be a number."); return; }
    const r = await mutate("catalog.update", {
      id: it!.id, item: f.item.trim(), type: f.type.trim(), group: f.group,
      supplier: f.supplier.trim(), sku: f.sku.trim(), cost: c, notes: f.notes,
    });
    if (!r.ok) { setErr(r.error); return; }
    setEditing(false);
  }

  async function addSize() {
    const sz = newSize.trim();
    if (!sz) return;
    setErr("");
    const r = await mutate("catalog.update", { id: it!.id, addSize: sz });
    if (!r.ok) { setErr(r.error); return; }
    setNewSize("");
  }

  async function setPar(si: number, next: number) {
    const r = await mutate("stock.reorder", { itemId: it!.id, si, reorder: Math.max(0, next) });
    if (!r.ok) setErr(r.error);
  }

  /** Where a code already sits, named the way a person would name it, or "" if this snapshot has
   *  never seen it. */
  function boundElsewhere(code: string): string {
    const at = s.barcodes[code];
    if (!at) return "";
    const { itemId, si } = splitKey(at);
    const other = byId[itemId];
    return other ? `${label(other)} · size ${other.sizes[si] ?? si}` : "";
  }

  /* Binding, including the refusal that used to be a dead end: when the code already sits on another
   * garment, offer the move rather than printing the message and stopping there. A generated
   * 93XXXXXXX code is refused with or without force and is shown as it came. */
  async function bind(si: number, raw: string): Promise<boolean> {
    const code = raw.trim();
    if (!code) return false;
    setErr(""); setMade([]);
    const r = await mutate("barcode.bind", { code, itemId: it!.id, si });
    if (r.ok) { setTypeFor(null); setTyped(""); return true; }
    const at = boundElsewhere(code);
    if (!at && !/is already on/.test(r.error)) { setErr(r.error); return false; }
    const ask = at
      ? `${code} is on ${at}. Take it off there and put it on ${name} · size ${it!.sizes[si]}?`
      : `${r.error}\n\nMove it onto ${name} · size ${it!.sizes[si]}?`;
    if (!confirm(ask)) { setErr(r.error); return false; }
    const moved = await mutate("barcode.bind", { code, itemId: it!.id, si, force: true });
    if (!moved.ok) { setErr(moved.error); return false; }
    setTypeFor(null); setTyped("");
    return true;
  }

  async function bindScanned(si: number) {
    if (!(await bind(si, bindCode))) return;
    toast(`${bindCode} bound to size ${it!.sizes[si]}`);
    router.replace(`/m/catalogue/${encodeURIComponent(it!.id)}`);
  }

  async function unbind(si: number, code: string) {
    if (!confirm(`Unbind ${code} from ${name} · size ${it!.sizes[si]}? Scanning that label won't find this size any more.`)) return;
    setErr(""); setMade([]);
    const r = await mutate("barcode.unbind", { code });
    if (!r.ok) setErr(r.error);
  }

  /* The server decides whether a size can go; removing shifts later sizes down a place, so anything
   * held open against a position lets go of it. */
  async function removeSize(si: number) {
    if (!confirm(`Remove size ${it!.sizes[si]} from ${name}? Its par level and any barcode on it go with it.`)) return;
    setErr("");
    const r = await mutate("catalog.removeSize", { id: it!.id, si });
    if (!r.ok) { setErr(r.error); return; }
    setScanFor(null); setTypeFor(null); setTyped(""); setMade([]);
  }

  /* Our own barcode for stock that arrived without one. The server fills only the gaps and refuses
   * when there is nothing to do, so the offer is made and whatever comes back is shown. */
  async function generate(si?: number) {
    setErr(""); setMade([]);
    setGenFor(si ?? -1);
    const r = await mutate<{ made: { si: number; size: string; code: string }[]; count: number }>(
      "barcode.generate", si === undefined ? { itemId: it!.id } : { itemId: it!.id, si },
    );
    setGenFor(null);
    if (!r.ok) { setErr(r.error); return; }
    setMade(r.result.made);
  }

  async function generateAll() {
    const ask = `Generate a barcode for ${unlabelled} size${unlabelled === 1 ? "" : "s"} on ${name}? Sizes that already carry a supplier's code keep theirs, and nothing is on a garment until the labels are printed.`;
    if (unlabelled > 0 && !confirm(ask)) return;
    await generate();
  }

  /* A whole garment's labels: one per garment on hand, every size that carries a code. Android
     printing in the app; a printable page in a browser. */
  async function printLabels() {
    const r = await printItemLabels({ itemId: it!.id });
    if (!r.ok) setErr(r.error);
  }

  async function archive() {
    const r = await mutate("catalog.update", { id: it!.id, archived: !it!.archived });
    if (!r.ok) { setErr(r.error); return; }
    if (!it!.archived) router.replace("/m/catalogue");
  }

  const bigBtn = (tone: "line" | "accent" | "ink"): React.CSSProperties => ({
    width: "100%", minHeight: 52, border: "2px solid " + (tone === "accent" ? ACCENT : INK),
    background: tone === "accent" ? ACCENT : tone === "ink" ? INK : "transparent", color: tone === "line" ? INK : tone === "ink" ? GROUND : "#fff",
    font: "inherit", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 14, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer",
  });

  return (
    <>
      <MTop title={it.archived ? "Archived" : "Garment"} right={<MTopCount>{it.sizes.length} size{it.sizes.length === 1 ? "" : "s"}</MTopCount>} back />
      <MRule />
      <MError msg={err} onDismiss={() => setErr("")} />
      <MBody pad>
        {(it.archived || bindCode) && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {it.archived && <MPill tone="accent">Archived</MPill>}
            {bindCode && <MPill tone="accent" mono>Binding {bindCode}</MPill>}
          </div>
        )}

        {/* ---- the description ---- */}
        {!editing ? (
          <>
            <div style={{ paddingBottom: 14, borderBottom: "1px solid var(--color-divider)" }}>
              <h2 style={{ fontWeight: 900, fontSize: 24, lineHeight: 1.1, margin: 0 }}>{name}</h2>
              <div style={{ fontSize: 14, color: "var(--color-neutral-700)", marginTop: 6 }}>
                {[it.type, it.group === "All" ? "Anyone" : it.group, it.supplier, it.sku].filter(Boolean).join(" · ") || "No details yet"}
              </div>
              <div style={{ fontSize: 14, fontFamily: MONO, marginTop: 4 }}>{it.cost ? `${money(it.cost)} each` : "No unit cost"}</div>
              {it.notes && <div style={{ fontSize: 13, color: "var(--color-neutral-800)", marginTop: 8 }}>{it.notes}</div>}
            </div>
            {!readOnly && !bindCode && (
              <div style={{ padding: "14px 0", borderBottom: "2px solid " + INK }}>
                <button onClick={startEdit} style={bigBtn("line")}>Edit details</button>
              </div>
            )}
          </>
        ) : (
          <>
            <MField label="Garment">
              <input value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} autoCapitalize="words" style={inputStyle} />
            </MField>
            <MField label="Type">
              <input value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} style={inputStyle} />
            </MField>
            <MField label="Who wears it">
              <select value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })} style={{ ...inputStyle, appearance: "none" }}>
                {groups.map((g) => <option key={g} value={g}>{g === "All" ? "Anyone" : g}</option>)}
              </select>
            </MField>
            <MField label="Supplier">
              <input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} style={inputStyle} />
            </MField>
            <MField label="Supplier code">
              <input value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} autoCapitalize="characters" autoCorrect="off" spellCheck={false} style={inputStyle} />
            </MField>
            <MField label="Unit cost">
              <input value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} inputMode="decimal" style={inputStyle} />
            </MField>
            <MField label="Notes">
              <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Optional" style={inputStyle} />
            </MField>
            <div style={{ padding: "14px 0", display: "grid", gap: 10, borderBottom: "2px solid " + INK }}>
              <button onClick={saveDetails} disabled={busy} style={bigBtn("accent")}>{busy ? "Saving…" : "Save details"}</button>
              <button onClick={() => { setEditing(false); setErr(""); setF({ item: it.item, type: it.type, group: it.group, supplier: it.supplier, sku: it.sku, cost: String(it.cost), notes: it.notes }); }}
                style={{ width: "100%", minHeight: 48, border: 0, background: "none", color: "var(--color-neutral-700)", font: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </>
        )}

        {/* ---- per size ---- */}
        <MSection label="Sizes" right="on hand · par" />
        {it.sizes.map((sz: string, si: number) => {
          const k = vkey(it.id, si);
          const oh = onhand(s, L, k);
          const par = reorderAt(s, k);
          // The bound supplier code only; bcFor()'s generated fallback is printed on no garment.
          const code = bcBound(s, it, si);
          return (
            <div key={si} style={{ padding: "14px 0", borderBottom: "1px solid var(--color-divider)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 18, minWidth: 54 }}>{sz}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--color-neutral-700)" }}>
                    <b style={{ color: oh <= par ? "var(--color-accent-700)" : INK, fontSize: 15, fontFamily: MONO }}>{oh}</b> on hand
                  </div>
                  <div style={{ fontSize: 12, fontFamily: MONO, color: code ? "var(--color-neutral-700)" : "var(--color-neutral-600)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {code || "No barcode bound"}
                  </div>
                </div>
                {!readOnly && (
                  <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                    <button onClick={() => setPar(si, par - 1)} aria-label={`Lower par for ${sz}`}
                      style={{ width: 44, height: 44, border: "2px solid " + INK, background: "transparent", color: INK, fontSize: 20, fontWeight: 800, cursor: "pointer" }}>−</button>
                    <div aria-label={`Par for ${sz}: ${par}`} style={{ minWidth: 44, height: 44, background: INK, color: GROUND, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 16 }}>{par}</div>
                    <button onClick={() => setPar(si, par + 1)} aria-label={`Raise par for ${sz}`}
                      style={{ width: 44, height: 44, border: "2px solid " + INK, background: "transparent", color: INK, fontSize: 20, fontWeight: 800, cursor: "pointer" }}>+</button>
                  </div>
                )}
              </div>
              {!readOnly && bindCode && code !== bindCode && (
                <MButton small tone="ink" label={`Bind to size ${sz}`} disabled={busy} onClick={() => bindScanned(si)} />
              )}
              {!readOnly && !bindCode && (
                <div style={{ marginTop: 10 }}>
                  {typeFor === si ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      {/* A numeric keypad hint only: whatever arrives is taken as typed. */}
                      <input value={typed} onChange={(e) => setTyped(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") bind(si, typed); }}
                        placeholder="Barcode on the label" inputMode="numeric" autoFocus
                        autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                        aria-label={`Barcode for size ${sz}`} style={inputStyle} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => bind(si, typed)} disabled={busy || !typed.trim()}
                          style={{ ...codeBtn, border: "2px solid " + ACCENT, background: ACCENT, color: "#fff", opacity: typed.trim() ? 1 : 0.4 }}>
                          {busy ? "Binding…" : "Bind"}
                        </button>
                        <button onClick={() => { setTypeFor(null); setTyped(""); }}
                          style={{ ...codeBtn, border: "2px solid var(--color-neutral-400)", background: "transparent", color: "var(--color-neutral-700)" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setScanFor(si)} aria-label={`Scan a barcode for size ${sz}`}
                          style={{ ...codeBtn, border: "2px solid " + INK, background: INK, color: GROUND }}>
                          {code ? "Scan a new one" : "Scan"}
                        </button>
                        <button onClick={() => { setErr(""); setTyped(""); setTypeFor(si); }} aria-label={`Type a barcode for size ${sz}`}
                          style={{ ...codeBtn, border: "2px solid " + INK, background: "transparent", color: INK }}>
                          Type it in
                        </button>
                      </div>
                      {/* Offered only where nothing is bound: a supplier's printed code always stays. */}
                      {!code && (
                        <button onClick={() => generate(si)} disabled={busy} aria-label={`Generate a barcode for size ${sz}`}
                          style={{ ...codeBtn, width: "100%", marginTop: 8, border: "2px solid " + INK, background: "transparent", color: INK, opacity: busy ? 0.5 : 1 }}>
                          {genFor === si ? "Generating…" : "Generate a barcode"}
                        </button>
                      )}
                    </>
                  )}
                  {code && <button onClick={() => unbind(si, code)} style={quietAction}>Unbind {code}</button>}
                  <button onClick={() => removeSize(si)} style={quietAction}>Remove size {sz}</button>
                  {made.length === 1 && made[0].si === si && <MMade made={made} labels={labels} onPrint={printLabels} />}
                </div>
              )}
            </div>
          );
        })}

        {!readOnly && !bindCode && (
          <div style={{ padding: "14px 0", borderBottom: "2px solid " + INK, display: "flex", gap: 10 }}>
            <input value={newSize} onChange={(e) => setNewSize(e.target.value)} placeholder="Add a size" aria-label="New size"
              autoCapitalize="characters" autoCorrect="off" spellCheck={false}
              style={{ ...inputStyle, flex: 1 }} />
            <button onClick={addSize} disabled={busy || !newSize.trim()}
              style={{ minWidth: 96, border: "2px solid " + INK, background: INK, color: GROUND, font: "inherit", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", opacity: newSize.trim() ? 1 : 0.4 }}>
              Add
            </button>
          </div>
        )}

        {!readOnly && !bindCode && (
          <>
            <MSection label="Barcodes" right={unlabelled ? `${unlabelled} without` : "All labelled"} />
            {made.length > 1 && <MMade made={made} labels={labels} onPrint={printLabels} />}
            <div style={{ padding: "14px 0", display: "grid", gap: 10, borderBottom: "2px solid " + INK }}>
              <button onClick={generateAll} disabled={busy} style={{ ...bigBtn("line"), opacity: busy ? 0.5 : 1 }}>
                {genFor === -1 ? "Generating…" : "Generate for every unlabelled size"}
              </button>
              <button onClick={printLabels} disabled={labels === 0}
                style={{ ...bigBtn("accent"), cursor: labels === 0 ? "not-allowed" : "pointer", opacity: labels === 0 ? 0.4 : 1 }}>
                {labels ? `Print ${labels} label${labels === 1 ? "" : "s"}` : "Nothing to print"}
              </button>
            </div>
          </>
        )}

        {!readOnly && !bindCode && (
          <div style={{ padding: "14px 0" }}>
            <button onClick={archive} style={{ ...quietAction, color: it.archived ? "var(--color-accent-700)" : "var(--color-neutral-700)" }}>
              {it.archived ? "Put this garment back in the catalogue" : "Archive this garment"}
            </button>
          </div>
        )}

        {/* What we used to pay: a price rise would otherwise erase the old figure. */}
        {costs.length > 0 && (
          <>
            <MSection label="What it has cost" right="changed by" />
            {costs.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--color-divider)" }}>
                <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 15, minWidth: 78 }}>{money(c.cost)}</div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--color-neutral-700)" }}>
                  {c.previous === null ? "Opening price" : `${c.previous > c.cost ? "Down" : "Up"} from ${money(c.previous)}`}
                  {" · "}
                  {/* The facility's zone, not the device's, so server and browser render the same day. */}
                  {formatInZone(c.at, s.tz)}
                </div>
                <div style={{ fontSize: 12, color: "var(--color-neutral-600)", whiteSpace: "nowrap" }}>{c.byName}</div>
              </div>
            ))}
          </>
        )}
      </MBody>

      {!readOnly && !it.archived && !bindCode && <MBar label="Done" glyph="check" tone="ink" onClick={() => router.push("/m/catalogue")} />}

      {scanFor !== null && (
        <MScan
          title={`Barcode for ${it.sizes[scanFor]}`}
          onClose={() => setScanFor(null)}
          onHit={(raw) => { const si = scanFor; setScanFor(null); if (si !== null) bind(si, raw); }}
        />
      )}
    </>
  );
}
