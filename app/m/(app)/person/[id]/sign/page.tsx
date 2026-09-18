"use client";
/* Sign (issue): what is being handed over, the manager approval deduction, their signature and the
 * slip switch. issue.create records the lines, the per-line reasons, the approval deduction and the
 * signed slip in one locked write; SignFlow then shows the Done screen in place. */
import { useState } from "react";
import { useParams } from "next/navigation";
import { useDerived, useSnap } from "@/lib/client";
import { approvalRemaining, isNursing, isPantItem, isTopItem, issueLineFlags, label, staffName } from "@/lib/compute";
import { MBody, MButton, MEmpty, MHead, MRow, MRule, MSection, MStepper, MTop } from "@/components/m";
import { useBasket, type IssueLine } from "@/components/MBasket";
import SignFlow from "@/components/SignFlow";
import { personMeta, plural } from "@/components/m/issue/meta";

export default function SignIssue() {
  const { s, mutate } = useSnap();
  const { byId } = useDerived();
  const id = String(useParams().id || "");
  const basket = useBasket();
  const st = s.staff.find((x) => x.id === id);
  // Once issued the basket is cleared; the lines are kept here so the screen does not fall back to
  // "nothing to issue" in the moment before the Done screen replaces it.
  const [frozen, setFrozen] = useState<IssueLine[] | null>(null);
  const lines = frozen ?? basket.issue(id);

  if (!st || !lines.length) {
    return (
      <>
        <MTop title="Sign" back />
        <MRule />
        <MBody pad>
          <MEmpty title={st ? "Nothing to issue" : "No such staff member"} />
          {st && <MButton label="Back to their record" href={`/m/person/${encodeURIComponent(st.id)}`} />}
        </MBody>
      </>
    );
  }

  const n = lines.reduce((t, l) => t + l.qty, 0);
  const tops = lines.reduce((t, l) => t + (isTopItem(byId[l.itemId]) ? l.qty : 0), 0);
  const pants = lines.reduce((t, l) => t + (isPantItem(byId[l.itemId]) ? l.qty : 0), 0);
  const sets = Math.max(tops, pants);
  const left = approvalRemaining(s, st.id);
  const approval = isNursing(s, st) && left > 0;
  const most = Math.min(left, sets);
  const chosen = basket.deduct(id);
  const deduct = Math.max(0, Math.min(most, chosen ?? most));

  const extra = approval ? (
    <>
      <MSection label="Manager approval" right={`${plural(left, "set")} left`} />
      <MRow title="Take off the approval" sub={`This issue is ${plural(sets, "set")}`}
        right={<MStepper label="sets off the approval" n={deduct} min={0} max={most} onChange={(v) => basket.setDeduct(id, v)} />} />
    </>
  ) : undefined;

  const commit = async ({ sigId, slip }: { sigId: string; slip: boolean }) => {
    const flags = issueLineFlags(s, st, lines);
    const r = await mutate<{ slipId: string | null }>("issue.create", {
      staffId: st.id,
      lines: lines.map((l, i) => ({ itemId: l.itemId, si: l.si, qty: l.qty, src: "stock", reason: flags[i] ? l.reason || "" : "" })),
      override: flags.some(Boolean),
      lineReasons: true,
      apDeduct: approval ? deduct : 0,
      sigId,
      slip,
    });
    if (!r.ok) return { ok: false as const, error: r.error };
    const sent = lines;
    setFrozen(sent);
    basket.clear("issue", st.id);
    return {
      ok: true as const,
      done: {
        head: `${plural(n, "item")} issued`,
        sub: `${staffName(st)} · ${slip ? "slip sent to their staff app" : "signed"}`,
        shelfKeys: sent.map((l) => l.key),
        next: "scan" as const,
      },
    };
  };

  return (
    <SignFlow
      kind="issue"
      head={<MHead name={staffName(st)} meta={personMeta(s, st)} />}
      lines={lines.map((l) => ({ key: l.key, name: `${label(byId[l.itemId])} ${String(byId[l.itemId]?.sizes[l.si] ?? l.si)}`, qty: l.qty }))}
      signerName={staffName(st)}
      extra={extra}
      slip={{ available: !!st.selfEmail }}
      barLabel={`Issue ${plural(n, "item")}`}
      commit={commit}
    />
  );
}
