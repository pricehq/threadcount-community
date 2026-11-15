"use client";
/* Data & audit log: backups, CSV import, wipe, start fresh, and the audit log. */
import { useEffect, useState } from "react";
import { useSnap } from "@/lib/client";
import { MonoNum } from "@/components/portal";
import { CSV_TEMPLATES, parseCsv } from "@/lib/csv";
import { daysBetween, fmtDate } from "@/lib/compute";
import { Msg, SectionHead, useSaver } from "./common";
import { useBackupExport } from "./backup";
import AuditLog from "./AuditLog";

export default function DataAudit({ importKind, scrollAudit }: { importKind?: string; scrollAudit: boolean }) {
  const { s, isAdmin, mutate } = useSnap();
  const { msg, say } = useSaver();
  const { bkBusy, exportBackup } = useBackupExport(say);
  const [impKind, setImpKind] = useState(importKind && CSV_TEMPLATES[importKind] ? importKind : "catalog");
  const [impBusy, setImpBusy] = useState(false);
  const [wipe, setWipe] = useState("");
  const [reset, setReset] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    if (importKind && CSV_TEMPLATES[importKind]) {
      setImpKind(importKind);
      requestAnimationFrame(() => document.getElementById("import")?.scrollIntoView({ block: "start" }));
    }
  }, [importKind]);

  const lastBk = s.settings.lastBackup;
  const bkDays = lastBk ? daysBetween(lastBk, s.today) : null;
  const bkStale = !lastBk || (bkDays ?? 0) > 7;

  /* parseCsv throws on a malformed file to stop a half-import; its words are what the admin needs. */
  async function importFile(file: File) {
    setImpBusy(true); say("import", "Importing…");
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) { say("import", "No rows found — check the header row."); return; }
      const r = await mutate<{ created: number; updated: number; skipped: number; styles?: number; errors: string[] }>("import.rows", { kind: impKind, rows });
      if (!r.ok) { say("import", r.error); return; }
      const x = r.result;
      say("import", `${CSV_TEMPLATES[impKind].name}: ${x.created} created, ${x.updated} updated, ${x.skipped} skipped.${x.styles ? ` ${x.styles} uniform ${x.styles === 1 ? "style" : "styles"} set.` : ""}` + (x.errors.length ? "\n" + x.errors.join("\n") : ""));
    }
    catch (e) { say("import", (e as Error)?.message || "That file couldn’t be read as a CSV. Nothing was imported."); }
    finally { setImpBusy(false); }
  }
  async function restore(file: File) {
    if (!confirm("Restore this backup? It replaces ALL data in this facility (catalogue, staff, orders, issues, stock, approvals). Users are kept.")) return;
    say("backup", "Restoring…");
    try {
      const data = JSON.parse(await file.text());
      const r = await mutate<{ photosSkipped: number }>("backup.restore", data);
      if (!r.ok) { say("backup", r.error); return; }
      const skipped = r.result?.photosSkipped || 0;
      say("backup", skipped ? `Backup restored. ${skipped} photo${skipped === 1 ? "" : "s"} in the file did not come back; keep the file.` : "Backup restored.");
    }
    catch (e) { say("backup", "Import failed — " + (e as Error).message); }
  }
  function template(kind: string) {
    const t = CSV_TEMPLATES[kind];
    const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(t.headers + "\n" + t.example + "\n"); a.download = `threadcount-${kind}-template.csv`; a.click();
  }

  const backupLine = (
    <div className={bkStale ? "tc-flag" : undefined} style={{ fontSize: 13, fontWeight: bkStale ? 700 : 600, paddingLeft: bkStale ? 12 : 0, color: bkStale ? "var(--color-accent-700)" : "var(--color-text)" }}>
      {bkStale && <span className="tc-mark" aria-hidden="true" />}
      {lastBk ? <>Last backup <MonoNum>{fmtDate(lastBk)}</MonoNum>{bkDays ? ` · ${bkDays} day${bkDays === 1 ? "" : "s"} ago` : " · today"}</> : "No backup taken yet."}
    </div>
  );

  if (!isAdmin) {
    return (
      <>
        <SectionHead divider={false}>Backup</SectionHead>
        {backupLine}
        <div className="tc-meta-line">Only an admin can read the audit log.</div>
      </>
    );
  }

  const active = s.staff.filter((x) => !x.inactive).length;
  const items = s.catalog.filter((x) => !x.archived).length;

  return (
    <>
      <div className="tc-meta-line">
        <MonoNum>{active}</MonoNum> active staff · <MonoNum>{items}</MonoNum> garments · <MonoNum>{s.issues.length}</MonoNum> issues · <MonoNum>{s.orders.length}</MonoNum> orders
      </div>

      <SectionHead>Backup</SectionHead>
      {backupLine}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-secondary" disabled={bkBusy} onClick={exportBackup}>{bkBusy ? "Preparing…" : "Export backup"}</button>
        <label className="btn btn-ghost" style={{ cursor: "pointer" }}>Import backup<input type="file" accept="application/json,.json" aria-label="Choose a ThreadCount backup file to restore" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void restore(f); e.target.value = ""; }} /></label>
      </div>
      <Msg text={msg.backup} />

      <SectionHead id="import" meta="re-importing updates matching rows">Import from CSV</SectionHead>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select className="input" aria-label="What kind of CSV to import" value={impKind} onChange={(e) => setImpKind(e.target.value)}>{Object.entries(CSV_TEMPLATES).map(([k, t]) => <option key={k} value={k}>{t.name}</option>)}</select>
        <button className="btn btn-ghost" onClick={() => template(impKind)}>Download template</button>
        <label className="btn btn-secondary" style={{ cursor: impBusy ? "wait" : "pointer" }}>{impBusy ? "Importing…" : "Import CSV"}<input type="file" accept=".csv,text/csv" aria-label="Choose a CSV file to import" className="sr-only" disabled={impBusy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} /></label>
      </div>
      <Msg text={msg.import} />

      <SectionHead meta="keeps catalogue, staff, departments and suppliers">Wipe recorded activity</SectionHead>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input className="input tc-mono" style={{ width: 120 }} aria-label="Type WIPE to confirm wiping recorded activity" value={wipe} onChange={(e) => setWipe(e.target.value)} placeholder="WIPE" />
        <button className="btn btn-secondary" disabled={wipe !== "WIPE"} onClick={async () => { const r = await mutate("data.wipeActivity", { confirm: wipe }); say("wipe", r.ok ? "Activity wiped." : r.error); setWipe(""); }}>Wipe activity</button>
      </div>
      <Msg text={msg.wipe} />

      <div className="tc-flag" style={{ border: "2px solid var(--color-text)", borderLeft: "4px solid var(--color-accent)", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ margin: 0, fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, color: "var(--color-accent-700)" }}><span className="tc-mark" aria-hidden="true" />Start fresh</h2>
        <div className="tc-meta-line">Empties this facility; logins and settings stay. Export a backup first.</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input className="input tc-mono" style={{ width: 120 }} aria-label="Type RESET to confirm emptying this facility" value={reset} onChange={(e) => setReset(e.target.value)} placeholder="RESET" />
          <button className="btn btn-primary" disabled={reset !== "RESET" || resetBusy} onClick={async () => {
            if (!confirm("Delete everything in this facility and start fresh? Logins stay; all data goes.")) return;
            setResetBusy(true);
            const r = await mutate("data.reset", { confirm: reset });
            setResetBusy(false);
            say("reset", r.ok ? "Facility emptied — you’re starting fresh." : r.error);
            setReset("");
          }}>{resetBusy ? "Emptying…" : "Empty this facility"}</button>
        </div>
        <Msg text={msg.reset} />
      </div>

      <AuditLog scrollTo={scrollAudit} />
    </>
  );
}
