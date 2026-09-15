"use client";
/* 2B — Waitlist. What "none on the shelf" leads to instead of a dead end.
 *
 * Position is shown **before** joining, because "you are fourth" and "you are fortieth" are
 * different decisions and only one of them is worth waiting for. The nearest stocked sizes sit
 * right underneath for the same reason: most people would rather have something that fits
 * approximately today than exactly in three weeks, and the screen should let them say so.
 *
 * Joining needs no approval — a queue is not a request. Approval happens if and when the item
 * lands and they accept it.
 */
import { useState } from "react";
import { MBar, MBody, MError, MRule, MTop } from "@/components/m";
import { ACCENT_300, CompactAction, DarkCard, DIVIDER, GROUND, INK, Kicker, N300, N600, N700, StockTag } from "@/components/staffui";
import { useStaff } from "@/lib/staffclient";
import { fmtDate, formatInZone } from "@/lib/compute";
import { WAITLIST_HOLD_HOURS } from "@/lib/staffreq";

type Alt = { si: number; size: string; word: string };
type Data = {
  itemId: string; item: string; size: string; si: number;
  lastRestocked: string; position: number; ahead: number;
  joined: boolean; entryId: string | null; offeredAt: string | null;
  holdUntil: string | null; offerExpired: boolean; acceptedAt: string | null;
  alternatives: Alt[];
};

