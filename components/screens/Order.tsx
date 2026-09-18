"use client";
/* 1D — Order detail. The tracking screen, and the screen someone holds up at the counter.
 *
 * It leads with what to do next. The old order of this page was a history lesson with the action
 * buried under it: the code somebody was walking to the counter to show sat below four timeline
 * rows they had already read. So the top of the screen is now the status word and the bag, then
 * the one thing there is to do — show the code, tell the desk you have it, read why it was
 * refused — and the history follows underneath, where it belongs.
 *
 * The timeline still always shows the step that hasn't happened yet, as an outlined dot. Half the
 * point of a progress list is what is still to come: one that only listed what had already
 * happened left "so when do I get it?" unanswered, which is the question that sends people to the
 * counter.
 */
import { useState } from "react";
import { CodeBlock, Kicker, LineList, N600, N700, OutlineButton, SecondaryBar, type Step, Timeline } from "@/components/staffui";
import { MBar, MBody, MError, MRule, MSection, MTop } from "@/components/m";
import { useStaff } from "@/lib/staffclient";
import { ROUTED_TO_ROUND, statusText } from "@/lib/staffreq";
import type { Terms } from "@/lib/terms";
import type { ReqStatus } from "@/lib/staffreq";
import type { ReqLine } from "@/lib/staffdata";
import { formatInZone } from "@/lib/compute";

type Ev = { id: string; label: string; meta: string; actorName: string; at: string };

/** The timeline row lib/ops.ts writes when the coordinator withdraws a request. A stored value
 *  matched by equality, so it never changes; it is translated only where it is shown. */
const WITHDRAWN = "Withdrawn by the linen room";
type Data = {
  id: string; code: string; status: string;
  lines: ReqLine[]; summary: string; garments: number; lineCount: number; decision: string | null;
  reason: string; note: string; managerName: string; declineReason: string | null;
  collectCode: string | null; holdUntil: string; route: string | null;
  signerName: string | null; signerRole: string | null; ward: string;
  subjectName: string; raisedByName: string; mine: boolean; claimedAt: string | null;
  createdAt: string;
  events: Ev[];
};

/* The zone is the facility's, not the device's and not the server's.
 *
 * This screen is server-rendered and then hydrated, so a timeline stamp built without a zone was
 * printed in whatever zone the host sits in and then quietly replaced with the phone's — a step
 * taken at 08:00 in the linen room read "7 Sep, 22:00" until React caught up. */
