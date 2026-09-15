"use client";
/* 2D — Ward round manifest. What the desk sees when the trolley arrives.
 *
 * Unclaimed bags from previous rounds sit **above** today's work. They are the linen room's
 * biggest waste — a bag signed for on the ward and never collected is a garment out of stock and
 * off the record — so the screen refuses to bury them under whatever arrived this morning.
 *
 * Anyone on the ward can sign, and whoever does is named on the requester's order. That is the
 * whole audit story: a missing bag has a name against it.
 */
import { useState } from "react";
import { MBody, MError, MRule, MTop } from "@/components/m";
import { ACCENT_300, CompactAction, DoneRow, EdgeRow, GROUND, INK, Kicker, LineList, N300, N400, N600, N700, SecondaryBar } from "@/components/staffui";
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
   * local text — slicing the first ten characters for the date, and formatting with no zone for the
   * time. The ward round happens in the morning, which is exactly when the UTC date is still
   * yesterday's, so the desk was routinely told a bag it signed for an hour ago went out the day
   * before. The facility's zone answers both. */
  const tz = me.tz;
  const [err, setErr] = useState("");

  async function sign(id: string) {
    const r = await mutate("round.sign", { id });
    if (!r.ok) setErr(r.error);
  }

  async function claim(id: string) {
    const r = await mutate("round.claim", { id });
    if (!r.ok) { setErr(r.error); return; }
    window.location.reload();
  }

  return (
    <>
      <MTop title="Ward round" back right={<span style={{ fontSize: 12, color: N400 }}>{ward}</span>} />
      <MRule />
      <MBody>
        <div style={{ background: INK, color: GROUND, padding: 18, display: "flex", alignItems: "center", gap: 16 }}>
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

        <MError msg={err} onDismiss={() => setErr("")} />

        {unclaimed.length > 0 && (
          <>
            <div style={{ padding: "18px 16px 8px", borderBottom: "2px solid " + INK, background: GROUND }}>
              <Kicker tone="attention">Unclaimed from earlier rounds</Kicker>
            </div>
            <div style={{ display: "grid", gap: 2, padding: "12px 0" }}>
              {unclaimed.map((b) => (
                <EdgeRow key={b.id} tone="accent">
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3 }}>{b.subjectName}</div>
                      <div style={{ fontSize: 12.5, color: N600, marginTop: 4, lineHeight: 1.4 }}>
                        {b.summary} · {b.code}
                      </div>
                      <div style={{ fontSize: 12.5, color: N600, marginTop: 2 }}>
                        signed by {b.signerName === me.name ? "you" : b.signerName}
                        {b.signedAt ? ` ${formatInZone(b.signedAt, tz)}` : ""}
                      </div>
                    </div>
                    <CompactAction label="Nudge" onClick={() => { window.location.assign(`/my/orders/${b.id}/messages`); }} />
                    {/* The desk’s own way out of this list. Nudging only works if the requester
                        eventually opens the app; often the bag went days ago and the person who
                        knows that is the clerk standing where it used to be. */}
                    <CompactAction label="Collected" tone="accent" disabled={busy} onClick={() => claim(b.id)} />
                  </div>
                </EdgeRow>
              ))}
            </div>
          </>
        )}

        <div style={{ padding: "18px 16px 8px", borderBottom: "2px solid " + INK, background: GROUND }}>
          <Kicker>Arriving today</Kicker>
        </div>

        {toSign.length === 0 && signedToday.length === 0 ? (
          <div style={{ padding: "22px 16px", fontSize: 14, color: N600, lineHeight: 1.6 }}>
            Nothing on the round for {ward || "your ward"} right now.
          </div>
        ) : (
          <>
            {toSign.map((b) => (
              <div key={b.id} style={{ padding: "14px 16px", background: "#fff", borderTop: "1px solid var(--color-divider)" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3 }}>{b.subjectName}</div>
                    <div style={{ fontSize: 12.5, color: N600, marginTop: 4 }}>{b.summary} · {b.code}</div>
                  </div>
                  <CompactAction label="Sign" tone="accent" disabled={busy} onClick={() => sign(b.id)} />
                </div>
                {/* Signing is a signature: whoever puts their name to a bag of four garments should
                    be able to see the four before they do, not a count. Nothing declined is listed
                    — a knocked-back garment never reaches the trolley. */}
                {b.lineCount > 1 && (
                  <div style={{ marginTop: 10 }}><LineList lines={b.lines} /></div>
                )}
              </div>
            ))}
            {signedToday.map((b) => (
              <DoneRow key={b.id}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3 }}>{b.subjectName}</div>
                    <div style={{ fontSize: 12.5, marginTop: 4 }}>
                      signed {b.signedAt ? formatInZone(b.signedAt, tz, { hour: "2-digit", minute: "2-digit", hour12: false }) : ""} by {b.signerName}
                    </div>
                  </div>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden><path d="m4 12 5 5L20 6" /></svg>
                </div>
              </DoneRow>
            ))}
          </>
        )}

        {/* What this person raised in somebody else's name, still on its way. The bags above are
            only the ones arriving today; a request typed in on Tuesday and approved on Thursday is
            invisible there until it turns up on a trolley, so without this the only way to find out
            where it had got to was to ring the linen room. */}
        {raised.length > 0 && (
          <>
            <div style={{ padding: "18px 16px 8px", borderTop: "2px solid " + INK, borderBottom: "2px solid " + INK, background: GROUND }}>
              <Kicker>Raised by you · still open</Kicker>
            </div>
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
                    <div style={{ fontSize: 12.5, color: N600, marginTop: 4 }}>
                      {[st.label, st.note].filter(Boolean).join(" · ")}
                    </div>
                  </EdgeRow>
                );
              })}
            </div>
          </>
        )}

        <p style={{ fontSize: 13, lineHeight: 1.6, color: N700, padding: 16, margin: 0 }}>
          Anyone on the ward can sign. Whoever does appears on the requester&rsquo;s order, so a
          missing bag has a name against it.
        </p>
        <div style={{ height: 12 }} />
      </MBody>

      {toSign.length > 1 && (
        <div style={{ borderTop: "2px solid " + INK }}>
          {/* Bulk signing is allowed but not encouraged — a secondary action, never the red one. */}
          <SecondaryBar
            label={busy ? "Signing…" : `Sign for all ${toSign.length} remaining`}
            disabled={busy}
            onClick={async () => {
              for (const b of toSign) {
                const r = await mutate("round.sign", { id: b.id });
                if (!r.ok) { setErr(r.error); return; }
              }
            }}
          />
        </div>
      )}
    </>
  );
}
