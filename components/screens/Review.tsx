"use client";
/* Reviewing one request: approve it, or knock back the garments that shouldn't go.
 *
 * One request covers everything the person asked for, so this screen shows the whole ask and
 * settles it in one action. A manager can still refuse part of it — the tunic and the trousers
 * yes, the fleece no — and each line carries its own control for that. Everything not knocked back
 * is approved when the bar at the bottom is pressed, and the bar says how many that is, because
 * "Approve" over a list of three garments with one struck out has to be unambiguous.
 *
 * The decline reason is compulsory and comes from a fixed list of three, and it is always shown to
 * the staff member — per garment now, rather than for the request as a whole. That is the point:
 * the thing this replaces is a request that goes quiet, and a refusal nobody can explain is the
 * same failure with an extra step.
 *
 * A manager can be the person the request is for. Two ward managers commonly name each other as
 * approver — that is how the top of the tree gets one at all — and the server now lets the wearer
 * settle their own, provided somebody actually reports to them. The queue sets those apart; so does
 * this screen, next to the button, because having been told on a list you scrolled past is not the
 * same as being told at the moment you sign.
 *
 * The allowance line tells the manager what the cap is *and* that releasing the second allocation
 * is not theirs to do. Operational Officers are the only capped role; for everyone else the
 * manager's judgement is the number, and the screen says so rather than showing a limit that
 * doesn't exist.
 */
import { useState } from "react";
import { MBar, MBody, MError, MRule, MTop } from "@/components/m";
import { ACCENT_700, CompactAction, INK, Kicker, LineList, N600, N700, lineText } from "@/components/staffui";
import { useStaff } from "@/lib/staffclient";
import { DECLINE_REASONS } from "@/lib/staffreq";
import type { ReviewLine } from "@/lib/managerdata";

type Data = {
  id: string; code: string; status: string;
  subject: { id: string; name: string; num: string; group: string; ward: string; held: number; sets: number; approvedThisYear: number };
  lines: ReviewLine[]; summary: string; garments: number; lineCount: number; decision: string | null;
  reason: string; note: string; raisedByName: string;
  allowance: { capped: boolean; label: string; note: string; over: boolean };
};

/** What the manager has pencilled against each line before they press the bar. */
type Call = { decision: "approved" | "declined"; reason: string };

