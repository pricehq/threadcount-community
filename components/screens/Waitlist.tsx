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
 *
 * Joining and leaving redraw this screen in place (router.refresh) rather than reloading it: the
 * whole point of the bar is that it answers immediately, and a full reload on ward wifi is a
 * second or two of white while somebody wonders whether the tap landed.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MBar, MBody, MError, MRule, MSection, MTop } from "@/components/m";
import { DIVIDER, INK, Kicker, N600, N700, StockTag } from "@/components/staffui";
import { useStaff } from "@/lib/staffclient";
import { fmtDate, formatInZone } from "@/lib/compute";

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
  const router = useRouter();
  const [err, setErr] = useState("");

  /* Optimistic, then corrected by the refresh that follows it. The server's answer always wins:
   * without the effect a stale local flag would outlive the redraw and offer "Leave the list" to
   * somebody who had already left. */
  const [joined, setJoined] = useState(data.joined);
  useEffect(() => { setJoined(data.joined); }, [data.joined]);

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

  const headline = accepted ? "It’s with your manager"
    : heldForMe ? "Held for you"
    : lapsed ? "The hold has run out"
    : joined ? "You are on the list"
    : "None on the shelf";

  const noticeKicker = accepted ? "Accepted" : heldForMe ? "It’s in" : lapsed ? "Your place" : joined ? "Your place" : "If you join";
  const noticeLine = accepted
    ? `Accepted ${formatInZone(acceptedAt || "", me.tz)}. It goes to your manager for approval like any other request.`
    : heldForMe
      ? `${heldUntil ? `Held for you until ${heldUntil}.` : "Held for you."} Accepting sends it to your manager like any other request.`
      : lapsed
        ? `Nobody took it before the hold ran out, so you are ${ordinal(data.position)} in queue again and the linen room can offer it a second time.`
        : joined
          ? `${ordinal(data.position)} in queue. The linen room tells you when one is held for you.`
          : `You would be ${ordinal(data.position)} in queue. ${data.ahead === 0 ? "Nobody is waiting yet." : data.ahead === 1 ? "One person is already waiting." : `${data.ahead} people are already waiting.`}`;

  return (
    <>
      <MTop title="Waitlist" back backHref="/my/shelf" />
      <MRule />
      <MBody>
        <div style={{ padding: "16px 16px 0" }}>
          <Kicker>{data.item} · {data.size}</Kicker>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 24, letterSpacing: "-0.015em", lineHeight: 1.1, marginTop: 4 }}>
            {headline}
          </div>
        </div>

        <MError msg={err} onDismiss={() => setErr("")} />

        <div style={{ padding: "0 16px" }}>
          <div style={{ border: `2px solid ${INK}`, background: "#fff", padding: "12px 14px", marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: N600 }}>{noticeKicker}</div>
            <div style={{ fontSize: 14, lineHeight: 1.5, marginTop: 4 }}>{noticeLine}</div>
          </div>

          {accepted && (
            <div style={{ fontSize: 13, lineHeight: 1.6, color: N700, marginTop: 12 }}>
              Follow it on <Link href="/my/orders" style={{ color: INK, fontWeight: 800 }}>your orders</Link>.
            </div>
          )}

          {!accepted && !heldForMe && data.lastRestocked && (
            <div style={{ fontSize: 13, lineHeight: 1.6, color: N700, marginTop: 12 }}>
              Last counted {fmtDate(data.lastRestocked)}.
            </div>
          )}

          {/* Most people would rather have a size that fits approximately today, so the stocked
              sizes nearest theirs are the row above the wait, not a footnote under it. Tapping one
              opens the request screen with that garment and size already chosen. */}
          {data.alternatives.length > 0 && !heldForMe && !accepted && (
            <>
              <MSection label="Or take a stocked size" />
              {data.alternatives.map((a) => (
                <Link
                  key={a.si}
                  href={`/my/request?item=${encodeURIComponent(data.itemId)}&si=${a.si}`}
                  className="tcx-bar"
                  aria-label={`Ask for ${data.item}, size ${a.size}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, minHeight: 60, padding: "9px 0",
                    width: "100%", borderBottom: `1px solid ${DIVIDER}`, color: INK,
                    textDecoration: "none", font: "inherit", background: "none",
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700 }}>{a.size}</span>
                  <StockTag word={a.word} />
                </Link>
              ))}
            </>
          )}

          <p style={{ fontSize: 13, lineHeight: 1.6, color: N700, padding: "16px 0 0", margin: 0 }}>
            Waiting doesn’t need approval. Your manager only sees it if the item comes in and you
            accept it.
          </p>
        </div>
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
            router.push(`/my/orders/${r.result.request.id}`);
          }}
        />
      ) : joined ? (
        <MBar
          label={busy ? "Working…" : "Leave the list"}
          tone="ink"
          disabled={busy}
          onClick={async () => {
            const r = await mutate("waitlist.leave", { id: data.entryId });
            if (!r.ok) { setErr(r.error); return; }
            setJoined(false);
            router.refresh();
          }}
        />
      ) : (
        <MBar
          label={busy ? "Joining…" : "Join the list"}
          disabled={busy}
          onClick={async () => {
            const r = await mutate("waitlist.join", { itemId: data.itemId, si: data.si });
            if (!r.ok) { setErr(r.error); return; }
            setJoined(true);
            router.refresh();
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
