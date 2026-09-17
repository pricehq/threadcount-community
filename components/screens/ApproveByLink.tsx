"use client";
/* Approving or declining straight from the email, on whatever device opened it.
 *
 * This is the centred page shell rather than the phone column: a manager reaches it from a mail
 * client, as often on a desktop as on a ward phone, and dropping them into an app chrome they
 * never signed into would be a strange thing to meet.
 *
 * Nothing has happened when this page loads. That is the point of the design: the link renders,
 * the button decides.
 */
import { useState } from "react";
import { Err, MyShell, h1, kicker, lead, primary } from "@/components/my";
import { DECLINE_REASONS } from "@/lib/staffreq";
import type { ReqLine } from "@/lib/staffdata";

type Data = {
  code: string; subjectName: string; subjectMeta: string;
  /** The whole ask, in the order it was entered. */
  lines: ReqLine[];
  /** linesSummary() — the one-liner every other screen leads with. */
  summary: string;
  reason: string; note: string;
  raisedByName: string; facility: string;
};

const INK = "#201e1d";
const N600 = "var(--color-neutral-600)";
const N700 = "var(--color-neutral-700)";
const ACCENT_700 = "var(--color-accent-700)";

/** The garments, one row each. Deliberately drawn here rather than borrowed from the staff app's
 *  own list: this page is the centred desktop shell, not the phone column, and its type sizes and
 *  rules are a size up from everything in components/staffui. What it must match is the *content* —
 *  the same order, the same strike-through on a refusal, the same reason against it. */