export default function ReviewScreen({ data }: { data: Data }) {
  const { me, mutate, busy } = useStaff();
  /* Everything starts approved. That is not a default in the lazy sense — it is what the button at
   * the bottom will do, spelled out on every line before it is pressed, so the manager is choosing
   * what to refuse rather than ticking off what to allow. */
  const [calls, setCalls] = useState<Record<string, Call>>(
    () => Object.fromEntries(data.lines.map((l) => [l.id, { decision: "approved" as const, reason: "" }])),
  );
  /* Which line's reason list is open — or "*" for the one that settles the whole request. */
  const [asking, setAsking] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const decided = data.status !== "awaiting";
  /* Whether the person deciding this is the person it is for. Matched on the staff number, which
   * the register keeps unique within a facility; a name would start calling a stranger's request
   * yours the day two people on the ward share one, and what is being marked here is an audit
   * fact. */
  const mine = data.subject.id === me.staffId;
  /* The server takes a self-approval from anybody a request is addressed to (lib/staffops.ts
   * decideRequest — the reports test was dropped, by Kyle's decision), so the screen no longer has
   * a "not yours to settle" reading: it said the bar would come back refused, and the bar approved.
   * What it does say, every time, is that a self-approval is written down as one. */
  const mayApproveOwn = true;
  const yes = data.lines.filter((l) => calls[l.id]?.decision === "approved").length;
  const total = data.lines.length;

  function decline(lineId: string, reason: string) {
    setAsking(null);
    setErr("");
    setCalls((c) => (lineId === "*"
      // Declining the lot: one reason against every line, which is also what makes the request's
      // own decline reason true rather than invented.
      ? Object.fromEntries(data.lines.map((l) => [l.id, { decision: "declined" as const, reason }]))
      : { ...c, [lineId]: { decision: "declined", reason } }));
  }

  async function send() {
    const lines = data.lines.map((l) => ({
      id: l.id,
      decision: calls[l.id]?.decision ?? "approved",
      reason: calls[l.id]?.reason ?? "",
    }));
    const every = lines.every((l) => l.decision === "declined");
    // The op name matches the outcome the manager can see on the button; `lines` is what actually
    // decides, garment by garment, and it has to name every one of them exactly once.
    const r = await mutate(every ? "request.decline" : "request.approve", {
      id: data.id,
      lines,
      // When the whole request went, and every line went for the same reason, that reason is the
      // request's reason too — it is what the wearer's order and the decision email lead with.
      reason: every && new Set(lines.map((l) => l.reason)).size === 1 ? lines[0].reason : undefined,
    });
    if (!r.ok) { setErr(r.error); return; }
    window.location.assign("/my/approvals");
  }

  const barLabel = busy ? "Working…"
    : yes === 0 ? (total === 1 ? "Decline" : `Decline all ${total}`)
    : yes === total ? (total === 1 ? "Approve" : `Approve all ${total}`)
    : `Approve ${yes} of ${total}`;

  return (
    <>
      <MTop title="Review request" back right={<span style={{ fontSize: 12, color: "var(--color-neutral-400)" }}>{data.code}</span>} />
      <MRule />
      <MBody>
        <div style={{ padding: "20px 16px 18px", borderBottom: "2px solid " + INK, background: "var(--color-bg)" }}>
          <Kicker>{[data.subject.ward, data.subject.num, data.subject.group].filter(Boolean).join(" · ")}</Kicker>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 28, letterSpacing: "-0.02em", lineHeight: 1.15, marginTop: 8 }}>
            {data.subject.name}
          </div>
          {mine && <div style={{ marginTop: 10 }}><Kicker tone="attention">Your own uniform</Kicker></div>}
          <div style={{ fontSize: 14, color: N700, marginTop: 8 }}>
            Holds {data.subject.held} item{data.subject.held === 1 ? "" : "s"}
            {data.subject.approvedThisYear > 0 && ` · ${data.subject.approvedThisYear} request${data.subject.approvedThisYear === 1 ? "" : "s"} approved`}
          </div>
        </div>

        <div style={{ padding: "16px 16px 0", display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ flex: 1 }}><Kicker>Asking for</Kicker></span>
          <span style={{ fontSize: 12, color: N600 }}>
            {data.garments} garment{data.garments === 1 ? "" : "s"}{total > 1 ? ` · ${total} lines` : ""}
          </span>
        </div>

        {decided ? (
          <>
            <div style={{ margin: "12px 16px 0" }}><LineList lines={data.lines} /></div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: N700, padding: "12px 16px 0", margin: 0 }}>
              {data.decision ? `${data.decision}. ` : ""}This one has already been settled — it is with
              the linen room or closed. Nothing here is waiting on you.
            </p>
          </>
        ) : (
          <div style={{ display: "grid", gap: 2, margin: "12px 16px 0" }}>
            {data.lines.map((l) => {
              const call = calls[l.id] ?? { decision: "approved" as const, reason: "" };
              const off = call.decision === "declined";
              return (
                <div key={l.id} style={{ background: "#fff", padding: "14px 16px", borderLeft: `6px solid ${off ? ACCENT_700 : "transparent"}` }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 19, letterSpacing: "-0.01em",
                        lineHeight: 1.25, textDecoration: off ? "line-through" : "none", color: off ? N600 : INK,
                      }}>{lineText(l)}</div>
                      <div style={{ fontSize: 13, color: N600, marginTop: 5, lineHeight: 1.45 }}>
                        {[
                          l.stock,
                          l.held ? `holds ${l.held}` : "holds none",
                          l.heldThisSize ? `${l.heldThisSize} in this size` : "",
                        ].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    {off
                      ? <CompactAction label="Undo" onClick={() => { setCalls((c) => ({ ...c, [l.id]: { decision: "approved", reason: "" } })); setAsking(null); }} />
                      : <CompactAction label="Decline" onClick={() => setAsking(asking === l.id ? null : l.id)} />}
                  </div>

                  {off && (
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: ACCENT_700, marginTop: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      {call.reason}
                    </div>
                  )}

                  {asking === l.id && (
                    <div style={{ marginTop: 12 }}>
                      <Kicker tone="attention">Why not this one?</Kicker>
                      <div style={{ display: "grid", gap: 2, marginTop: 10 }}>
                        {DECLINE_REASONS.map((r) => (
                          <button key={r} onClick={() => decline(l.id, r)} style={{
                            minHeight: 52, background: "var(--color-neutral-200)", color: INK, border: 0, borderRadius: 0,
                            textAlign: "left", padding: "0 14px", font: "inherit", fontSize: 15, fontWeight: 800, cursor: "pointer",
                          }}>{r}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {(data.reason || data.note || data.raisedByName) && (
          <div style={{ margin: "12px 16px 0", background: "#fff", padding: "14px 16px" }}>
            {data.reason && <div style={{ fontSize: 14, fontWeight: 800 }}>{data.reason}</div>}
            {data.note && <p style={{ fontSize: 14, lineHeight: 1.55, color: N700, margin: data.reason ? "8px 0 0" : 0 }}>{data.note}</p>}
            {data.raisedByName && (
              <p style={{ fontSize: 13, color: N600, margin: "10px 0 0" }}>Raised for them by {data.raisedByName}.</p>
            )}
          </div>
        )}

        <div style={{ margin: "12px 16px 0", background: "#fff", borderLeft: `6px solid ${data.allowance.over ? "var(--color-accent)" : INK}`, padding: "14px 16px" }}>
          <Kicker tone={data.allowance.over ? "attention" : "quiet"}>Allowance</Kicker>
          <div style={{ fontSize: 15, lineHeight: 1.5, marginTop: 6 }}>{data.allowance.label}</div>
          <p style={{ fontSize: 13, lineHeight: 1.55, color: N600, margin: "8px 0 0" }}>{data.allowance.note}</p>
        </div>

        <MError msg={err} onDismiss={() => setErr("")} />

        {!decided && (
          <div style={{ padding: "16px 16px 0" }}>
            {asking === "*" ? (
              <>
                <Kicker tone="attention">Why are you declining all of it?</Kicker>
                <p style={{ fontSize: 13, lineHeight: 1.55, color: N600, margin: "8px 0 12px" }}>
                  {data.subject.name.split(" ")[0]} is told which one you picked.
                </p>
                <div style={{ display: "grid", gap: 2 }}>
                  {DECLINE_REASONS.map((r) => (
                    <button key={r} onClick={() => decline("*", r)} style={{
                      minHeight: 56, background: "#fff", color: INK, border: 0, borderRadius: 0, textAlign: "left",
                      padding: "0 16px", font: "inherit", fontSize: 15.5, fontWeight: 800, cursor: "pointer",
                    }}>{r}</button>
                  ))}
                </div>
                <div style={{ marginTop: 12 }}><CompactAction label="Back" onClick={() => setAsking(null)} /></div>
              </>
            ) : yes > 0 ? (
              <CompactAction label={total === 1 ? "Decline it instead" : "Decline the whole request"} onClick={() => setAsking("*")} />
            ) : (
              <p style={{ fontSize: 13.5, lineHeight: 1.6, color: N700, margin: 0 }}>
                Nothing on this request will be picked. {data.subject.name.split(" ")[0]} is told the
                reason against each garment.
              </p>
            )}
          </div>
        )}

        {mine && !decided && (
          /* Last thing above the bar, because the bar is what does it. Whichever half of the rule
             the reader is in, they find out here rather than from a refusal or from an auditor. */
          <div style={{ margin: "16px 16px 0", background: "#fff", borderLeft: `6px solid ${mayApproveOwn ? INK : ACCENT_700}`, padding: "14px 16px" }}>
            <Kicker tone="attention">{mayApproveOwn ? "You are signing for yourself" : "Not yours to settle"}</Kicker>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: N700, margin: "8px 0 0" }}>
              {mayApproveOwn
                ? "These garments are for you, and this one is yours to decide. The request's own history will say, in words, that you approved your own uniform, and so will the record anybody reads afterwards."
                : "These garments are for you, and only a manager with somebody reporting to them can decide their own. Nobody reports to you at the moment, so this will come back refused whichever way you send it — ask the linen room to hand it to another manager."}
            </p>
          </div>
        )}

        <p style={{ fontSize: 13, lineHeight: 1.6, color: N700, padding: 16, margin: 0 }}>
          Only what you approve reaches the linen room, and it goes in one bag with one collection code.
        </p>
        <div style={{ height: 12 }} />
      </MBody>

      {!decided && (
        <MBar
          label={barLabel}
          sub={yes > 0 && yes < total ? `${total - yes} declined` : undefined}
          glyph={yes > 0 ? "check" : "arrow"}
          tone={yes > 0 ? "accent" : "ink"}
          disabled={busy || asking !== null}
          onClick={send}
        />
      )}
    </>
  );
}
