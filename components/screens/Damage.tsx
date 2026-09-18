"use client";
/* Report damage. Two jobs on one screen: tell the linen room, and start the replacement.
 *
 * The two are deliberately separate acts. Reporting damage does not issue anything and does not
 * silently remove the garment — it comes off the record when it is handed in at the counter. A
 * screen that wrote off a garment on somebody's say-so would be a screen the linen room stops
 * trusting, and a screen that quietly issued a replacement would route around the manager.
 *
 * `Contaminated` is not in the list. Clinically it is a different pathway — red bag, no return to
 * the counter — and telling someone to carry a contaminated garment to the linen room would be
 * worse than saying nothing. Wards use the route they already have.
 */
import { useState } from "react";
import { MBar, MBody, MChipRow, MError, MRule, MSwitchRow, MTop } from "@/components/m";
import { DarkCard, N600, N700, NumberedField, OptionList } from "@/components/staffui";
import Sent from "@/components/screens/Sent";
import { useStaff } from "@/lib/staffclient";
import { DAMAGE_KINDS } from "@/lib/staffreq";

type Holding = {
  issueId: string; itemId: string; item: string; size: string; si: number; qty: number;
  labelId: string; issued: string; replacement: string;
};

export default function DamageScreen({ holdings, managerName, notifyWays }: {
  holdings: Holding[]; managerName: string; notifyWays: { email: boolean; push: boolean };
}) {
  const { mutate, busy, me } = useStaff();
  const terms = me.terms;
  const [issueId, setIssueId] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [note, setNote] = useState("");
  /* The switch defaults on, because asking for a replacement is what almost everybody reporting a
   * torn tunic actually wants — but only when there is somebody to ask. With no manager recorded
   * the request half cannot be raised at all, so defaulting it on left people tapping "Report and
   * request" and getting an error they could do nothing about. */
  const canRequest = !!managerName;
  const [replace, setReplace] = useState(canRequest);
  const [err, setErr] = useState("");
  /* The server's sentence for a report it saved without a replacement behind it — almost always a
   * garment whose range has been withdrawn, which cannot be ordered but is still on somebody's
   * back. Nothing failed, so it is not an error; but the screen used to go straight to the kit
   * list on a plain success and the nurse walked away expecting a replacement nobody had ordered. */
  const [noReplacement, setNoReplacement] = useState("");
  /* Where a finished report lands. A replacement was raised, so this is the request screen's own
   * Sent — same approver, same "what happens next" — or, with no replacement asked for, the same
   * screen saying the one thing that is still true: it comes off the record at the counter. */
  const [done, setDone] = useState<{ what: string; order: { id: string; code: string; manager: string; notified: boolean } | null } | null>(null);

  const held = holdings.find((h) => h.issueId === issueId) || null;
  const ready = !!held && !!kind;

  if (noReplacement) {
    return (
      <>
        <MTop title="Reported" />
        <MRule />
        <MBody>
          <div style={{ padding: 16 }}>
            <DarkCard kicker="Reported" title="No replacement has been ordered" meta={noReplacement} />
          </div>
        </MBody>
        <MBar label="Back to your kit" href="/my/kit" />
      </>
    );
  }

  if (done) {
    const o = done.order;
    const who = o?.manager || managerName || "your manager";
    return o ? (
      <Sent
        headline={`Sent to ${who}`}
        sub={`${done.what} · ${o.code}`}
        next={
          notifyWays.push
            ? "You get a notification when it is approved, and again when it is ready."
            : o.notified
              ? `${who} has been emailed.`
              : `It is waiting with ${who}.`
        }
        actions={[
          { label: "Open the order", href: `/my/orders/${o.id}` },
          { label: "Back to home", href: "/my" },
        ]}
        bar={{ label: "Back to home", href: "/my" }}
      />
    ) : (
      <Sent
        title="Reported"
        headline={`Reported to the ${terms.store}`}
        sub={done.what}
        next="It comes off your record when you hand it in at the counter."
        actions={[{ label: "Back to your kit", href: "/my/kit" }]}
        bar={{ label: "Back to home", href: "/my" }}
      />
    );
  }

  return (
    <>
      <MTop title="Report damage" back backHref="/my/kit" />
      <MRule />
      <MBody>
        <NumberedField n={1} label="Which item" first>
          {holdings.length === 0 ? (
            <p style={{ fontSize: 14, color: N600, lineHeight: 1.6, margin: 0 }}>
              Nothing on your record to report.
            </p>
          ) : (
            <OptionList
              value={issueId}
              onPick={(k) => { setIssueId(k); setErr(""); }}
              options={holdings.map((h) => ({
                key: h.issueId,
                label: `${h.item} — ${h.size}`,
                // The label id is what the linen room reads off the garment in their hand, so a
                // row here can be matched to a physical thing.
                meta: `${h.labelId} · issued ${h.issued}`,
              }))}
            />
          )}
        </NumberedField>

        {/* Both steps stay on screen from the start, as the mockup draws them. Revealing "what
            happened" only after a garment is chosen hid half the job from somebody deciding whether
            this screen was the one they wanted. */}
        <NumberedField n={2} label="What happened">
            <MChipRow
              label="What happened"
              value={kind}
              onPick={(k) => { setKind(k); setErr(""); }}
              options={DAMAGE_KINDS.map((d) => ({ value: d, label: d }))}
            />
            <textarea
              value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              aria-label={`Anything the ${terms.store} should know (optional)`}
              placeholder={`Anything the ${terms.store} should know (optional)`}
              style={{ width: "100%", minHeight: 84, marginTop: 14, padding: 12, border: "2px solid var(--color-divider)", borderRadius: 0, font: "inherit", fontSize: 16, resize: "none", background: "#fff", color: "var(--color-text)" }}
            />
        </NumberedField>

        <div style={{ padding: "16px 16px 0" }}>
            <MSwitchRow
              title="Ask for a replacement too"
              sub={canRequest
                ? `Goes to ${managerName} with the report`
                : `Nobody is recorded as your approver yet — ask the ${terms.store} to set your manager`}
              on={replace && canRequest}
              onToggle={() => setReplace((v) => !v)}
              disabled={!canRequest}
            />
            <p style={{ fontSize: 13, lineHeight: 1.6, color: N700, margin: "12px 0 0" }}>
              The damaged item comes off your record when you hand it in at the counter.
            </p>
        </div>

        <MError msg={err} onDismiss={() => setErr("")} />
        <div style={{ height: 12 }} />
      </MBody>
      <MBar
        label={busy ? "Sending…" : replace && canRequest ? "Report and request" : "Report it"}
        disabled={!ready || busy}
        offReason="Pick the item and what happened"
        onClick={async () => {
          if (!held || !kind) return;
          /* `replacement` is the whole request.create result at run time — id, code, manager and
           * whether an email actually left the server — because damage.report raises the
           * replacement through that op and hands back what it returned. Every field past the id
           * is optional here: the app in somebody's pocket can be older or newer than the server
           * it is talking to, and a missing one only costs a line of the confirmation. */
          const r = await mutate<{
            replacement: { id: string; code?: string; manager?: string; notified?: boolean } | null;
            replacementNote?: string;
          }>("damage.report", { issueId: held.issueId, kind, note, replace: replace && canRequest });
          if (!r.ok) { setErr(r.error); return; }
          const why = (r.result.replacementNote || "").trim();
          if (!r.result.replacement && why) { setNoReplacement(why); return; }
          const rep = r.result.replacement;
          setDone({
            what: `${held.item} — ${held.size}`,
            order: rep ? {
              id: rep.id, code: rep.code || "", manager: rep.manager || managerName, notified: !!rep.notified,
            } : null,
          });
        }}
      />
    </>
  );
}
