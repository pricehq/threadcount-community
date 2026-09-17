"use client";
/* Receive a delivery: tick each line as it is unpacked, step a line down when less came. Receiving
   closes the order; anything short goes onto a back order raised by order.receive. */
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useDerived, useSnap } from "@/lib/client";
import { key, staffName } from "@/lib/compute";
import { plural } from "@/lib/today";
import { DoneScreen, useShowDone, type DoneProps } from "@/components/SignFlow";
import { MBar, MBody, MButton, MEmpty, MError, MField, MKick, MPickRow, MRule, MSection, MStepper, MTop, inputStyle } from "@/components/m";
import { RECEIVABLE, garmentSize, locMap, orderWhen, outstandingLines, segment, shelfOf, type OutLine } from "@/components/m/work/util";

export default function ReceiveOrder() {
  const id = segment(useParams<{ id: string }>().id);
  const { s, mutate } = useSnap();
  const { byId, staffById } = useDerived();
  const order = s.orders.find((o) => o.id === id);
  const lines = useMemo(() => (order && RECEIVABLE.includes(order.status) ? outstandingLines(order, byId) : []), [order, byId]);
  const locs = useMemo(() => locMap(s), [s]);
  const [tick, setTick] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, number>>({});
  const [invoice, setInvoice] = useState(() => order?.invoice || "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<DoneProps | null>(null);
  const showDone = useShowDone();

  if (done) return <DoneScreen {...done} />;

  const q = (l: OutLine) => qty[l.id] ?? l.outstanding;
  const ticked = lines.filter((l) => tick[l.id]);
  const n = ticked.reduce((t, l) => t + q(l), 0);
  const all = lines.length > 0 && ticked.length === lines.length;

  const receive = async () => {
    if (!order || saving) return;
    setSaving(true);
    setErr("");
    const r = await mutate("order.receive", {
      id: order.id, invoice: invoice.trim(),
      lines: lines.map((l) => ({ lineId: l.id, itemId: l.itemId, size: l.size, arrived: q(l), dest: order.staffId ? "pickup" : "shelf" })),
    });
    setSaving(false);
    if (!r.ok) { setErr(r.error); return; }
    const short = lines.some((l) => q(l) < l.outstanding);
    const d: DoneProps = {
      head: `${plural(n, "item")} received`,
      sub: `${order.code} · ${order.supplier || "Supplier"} · order closed${short ? " · back order raised" : ""}`,
      shelfKeys: order.staffId ? [] : lines.filter((l) => q(l) > 0 && l.si >= 0).map((l) => key(l.itemId, l.si)),
      next: "work",
    };
    setDone(d);
    showDone(d);
  };

  const forName = order?.staffId ? staffName(staffById[order.staffId]) : "";
  return (
    <>
      <MTop title={order?.code || "Receive"} back />
      <MRule />
      <MError msg={err} onDismiss={() => setErr("")} />
      <MBody pad>
        {!order || !lines.length ? (
          <>
            <MEmpty title="Nothing outstanding" />
            <MButton label="Back to Work" href="/m/work?seg=in" />
          </>
        ) : (
          <>
            <MKick>{`${order.supplier || "Supplier"} · ${orderWhen(s, order)}`}</MKick>
            <MSection label="Tick what came in" right={`${ticked.length} of ${lines.length}`} />
            {lines.map((l) => {
              const name = garmentSize(byId[l.itemId], "Garment", l.size);
              const sub = forName ? `for ${forName}` : l.si >= 0 ? shelfOf(s, locs, l.itemId, l.si) : "";
              return (
                <MPickRow key={l.id} done={!!tick[l.id]} onToggle={() => setTick((x) => ({ ...x, [l.id]: !x[l.id] }))} title={name} sub={sub || undefined} tickLabel={`Came in ${name}`}>
                  <MStepper n={q(l)} min={0} max={l.outstanding} label={name} onChange={(v) => setQty((x) => ({ ...x, [l.id]: v }))} />
                </MPickRow>
              );
            })}
            <MButton label="Tick all" onClick={() => setTick(Object.fromEntries(lines.map((l) => [l.id, true])))} />
            <MField label="Invoice number">
              <input value={invoice} onChange={(e) => setInvoice(e.target.value)} autoComplete="off" maxLength={80} style={inputStyle} />
            </MField>
          </>
        )}
      </MBody>
      {order && lines.length > 0 && (
        <MBar label={saving ? "Recording…" : `Receive ${plural(n, "item")}`} disabled={saving || !all || n === 0}
          offReason={saving ? undefined : !all ? "Tick each line" : "Nothing arrived"} onClick={receive} />
      )}
    </>
  );
}
