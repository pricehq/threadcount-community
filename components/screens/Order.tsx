"use client";
/* 1D — Order detail. The tracking screen, and the screen someone holds up at the counter.
 *
 * The timeline always shows the step that hasn't happened yet, as an outlined dot. Half the point
 * of this screen is what is still to come — an order that only listed what had already happened
 * would leave "so when do I get it?" unanswered, which is the question that sends people to the
 * counter.
 */
import { useState } from "react";
import { CodeBlock, Kicker, LineList, N600, N700, SecondaryBar, type Step, Timeline } from "@/components/staffui";
import { MBar, MBody, MError, MRule, MTop } from "@/components/m";
import { useStaff } from "@/lib/staffclient";
import { statusText } from "@/lib/staffreq";
import type { ReqStatus } from "@/lib/staffreq";
import type { ReqLine } from "@/lib/staffdata";
import { formatInZone } from "@/lib/compute";

type Ev = { id: string; label: string; meta: string; actorName: string; at: string };
type Data = {
  id: string; code: string; status: string;
  lines: ReqLine[]; summary: string; garments: number; lineCount: number; decision: string | null;
  reason: string; note: string; managerName: string; declineReason: string | null;
  collectCode: string | null; holdUntil: string; route: string | null;
  signerName: string | null; signerRole: string | null; ward: string;
  subjectName: string; raisedByName: string; mine: boolean; claimedAt: string | null;
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
function nextStep(status: string, holdUntil: string, route: string | null): { label: string; meta?: string } | null {
  switch (status as ReqStatus) {
    case "awaiting": return { label: "Approved", meta: "Then it goes to the linen room" };
    case "accepted": return { label: "Picked from the shelf" };
    case "picking": return { label: route === "ward_round" ? "Out on the ward round" : "Ready at the counter" };
    case "ready": return { label: "Collected", meta: holdUntil ? `Held until ${holdUntil}` : undefined };
    case "round": return { label: "Signed for on the ward" };
    default: return null; // declined, collected and delivered are endings
  }
}

export default function OrderScreen({ data }: { data: Data }) {
  const { mutate, busy, me } = useStaff();
  const [err, setErr] = useState("");
  // The wearer's first name, for the third-person reading a manager or the desk gets of this page.
  const first = (data.subjectName || "").split(" ")[0];
  const st = statusText(data, { mine: data.mine, first });
  // A request the linen room withdrew was never decided by the manager named on it; the timeline
  // row it writes is the only record of that, so this is where the page finds out.
  const withdrawn = data.status === "declined" && data.events.some((e) => e.label === "Withdrawn by the linen room");

  /* The one thing only the requester can settle: whether the bag actually reached them.
   *
   * A ward clerk signs for the round, which is where the linen room's job ends — but the bag then
   * sits on the desk, and until somebody says it was picked up the desk's unclaimed list only
   * grows. This is that confirmation, and it is why round.claim exists; without a caller it never
   * ran and the list never emptied. */
  const canClaim = data.status === "delivered" && data.mine && !data.claimedAt;

  const steps: Step[] = data.events.map((e, i) => ({
    label: e.label,
    meta: [e.actorName, e.meta, stamp(e.at, me.tz)].filter(Boolean).join(" · "),
    state: i === data.events.length - 1 ? "current" : "done",
  }));
  const next = nextStep(data.status, data.holdUntil, data.route);
  if (next) steps.push({ label: next.label, meta: next.meta, state: "future" });

  return (
    <>
      <MTop title={data.code} back right={<span style={{ fontSize: 12, color: "var(--color-neutral-400)" }}>{data.mine ? "" : data.subjectName}</span>} />
      <MRule />
      <MBody>
        <MError msg={err} onDismiss={() => setErr("")} />
        <div style={{ padding: "20px 16px 18px", borderBottom: "2px solid var(--color-text)", background: "var(--color-bg)" }}>
          <Kicker tone={st.ink === "attention" ? "attention" : "quiet"}>{st.label}</Kicker>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em", lineHeight: 1.15, marginTop: 8 }}>
            {data.summary}
          </div>
          <div style={{ fontSize: 14, color: N700, marginTop: 8 }}>
            {/* `decision` is only there once the manager has been through it, and it is the honest
                headline when they didn't approve everything: "2 of 3 approved" above a list where
                the fleece is struck out. */}
            {[data.decision, data.reason.toLowerCase()].filter(Boolean).join(" · ")}
          </div>
          {!data.mine && data.subjectName && (
            <div style={{ fontSize: 13, color: N600, marginTop: 8 }}>{`For ${data.subjectName}${data.raisedByName ? ` · raised by ${data.raisedByName}` : ""}`}</div>
          )}
          {data.mine && data.raisedByName && (
            <div style={{ fontSize: 13, color: N600, marginTop: 8 }}>{`Raised for you by ${data.raisedByName}`}</div>
          )}
        </div>

        {/* The whole ask, declines included. A request where the fleece was refused has to read
            honestly on the wearer's own screen — the alternative is somebody collecting a bag,
            counting two garments where they asked for three, and coming to the counter to find out
            why. One line needs no list: the heading above already is one. */}
        {data.lineCount > 1 && (
          <div style={{ padding: "16px 16px 0" }}>
            <Kicker>{data.mine ? "What you asked for" : `What ${first || "they"} asked for`}</Kicker>
            <div style={{ marginTop: 10 }}><LineList lines={data.lines} /></div>
          </div>
        )}

        {data.status === "declined" && data.declineReason && (
          <div style={{ background: "#fff", borderLeft: "6px solid var(--color-accent)", padding: "14px 16px", margin: 16 }}>
            <Kicker tone="attention">Why</Kicker>
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6 }}>{data.declineReason}</div>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: N700, margin: "8px 0 0" }}>
              {withdrawn
                ? "The linen room withdrew this. Ask at the counter if it needs another look."
                : data.managerName
                  ? `${data.managerName} decided this. Talk to them if it needs another look.`
                  : "Ask the linen room if it needs another look."}
            </p>
          </div>
        )}

        <div style={{ padding: "16px 16px 0" }}><Kicker>Progress</Kicker></div>
        <Timeline steps={steps} />

        {data.collectCode && data.status === "ready" && (
          <div style={{ padding: 16 }}>
            <CodeBlock code={data.collectCode} />
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
                can&rsquo;t get there by then, say so on this order and the linen room will sort it out.
              </p>
            )}
          </div>
        )}

        {data.status === "delivered" && data.signerName && (
          <div style={{ padding: 16 }}>
            <div style={{ background: "#fff", borderLeft: "6px solid var(--color-text)", padding: "14px 16px" }}>
              <Kicker>Signed for</Kicker>
              <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6 }}>{data.signerName}{data.signerRole ? `, ${data.signerRole}` : ""}</div>
              <p style={{ fontSize: 13.5, lineHeight: 1.55, color: N700, margin: "8px 0 0" }}>
                {data.claimedAt
                  ? `Picked up from the desk on ${data.ward || "your ward"}.`
                  : `Ask at the desk on ${data.ward || "your ward"} — whoever signed has it.`}
              </p>
            </div>
          </div>
        )}

        {data.note && (
          <div style={{ padding: "0 16px 16px" }}>
            <Kicker>{data.mine ? "Your note" : `${first || "Their"}’s note`}</Kicker>
            <p style={{ fontSize: 14, lineHeight: 1.55, margin: "8px 0 0" }}>{data.note}</p>
          </div>
        )}

        <div style={{ padding: 16 }}>
          <SecondaryBar label="Ask about this order" href={`/my/orders/${data.id}/messages`} />
        </div>
        <div style={{ height: 12 }} />
      </MBody>

      {canClaim && (
        <MBar
          label={busy ? "Working…" : "I’ve got it"}
          sub="Tells the desk the bag has been picked up"
          glyph="check"
          disabled={busy}
          onClick={async () => {
            const r = await mutate("round.claim", { id: data.id });
            if (!r.ok) { setErr(r.error); return; }
            window.location.reload();
          }}
        />
      )}
    </>
  );
}
