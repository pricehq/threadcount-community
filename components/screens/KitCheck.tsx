"use client";
/* 2A — Kit check. Every few months, reconcile the record with reality, item by item.
 *
 * "Nothing here is chargeable" is not reassurance for its own sake — a check that felt like an
 * audit would be answered with whatever number keeps somebody out of trouble, and the resulting
 * data would be worse than no data.
 *
 * Writing off and re-requesting stay separate acts. Saying a garment is missing does not quietly
 * order another one: that would turn an honest answer into a request somebody's manager has to
 * decline, which is exactly how you teach a ward to stop answering honestly.
 *
 * Between rounds this is a STATE, not a refusal. A refusal explains nothing by design, and "no kit
 * check is open" is not a secret — it is the answer somebody who tapped a notification from last
 * autumn needs, with the one way onward under it.
 */
import { useState } from "react";
import { MBar, MBody, MEmpty, MError, MONO, MRule, MTop } from "@/components/m";
import { ACCENT_300, DIVIDER, GROUND, INK, N300, N600, N700 } from "@/components/staffui";
import { useStaff } from "@/lib/staffclient";
import { fmtDate } from "@/lib/compute";

type Row = { itemId: string; item: string; size: string; si: number; onRecord: number; answered: number | null };

export default function KitCheckScreen({ closed, dueBy = "", lastConfirmed = "", rows = [] }: {
  /** No cycle open. The screen still exists; it just has one thing to say. */
  closed?: boolean;
  dueBy?: string; lastConfirmed?: string; rows?: Row[];
}) {
  const { mutate, busy, me } = useStaff();
  const terms = me.terms;
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
      flex: 1, minWidth: 0, minHeight: 44, borderRadius: 0, font: "inherit",
      border: `2px solid ${on ? INK : DIVIDER}`,
      background: on ? INK : "#fff", color: on ? GROUND : N700,
      fontWeight: 700, fontSize: 14, cursor: "pointer",
    }}>{label}</button>
  );

  if (closed) {
    return (
      <>
        <MTop title="Kit check" back backHref="/my" />
        <MRule />
        <MBody>
          <div style={{ padding: "0 16px" }}>
            <MEmpty title="No kit check is open" sub={`The ${terms.store} opens one every few months. You get a notification.`} />
          </div>
        </MBody>
        <MBar label="Back to home" href="/my" />
      </>
    );
  }

  if (done) {
    return (
      <>
        <MTop title="Kit check" back backHref="/my" />
        <MRule />
        <MBody>
          <div style={{ background: INK, color: GROUND, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: ACCENT_300 }}>Thanks</div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 22, lineHeight: 1.15, marginTop: 4 }}>
              That’s your record confirmed.
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: N300, marginTop: 4 }}>
              The {terms.store} will square anything short. Nothing is charged.
            </div>
          </div>
        </MBody>
        <MBar label="Back to home" href="/my" />
      </>
    );
  }

  return (
    <>
      <MTop title="Kit check" back backHref="/my" right={dueBy ? `Due ${fmtDate(dueBy)}` : undefined} />
      <MRule />
      <MBody>
        {/* The ink header carries the question and the one rule that decides how honestly it gets
            answered. Nobody keeps their uniform at work — it is at home, in the wash, in a bag in
            the boot — so the ask is to count what they still have, wherever it is. */}
        <div style={{ background: INK, color: GROUND, padding: "14px 16px 16px" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 22, letterSpacing: "-0.015em", lineHeight: 1.05 }}>
            Have you still got everything on your record?
          </div>
          <div style={{ fontSize: 13, color: "#d6d3d2", marginTop: 4, lineHeight: 1.45 }}>
            Count everything you still have, wherever it is. Nothing here is chargeable.
            {lastConfirmed ? ` Last confirmed ${fmtDate(lastConfirmed)}.` : ""}
          </div>
        </div>

        <MError msg={err} onDismiss={() => setErr("")} />

        {rows.length === 0 ? (
          <div style={{ padding: "0 16px" }}>
            <MEmpty title="Nothing on your record to check." sub={`Anything the ${terms.store} issues you shows up here.`} />
          </div>
        ) : (
          <div style={{ padding: "0 16px" }}>
            {rows.map((r) => {
              const k = `${r.itemId}:${r.si}`;
              const a = answers[k];
              const short = a !== undefined && a < r.onRecord;
              const open = expanded[k];
              return (
                <div key={k} style={{
                  borderBottom: `1px solid ${DIVIDER}`, padding: "10px 0 12px",
                  ...(short ? { borderLeft: "6px solid var(--color-accent)", paddingLeft: 12, marginLeft: -12 } : null),
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{r.item} — {r.size}</span>
                    <span style={{ fontFamily: MONO, fontSize: 14 }} aria-label={`${r.onRecord} on record`}>×{r.onRecord}</span>
                  </div>

                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    {/* "All 3 here" was an answer only somebody standing in front of the garments
                        could give, and nobody is: they are at home, half of them in the wash. */}
                    {pick(a === r.onRecord, `Got all ${r.onRecord}`, () => { setExpanded((e) => ({ ...e, [k]: false })); void answer(r, r.onRecord); })}
                    {pick(short || !!open, short ? (a === 0 ? "None left" : `Only ${a}`) : "Fewer", () => setExpanded((e) => ({ ...e, [k]: !e[k] })))}
                  </div>

                  {open && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                      {Array.from({ length: r.onRecord }, (_, i) => i).map((n) => (
                        <button key={n} aria-pressed={a === n} onClick={() => { void answer(r, n); setExpanded((e) => ({ ...e, [k]: false })); }} style={{
                          minHeight: 46, minWidth: 50, padding: "0 12px", borderRadius: 0, font: "inherit",
                          border: `2px solid ${a === n ? INK : DIVIDER}`,
                          background: a === n ? INK : "#fff", color: a === n ? GROUND : N700,
                          fontWeight: 700, fontSize: 14, cursor: "pointer",
                        }}>{n === 0 ? "None left" : `Only ${n}`}</button>
                      ))}
                    </div>
                  )}

                  {short && (
                    /* This used to say the missing ones "come off your record". They don't — the
                       answer is written down and that is all it does; only the linen room can
                       change the record. Telling somebody it has already been corrected, when it
                       hasn't, is how they stop believing the next thing this screen says. */
                    <div style={{ fontSize: 13, lineHeight: 1.5, color: N700, marginTop: 8 }}>
                      {r.onRecord - (a as number)} unaccounted for. The {terms.store} will square your record.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ height: 12 }} />
      </MBody>
      {rows.length === 0 ? (
        <MBar label="Back to home" href="/my" />
      ) : (
        <MBar
          label={busy ? "Saving…" : "Confirm"}
          small={`${answeredCount} of ${rows.length} answered`}
          disabled={busy || answeredCount < rows.length}
          onClick={() => setDone(true)}
        />
      )}
    </>
  );
}
