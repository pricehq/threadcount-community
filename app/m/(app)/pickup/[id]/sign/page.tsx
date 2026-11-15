"use client";
/* Sign (pickup): a person collecting garments that were ordered in for them.
 *
 * Collecting used to be one tap on the Work tab's Pickups card, with no signature and no way back:
 * a stray thumb recorded a hand-over that never happened, and one that did happen left nothing
 * signed, while the same garments issued off the shelf needed a signature. This is the same Sign
 * screen as an issue, so a collection leaves the same trail and a mis-tap is a Back away. */
import { useRef } from "react";
import { useParams } from "next/navigation";
import { useDerived, useSnap } from "@/lib/client";
import { staffName } from "@/lib/compute";
import { pickupLines } from "@/lib/today";
import { MBody, MButton, MEmpty, MHead, MRule, MTop } from "@/components/m";
import SignFlow from "@/components/SignFlow";
import { personMeta, plural } from "@/components/m/issue/meta";

export default function SignPickup() {
  const { s, mutate } = useSnap();
  const { byId } = useDerived();
  const id = String(useParams().id || "");
  const live = s.pickups.find((x) => x.id === id);
  const liveSt = live ? s.staff.find((x) => x.id === live.staffId) : undefined;
  // The snapshot only carries pickups still waiting, so the moment this one is collected it drops
  // out of it. Held here, so the screen does not flash "nothing waiting" before Done replaces it.
  const kept = useRef<{ p: NonNullable<typeof live>; st: NonNullable<typeof liveSt> } | null>(null);
  if (live && liveSt && !live.pickedUp) kept.current = { p: live, st: liveSt };
  const p = kept.current?.p, st = kept.current?.st;

  if (!p || !st) {
    return (
      <>
        <MTop title="Sign" back />
        <MRule />
        <MBody pad>
          <MEmpty title="Nothing waiting to collect" />
          <MButton label="Back to Work" href="/m/work?seg=pickups" />
        </MBody>
      </>
    );
  }

  const lines = pickupLines(p, byId);
  const n = lines.reduce((t, l) => t + l.qty, 0);

  const commit = async ({ sigId, slip }: { sigId: string; slip: boolean }) => {
    const r = await mutate("pickup.pickedUp", { id: p.id, sigId, slip });
    if (!r.ok) return { ok: false as const, error: r.error };
    return {
      ok: true as const,
      done: {
        head: `${plural(n, "item")} collected`,
        sub: `${staffName(st)} · ${slip ? "slip sent to their staff app" : "signed"}`,
        shelfKeys: [],
        next: "work" as const,
      },
    };
  };

  return (
    <SignFlow
      kind="issue"
      head={<MHead name={staffName(st)} meta={personMeta(s, st)} />}
      lines={lines.map((l, i) => ({ key: `${i}`, name: `${l.garment} ${l.size}`, qty: l.qty }))}
      signerName={staffName(st)}
      slip={{ available: !!st.selfEmail }}
      barLabel={`Hand over ${plural(n, "item")}`}
      commit={commit}
      spentHref="/m/work?seg=pickups"
    />
  );
}
