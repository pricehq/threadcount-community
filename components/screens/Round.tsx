"use client";
/* Team ▸ Round — what the desk sees when the trolley arrives.
 *
 * Unclaimed bags from previous rounds sit **above** today's work. They are the linen room's
 * biggest waste — a bag signed for on the ward and never collected is a garment out of stock and
 * off the record — so the screen refuses to bury them under whatever arrived this morning.
 *
 * Anyone on the ward can sign, and whoever does is named on the requester's order. That is the
 * whole audit story: a missing bag has a name against it.
 *
 * Signing for the lot now reports itself. It used to loop silently: on a ward where the fourth bag
 * was refused, the clerk saw an unchanged list and no idea which three had gone through, so the
 * honest thing — a count that climbs, and the name of whatever stopped it — is on the screen.
 */
import { useState } from "react";
import { MEmpty, MError } from "@/components/m";
import {
  ACCENT_300, DoneRow, EdgeRow, GROUND, INK, Kicker, N300, N600, Progress, SecondaryBar, lineText,
} from "@/components/staffui";
import Team, { Band, ChipAction, ChipRow } from "./Team";
import { useStaff } from "@/lib/staffclient";
import { statusText } from "@/lib/staffreq";
import type { ReqLine, ReqRow } from "@/lib/staffdata";
import { formatInZone } from "@/lib/compute";

type Bag = {
  id: string; code: string; subjectName: string;
  /** What is actually in the bag: the approved lines, and nothing the manager knocked back. */
  lines: ReqLine[]; summary: string; garments: number; lineCount: number;
  status: string; signerName: string | null; signedAt: string | null; claimedAt: string | null;
  since: string;
};

