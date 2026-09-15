"use client";
/* 2A — Kit check. Twice a year, reconcile the record with reality, item by item.
 *
 * The copy does most of the work here. "Nothing here is chargeable" and "the linen room uses these
 * answers to set par levels, not to chase people" are not reassurance for its own sake — a check
 * that felt like an audit would be answered with whatever number keeps someone out of trouble, and
 * the resulting data would be worse than no data.
 *
 * Writing off and re-requesting stay separate acts. Saying a garment is missing does not quietly
 * order another one: that would turn an honest answer into a request somebody's manager has to
 * decline, which is exactly how you teach a ward to stop answering honestly.
 */
import { useState } from "react";
import { MBar, MBody, MError, MRule, MTop } from "@/components/m";
import { ACCENT_300, DIVIDER, GROUND, INK, N300, N600, N700 } from "@/components/staffui";
import { useStaff } from "@/lib/staffclient";
import { fmtDate } from "@/lib/compute";

type Row = { itemId: string; item: string; size: string; si: number; onRecord: number; answered: number | null };

export default function KitCheckScreen({ dueBy, lastConfirmed, rows }: {
  dueBy: string; lastConfirmed: string; rows: Row[];
}) {
  const { mutate, busy } = useStaff();
  const [answers, setAnswers] = useState<Record<string, number>>(
    Object.fromEntries(rows.filter((r) => r.answered !== null).map((r) => [`${r.itemId}:${r.si}`, r.answered as number])),
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const answeredCount = rows.filter((r) => answers[`${r.itemId}:${r.si}`] !== undefined).length;

  async function answer(r: Row, confirmed: number) {
    const k = `${r.itemId}:${r.si}`;
    setAnswers((a) => ({ ...a, [k]: confirmed }));
    setErr("");
    const res = await mutate("kit.answer", { itemId: r.itemId, si: r.si, onRecord: r.onRecord, confirmed });
    if (!res.ok) {
      setErr(res.error);
      setAnswers((a) => { const n = { ...a }; delete n[k]; return n; });
    }
  }

  // aria-pressed, because the only other thing separating the chosen answer from the unchosen one
  // is an ink fill: nothing a screen reader can hear, and nothing at all in high contrast.
  const pick = (on: boolean, label: string, onClick: () => void): React.ReactNode => (
    <button onClick={onClick} aria-pressed={on} style={{
      flex: 1, minHeight: 44, border: 0, borderRadius: 0, font: "inherit",
      background: on ? INK : "var(--color-neutral-200)", color: on ? GROUND : N700,
      fontWeight: 800, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer",
    }}>{label}</button>
  );

  if (done) {
    return (
      <>
        <MTop title="Kit check" back />
        <MRule />
        <MBody>
          <div style={{ background: INK, color: GROUND, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: ACCENT_300 }}>Thanks</div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 24, lineHeight: 1.25, marginTop: 10 }}>
              That&rsquo;s your record confirmed.
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: N300, margin: "12px 0 0" }}>
              Your answers have gone to the linen room, and they&rsquo;ll square anything that
              didn&rsquo;t match. Nothing is charged, and you don&rsquo;t need to do anything else.
            </p>
          </div>
        </MBody>
      </>
    );
  }

  return (
    <>
      <MTop title="Kit check" back right={<span style={{ fontSize: 12, color: "var(--color-neutral-400)" }}>{dueBy ? fmtDate(dueBy).split(" ").slice(1).join(" ") : ""}</span>} />
      <MRule />
      <MBody>
        <div style={{ background: INK, color: GROUND, padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: ACCENT_300 }}>
            Due by {fmtDate(dueBy)}
          </div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 24, lineHeight: 1.25, marginTop: 10 }}>
            Have you still got everything on your record?
          </div>
          {/* Nobody keeps their uniform at work. It goes home, it gets washed, and on any given
              day a good part of it is on the line or in a bag in the boot. The question that used
              to be asked here — whether this matched what was in your locker — could only be
              answered by somebody standing in front of a locker they do not have, so it either
              got answered wrongly or not at all. Counting from memory, wherever the garments
              are, is the honest ask. */}
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: N300, margin: "12px 0 0" }}>
            Count everything you still have, wherever it is &mdash; what&rsquo;s in the wash and on
            the line counts too.{" "}
            {lastConfirmed ? `Last confirmed ${fmtDate(lastConfirmed)}. ` : ""}Nothing here is chargeable.
          </p>
        </div>

        <MError msg={err} onDismiss={() => setErr("")} />

        <div style={{ padding: "18px 16px 8px", borderBottom: "2px solid " + INK, background: GROUND }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: N600 }}>
            {rows.length} item{rows.length === 1 ? "" : "s"} on your record
          </span>
        </div>

        {rows.length === 0 && (
          <div style={{ padding: "22px 16px", fontSize: 14, color: N600, lineHeight: 1.6 }}>
            Nothing on your record to check.
          </div>
        )}

        {rows.map((r) => {
          const k = `${r.itemId}:${r.si}`;
          const a = answers[k];
          const short = a !== undefined && a < r.onRecord;
          const open = expanded[k];
          return (
            <div key={k} style={{
              background: "#fff", borderTop: `1px solid ${DIVIDER}`,
              borderLeft: short ? "6px solid var(--color-accent)" : "6px solid transparent",
              padding: "14px 16px",
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3 }}>{r.item} — {r.size}</div>
              <div style={{ fontSize: 12.5, color: N600, marginTop: 4 }}>{r.onRecord} on record</div>

              <div style={{ display: "flex", gap: 2, marginTop: 12 }}>
                {/* "All 3 here" was an answer only somebody standing in front of the garments
                    could give, and nobody is: they are at home, half of them in the wash. */}
                {pick(a === r.onRecord, r.onRecord === 1 ? "Got it" : `Got all ${r.onRecord}`, () => { setExpanded((e) => ({ ...e, [k]: false })); void answer(r, r.onRecord); })}
                {pick(short || !!open, short ? (a === 0 ? "None left" : `Only ${a}`) : "Fewer", () => setExpanded((e) => ({ ...e, [k]: !e[k] })))}
              </div>

              {open && (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(r.onRecord, 4)}, 1fr)`, gap: 2, marginTop: 2 }}>
                  {Array.from({ length: r.onRecord }, (_, i) => i).map((n) => (
                    <button key={n} aria-pressed={a === n} onClick={() => { void answer(r, n); setExpanded((e) => ({ ...e, [k]: false })); }} style={{
                      minHeight: 44, border: 0, borderRadius: 0, font: "inherit",
                      background: a === n ? INK : "var(--color-neutral-200)", color: a === n ? GROUND : N700,
                      fontWeight: 800, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer",
                    }}>{n === 0 ? "None left" : `Only ${n}`}</button>
                  ))}
                </div>
              )}

              {short && (
                <div style={{ borderTop: `1px solid ${DIVIDER}`, marginTop: 12, paddingTop: 10 }}>
                  {/* This used to say the missing ones "come off your record". They don't — the
                      answer is written down and that is all it does; the record still says what it
                      said, and only the linen room can change it. Telling somebody their record has
                      already been corrected, when it hasn't, is how they stop believing the next
                      thing this screen says. */}
                  <p style={{ fontSize: 13, lineHeight: 1.55, color: N700, margin: 0 }}>
                    {r.onRecord - (a as number) === 1 ? "One" : `${r.onRecord - (a as number)}`} unaccounted
                    for. The linen room will square your record — ask for a replacement separately if
                    you need one.
                  </p>
                </div>
              )}
            </div>
          );
        })}

        <p style={{ fontSize: 13, lineHeight: 1.6, color: N700, padding: 16, margin: 0 }}>
          Anything you can&rsquo;t account for is noted for the linen room to look at — nothing is
          charged, and nothing changes on your record until they do. They use these answers to set
          par levels, not to chase people.
        </p>
        <div style={{ height: 12 }} />
      </MBody>
      <MBar
        label={busy ? "Saving…" : `Confirm — ${answeredCount} of ${rows.length} answered`}
        glyph="check"
        disabled={busy || answeredCount < rows.length || rows.length === 0}
        onClick={() => setDone(true)}
      />
    </>
  );
}
