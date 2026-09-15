"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { QueueGroup, QueueRow } from "@/components/portal";
import { ErrorLine } from "@/components/ui";
import { NewOrderDialog } from "@/components/dialogs";
import { useServerCounts } from "@/lib/portalcounts";
import { bagStock, isPickable, useRequestActions, useRequests, type RequestRow } from "@/components/requests/RequestList";
import { relativeDay } from "@/lib/today";
import { Lines } from "./Lines";

export default function PickGroup() {
  const { s } = useSnap();
  const { L, byId } = useDerived();
  const server = useServerCounts();
  const { data, error, loading, reload } = useRequests();
  const { act, error: actErr } = useRequestActions(reload);
  const [orderFor, setOrderFor] = useState<{ r: RequestRow; short: RequestRow["bag"] } | null>(null);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.requests
      .filter(isPickable)
      .sort((a, b) => ((a.decidedAt || a.createdAt) < (b.decidedAt || b.createdAt) ? -1 : 1))
      .map((r) => ({ r, stock: bagStock(s, L, r) }));
  }, [data, s, L]);

  const count = data ? rows.length : server.pick;

  return (
    <>
      <QueueGroup id="pick" icon="bag" title="Pick for approved requests" count={count}>
        {actErr && <div style={{ padding: "0 16px 10px" }}><ErrorLine msg={actErr} /></div>}
        {!data && error && !loading && (
          <div className="tc-qrow">
            <div className="tc-qrow-main tc-qrow-meta">Requests couldn’t be loaded.</div>
            <div className="tc-qrow-actions"><button type="button" className="btn btn-ghost" onClick={() => reload()}>Try again</button></div>
          </div>
        )}
        {rows.map(({ r, stock }) => {
          const lines = (r.bag.length ? r.bag : r.lines).map((l) => ({ garment: l.item, size: l.size, qty: l.qty }));
          const when = relativeDay(r.decidedAt, s);
          return (
            <QueueRow
              key={r.id}
              age={r.code}
              ageLabel={r.ward.slice(0, 10)}
              title={<Link href={`/app/requests?open=${encodeURIComponent(r.id)}`} style={{ color: "inherit" }}>{r.staffName}</Link>}
              meta={<>
                <Lines lines={lines} />
                {r.managerName ? ` · approved by ${r.managerName}` : " · approved"}{when ? ` ${when}` : ""}
                {" · "}
                {stock.inStock ? "in stock" : <span style={{ color: "var(--color-accent-700)", fontWeight: 600 }}>none on the shelf</span>}
              </>}
              actions={stock.inStock
                ? <button type="button" className="btn btn-secondary" aria-label={`Start picking ${r.code}`} onClick={() => act("request.pick", { id: r.id })}>Start picking</button>
                : <button type="button" className="btn btn-ghost" aria-label={`Order in the garments for ${r.code}`} onClick={() => setOrderFor({ r, short: stock.shortLines })}>Order it in</button>}
            />
          );
        })}
      </QueueGroup>
      {orderFor && (
        <NewOrderDialog
          onClose={() => setOrderFor(null)}
          initOrderFor="Staff Member"
          initStaffId={orderFor.r.staffId}
          initLines={orderFor.short.map((l) => ({ itemId: l.itemId, size: l.size, qty: l.qty }))}
          initSupplier={orderFor.short[0] ? byId[orderFor.short[0].itemId]?.supplier : undefined}
        />
      )}
    </>
  );
}