export default function RoundScreen({ ward, toSign, unclaimed, signedToday, raised }: {
  ward: string; toSign: Bag[]; unclaimed: Bag[]; signedToday: Bag[];
  /** Open requests this person raised for someone else, however they came to raise them. */
  raised: ReqRow[];
}) {
  const { mutate, busy, me } = useStaff();
  /* `signedAt` arrives as a UTC instant, and both of the places it is shown used to read it as
   * local text. The ward round happens in the morning, which is exactly when the UTC date is still
   * yesterday's, so the desk was routinely told a bag it signed for an hour ago went out the day
   * before. The facility's zone answers both. */
  const tz = me.tz;
  const [err, setErr] = useState("");
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);

  async function sign(id: string) {
    setErr("");
    const r = await mutate("round.sign", { id });
    if (!r.ok) setErr(r.error);
  }

  async function claim(id: string) {
    setErr("");
    const r = await mutate("round.claim", { id });
    if (!r.ok) setErr(r.error);
  }

  /* One call per bag, because that is what signing is — a signature against one hand-over — and the
   * count climbs after each. It stops at the first refusal and says which bag it stopped on: the
   * ones already signed are done and must not be sent again (round.sign is not idempotent), and
   * the rest are left exactly as they were for the clerk to deal with. */
  async function signAll() {
    const list = toSign;
    if (!list.length) return;
    setErr("");
    setProg({ done: 0, total: list.length });
    let done = 0;
    for (const b of list) {
      const r = await mutate("round.sign", { id: b.id });
      if (!r.ok) {
        setErr(`Signed ${done} of ${list.length} — ${b.subjectName}: ${r.error}`);
        setProg(null);
        return;
      }
      done += 1;
      setProg({ done, total: list.length });
    }
    setProg(null);
  }

  const nothingAtAll = toSign.length === 0 && signedToday.length === 0 && unclaimed.length === 0;

  return (
    <Team
      active="/my/round"
      foot={toSign.length > 1 ? (
        <div style={{ borderTop: "2px solid " + INK }}>
          {/* Bulk signing is allowed but not encouraged — a secondary action, never the red one. */}
          <SecondaryBar
            label={prog ? "Signing…" : `Sign for all ${toSign.length} remaining`}
            disabled={busy || !!prog}
            onClick={() => void signAll()}
          />
        </div>
      ) : undefined}
    >
      <div style={{ padding: "4px 16px 0" }}><Kicker>Ward round</Kicker></div>
      <div style={{ background: INK, color: GROUND, padding: 18, margin: "8px 0 0", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 34, letterSpacing: "-0.03em", lineHeight: 1 }}>
          {toSign.length}
        </div>
        <div style={{ flex: 1, fontSize: 14, lineHeight: 1.4, color: N300 }}>
          <div>{toSign.length === 1 ? "bag to sign" : "bags to sign"}</div>
          <div>{toSign.length === 0 ? "nothing waiting" : "arriving today"}</div>
        </div>
        {signedToday.length > 0 && (
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: ACCENT_300 }}>
            {signedToday.length} signed
          </div>
        )}
      </div>

      {prog && <Progress label="Signing" done={prog.done} total={prog.total} unit="signed" />}
      <MError msg={err} onDismiss={() => setErr("")} />

      {unclaimed.length > 0 && (
        <>
          <Band tone="attention" label="Unclaimed from earlier rounds" />
          <div style={{ display: "grid", gap: 2, padding: "12px 0" }}>
            {unclaimed.map((b) => (
              <EdgeRow key={b.id} tone="accent">
                <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3 }}>{b.subjectName}</div>
                <div style={{ fontSize: 13, color: N600, marginTop: 4, lineHeight: 1.4 }}>
                  {[b.lines.map(lineText).join(", "), b.signedAt ? `since ${formatInZone(b.signedAt, tz, { weekday: "long" })}` : ""].filter(Boolean).join(" · ")}
                </div>
                <ChipRow>
                  {/* Nudging only works if the requester eventually opens the app; often the bag
                      went days ago and the person who knows that is the clerk standing where it
                      used to be, which is what Collected is for. */}
                  <ChipAction label="Nudge" href={`/my/orders/${b.id}/messages`} />
                  <ChipAction label="Collected" disabled={busy} onClick={() => void claim(b.id)} />
                </ChipRow>
              </EdgeRow>
            ))}
          </div>
        </>
      )}

      {/* The count stays on the band when it reaches nought: a heading that drops its note the
          moment the work is done reads as a screen that has lost its place. */}
      <Band label="Arriving today" right={`${toSign.length} to sign`} />

      {nothingAtAll ? (
        <div style={{ padding: "0 16px" }}>
          <MEmpty title={`Nothing on the round for ${ward || "your ward"} right now.`} />
        </div>
      ) : (
        <>
          {toSign.map((b) => (
            <EdgeRow key={b.id} tone="ink">
              <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3 }}>{b.subjectName}</div>
              {/* Signing is a signature: whoever puts their name to a bag of four garments should be
                  able to read the four before they do, rather than a count of them and a code. That
                  is why the garments themselves are the row's second line. Nothing declined is
                  listed — a knocked-back garment never reaches the trolley. */}
              <div style={{ fontSize: 13, color: N600, marginTop: 4, lineHeight: 1.4 }}>
                {b.lines.map(lineText).join(", ")}
              </div>
              <ChipRow>
                <ChipAction label="Sign" disabled={busy || !!prog} onClick={() => void sign(b.id)} />
              </ChipRow>
            </EdgeRow>
          ))}
          {signedToday.map((b) => (
            <DoneRow key={b.id}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3 }}>{b.subjectName}</div>
                  <div style={{ fontSize: 13, marginTop: 3 }}>
                    Signed {b.signedAt ? formatInZone(b.signedAt, tz, { hour: "2-digit", minute: "2-digit", hour12: false }) : ""} by {b.signerName}
                  </div>
                </div>
                <span style={{
                  fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase",
                  background: "var(--color-divider)", color: INK, padding: "5px 8px", whiteSpace: "nowrap",
                }}>Done</span>
              </div>
            </DoneRow>
          ))}
          {/* Under the signed rows rather than instead of them: the desk wants this morning's work
              still on the screen AND to be told it is finished. Drawn whenever nothing is left to
              sign, which is what the mockup does once the last bag has a name against it. */}
          {toSign.length === 0 && (
            <div style={{ padding: "0 16px" }}>
              <MEmpty title="Every bag is signed" sub="Whoever signs appears on the requester’s order." />
            </div>
          )}
        </>
      )}

      {/* What this person raised in somebody else's name, still on its way. The bags above are only
          the ones arriving today; a request typed in on Tuesday and approved on Thursday is invisible
          there until it turns up on a trolley, so without this the only way to find out where it had
          got to was to ring the linen room. */}
      {raised.length > 0 && (
        <>
          <Band label="Raised by you · still open" />
          <div style={{ display: "grid", gap: 2, padding: "12px 0" }}>
            {raised.map((r) => {
              const st = statusText(r, { mine: false, first: r.subjectName?.split(" ")[0] });
              return (
                <EdgeRow key={r.id} tone="divider" href={`/my/orders/${r.id}`}>
                  <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                    <span style={{ flex: 1, fontSize: 16, fontWeight: 800 }}>{r.subjectName}</span>
                    <span style={{ fontSize: 12, color: N600 }}>{r.code}</span>
                  </div>
                  <div style={{ fontSize: 14.5, fontWeight: 600, marginTop: 5, lineHeight: 1.35 }}>{r.summary}</div>
                  <div style={{ fontSize: 13, color: N600, marginTop: 4 }}>
                    {[st.label, st.note].filter(Boolean).join(" · ")}
                  </div>
                </EdgeRow>
              );
            })}
          </div>
        </>
      )}
      <div style={{ height: 12 }} />
    </Team>
  );
}
