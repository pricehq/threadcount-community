import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import AutoPrint from "@/components/AutoPrint";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

const lb: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" };
const val = (big?: boolean): React.CSSProperties => ({ borderBottom: big ? "2px solid #201e1d" : "1.5px solid #201e1d", minHeight: big ? 30 : 24, fontSize: big ? 17 : 13, fontWeight: big ? 700 : 600, padding: "2px 2px 0", display: "flex", alignItems: "flex-end" });
const F = ({ label, v, big }: { label: string; v?: string; big?: boolean }) => (
  <div><div style={lb}>{label}</div><div style={val(big)}>{v || " "}</div></div>
);
const CB = ({ label, on }: { label: string; on: boolean }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
    <span style={{ width: 12, height: 12, border: "1.5px solid #201e1d", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, lineHeight: 1 }}>{on ? "✕" : " "}</span>
    <span style={{ fontSize: 11, fontWeight: 600 }}>{label}</span>
  </span>
);

export default async function PrintPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await currentUser();
  if (!user) redirect("/auth");
  const fac = await prisma.facility.findUniqueOrThrow({ where: { id: user.facilityId } });
  const q = await searchParams;
  const type = q.type === "delivery" ? "delivery" : "collection";
  const copies = Math.min(3, Math.max(1, parseInt(q.copies || "1", 10) || 1));
  const org = fac.slipOrg || fac.name;
  /* What is actually in the bag, one garment to a line.
   *
   * A ward request now covers several garments under one code, so a slip that only carried a total
   * would be signed for without anybody being able to check it. The caller passes the approved
   * lines already worded ("2 × Tunic — 16"), newline separated; the counter's own issue slip passes
   * nothing and the block simply doesn't appear. Capped so a very long request can't push the
   * signature block off the page — the number is still printed in full beside it. */
  const garments = String(q.lines || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const shown = garments.slice(0, 10);
  const spilled = garments.length - shown.length;
  const title = type === "delivery" ? "Uniform ward delivery" : "Uniform ready for collection";
  const foot = type === "delivery" ? fac.slipDeliveryFooter : fac.slipCollectionFooter;

  const Slip = () => (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-start" }}>
      <div style={{ height: 8, background: "linear-gradient(90deg,#201e1d 72%,#9ACBD8 72%)" }} />
      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em", textTransform: "uppercase" }}>{title}</div>
        {fac.logoData ? <img src={fac.logoData} alt={org} style={{ width: 110, height: 34, objectFit: "contain", objectPosition: "right center" }} /> : <div style={{ width: 150, textAlign: "right", fontSize: 12, fontWeight: 800, letterSpacing: "0.02em", lineHeight: 1.15 }}>{org}</div>}
      </div>
      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: q.code ? "1fr 130px" : "1fr", columnGap: 18 }}>
        <F label="Staff name" v={q.staffName} big />
        {/* One code, one bag. It sits beside the name because that is the pair the counter matches. */}
        {q.code && <F label="Collection code" v={q.code} big />}
      </div>
      {shown.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={lb}>Garments — tick each one as it goes in the bag</div>
          <div style={{ border: "1.5px solid #201e1d", marginTop: 3, padding: "5px 8px", display: "grid", gridTemplateColumns: garments.length > 4 ? "1fr 1fr" : "1fr", columnGap: 18, rowGap: 3 }}>
            {shown.map((g, i) => <div key={i} style={{ fontSize: 12, fontWeight: 600 }}><CB label={g} on={false} /></div>)}
          </div>
          {spilled > 0 && <div style={{ fontSize: 10, fontWeight: 600, marginTop: 3 }}>+{spilled} more line{spilled === 1 ? "" : "s"} — see the request in ThreadCount.</div>}
        </div>
      )}
      {type === "delivery" ? (
        <>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1.4fr 1.4fr 0.5fr", columnGap: 18 }}><F label="Ward / Department" v={q.dept} /><F label="Deliver to (location on ward)" v={q.deliverTo} /><F label="Garments" v={q.sets} /></div>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr", columnGap: 18 }}><F label="PO / Order no." v={q.po} /><F label="Date received" v={q.dateReceived} /><F label="Requested by (manager / staff)" v={q.requestedBy} /></div>
          <div style={{ marginTop: 12, paddingTop: 8, borderTop: "2px solid #201e1d", display: "grid", gridTemplateColumns: "1fr 0.8fr 1.4fr", columnGap: 18 }}><F label="Delivered by" v={q.deliveredBy} /><F label="Date / time" v={q.dateTime} /><F label="Received on ward by (name + sign)" /></div>
        </>
      ) : (
        <>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", columnGap: 18 }}><F label="Ward / Department" v={q.dept} /><F label="Date received" v={q.dateReceived} /><F label="PO / Order no." v={q.po} /></div>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "0.5fr auto 1fr", alignItems: "end", columnGap: 18 }}>
            <F label="Garments" v={q.sets} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 5 }}><span style={lb}>Staff notified</span><CB label="Phone" on={q.notifiedPhone === "1"} /><CB label="Email" on={false} /></div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span style={{ ...lb, whiteSpace: "nowrap" }}>Date notified</span><div style={{ ...val(), flex: 1 }}>{q.dateNotified || " "}</div></div>
          </div>
          <div style={{ marginTop: 12, paddingTop: 8, borderTop: "2px solid #201e1d", display: "grid", gridTemplateColumns: "1.6fr 1fr", columnGap: 18 }}><F label="Collected by (signature)" /><F label="Date collected" /></div>
        </>
      )}
      <div style={{ marginTop: 8, fontSize: 9.5, fontWeight: 600, color: "#57534f" }}>{foot}</div>
    </div>
  );

  return (
    <div style={{ background: "#fff", color: "#201e1d", fontFamily: "var(--font-body)", minHeight: "100vh" }}>
      <style>{`@page{size:A4;margin:0} html,body{background:#fff !important} .sheet{width:210mm;min-height:${copies > 1 ? "297mm" : "auto"};padding:28px 44px 24px;margin:0 auto;display:flex;flex-direction:column;-webkit-print-color-adjust:exact;print-color-adjust:exact} .cut{display:flex;align-items:center;gap:8px;color:#a8a4a1;margin:10px 0} .cut div{flex:1;border-top:2px dashed #a8a4a1} @media print{.no-print{display:none !important}}`}</style>
      <div className="no-print" style={{ padding: "10px 16px", borderBottom: "2px solid #201e1d", display: "flex", gap: 12, alignItems: "center", fontSize: 13 }}>
        <b>{title}</b><span style={{ color: "#57534f" }}>Print preview — use your browser&apos;s print dialog if it didn&apos;t open.</span>
        <AutoPrint />
      </div>
      <div className="sheet">
        {Array.from({ length: copies }).map((_, i) => (
          <div key={i} style={{ display: "contents" }}>
            {i > 0 && <div className="cut"><span style={{ fontSize: 13 }}>✂</span><div /></div>}
            <Slip />
          </div>
        ))}
      </div>
    </div>
  );
}
