"use client";
/* Check the gaps: the lines that don't match, each with a reason, then the commit.
   A gap at or over the facility's threshold (settings.varianceReason, enforced again by
   stocktake.apply) must carry a reason before the bar will commit. The reason chosen is stored
   on the stocktake line. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSnap } from "@/lib/client";
import { UNPLACED } from "@/lib/compute";
import { clearCount, readCount, writeCount } from "@/lib/opencount";
import { INK, MBar, MBody, MEmpty, MError, MKick, MLine, MPill, MReasonChips, MRow, MRule, MSection, MTop } from "@/components/m";
import { OVER_REASONS, SHORT_REASONS, lineTitle, signed, useCountLines } from "@/components/m/count/lines";

const chip: React.CSSProperties = {
  minHeight: 44, minWidth: 48, padding: "0 12px", border: "2px solid " + INK, background: "transparent", color: INK,
  fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer", borderRadius: 0, flex: "none",
};

export default function MVariance() {
  const { s, mutate, busy } = useSnap();
  const router = useRouter();
  const locationId = String(useParams().id || "");
  const { lines, locName } = useCountLines(locationId);

  const [counted, setCounted] = useState<Record<string, number> | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");

  const me = s.session.userId;
  useEffect(() => {
    setCounted(readCount(me, locationId)?.n ?? {});
  }, [me, locationId]);

  const gate = Math.max(1, s.settings.varianceReason);
  const gaps = useMemo(() => (counted ? lines.filter((l) => (counted[l.key] ?? 0) !== l.expected) : []), [counted, lines]);
  const matches = useMemo(() => (counted ? lines.filter((l) => (counted[l.key] ?? 0) === l.expected) : []), [counted, lines]);
  const missing = gaps.filter((l) => Math.abs((counted?.[l.key] ?? 0) - l.expected) >= gate && !reason[l.key]);
  const ready = missing.length === 0;

  const recount = useCallback((key: string) => {
    if (!counted) return;
    writeCount(me, locationId, { ...counted, [key]: 0 });
    setReason((r) => { const n = { ...r }; delete n[key]; return n; });
    router.push(`/m/count/${locationId}?line=${encodeURIComponent(key)}`);
  }, [counted, me, locationId, router]);

  const commit = useCallback(async () => {
    if (!counted || !ready || busy) return;
    const payload = lines.map((l) => {
      const n = counted[l.key] ?? 0;
      return { itemId: l.itemId, si: l.si, counted: n, reason: n !== l.expected ? reason[l.key] || "" : "" };
    });
    const r = await mutate("stocktake.apply", { lines: payload, mode: "shelf", locationId: locationId === UNPLACED ? "" : locationId });
    if (!r.ok) { setErr(r.error); return; }
    clearCount(me, locationId);
    router.replace(`/m?flash=counted&loc=${encodeURIComponent(locName)}&gaps=${gaps.length}`);
  }, [counted, ready, busy, lines, reason, mutate, locationId, me, router, locName, gaps.length]);

  if (!counted) return (<><MTop title="Check the gaps" back /><MRule /><MBody pad /></>);

  return (
    <>
      <MTop title="Check the gaps" back />
      <MRule />
      <MError msg={err} onDismiss={() => setErr("")} />
      <MBody pad>
        <MKick>{locName}</MKick>
        <h2 style={{ fontSize: 26, fontWeight: 900, margin: "2px 0 0", lineHeight: 1.15 }}>
          {gaps.length === 0 ? "Everything matches" : `${gaps.length} gap${gaps.length === 1 ? "" : "s"}`}
        </h2>

        {lines.length === 0 && <MEmpty title="Nothing on this shelf" />}

        {gaps.map((l) => {
          const n = counted[l.key] ?? 0;
          const d = n - l.expected;
          const name = `${lineTitle(l)} ${l.size}`;
          return (
            <div key={l.key} style={{ marginTop: 10 }}>
              <MLine title={name} flag={`${n} counted, ${l.expected} expected`}
                right={
                  <>
                    <MPill tone="accent" mono>{signed(d)}</MPill>
                    <button type="button" style={chip} onClick={() => recount(l.key)} aria-label={`Recount ${name}`}>Recount</button>
                  </>
                }>
                <MReasonChips reasons={d > 0 ? OVER_REASONS : SHORT_REASONS} value={reason[l.key] || null} label={`Reason for ${name}`}
                  onPick={(r) => setReason((x) => { const o = { ...x }; if (r) o[l.key] = r; else delete o[l.key]; return o; })} />
              </MLine>
            </div>
          );
        })}

        {matches.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <MSection label="Match" right={matches.length} />
            {matches.map((l) => (
              <MRow key={l.key} dense mark="ok" title={`${lineTitle(l)} ${l.size}`} right={counted[l.key] ?? 0} />
            ))}
          </div>
        )}
      </MBody>
      <MBar label={busy ? "Committing…" : "Commit count"}
        small={ready ? `${lines.length} line${lines.length === 1 ? "" : "s"}` : "reason each gap"}
        onClick={commit} disabled={!ready || busy || lines.length === 0}
        offReason={!ready ? "Pick a reason for each gap" : undefined} />
    </>
  );
}
