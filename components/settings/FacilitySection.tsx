"use client";
/* Facility: details and time zone, slips and logo, finance and reports, and the ward notice. */
import { useMemo, useState } from "react";
import { useSnap } from "@/lib/client";
import { Field } from "@/components/ui";
import { fmtDate, type Settings, type Snapshot } from "@/lib/compute";
import { Msg, SectionHead, TextField, useSaver, useSettingsFields } from "./common";

// Only for a browser without Intl.supportedValuesOf, so the picker is never empty.
const FALLBACK_ZONES = ["Australia/Brisbane", "Australia/Sydney", "Australia/Melbourne", "Australia/Hobart", "Australia/Adelaide", "Australia/Darwin", "Australia/Perth", "Australia/Broken_Hill", "Australia/Lord_Howe"];

type LiveNotice = { body: string; endsAt: string } | null;

const dayMonth = (d: string) => {
  const t = new Date(d + "T00:00:00Z");
  return isNaN(t.getTime()) ? d : t.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
};

export default function FacilitySection() {
  const { s, isAdmin, mutate } = useSnap();
  const saver = useSaver();
  const { msg, say } = saver;
  const { val, setField } = useSettingsFields(saver);
  const [tzPick, setTzPick] = useState<string | null>(null);
  const [tzErr, setTzErr] = useState("");
  const [logoV, setLogoV] = useState(0);
  const [notice, setNotice] = useState({ body: "", endsAt: "" });
  const [noticeBusy, setNoticeBusy] = useState(false);
  /* The live notice, once the snapshot carries it (spec S1). Undefined means this build's snapshot
     cannot see the board, which is different from an empty board, so nothing is claimed. */
  const live = (s as Snapshot & { notice?: LiveNotice }).notice;

  const zones = useMemo(() => {
    const all = Intl.supportedValuesOf?.("timeZone") || FALLBACK_ZONES;
    return all.includes(s.settings.timezone) ? all : [s.settings.timezone, ...all];
  }, [s.settings.timezone]);

  const F = (k: keyof Settings, label: string, opts: { ph?: string; hint?: string; numeric?: boolean; demoFixed?: boolean; style?: React.CSSProperties } = {}) =>
    <TextField label={label} hint={opts.hint} ph={opts.ph} value={val(k)} style={opts.style} disabled={!isAdmin || (!!opts.demoFixed && !!s.demo)} onChange={(v) => setField(k, opts.numeric ? v.replace(/[^0-9]/g, "") : v)} />;

  function uploadLogo(file: File) {
    if (file.size > 400 * 1024) { say("logo", "Logo must be under 400 KB."); return; }
    const r = new FileReader();
    r.onload = async () => { const res = await mutate("settings.update", { logoData: String(r.result) }); setLogoV((v) => v + 1); say("logo", res.ok ? "Logo saved." : res.error); };
    r.readAsDataURL(file);
  }

  async function postNotice() {
    const body = notice.body.trim(), endsAt = notice.endsAt.trim();
    // The staff app only shows a notice whose end date is today or later.
    if (body && endsAt && endsAt < s.today) { say("notice", `${fmtDate(endsAt)} has already gone. Pick today or later, or leave it blank.`); return; }
    setNoticeBusy(true);
    const r = await mutate<{ cleared: boolean }>("notice.set", { body, endsAt });
    setNoticeBusy(false);
    if (!r.ok) { say("notice", r.error); return; }
    if (!r.result.cleared) setNotice({ body: "", endsAt: "" });
    say("notice", r.result.cleared ? "Notice taken down." : `Posted${endsAt ? ` until ${dayMonth(endsAt)}` : ""}.`);
  }

  return (
    <>
      <SectionHead divider={false}>Facility</SectionHead>
      <div className="tc-set-grid">
        {F("facility", "Facility")}
        {F("location", "Stock location")}
        {F("coordinator", "Coordinator name")}
        {/* Fixed in the demo: everyone shares that facility, and these print on order forms. */}
        {F("coordinatorEmail", "Coordinator e-mail", { ph: "e.g. uniforms@yourhospital.org.au", demoFixed: true })}
        {F("coordinatorPhone", "Coordinator phone", { ph: "e.g. 07 3xxx xxxx", demoFixed: true })}
        <Field label="Time zone" error={tzErr || undefined}>{(c) => (
          <select {...c} className="input" value={tzPick ?? s.settings.timezone} disabled={!isAdmin || !!s.demo}
            onChange={async (e) => {
              const z = e.target.value; setTzPick(z); setTzErr("");
              const r = await mutate("settings.update", { timezone: z });
              if (!r.ok) { setTzPick(null); setTzErr(r.error); return; }
              say("fields", `Dates now follow ${z} time.`);
            }}>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        )}</Field>
      </div>
      <Msg text={msg.fields} />

      <SectionHead>Slips &amp; logo</SectionHead>
      <div className="tc-set-grid">
        {F("slipOrg", "Organisation name on slips", { ph: "Printed when there is no logo" })}
        {/* A named group, not a Field: a preview, a picker and a remove button share one label. */}
        <div className="field" role="group" aria-label="Logo, top right on slips">
          <span aria-hidden="true" className="tc-lbl">Logo</span>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {s.settings.hasLogo && <img src={`/api/logo?v=${logoV}`} alt="The logo printed on slips" style={{ height: 34, maxWidth: 140, objectFit: "contain", border: "1px solid var(--color-divider)", background: "#fff", padding: 2 }} />}
            {!s.settings.hasLogo && !isAdmin && <span className="tc-meta-line">No logo</span>}
            {isAdmin && <label className="btn btn-secondary" style={{ cursor: "pointer" }}>{s.settings.hasLogo ? "Replace" : "Upload"}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label={s.settings.hasLogo ? "Replace the slip logo" : "Upload a slip logo"} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }} /></label>}
            {isAdmin && s.settings.hasLogo && <button className="btn btn-ghost" aria-label="Remove the slip logo" onClick={async () => { const r = await mutate("settings.update", { logoData: "" }); say("logo", r.ok ? "Logo removed." : r.error); }}>Remove</button>}
          </div>
        </div>
        {F("slipCollectionFooter", "Collection slip footer", { style: { gridColumn: "1 / -1" } })}
        {F("slipDeliveryFooter", "Delivery slip footer", { style: { gridColumn: "1 / -1" } })}
      </div>
      <Msg text={msg.logo} />

      <SectionHead>Finance &amp; reports</SectionHead>
      <div className="tc-set-grid">
        {F("glAccount", "GL account", { ph: "e.g. 631020" })}
        {F("journalDesc", "Journal description prefix", { ph: "e.g. Uniform issues" })}
        {F("exceptionHigh", "Exception threshold (items/month)", { numeric: true })}
      </div>

      <SectionHead meta="on the staff app home screen">Ward notice</SectionHead>
      {live !== undefined && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="tc-lbl">Currently posted</span>
          {live
            ? <>
                <blockquote className="tc-notice-quote" style={{ margin: 0 }}>{live.body}</blockquote>
                <span className="tc-meta-line">{live.endsAt ? <>until <span className="tc-mono">{dayMonth(live.endsAt)}</span></> : "no end date"}</span>
              </>
            : <span className="tc-meta-line">Nothing posted</span>}
        </div>
      )}
      {isAdmin && (
        <>
          <Field label="Message" hint="Replaces the notice that is up now.">{(c) => <textarea {...c} className="input" rows={3} maxLength={400} style={{ width: "100%" }} placeholder="e.g. The linen room is closed this Friday — collections move to Thursday." value={notice.body} onChange={(e) => setNotice({ ...notice, body: e.target.value })} />}</Field>
          <div className="tc-set-grid">
            <Field label="Last day shown" hint="Optional. Blank stays up until taken down.">{(c) => <input {...c} className="input" type="date" min={s.today} value={notice.endsAt} onChange={(e) => setNotice({ ...notice, endsAt: e.target.value })} />}</Field>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-secondary" disabled={noticeBusy || (!notice.body.trim() && live === null)} onClick={postNotice}>
              {noticeBusy ? "Saving…" : notice.body.trim() ? "Post this notice" : "Take the notice down"}
            </button>
          </div>
        </>
      )}
      <Msg text={msg.notice} />
    </>
  );
}
