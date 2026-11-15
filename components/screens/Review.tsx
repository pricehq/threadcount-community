"use client";
/* Reviewing one request: approve it, or knock back the garments that shouldn't go.
 *
 * One request covers everything the person asked for, so this screen shows the whole ask and
 * settles it in one action. A manager can still refuse part of it — the tunic and the trousers
 * yes, the fleece no — and each line carries its own reasons, in the list, where the garment is.
 * Everything not knocked back is approved when the bar is pressed, and the bar says how many that
 * is, because "Approve" over a list of three with one struck out has to be unambiguous.
 *
 * The decline reason is compulsory and comes from a fixed list of three, and it is always shown to
 * the staff member — per garment now, rather than for the request as a whole. That is the point:
 * the thing this replaces is a request that goes quiet, and a refusal nobody can explain is the
 * same failure with an extra step.
 *
 * A manager can be the person the request is for. Two ward managers commonly name each other as
 * approver — that is how the top of the tree gets one at all — and the server lets the wearer
 * settle their own. The queue sets those apart; so does the line above the bar here, because
 * having been told on a list you scrolled past is not the same as being told as you sign.
 *
 * Not inside the Team shell: this is a detail screen with a back chevron, like the order and the
 * thread. A tab row on a decision screen invites somebody off it mid-decision.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MBar, MBody, MError, MRule, MTop } from "@/components/m";
import { ACCENT_700, IdentityBlock, INK, Kicker, LineList, N600, N700, lineText } from "@/components/staffui";
import { Band, ChipAction } from "./Team";
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

/** The shelf word, in a box beside the garment. Words, never a count. */
function StockBox({ word, struck }: { word: string; struck: boolean }) {
  const none = word.startsWith("none");
  return (
    <span style={{
      flex: "0 0 auto", fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase",
      background: none ? "var(--color-accent)" : "var(--color-divider)", color: none ? "#fff" : INK,
      padding: "5px 8px", whiteSpace: "nowrap", textDecoration: struck ? "line-through" : "none",
    }}>{word}</span>
  );
}

