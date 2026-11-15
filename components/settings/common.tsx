"use client";
/* Pieces every Settings section shares: the result line, the debounced field saver, the section
 * heading, and the few layout rules the side list and the route board need. */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useSnap } from "@/lib/client";
import { Field, LiveRegion } from "@/components/ui";
import { LEGACY_SETTINGS_TAB } from "@/lib/manual-links";
import type { Settings } from "@/lib/compute";

export const SECTIONS = [
  { id: "facility", label: "Facility" },
  { id: "issuing", label: "Issuing rules" },
  { id: "catalogue", label: "Catalogue & suppliers" },
  { id: "places", label: "Places & cost centres" },
  { id: "people", label: "People & sign-in" },
  { id: "data", label: "Data & audit log" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];

/** A ?tab= value (new id, old tab name, or #hash form) to the section it opens, and whether the
 *  audit log should be scrolled into view. Unknown values open Facility. */
export function resolveSection(raw: string | null | undefined): { section: SectionId; audit: boolean } {
  const want = (raw || "").trim().toLowerCase();
  const mapped = LEGACY_SETTINGS_TAB[want] || want;
  if (mapped === "audit") return { section: "data", audit: true };
  const hit = SECTIONS.find((x) => x.id === mapped);
  return { section: hit ? hit.id : "facility", audit: false };
}

/* Module scope, so a live region is not rebuilt (and re-announced) on every keystroke. */
export function Msg({ text }: { text?: string }) {
  return <LiveRegion msg={text} style={{ fontSize: 12, color: "var(--color-accent-700)", fontWeight: 600, whiteSpace: "pre-wrap" }} />;
}

export function TextField({ label, hint, ph, value, onChange, disabled, style }: { label: string; hint?: string; ph?: string; value: string; onChange: (v: string) => void; disabled: boolean; style?: React.CSSProperties }) {
  return <Field label={label} hint={hint} style={style}>{(c) => <input {...c} className="input" placeholder={ph} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />}</Field>;
}

/** An h2 in the board's section style, with an optional meta line and right-hand content. */
export function SectionHead({ children, meta, right, divider = true, id }: { children: React.ReactNode; meta?: React.ReactNode; right?: React.ReactNode; divider?: boolean; id?: string }) {
  return (
    <div id={id} style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", borderTop: divider ? "2px solid var(--color-text)" : undefined, paddingTop: divider ? 16 : 0, scrollMarginTop: 72 }}>
      <h2 style={{ margin: 0, fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em" }}>{children}</h2>
      {meta && <span className="tc-meta-line">{meta}</span>}
      {right && <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>{right}</span>}
    </div>
  );
}

/* Debounced saves, one message map per section.
 *
 * Sections unmount when the side list moves on, so a save still waiting out its pause is sent
 * straight away on unmount rather than dropped: typing a figure and clicking the next section must
 * not lose it. */
export function useSaver() {
  const { mutate } = useSnap();
  const [msg, setMsg] = useState<Record<string, string>>({});
  const say = useCallback((k: string, v: string) => setMsg((m) => ({ ...m, [k]: v })), []);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const pending = useRef<Record<string, { t: ReturnType<typeof setTimeout>; run: () => void }>>({});
  const draftNow = useRef(draft);
  useEffect(() => { draftNow.current = draft; });
  useEffect(() => {
    const p = pending.current;
    return () => { for (const k of Object.keys(p)) { clearTimeout(p[k].t); p[k].run(); } };
  }, []);
  const schedule = useCallback((k: string, run: () => void | Promise<void>, ms: number) => {
    if (pending.current[k]) clearTimeout(pending.current[k].t);
    const go = () => { delete pending.current[k]; void run(); };
    pending.current[k] = { t: setTimeout(go, ms), run: go };
  }, []);
  /** Take a refused edit back out of the draft, but only if the box still says what was refused. */
  const forgetDraft = useCallback((k: string, only?: string) => setDraft((d) => {
    if (only !== undefined && d[k] !== only) return d;
    const next = { ...d }; delete next[k]; return next;
  }), []);
  const debounced = useCallback((k: string, v: string, op: string, payload: Record<string, unknown>, msgKey = "fields") => {
    setDraft((d) => ({ ...d, [k]: v }));
    schedule(k, async () => { const r = await mutate(op, payload); say(msgKey, r.ok ? "Saved." : r.error); }, 500);
  }, [mutate, say, schedule]);
  return { msg, say, draft, setDraft, draftNow, forgetDraft, debounced, schedule };
}

const NUMERIC = new Set(["defaultEntitlement", "initialSets", "defaultReorder", "exceptionHigh", "capSets", "varianceReason"]);

/** Reading and saving facility settings fields through settings.update. */
export function useSettingsFields(saver: ReturnType<typeof useSaver>) {
  const { s } = useSnap();
  const { draft, setDraft, debounced } = saver;
  const val = (k: keyof Settings) => (draft[k] !== undefined ? draft[k] : String(s.settings[k] ?? ""));
  const setField = (k: keyof Settings, v: string) => {
    // An emptied number box saves nothing; the stored figure stands until a number is typed.
    if (NUMERIC.has(k) && v === "") { setDraft((d) => ({ ...d, [k]: v })); return; }
    debounced(k, v, "settings.update", { [k]: v });
  };
  return { val, setField };
}

/** A small number box with a label above and a unit after, as on the Issuing rules board. */
export function InlineNumber({ label, unit, value, onChange, disabled }: { label: string; unit: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="tc-lbl" style={{ display: "block" }}>{label}</label>
      <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
        <input id={id} className="input tc-mono" inputMode="numeric" style={{ width: 70, textAlign: "center", fontWeight: 600 }} value={value} disabled={disabled}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))} />
        <span>{unit}</span>
      </div>
    </div>
  );
}

/* Layout rules for this screen only. Scoped to class names nothing else wears. */
export function SettingsStyles() {
  return null; // the rules are in app/globals.css under portal redesign
}
