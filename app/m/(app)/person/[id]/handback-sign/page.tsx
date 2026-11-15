"use client";
/* Sign (hand back with a size swap). A swap takes one garment back and hands another over, and every
 * other hand-over at the counter is signed for, so a list with a swap is signed here before
 * handback.commit records the whole list: the returns, and the swapped garments on a slip. */
import { useRef } from "react";
import { useParams } from "next/navigation";
import { useDerived, useSnap } from "@/lib/client";
import { key, label, staffName } from "@/lib/compute";
import { MBody, MButton, MEmpty, MHead, MRule, MTop } from "@/components/m";
import SignFlow from "@/components/SignFlow";
import { personMeta, plural } from "@/components/m/issue/meta";
import { useHandBack } from "@/components/m/handback/useHandBack";

export default function SignHandBack() {
  const { s } = useSnap();
  const { byId } = useDerived();
  const id = String(useParams().id || "");
  const { st, lines, hasSwap, commit } = useHandBack(id);

  // What is being handed over: each swap, in its new size. Held once the basket is cleared, so the
  // screen does not fall back to "nothing to sign for" in the moment before Done replaces it.
  const swaps = lines.filter((l) => l.swapSi !== null).map((l) => {
    const it = byId[l.itemId];
    return { key: `${l.uid}:${key(l.itemId, l.swapSi as number)}`, name: `${label(it)} ${String(it?.sizes[l.swapSi as number] ?? l.swapSi)}`, qty: 1 };
  });
  const kept = useRef<typeof swaps>([]);
  if (hasSwap) kept.current = swaps;
  const shown = kept.current;

  if (!st || !shown.length) {
    return (
      <>
        <MTop title="Sign" back />
        <MRule />
        <MBody pad>
          <MEmpty title={st ? "No size swap to sign for" : "No such staff member"} />
          {st && <MButton label="Back to their record" href={`/m/person/${encodeURIComponent(st.id)}?tab=back`} />}
        </MBody>
      </>
    );
  }

  return (
    <SignFlow
      kind="issue"
      head={<MHead name={staffName(st)} meta={personMeta(s, st)} />}
      lines={shown}
      signerName={staffName(st)}
      slip={{ available: !!st.selfEmail }}
      barLabel={`Hand back ${plural(lines.length || shown.length, "item")}`}
      commit={commit}
      spentHref={`/m/person/${encodeURIComponent(st.id)}?tab=back`}
    />
  );
}