function stamp(iso: string, tz: string) {
  return formatInZone(iso, tz, { day: "numeric", month: "short" }) + ", " +
    formatInZone(iso, tz, { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** The step after the last one that happened, so the person can see where it goes next. */
function nextStep(status: string, holdUntil: string, route: string | null, t: Terms): { label: string; meta?: string } | null {
  switch (status as ReqStatus) {
    case "awaiting": return { label: "Approved", meta: `Then it goes to the ${t.store}` };
    case "accepted": return { label: "Picked from the shelf" };
    case "picking": return { label: route === "ward_round" ? `Out on the ${t.round}` : "Ready at the counter" };
    case "ready": return { label: "Collected", meta: holdUntil ? `Held until ${holdUntil}` : undefined };
    case "round": return { label: `Signed for on the ${t.team}` };
    default: return null; // declined, collected and delivered are endings
  }
}

export default function OrderScreen({ data }: { data: Data }) {
  const { mutate, busy, me } = useStaff();
  const terms = me.terms;
  const [err, setErr] = useState("");
  // The wearer's first name, for the third-person reading a manager or the desk gets of this page.
  const first = (data.subjectName || "").split(" ")[0];
  const st = statusText(data, { mine: data.mine, first, terms });
  // A request the linen room withdrew was never decided by the manager named on it; the timeline
  // row it writes is the only record of that, so this is where the page finds out.
  const withdrawn = data.status === "declined" && data.events.some((e) => e.label === WITHDRAWN);

  /* The one thing only the requester can settle: whether the bag actually reached them.
   *
   * A ward clerk signs for the round, which is where the linen room's job ends — but the bag then
   * sits on the desk, and until somebody says it was picked up the desk's unclaimed list only
   * grows. This is that confirmation, and it is why round.claim exists; without a caller it never
   * ran and the list never emptied.
   *
   * The mockup offers it while the bag is still `round`. The op does not, and should not: a bag
   * still on the trolley has not been signed for by anybody, and claiming it would clear a desk
   * list that has nothing on it yet. `delivered` — signed for on the ward, not yet picked up off
   * the desk — is the state this question belongs to. */
  const canClaim = data.status === "delivered" && data.mine && !data.claimedAt;
  /* ⛔ The code is the wearer's alone.
   *
   * Four people can open this order — the wearer, the manager it was addressed to, whoever raised
   * it and the ward desk holding the bag — and only one of them collects the bag. Without the
   * `mine` test an approver read the four digits off their own approvals history and could walk to
   * the counter with them, and was offered a "Show at the counter" button that /my/orders/[id]/code
   * then refused. reqRow() no longer hands them the code at all; this is the same rule said on the
   * screen, so neither end can drift. */
  const showCode = data.mine && data.status === "ready" && !!data.collectCode;

  const steps: Step[] = data.events.map((e, i) => ({
    // The two stored labels that are matched on keep their words in the database; they read in
    // this facility's words here.
    label: e.label === WITHDRAWN ? `Withdrawn by the ${terms.store}` : e.label === ROUTED_TO_ROUND ? `Out on the ${terms.round}` : e.label,
    meta: [e.actorName, e.meta, stamp(e.at, me.tz)].filter(Boolean).join(" · "),
    state: i === data.events.length - 1 ? "current" : "done",
  }));
  const next = nextStep(data.status, data.holdUntil, data.route, terms);
  if (next) steps.push({ label: next.label, meta: next.meta, state: "future" });

  return (
    <>
      {/* A real destination behind the chevron: this screen is what a tapped notification opens, and
          on a cold start there is no history to pop, so a bare router.back() is a dead control. */}
      <MTop title={data.code} back backHref="/my/orders" right={<span style={{ fontSize: 12, color: "var(--color-neutral-400)" }}>{data.mine ? "" : data.subjectName}</span>} />
      <MRule />
      <MBody>
        <MError msg={err} onDismiss={() => setErr("")} />

        {/* The headline: which order this is, then the one word that says where it has got to. */}
        <div style={{ padding: "16px 16px 0", background: "var(--color-bg)" }}>
          <Kicker tone={st.ink === "attention" ? "attention" : "quiet"}>
            {data.code} · raised {formatInZone(data.createdAt, me.tz)}
          </Kicker>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 24, letterSpacing: "-0.02em", lineHeight: 1.1, marginTop: 4 }}>
            {st.label}
          </div>
        </div>

        {/* The bag and why it was asked for, in one bordered row under the headline. */}
        <div style={{ margin: "12px 16px 0", padding: "10px 0 12px", borderBottom: "2px solid var(--color-text)" }}>
          <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.35 }}>{data.summary}</div>
          <div style={{ fontSize: 13, color: N600, marginTop: 3 }}>
            {/* `decision` is only there once the manager has been through it, and it is the honest
                line when they didn't approve everything: "2 of 3 approved" above a list where the
                fleece is struck out. */}
            {[data.decision, data.reason].filter(Boolean).join(" · ")}
          </div>
          {!data.mine && data.subjectName && (
            <div style={{ fontSize: 13, color: N600, marginTop: 6 }}>{`For ${data.subjectName}${data.raisedByName ? ` · raised by ${data.raisedByName}` : ""}`}</div>
          )}
          {data.mine && data.raisedByName && (
            <div style={{ fontSize: 13, color: N600, marginTop: 6 }}>{`Raised for you by ${data.raisedByName}`}</div>
          )}
        </div>

        {/* The whole ask, declines included. A request where the fleece was refused has to read
            honestly on the wearer's own screen — the alternative is somebody collecting a bag,
            counting two garments where they asked for three, and coming to the counter to find out
            why. One line needs no list: the row above already is one. */}
        {data.lineCount > 1 && (
          <div style={{ padding: "16px 16px 0" }}>
            <Kicker>{data.mine ? "What you asked for" : `What ${first || "they"} asked for`}</Kicker>
            <div style={{ marginTop: 10 }}><LineList lines={data.lines} /></div>
          </div>
        )}

        {/* ---- what to do next, before the history ---- */}

        {showCode && (
          <div style={{ padding: "16px 16px 0" }}>
            <CodeBlock code={data.collectCode as string} kicker="Collection code" />
            <div style={{ marginTop: 12 }}>
              {/* A box in the flow of the screen, not the foot of it: the foot belongs to "Ask
                  about this order", and two flush-left bars with arrows one above the other read
                  as the same control twice. */}
              <OutlineButton label="Show at the counter" href={`/my/orders/${data.id}/code`} />
            </div>
            {data.garments > 1 && (
              <p style={{ fontSize: 13, color: N600, marginTop: 10, lineHeight: 1.55 }}>
                All {data.garments} garments are in one bag under this code.
              </p>
            )}
            {/* This used to say the hold lapses on its own and the garment goes back on the shelf.
                Nothing does that: the hold is a note the linen room typed, there is no job that
                reads it, and the only way out of `ready` is somebody collecting. So the copy says
                what is true — it keeps waiting, and a late collection is a conversation rather than
                a lost request. */}
            {data.holdUntil && (
              <p style={{ fontSize: 13, color: N600, marginTop: 10, lineHeight: 1.55 }}>
                Held until {data.holdUntil}. It stays on the counter until you collect it — if you
                can&rsquo;t get there by then, say so on this order and the {terms.store} will sort it out.
              </p>
            )}
          </div>
        )}

        {canClaim && (
          // In the flow rather than docked at the foot: it is the next thing to do, and the next
          // thing to do lives at the top of this screen now. The screen updates in place when it
          // lands — mutate() refreshes the route; nothing here reloads the app.
          <div style={{ marginTop: 16 }}>
            <MBar
              label={busy ? "Working…" : "I’ve got it"}
              sub="Tells the desk the bag has been picked up"
              glyph="check"
              disabled={busy}
              onClick={async () => {
                const r = await mutate("round.claim", { id: data.id });
                if (!r.ok) setErr(r.error);
              }}
            />
          </div>
        )}

        {data.status === "declined" && data.declineReason && (
          <div style={{ background: "#fff", borderLeft: "6px solid var(--color-accent)", padding: "14px 16px", margin: "16px 16px 0" }}>
            <Kicker tone="attention">Why</Kicker>
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6 }}>{data.declineReason}</div>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: N700, margin: "8px 0 0" }}>
              {withdrawn
                ? `The ${terms.store} withdrew this. Ask at the counter if it needs another look.`
                : data.managerName
                  ? `${data.managerName} decided this. Talk to them if it needs another look.`
                  : `Ask the ${terms.store} if it needs another look.`}
            </p>
          </div>
        )}

        {data.status === "delivered" && data.signerName && (
          <div style={{ margin: "16px 16px 0", background: "#fff", borderLeft: "6px solid var(--color-text)", padding: "14px 16px" }}>
            <Kicker>Signed for</Kicker>
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6 }}>{data.signerName}{data.signerRole ? `, ${data.signerRole}` : ""}</div>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: N700, margin: "8px 0 0" }}>
              {data.claimedAt
                ? `Picked up from the desk on ${data.ward || `your ${terms.team}`}.`
                : `Ask at the desk on ${data.ward || `your ${terms.team}`} — whoever signed has it.`}
            </p>
          </div>
        )}

        {/* ---- then the history ---- */}

        <div style={{ padding: "0 16px" }}><MSection label="Progress" /></div>
        <Timeline steps={steps} />

        {data.note && (
          <div style={{ padding: "0 16px 16px" }}>
            <Kicker>{data.mine ? "Your note" : `${first || "Their"}’s note`}</Kicker>
            <p style={{ fontSize: 14, lineHeight: 1.55, margin: "8px 0 0" }}>{data.note}</p>
          </div>
        )}

        <div style={{ height: 12 }} />
      </MBody>
      {/* Docked at the foot, as the mockup has it, rather than sitting at the end of the scroll:
          the one question somebody has about an order they are tracking is "can I ask about this?",
          and on a long timeline that control was below everything they had already read. */}
      <SecondaryBar label="Ask about this order" href={`/my/orders/${data.id}/messages`} />
    </>
  );
}
