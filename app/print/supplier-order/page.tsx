import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { loadOrderDoc } from "@/lib/orderdoc";
import { fmtDate, money } from "@/lib/compute";
import AutoPrint from "@/components/AutoPrint";

export const dynamic = "force-dynamic";

/* The purchase order as an A4 sheet: the supplier's own product codes, a tick box per line to
 * work down while keying it into the supplier's site, the account number, the order number, a
 * space for the supplier's reference, and a signature. Black on white, nothing that will not
 * print. Rendering it stamps printedAt on the order. */
export default async function SupplierOrderSheet({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await currentUser();
  if (!user) redirect("/auth");
  if (user.role !== "ADMIN") redirect("/app/orders");
  const q = await searchParams;
  const id = String(q.id || "").trim().slice(0, 64);
  if (!id) redirect("/app/orders");
  const d = await loadOrderDoc(user.facilityId, id).catch(() => null);
  if (!d) redirect("/app/orders");
  await prisma.order.update({ where: { id }, data: { printedAt: new Date() } }).catch(() => undefined);

  const ink = "#201e1d";
  const lb: React.CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: ink };
  const cell: React.CSSProperties = { padding: "6px 6px", borderBottom: `1px solid ${ink}`, fontSize: 11.5, verticalAlign: "top" };
  const r: React.CSSProperties = { ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" };
  const box = <span style={{ display: "inline-block", width: 11, height: 11, border: `1.2px solid ${ink}` }} />;

  return (
    <main style={{ fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", color: ink, background: "#fff", padding: "14mm", maxWidth: 800, margin: "0 auto" }}>
      <style>{`@page{size:A4;margin:14mm}@media print{.noprint{display:none}}`}</style>
      <div className="noprint" style={{ display: "flex", gap: 8, marginBottom: 12 }}><a className="btn btn-ghost" href="/app/orders">← Orders</a><AutoPrint /></div>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: `2px solid ${ink}`, paddingBottom: 8 }}>
        <div>
          <div style={lb}>Purchase order</div>
          <h1 style={{ fontSize: 22, margin: "2px 0 0", letterSpacing: "-0.01em" }}>{d.order.code}{d.order.ref ? <span style={{ fontWeight: 400 }}> · {d.order.ref}</span> : null}</h1>
        </div>
        <div style={{ textAlign: "right", fontSize: 11.5, lineHeight: 1.5 }}>
          <b>{d.facility.name}</b><br />{d.facility.location}{d.facility.slipOrg ? <><br />{d.facility.slipOrg}</> : null}
        </div>
      </header>
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px", margin: "12px 0", fontSize: 11.5, lineHeight: 1.6 }}>
        <div><span style={lb}>Supplier</span><br /><b>{d.supplier.name || "—"}</b>{d.supplier.contact ? ` · ${d.supplier.contact}` : ""}{d.supplier.phone ? ` · ${d.supplier.phone}` : ""}{d.supplier.email ? <><br />{d.supplier.email}</> : null}</div>
        <div><span style={lb}>Date</span><br /><b>{fmtDate(d.order.date)}</b>{d.order.expected ? ` · expected ${fmtDate(d.order.expected)}` : ""}</div>
        <div><span style={lb}>Our account with supplier</span><br /><b>{d.supplier.account || "—"}</b></div>
        <div><span style={lb}>Supplier&apos;s order reference</span><br />{d.order.ref ? <b>{d.order.ref}</b> : <span style={{ display: "inline-block", width: 180, borderBottom: `1.2px solid ${ink}`, height: 16 }} />}</div>
        {d.staff && <div style={{ gridColumn: "1 / -1" }}><span style={lb}>Ordered for</span><br /><b>{d.staff.name}</b>{d.staff.dept ? ` · ${d.staff.dept}` : ""}{d.staff.cc ? ` · cost centre ${d.staff.cc}` : ""}</div>}
      </section>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
        <thead>
          <tr>
            <th style={{ ...cell, ...lb, borderBottom: `2px solid ${ink}`, width: 18 }}></th>
            <th style={{ ...cell, ...lb, borderBottom: `2px solid ${ink}`, textAlign: "left" }}>Supplier code</th>
            <th style={{ ...cell, ...lb, borderBottom: `2px solid ${ink}`, textAlign: "left" }}>Description</th>
            <th style={{ ...cell, ...lb, borderBottom: `2px solid ${ink}`, textAlign: "left" }}>Size</th>
            <th style={{ ...r, ...lb, borderBottom: `2px solid ${ink}` }}>Qty</th>
            <th style={{ ...r, ...lb, borderBottom: `2px solid ${ink}` }}>Unit</th>
            <th style={{ ...r, ...lb, borderBottom: `2px solid ${ink}` }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={i}>
              <td style={cell}>{box}</td>
              <td style={{ ...cell, fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 700 }}>{l.code || "—"}</td>
              <td style={cell}>{l.description}</td>
              <td style={cell}>{l.size}</td>
              <td style={{ ...r, fontWeight: 700 }}>{l.qty}</td>
              <td style={r}>{l.unit ? money(l.unit) : "—"}</td>
              <td style={r}>{l.unit ? money(l.total) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12 }}>
        <div>{d.lines.reduce((t, l) => t + l.qty, 0)} units · {d.lines.length} line{d.lines.length === 1 ? "" : "s"}</div>
        <div><b>Total {money(d.total)}</b> <span style={{ fontSize: 10 }}>ex tax, at last known unit costs</span></div>
      </div>
      {d.order.notes && <div style={{ marginTop: 10, fontSize: 11 }}>Notes: {d.order.notes}</div>}
      <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, fontSize: 11 }}>
        <div><span style={lb}>Ordered by</span><div style={{ borderBottom: `1.2px solid ${ink}`, height: 22 }} /></div>
        <div><span style={lb}>Date placed</span><div style={{ borderBottom: `1.2px solid ${ink}`, height: 22 }} /></div>
      </div>
      <div style={{ marginTop: 14, fontSize: 10, color: "#57534f" }}>Please quote order {d.order.code} on the invoice.{d.facility.coordinator ? ` Questions: ${d.facility.coordinator}${d.facility.coordinatorPhone ? ` · ${d.facility.coordinatorPhone}` : ""}${d.facility.coordinatorEmail ? ` · ${d.facility.coordinatorEmail}` : ""}.` : ""}</div>
    </main>
  );
}
