"use client";
/* 1G — Report damage. Two jobs in one screen: take the garment off my record, and start the
 * replacement.
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
import { MBar, MBody, MError, MRule, MTop } from "@/components/m";
import { DarkCard, N600, N700, NumberedField, OptionList, StockTag, Toggle } from "@/components/staffui";
import { useStaff } from "@/lib/staffclient";
import { DAMAGE_KINDS } from "@/lib/staffreq";

type Holding = {
  issueId: string; itemId: string; item: string; size: string; si: number; qty: number;
  labelId: string; issued: string; replacement: string;
};

export default function DamageScreen({ holdings, managerName }: { holdings: Holding[]; managerName: string }) {
  const { mutate, busy } = useStaff();
  const [issueId, setIssueId] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [note, setNote] = useState("");
  /* The toggle defaults on, because asking for a replacement is what almost everybody reporting a
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

  return (
    <>
      <MTop title="Report damage" back />
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

        {held && (
          <NumberedField n={2} label="What happened">
            <OptionList
              columns={2}
              value={kind}
              onPick={(k) => { setKind(k); setErr(""); }}
              options={DAMAGE_KINDS.map((d) => ({ key: d, label: d }))}
            />
            <textarea
              value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              aria-label="Anything the linen room should know (optional)"
              placeholder="Anything the linen room should know (optional)"
              style={{ width: "100%", minHeight: 84, marginTop: 14, padding: 12, border: "2px solid var(--color-divider)", borderRadius: 0, font: "inherit", fontSize: 15, resize: "none", background: "#fff", color: "var(--color-text)" }}
            />
          </NumberedField>
        )}

        {held && kind && (
          <NumberedField n={3} label="Replacement">
            <div style={{ display: "flex", gap: 14, alignItems: "center", background: "#fff", padding: "14px 16px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>Request a replacement</div>
                <div style={{ fontSize: 12, color: N600, marginTop: 4 }}>
                  {held.item} — {held.size} · <StockTag word={held.replacement} />
                </div>
              </div>
              <Toggle on={replace && canRequest} onChange={setReplace} disabled={!canRequest} label="Request a replacement" />
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: N700, margin: "12px 0 0" }}>
              The damaged item comes off your record when you hand it in at the counter.
              {!canRequest
                ? " Nobody is recorded as your approver yet, so a replacement can’t be asked for here — report it, and ask the linen room to set your manager on your staff record."
                : replace ? ` The replacement goes to ${managerName} for approval first.` : ""}
            </p>
          </NumberedField>
        )}

        <MError msg={err} onDismiss={() => setErr("")} />
        <div style={{ height: 12 }} />
      </MBody>
      <MBar
        label={busy ? "Sending…" : replace && canRequest ? "Report and request" : "Report it"}
        disabled={!ready || busy}
        onClick={async () => {
          if (!held || !kind) return;
          const r = await mutate<{ replacement: { id: string } | null; replacementNote?: string }>("damage.report", {
            issueId: held.issueId, kind, note, replace: replace && canRequest,
          });
          if (!r.ok) { setErr(r.error); return; }
          // Optional on the type because the app in somebody's pocket can be older or newer than
          // the server it is talking to; an absent note just means there was nothing to explain.
          const why = (r.result.replacementNote || "").trim();
          if (!r.result.replacement && why) { setNoReplacement(why); return; }
          window.location.assign(r.result.replacement ? `/my/orders/${r.result.replacement.id}` : "/my/kit");
        }}
      />
    </>
  );
}
