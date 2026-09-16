"use client";
/* Catalogue & suppliers: default reorder level, barcode lookup, and the supplier directory. */
import { useState } from "react";
import { useSnap } from "@/lib/client";
import { Field } from "@/components/ui";
import { Panel } from "@/components/portal";
import { csvOf, type SupplierRec } from "@/lib/compute";
import { downloadCsv } from "@/lib/print";
import { Msg, SectionHead, TextField, useSaver, useSettingsFields } from "./common";

type SupKey = "contact" | "phone" | "account" | "email" | "lead";
const SUP_FIELDS: readonly [SupKey, string, string][] = [["contact", "Contact", "e.g. Dana R."], ["phone", "Phone", "e.g. 07 3xxx xxxx"], ["account", "Account no.", "e.g. ACC-2201"], ["email", "Order email", "e.g. orders@example.com"], ["lead", "Lead time (days)", "e.g. 14"]];

export default function CatalogueSection() {
  const { s, isAdmin, mutate } = useSnap();
  const saver = useSaver();
  const { msg, say, draft, debounced } = saver;
  const { val, setField } = useSettingsFields(saver);
  const [lookupOn, setLookupOn] = useState<boolean | null>(null);
  const [ns, setNs] = useState("");

  const supField = (sup: SupplierRec, k: SupKey) => draft[`sup:${sup.id}:${k}`] ?? (sup[k] === null ? "" : String(sup[k]));
  function exportSuppliers() {
    const rows = s.supplierDir.map((sup) => [sup.name, supField(sup, "contact"), supField(sup, "phone"), supField(sup, "account"), supField(sup, "email"), supField(sup, "lead"), s.catalog.filter((it) => it.supplier === sup.name).length, s.orders.filter((o) => o.supplier === sup.name).length]);
    downloadCsv(`threadcount-suppliers-${s.today}.csv`, csvOf(["Supplier", "Contact", "Phone", "Account no.", "Order email", "Lead time (days)", "Products", "Orders"], rows));
  }

  return (
    <>
      <SectionHead divider={false}>Catalogue</SectionHead>
      <div className="tc-set-grid">
        <TextField label="Default reorder level" hint="For sizes without their own." value={val("defaultReorder")} disabled={!isAdmin} onChange={(v) => setField("defaultReorder", v.replace(/[^0-9]/g, ""))} />
      </div>
      {isAdmin && (
        <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
          <input type="checkbox" style={{ width: 16, height: 16, accentColor: "var(--color-accent)" }} checked={lookupOn ?? s.settings.barcodeLookup}
            onChange={async (e) => {
              const v = e.target.checked; setLookupOn(v);
              const r = await mutate("settings.update", { barcodeLookup: v });
              if (!r.ok) setLookupOn(!v);
              say("fields", r.ok ? (v ? "Barcode lookup on." : "Barcode lookup off.") : r.error);
            }} />
          Look up unknown barcodes in public databases
        </label>
      )}
      <Msg text={msg.fields} />

      <SectionHead meta="Suppliers with products or orders can’t be removed."
        right={<button className="btn btn-ghost" onClick={exportSuppliers} disabled={s.supplierDir.length === 0}>Export CSV</button>}>
        Suppliers
      </SectionHead>
      {s.supplierDir.map((sp) => {
        const nItems = s.catalog.filter((it) => it.supplier === sp.name).length, nOrds = s.orders.filter((o) => o.supplier === sp.name).length;
        return (
          <Panel key={sp.id} headingLevel={3}
            title={<span style={{ textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-heading)", fontSize: 15, fontWeight: 800 }}>{sp.name}</span>}
            aside={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span className="tc-mono">{nItems}</span> product{nItems === 1 ? "" : "s"} · <span className="tc-mono">{nOrds}</span> order{nOrds === 1 ? "" : "s"}
              {isAdmin && nItems + nOrds === 0 && <button className="btn btn-ghost btn-icon" title="Remove this supplier" aria-label={`Remove ${sp.name}`} onClick={async () => { const r = await mutate("supplier.remove", { id: sp.id }); say("sup", r.ok ? `${sp.name} removed.` : r.error); }}>×</button>}
            </span>}>
            <div className="tc-set-grid" style={{ padding: "12px 16px" }}>
              {SUP_FIELDS.map(([k, lbl, ph]) => (
                <Field key={k} label={<>{lbl}<span className="sr-only"> for {sp.name}</span></>}>{(c) => <input {...c} className={"input" + (k === "lead" || k === "account" ? " tc-mono" : "")} placeholder={ph} value={supField(sp, k)} disabled={!isAdmin}
                  onChange={(e) => { const v = k === "lead" ? e.target.value.replace(/[^0-9]/g, "") : e.target.value; debounced(`sup:${sp.id}:${k}`, v, "supplier.update", { id: sp.id, [k]: v }, "sup"); }} />}</Field>
              ))}
            </div>
          </Panel>
        );
      })}
      {!s.supplierDir.length && <div className="tc-meta-line">No suppliers yet.</div>}
      {isAdmin && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Field label="New supplier" style={{ width: 280, maxWidth: "100%" }}>{(c) => <input {...c} className="input" value={ns} onChange={(e) => setNs(e.target.value)} placeholder="e.g. Northline Workwear" onKeyDown={async (e) => { if (e.key === "Enter" && ns.trim()) { const r = await mutate("supplier.add", { name: ns }); say("sup", r.ok ? "Added." : r.error); if (r.ok) setNs(""); } }} />}</Field>
          <button className="btn btn-secondary" disabled={!ns.trim()} onClick={async () => { const r = await mutate("supplier.add", { name: ns }); say("sup", r.ok ? "Added." : r.error); if (r.ok) setNs(""); }}>Add supplier</button>
        </div>
      )}
      <Msg text={msg.sup} />
    </>
  );
}