export default function WaitlistScreen({ data }: { data: Data }) {
  const { mutate, busy, me } = useStaff();
  const [err, setErr] = useState("");
  const [joined, setJoined] = useState(data.joined);

  /* Four states, and the screen used to know about two of them.
   *
   * An offer is not a standing invitation: it has been accepted, or it is live, or the 48-hour
   * hold has run out. Keying only off `offeredAt` meant somebody who had already accepted was
   * shown "Accept it" again — every tap answered "Nothing to accept" — and somebody whose hold
   * had lapsed was shown a bar the server now refuses, with no word about why. */
  const acceptedAt = data.acceptedAt;
  const accepted = !!acceptedAt;
  const heldForMe = !accepted && !!data.offeredAt && !data.offerExpired;
  const lapsed = !accepted && !!data.offeredAt && data.offerExpired;

  /* The deadline, with the time on it, in the facility's zone.
   *
   * `holdUntil` is an instant 48 hours after the offer, and it was being shown by slicing the first
   * ten characters of the UTC string — so an offer made at 09:00 Brisbane printed the previous day's
   * date, and a nurse reading "held until the 9th" had until the 10th. The hour matters as much as
   * the date here: a hold that runs out mid-afternoon is not the same as one that runs to midnight. */
  const heldUntil = data.holdUntil
    ? formatInZone(data.holdUntil, me.tz, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <>
      <MTop title="Waitlist" back />
      <MRule />
      <MBody>
        <div style={{ padding: "20px 16px 18px", borderBottom: "2px solid " + INK, background: GROUND }}>
          <Kicker tone="attention">None on the shelf</Kicker>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 30, letterSpacing: "-0.02em", lineHeight: 1.1, marginTop: 8 }}>
            {data.item} — {data.size}
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: N700, margin: "10px 0 0" }}>
            {data.lastRestocked ? `Last counted ${fmtDate(data.lastRestocked)}. ` : ""}
            The linen room orders these in when the shelf runs down.
          </p>
        </div>

        <MError msg={err} onDismiss={() => setErr("")} />

        <div style={{ padding: 16 }}>
          {accepted ? (
            <DarkCard kicker="Accepted" title="It’s with your manager" meta="You accepted this one, and it has gone to your manager for approval like any other request.">
              <div style={{ borderTop: "1px solid #4a4746", marginTop: 16, paddingTop: 14, fontSize: 13, color: N300 }}>
                Accepted {formatInZone(acceptedAt || "", me.tz)}. Follow it on <a href="/my/orders" style={{ color: GROUND }}>your orders</a>.
              </div>
            </DarkCard>
          ) : heldForMe ? (
            <DarkCard kicker="It’s in" title="Held for you" meta="The linen room has one for you. Accept it and it goes to your manager for approval like any other request.">
              <div style={{ borderTop: "1px solid #4a4746", marginTop: 16, paddingTop: 14, fontSize: 13, color: N300 }}>
                {heldUntil ? `Held until ${heldUntil}.` : "Held for you."}
              </div>
            </DarkCard>
          ) : (
            <div style={{ background: INK, color: GROUND, padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: ACCENT_300 }}>
                {joined ? "You’re on the list" : "If you join"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12 }}>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 44, letterSpacing: "-0.03em", lineHeight: 1 }}>
                  {ordinal(data.position)}
                </div>
                <div style={{ flex: 1, fontSize: 14, lineHeight: 1.4, color: N300 }}>
                  <div>in queue</div>
                  <div>{data.ahead === 0 ? "nobody ahead of you" : `${data.ahead} ${data.ahead === 1 ? "person" : "people"} already waiting`}</div>
                </div>
              </div>
              <div style={{ borderTop: "1px solid #4a4746", marginTop: 16, paddingTop: 14, fontSize: 13, lineHeight: 1.55, color: N300 }}>
                {lapsed
                  ? `One came in and was held for you until ${heldUntil || "the hold ran out"}. Nobody took it, so the hold has run out — you’re still on the list, and the linen room can offer it again.`
                  : `You’ll get a message the day it lands, and the item is held for you for ${WAITLIST_HOLD_HOURS} hours.`}
              </div>
            </div>
          )}
        </div>

        {data.alternatives.length > 0 && !heldForMe && !accepted && (
          <>
            <div style={{ padding: "18px 16px 8px", borderBottom: "2px solid " + INK, background: GROUND }}>
              <Kicker>Or take a stocked size</Kicker>
            </div>
            {data.alternatives.map((a) => (
              <div key={a.si} style={{ display: "flex", gap: 12, alignItems: "center", padding: "14px 16px", background: "#fff", borderTop: `1px solid ${DIVIDER}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{data.item} — {a.size}</div>
                  <div style={{ fontSize: 12.5, marginTop: 4 }}><StockTag word={a.word} /></div>
                </div>
                <CompactAction label="Request" onClick={() => { window.location.assign(`/my/request?item=${data.itemId}&si=${a.si}`); }} />
              </div>
            ))}
          </>
        )}

        <p style={{ fontSize: 13, lineHeight: 1.6, color: N700, padding: 16, margin: 0 }}>
          Waiting doesn&rsquo;t need approval. Your manager only sees it if the item comes in and you
          accept it.
        </p>
        <div style={{ height: 12 }} />
      </MBody>

      {accepted ? null : heldForMe ? (
        <MBar
          label={busy ? "Working…" : "Accept it"}
          glyph="check"
          disabled={busy}
          onClick={async () => {
            const r = await mutate<{ request: { id: string } }>("waitlist.accept", { id: data.entryId });
            if (!r.ok) { setErr(r.error); return; }
            window.location.assign(`/my/orders/${r.result.request.id}`);
          }}
        />
      ) : joined ? (
        <MBar
          label={busy ? "Working…" : "Leave the list"}
          glyph="none"
          tone="ink"
          disabled={busy}
          onClick={async () => {
            const r = await mutate("waitlist.leave", { id: data.entryId });
            if (!r.ok) { setErr(r.error); return; }
            setJoined(false);
            window.location.assign("/my/shelf");
          }}
        />
      ) : (
        <MBar
          label={busy ? "Joining…" : "Join the waitlist"}
          glyph="none"
          disabled={busy}
          onClick={async () => {
            const r = await mutate("waitlist.join", { itemId: data.itemId, si: data.si });
            if (!r.ok) { setErr(r.error); return; }
            setJoined(true);
            window.location.reload();
          }}
        />
      )}
    </>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