export default function ReviewScreen({ data }: { data: Data }) {
  const router = useRouter();
  const { me, mutate, busy } = useStaff();
  /* Everything starts approved. That is not a default in the lazy sense — it is what the button at
   * the bottom will do, spelled out on every line before it is pressed, so the manager is choosing
   * what to refuse rather than ticking off what to allow. */
  const [calls, setCalls] = useState<Record<string, Call>>(
    () => Object.fromEntries(data.lines.map((l) => [l.id, { decision: "approved" as const, reason: "" }])),
  );
  const [err, setErr] = useState("");

  const decided = data.status !== "awaiting";
  /* Whether the person deciding this is the person it is for. Matched on the id, which the register
   * keeps unique; a name would start calling a stranger's request yours the day two people on the
   * ward share one, and what is being marked here is an audit fact. */
  const mine = data.subject.id === me.staffId;
  const yes = data.lines.filter((l) => calls[l.id]?.decision === "approved").length;
  const total = data.lines.length;

  function decline(lineId: string, reason: string) {
    setErr("");
    setCalls((c) => ({ ...c, [lineId]: { decision: "declined", reason } }));
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
    router.push("/my/approvals");
  }

  const barLabel = busy ? "Working…"
    : yes === 0 ? (total === 1 ? "Decline" : `Decline all ${total}`)
    : yes === total ? (total === 1 ? "Approve" : `Approve all ${total}`)
    : `Approve ${yes} of ${total}`;

  return (
    <>
      {/* A real destination, not history.back(): this screen opens cold from the approval email. */}
      <MTop title={`Review ${data.code}`} back onBack={() => router.push("/my/approvals")} />
      <MRule />
      <MBody>
        <IdentityBlock
          ward={data.subject.ward}
          num={data.subject.num}
          name={data.subject.name}
          group={data.subject.group}
        />

        {/* No count at the right. Every garment is listed under this band with its own quantity,
            and a total beside the heading only invites the manager to decide against the number
            rather than against the list. */}
        <Band label="Asking for" />

        {decided ? (
          <>
            <div style={{ margin: "12px 16px 0" }}><LineList lines={data.lines} /></div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: N700, padding: "12px 16px 0", margin: 0 }}>
              {data.decision ? `${data.decision}. ` : ""}Nothing here is waiting on you.
            </p>
          </>
        ) : (
          <div style={{ display: "grid", gap: 2, margin: "12px 0 0" }}>
            {data.lines.map((l) => {
              const call = calls[l.id] ?? { decision: "approved" as const, reason: "" };
              const off = call.decision === "declined";
              return (
                <div key={l.id} style={{ background: "#fff", padding: "14px 16px" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{
                      flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, lineHeight: 1.3,
                      textDecoration: off ? "line-through" : "none", color: off ? N600 : INK,
                    }}>{lineText(l)}</div>
                    <StockBox word={l.stock} struck={off} />
                  </div>

                  {off ? (
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
                      <span style={{
                        flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, color: ACCENT_700,
                        textDecoration: "line-through",
                      }}>{call.reason}</span>
                      <button
                        type="button"
                        onClick={() => setCalls((c) => ({ ...c, [l.id]: { decision: "approved", reason: "" } }))}
                        style={{
                          minHeight: 44, padding: "0 14px", border: `2px solid ${INK}`, borderRadius: 0,
                          background: "#fff", color: ACCENT_700, font: "inherit", fontSize: 14, fontWeight: 800,
                          cursor: "pointer", flex: "0 0 auto",
                        }}
                      >Undo</button>
                    </div>
                  ) : (
                    /* The reasons are the control. A Decline button that opens them was a tap that
                       told nobody anything, and the three of them fit on the line they belong to. */
                    <div role="group" aria-label={`Decline ${lineText(l)}`} style={{ display: "flex", gap: 6, marginTop: 10 }}>
                      {DECLINE_REASONS.map((r) => (
                        <ChipAction key={r} small label={r} onClick={() => decline(l.id, r)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {(data.reason || data.note || data.raisedByName) && (
          <div style={{ margin: "12px 16px 0", background: "#fff", border: `2px solid ${INK}`, padding: "12px 14px" }}>
            <Kicker>Why they asked</Kicker>
            <div style={{ fontSize: 15, lineHeight: 1.5, marginTop: 6 }}>
              {[data.reason, data.note].filter(Boolean).join(" — ")}
            </div>
            {data.raisedByName && (
              <div style={{ fontSize: 13, color: N600, marginTop: 8 }}>Raised for them by {data.raisedByName}.</div>
            )}
          </div>
        )}

        <div style={{ margin: "12px 16px 0", background: "#fff", borderLeft: `6px solid ${data.allowance.over ? "var(--color-accent)" : INK}`, padding: "14px 16px" }}>
          <Kicker tone={data.allowance.over ? "attention" : "quiet"}>Allowance</Kicker>
          <div style={{ fontSize: 15, lineHeight: 1.5, marginTop: 6 }}>{data.allowance.label}</div>
          <p style={{ fontSize: 13, lineHeight: 1.55, color: N600, margin: "6px 0 0" }}>{data.allowance.note}</p>
        </div>

        {mine && !decided && (
          /* Last thing above the bar, because the bar is what does it. The reader finds out here
             rather than from an auditor months later. */
          <p style={{ fontSize: 13, lineHeight: 1.6, color: N700, padding: "12px 16px 0", margin: 0 }}>
            Approving it is recorded as your own approval.
          </p>
        )}

        <MError msg={err} onDismiss={() => setErr("")} />
        <div style={{ height: 12 }} />
      </MBody>

      {!decided && (
        /* `small`, not `sub`: the count of what is about to be refused is mono at the right of the
           bar, reading against the outcome rather than as a subtitle underneath it. */
        <MBar
          label={barLabel}
          small={yes < total ? `${total - yes} declined` : undefined}
          glyph={yes > 0 ? "check" : "arrow"}
          tone={yes > 0 ? "accent" : "ink"}
          disabled={busy}
          onClick={send}
        />
      )}
    </>
  );
}
