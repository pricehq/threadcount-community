"use client";
/* 1B — My kit.
 *
 * The linen room's record of what this person holds, shown to the person it is about, and a way
 * to say it is wrong. "This isn't right" is deliberately blunt and deliberately last: the record
 * is usually correct, and a dispute button placed first would invite one before anybody had read
 * the list.
 *
 * The bar is a screen-level one, drawn on ALL THREE segments rather than only on Holding. A wrong
 * recorded *size* is one of the commonest things anybody queries, and that is read on My sizes —
 * where the screen literally says "tell them below", a promise only kept while the bar is there.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MBody, MEmpty, MError, MRow, MRule, MTop } from "@/components/m";
import { INK, N600, SecondaryBar, Segments, SlipCard } from "@/components/staffui";
import StaffNav from "@/components/staffnav";
import { useDraft, useStaff } from "@/lib/staffclient";
import { fmtDate } from "@/lib/compute";

type Held = { itemId: string; item: string; size: string; si: number; qty: number; last: string };
/* One row per garment and size with its quantity — the slip as it was signed, not one repeated row
 * per garment. The grouping is done in kitData(); the screen only draws it. */
type Slip = { id: string; date: string; lines: { item: string; size: string; qty: number }[]; signed: boolean };
type Data = { held: Held[]; total: number; handedBackThisYear: number; fyFrom: string; sizes: { top: string; pants: string }; slips?: Slip[] };

export default function KitScreen({ data }: { data: Data }) {
  const { mutate, busy } = useStaff();
  const router = useRouter();
  const [tab, setTab] = useState<"holding" | "sizes" | "slips">("holding");
  const [disputing, setDisputing] = useState(false);
  // Kept across a dropped send and a screen change: ward wifi drops mid-sentence, and the one thing
  // worse than a complaint that did not send is a complaint that did not send and is gone.
  const draft = useDraft("dispute");
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  const slips = data.slips || [];

  return (
    <>
      <MTop title="My kit" />
      <MRule />
      <MBody>
        <Segments
          label="What to show"
          value={tab}
          onPick={setTab}
          options={[{ key: "holding" as const, label: "Holding" }, { key: "sizes" as const, label: "My sizes" }, { key: "slips" as const, label: "Slips" }]}
        />

        {tab === "holding" && (
          <div style={{ padding: "0 16px" }}>
            {data.held.length === 0 ? (
              <MEmpty title="Nothing on your record" sub="Anything the linen room issues you shows up here." />
            ) : (
              data.held.map((h) => (
                <MRow
                  key={`${h.itemId}:${h.si}`}
                  title={`${h.item} — ${h.size}`}
                  sub={`Last issued ${fmtDate(h.last)}`}
                  right={`×${h.qty}`}
                />
              ))
            )}
            {/* A row, not the paragraph this used to be: it is one figure about their own record,
                and it reads as one line beside the garments it belongs with. */}
            <MRow title="Handed back this year" right={String(data.handedBackThisYear)} />
          </div>
        )}

        {tab === "sizes" && (
          <div style={{ padding: "0 16px" }}>
            <MRow title="Top" right={data.sizes.top || "not recorded"} />
            <MRow title="Trouser" right={data.sizes.pants || "not recorded"} />
            <div style={{ padding: "18px 0 6px", fontSize: 14, color: N600, lineHeight: 1.5 }}>
              The linen room records these. Tell them below if they are wrong.
            </div>
            {/* Swapping a size is a request like any other, so it goes to the request screen rather
                than living as its own flow. This is the door it is reached by. */}
            <MRow title="Swap a size" sub="Hand one back, ask for another" href="/my/request?swap=1" chev />
          </div>
        )}

        {tab === "slips" && (
          slips.length === 0 ? (
            <div style={{ padding: "0 16px" }}>
              <MEmpty title="No signed slips" sub="A slip arrives when you sign for a hand-over at the counter." />
            </div>
          ) : (
            slips.map((sl) => (
              <div key={sl.id}>
                <SlipCard
                  date={fmtDate(sl.date)}
                  lines={sl.lines}
                  sigSrc={sl.signed ? `/api/staff/slip/${encodeURIComponent(sl.id)}/sig` : undefined}
                />
                {/* A slip with no signature stored is not a broken screen, and saying so is kinder
                    than an empty space where a signature obviously belongs. */}
                {!sl.signed && (
                  <div style={{ padding: "0 16px 14px", background: "#fff", fontSize: 12.5, color: N600 }}>
                    Handed over at the counter · no signature on file
                  </div>
                )}
              </div>
            ))
          )
        )}

        {sent && (
          <div style={{ margin: 16, background: INK, color: "var(--color-bg)", padding: 16, fontSize: 14, lineHeight: 1.5 }}>
            Sent. The linen room will look at your record and come back to you.
          </div>
        )}

        {disputing && !sent && (
          <div style={{ padding: 16, borderTop: "2px solid " + INK }}>
            <label htmlFor="tc-dispute" style={{ display: "block", fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>What doesn’t look right?</label>
            <textarea
              id="tc-dispute"
              value={draft.value} onChange={(e) => { draft.set(e.target.value); setErr(""); }} rows={4}
              placeholder="e.g. I handed two tunics back in August but they’re still on here"
              style={{ width: "100%", minHeight: 84, marginTop: 12, padding: 12, border: "2px solid var(--color-divider)", borderRadius: 0, font: "inherit", fontSize: 15, resize: "none", background: "#fff", color: INK }}
            />
            <MError msg={err} onDismiss={() => setErr("")} />
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <button
                disabled={busy || !draft.value.trim()}
                onClick={async () => {
                  const r = await mutate("dispute.raise", { body: draft.value });
                  if (!r.ok) { setErr(r.error); return; }
                  setSent(true); setDisputing(false); draft.clear(); router.refresh();
                }}
                style={{ minHeight: 48, padding: "0 20px", background: "var(--color-accent)", color: "#fff", border: 0, borderRadius: 0, font: "inherit", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", cursor: busy ? "wait" : "pointer", opacity: busy || !draft.value.trim() ? 0.45 : 1 }}
              >{busy ? "Sending…" : "Send to the linen room"}</button>
              <button onClick={() => { setDisputing(false); setErr(""); }}
                style={{ minHeight: 48, padding: "0 20px", background: "transparent", color: INK, border: "2px solid " + INK, borderRadius: 0, font: "inherit", fontWeight: 800, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        )}
        <div style={{ height: 12 }} />
      </MBody>
      {!disputing && !sent && <SecondaryBar label="This isn’t right" onClick={() => setDisputing(true)} />}
      <StaffNav />
    </>
  );
}
