"use client";
/* Sign a ward round: every bag waiting for that ward (lib/today roundSheet, the same set the Rounds
   segment counted), one signature for the lot through pickup.deliverWard, then Done. */
import { useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useDerived, useSnap } from "@/lib/client";
import { plural, roundSheet } from "@/lib/today";
import { takePhoto, uploadPhoto } from "@/lib/photo";
import SignFlow from "@/components/SignFlow";
import { MBody, MButton, MEmpty, MField, MHead, MRule, MTop, inputStyle, useToast } from "@/components/m";
import { roundLines, segment } from "@/components/m/work/util";
import { cap } from "@/lib/terms";

const BATCH = 40; // pickup.deliverWard takes at most 40 bags a call

export default function RoundSign() {
  const ward = segment(useParams<{ ward: string }>().ward);
  const { s, mutate } = useSnap();
  const { byId, staffById } = useDerived();
  const toast = useToast();
  // Held from the first render: delivering removes the ward from the sheet, and the Done screen
  // must not turn into an empty round.
  const [rows] = useState(() => roundSheet(s, byId, staffById).find((w) => w.ward === ward)?.rows ?? []);
  const lines = useMemo(() => roundLines(rows, byId), [rows, byId]);
  const [name, setName] = useState("");
  const [proofId, setProofId] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const delivered = useRef(new Set<string>());

  if (!rows.length) {
    return (
      <>
        <MTop title="Sign" back />
        <MRule />
        <MBody pad>
          <MEmpty title="Nothing to deliver" />
          <MButton label="Back to Work" href="/m/work?seg=rounds" />
        </MBody>
      </>
    );
  }

  const items = lines.reduce((t, l) => t + l.qty, 0);
  const people = new Set(rows.map((r) => r.p.staffId)).size;
  const who = name.trim();

  const takeProof = async () => {
    if (photoBusy) return;
    const data = await takePhoto();
    if (!data) return;
    setPhotoBusy(true);
    const up = await uploadPhoto(mutate, "proof", data);
    setPhotoBusy(false);
    if ("error" in up) { toast(up.error); return; }
    setProofId(up.id);
  };

  return (
    <SignFlow
      kind="round"
      head={<MHead name={ward} meta={`${cap(s.settings.terms.round)} · ${plural(people, "person", "people")} · ${plural(items, "item")}`} />}
      lines={lines.map((l) => ({ key: l.key, name: l.name, qty: l.qty }))}
      signerName={who || `${ward}, person in charge`}
      extra={
        <>
          <MField label="Received by">
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={120} style={inputStyle} />
          </MField>
          <MButton small label={photoBusy ? "Saving photo…" : proofId ? "Photo attached · retake" : "Add handover photo"} onClick={() => void takeProof()} disabled={photoBusy} />
        </>
      }
      barLabel="Delivered"
      commit={async ({ sigId }) => {
        // A ward with more bags than one call takes goes in batches; a retry skips what already went.
        const ids = rows.map((r) => r.p.id).filter((x) => !delivered.current.has(x));
        for (let i = 0; i < ids.length; i += BATCH) {
          const part = ids.slice(i, i + BATCH);
          const r = await mutate("pickup.deliverWard", { ids: part, deliveredTo: who, sigId, proofId });
          if (!r.ok) return { ok: false, error: delivered.current.size ? `${delivered.current.size} of ${rows.length} bags recorded. ${r.error}` : r.error };
          part.forEach((x) => delivered.current.add(x));
        }
        return {
          ok: true,
          done: { head: `${ward} delivered`, sub: `${plural(items, "item")} · signed by ${who || "the person in charge"}`, shelfKeys: [], next: "work" },
        };
      }}
    />
  );
}
