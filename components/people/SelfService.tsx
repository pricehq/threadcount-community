"use client";
import { useState } from "react";
import { ErrorLine } from "@/components/ui";
import { printAccessSlip } from "@/components/dialogs";
import { SLIP_DAYS, daysBetween, facilityDate, facilityToday, slipLive, type StaffRec } from "@/lib/compute";
import type { Act, Mutate } from "./shared";
import type { Terms } from "@/lib/terms";

/* Staff app activation. The code comes back once, in the op's response, and is never in the snapshot. */
export default function SelfService({ st, act, mutate, isAdmin, facility, terms, tz }: { st: StaffRec; act: Act; mutate: Mutate; isAdmin: boolean; facility: string; terms: Terms; tz: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const today = facilityToday(tz);
  const live = slipLive(st.selfCodeAt, today, tz);
  const printed = facilityDate(st.selfCodeAt ?? "", tz);
  const age = printed ? daysBetween(printed, today) : null;
  const left = age === null ? null : SLIP_DAYS - age;
  const when = age === 0 ? "today" : age === 1 ? "yesterday" : `${age} days ago`;

  if (code) {
    return (
      <div className="tc-people-confirm">
        <div className="tc-lbl">Code for {st.first}</div>
        <div className="tc-people-code">{code}</div>
        <div className="tc-people-hint">Shown once. Print or copy it now.</div>
        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" onClick={() => printAccessSlip({ settings: { facility, terms } }, st, code)}>Print the slip</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigator.clipboard?.writeText(code).catch(() => {})}>Copy</button>
          <button type="button" className="btn btn-ghost" onClick={() => setCode(null)}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13 }}>
        {st.selfEmail
          ? <>Signed up as <b>{st.selfEmail}</b>.</>
          : st.selfCode
            ? age === null
              ? <>Code outstanding but <b>won&apos;t work</b> (no print date).</>
              : live
                ? <>Code printed {when}, unused; expires {left === 1 ? "tomorrow" : `in ${left} days`}.</>
                : <>Code printed {when} has <b>expired</b>.</>
            : <>No staff-app login yet.</>}
      </div>
      <ErrorLine msg={err} />
      {isAdmin && (
        <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          {!st.selfEmail && (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={async () => {
              setBusy(true); setErr("");
              const r = await mutate<{ code: string }>("staff.selfCode", { id: st.id });
              setBusy(false);
              if (!r.ok) { setErr(r.error); return; }
              setCode(r.result.code);
            }}>{busy ? "Generating…" : st.selfCode ? "New code" : "Generate a code"}</button>
          )}
          {st.selfCode && !st.selfEmail && <button type="button" className="btn btn-ghost tc-people-ghost" onClick={() => act("staff.selfClear", { id: st.id })}>Cancel the code</button>}
          {st.selfEmail && (
            <button type="button" className="btn btn-ghost tc-people-ghost" onClick={() => {
              if (confirm(`Remove ${st.first}'s access? They'll be signed out and need a new code to get back in.`)) act("staff.selfUnlink", { id: st.id });
            }}>Remove access</button>
          )}
        </div>
      )}
    </div>
  );
}
