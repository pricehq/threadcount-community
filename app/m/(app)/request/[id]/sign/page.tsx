"use client";
/* Sign for a picked request, then Done. A request still "accepted" is moved to "picking" first
   (the queue only lets a picked request be collected); request.collected writes the issue rows, the
   signature and, when asked, the slip to the wearer's staff app. */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useDerived, useSnap } from "@/lib/client";
import { key } from "@/lib/compute";
import { plural } from "@/lib/today";
import { PICK_STATUSES } from "@/lib/workcount";
import { useRequests, type RequestRow } from "@/components/requests/RequestList";
import { useBasket } from "@/components/MBasket";
import SignFlow from "@/components/SignFlow";
import { MBody, MButton, MEmpty, MError, MHead, MKick, MRule, MTop } from "@/components/m";
import { garmentSize, personMeta, segment } from "@/components/m/work/util";

export default function RequestSign() {
  const id = segment(useParams<{ id: string }>().id);
  const { s, mutate } = useSnap();
  const { byId, staffById } = useDerived();
  const { data, error, reload } = useRequests();
  const basket = useBasket();
  // Held once loaded: the hand-over refreshes the queue, and the Done screen must not turn into
  // "moved on" when this request leaves it.
  const [held, setHeld] = useState<{ r: RequestRow; ready: boolean } | null>(null);
  const [seen, setSeen] = useState(false);

  const stored = basket.picked(id);
  useEffect(() => {
    if (held || !data) return;
    const r = data.requests.find((x) => x.id === id);
    if (r && PICK_STATUSES.has(r.status) && r.bag.length) {
      const ready = r.status === "ready" || r.bag.every((l) => (stored[l.id] ?? 0) >= l.qty);
      setHeld({ r, ready });
    }
    setSeen(true);
  }, [data, id, held, stored]);

  const shell = (body: React.ReactNode) => (
    <>
      <MTop title="Sign" back />
      <MRule />
      <MBody pad>{body}</MBody>
    </>
  );

  if (!held) {
    if (!data && error) return shell(<><MError msg="Requests couldn’t be loaded." /><MButton small label="Try again" onClick={() => void reload()} /></>);
    if (!data || !seen) return shell(<MKick>Loading</MKick>);
    return shell(<><MEmpty title="That request has moved on" /><MButton label="Back to Work" href="/m/work?seg=picks" /></>);
  }
  const { r } = held;
  if (!held.ready) {
    return shell(<><MEmpty title="Pick every line first" /><MButton label="Back to the pick list" href={`/m/request/${r.id}`} /></>);
  }

  const st = staffById[r.staffId];
  const total = r.bag.reduce((t, l) => t + l.qty, 0);
  return (
    <SignFlow
      kind="request"
      head={<MHead name={r.staffName} meta={personMeta(s, st, r.ward)} />}
      lines={r.bag.map((l) => ({ key: l.id, name: garmentSize(byId[l.itemId], l.item, l.size), qty: l.qty }))}
      signerName={r.staffName}
      slip={{ available: !!st?.selfEmail }}
      barLabel={`Hand over ${plural(total, "item")}`}
      spentHref={`/m/request/${r.id}`}
      commit={async ({ sigId, slip }) => {
        // Accepted cannot go straight to collected. If the pick screen already moved it, this
        // refusal is expected and collected below answers for the real state.
        if (r.status === "accepted") await mutate("request.pick", { id: r.id });
        const c = await mutate("request.collected", { id: r.id, sigId, slip });
        if (!c.ok) { void reload(); return { ok: false, error: c.error }; }
        basket.clear("picked", r.id);
        void reload();
        return {
          ok: true,
          done: {
            head: "Request handed over",
            sub: `${r.staffName} · ${plural(total, "item")}${slip ? " · slip sent" : ""}`,
            shelfKeys: r.bag.map((l) => key(l.itemId, l.si)),
            next: "work",
          },
        };
      }}
    />
  );
}