function Lines({ lines }: { lines: readonly ReqLine[] }) {
  return (
    <div style={{ display: "grid", gap: 1, background: "var(--color-divider)", marginTop: 16 }}>
      {lines.map((l) => {
        const off = l.status === "declined";
        return (
          <div key={l.id} style={{ background: "#fff", padding: "14px 16px" }}>
            <div style={{
              fontSize: 17, fontWeight: 800, lineHeight: 1.3,
              textDecoration: off ? "line-through" : "none", color: off ? N600 : INK,
            }}>{l.qty} × {l.item} — {l.size}</div>
            {off && (
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: ACCENT_700, marginTop: 6 }}>
                Declined{l.declineReason ? ` — ${l.declineReason}` : ""}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ApproveByLink({ token, data, decided, status, declineReason }: {
  token: string; data: Data; decided: boolean; status: string; declineReason: string | null;
}) {
  const [done, setDone] = useState<null | { approved: boolean; reason?: string; notified: boolean }>(null);
  const [declining, setDeclining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function decide(action: "approve" | "decline", reason?: string) {
    setBusy(true); setErr("");
    const r = await fetch("/api/staff/decide", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, action, reason }),
    }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    // Already decided — the other link in the email was used, or this one twice. The route says
    // so with `already`, and the server render of this page shows the decision that stands, so
    // reload into that rather than sit on a red error with two live buttons under it.
    if (j?.already) { window.location.reload(); return; }
    if (!r || !r.ok) { setErr(j?.error || "That didn’t work."); return; }
    setDone({ approved: action === "approve", reason, notified: !!j?.notified });
  }

  if (done) {
    return (
      <MyShell>
        <div style={kicker}>ThreadCount</div>
        <h1 style={h1}>{done.approved ? "Approved." : "Declined."}</h1>
        <p style={lead}>
          {/* "Has been told" only when an email actually left — a wearer with no account or a site
              with no mail hears nothing from this, and saying otherwise is how they wait a fortnight. */}
          {done.approved
            ? `${done.notified ? `${data.subjectName.split(" ")[0]} has been told, and` : `${data.subjectName.split(" ")[0]} hasn’t been emailed — it’s on their record in the app — and`} ${data.lines.length > 1 ? "all of it is" : "it’s"} with the linen room now.`
            : `${done.notified ? `${data.subjectName.split(" ")[0]} has been told` : `${data.subjectName.split(" ")[0]} hasn’t been emailed, so mention it to them`} — ${(done.reason || "").toLowerCase()}.`}
        </p>
        <p style={{ ...lead, fontSize: 13.5, color: N600 }}>
          You can close this. Nothing else is waiting on you here.
        </p>
      </MyShell>
    );
  }

  if (decided) {
    return (
      <MyShell>
        <div style={kicker}>{data.facility}</div>
        <h1 style={h1}>Already decided.</h1>
        <p style={lead}>
          {status === "declined"
            ? `This request was declined${declineReason ? ` — ${declineReason.toLowerCase()}` : ""}.`
            : "This request has already been approved and is with the linen room."}
        </p>
        {/* Which garments went and which didn't. A manager coming back to a request they settled
            on their phone deserves the same answer here as the wearer gets on their order — the
            alternative is a page that says "approved" over an ask where a third of it was refused. */}
        <Lines lines={data.lines} />
        <p style={{ ...lead, fontSize: 13.5, color: N600 }}>
          Approval links work once. Open the app if you need to look at it again.
        </p>
      </MyShell>
    );
  }

  return (
    <MyShell>
      <div style={kicker}>{data.facility} · {data.code}</div>
      <h1 style={h1}>{data.subjectName} needs your approval.</h1>
      {data.subjectMeta && <p style={{ ...lead, marginTop: 8, fontSize: 13.5, color: N600 }}>{data.subjectMeta}</p>}

      <div style={{ border: `2px solid ${INK}`, padding: 18, marginTop: 24, background: "#fff" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
          {data.summary}
        </div>
        {data.reason && <div style={{ fontSize: 14, color: N700, marginTop: 8 }}>{data.reason}</div>}
        {data.note && <p style={{ fontSize: 14, lineHeight: 1.55, color: N700, margin: "10px 0 0" }}>{data.note}</p>}
        {data.raisedByName && (
          <p style={{ fontSize: 13, color: N600, margin: "10px 0 0" }}>Raised for them by {data.raisedByName}.</p>
        )}
      </div>

      {/* The summary above is a count and three names; a manager about to approve four garments
          needs to see the four. One garment needs no list — the heading already is one. */}
      {data.lines.length > 1 && <Lines lines={data.lines} />}

      {err && <div style={{ marginTop: 16 }}><Err>{err}</Err></div>}

      {declining ? (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: ACCENT_700 }}>
            Why are you declining?
          </div>
          <p style={{ ...lead, marginTop: 8, fontSize: 13.5 }}>
            {data.lines.length > 1
              ? `This turns down all ${data.lines.length} garments. ${data.subjectName.split(" ")[0]} is told which reason you picked.`
              : `${data.subjectName.split(" ")[0]} is told which one you picked.`}
          </p>
          <div style={{ display: "grid", gap: 2, marginTop: 14 }}>
            {DECLINE_REASONS.map((r) => (
              <button key={r} disabled={busy} onClick={() => decide("decline", r)} style={{
                minHeight: 56, background: "#fff", color: INK, border: `2px solid ${INK}`, borderRadius: 0,
                textAlign: "left", padding: "0 16px", font: "inherit", fontSize: 15.5, fontWeight: 800,
                cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1,
              }}>{r}</button>
            ))}
          </div>
          <button onClick={() => { setDeclining(false); setErr(""); }} style={{
            marginTop: 16, minHeight: 48, padding: "0 20px", background: "transparent", color: INK,
            border: `2px solid ${INK}`, borderRadius: 0, font: "inherit", fontWeight: 800, fontSize: 13,
            letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer",
          }}>Back</button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 2, marginTop: 24 }}>
          <button disabled={busy} onClick={() => decide("approve")} style={primary(busy)}>
            {busy ? "Working…" : "Approve"}
          </button>
          <button disabled={busy} onClick={() => setDeclining(true)} style={{
            minHeight: 56, background: "transparent", color: INK, border: `2px solid ${INK}`, borderRadius: 0,
            font: "inherit", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 14,
            letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "left", padding: "0 20px",
            cursor: busy ? "wait" : "pointer",
          }}>Decline</button>
        </div>
      )}

      {/* The one thing this page cannot do. Signed in, a manager approves the tunic and turns down
          the fleece on the same request; from an email link there is no signed-in person to check
          a per-garment decision against, so it is deliberately the whole ask either way. A manager
          who wants part of it has to be told where that lives rather than left approving three
          garments to get one of them through. */}
      <p style={{ ...lead, fontSize: 13, color: N600, marginTop: 24 }}>
        Nothing has been decided yet — this page just shows you the request. The link works once,
        and it settles {data.lines.length > 1 ? "the whole request" : "it"} one way or the other.
        {data.lines.length > 1 && " To approve some garments and not others, open the app."}
      </p>
    </MyShell>
  );
}
