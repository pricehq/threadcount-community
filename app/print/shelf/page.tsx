import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { locTrail, type LocationRec } from "@/lib/compute";
import { shelfLabelCode } from "@/lib/scanroute";
import AutoPrint from "@/components/AutoPrint";
import { barcodeSvg } from "@/lib/barcode";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

/* Shelf labels, 6 to an A4 sheet.
 *
 * A shelf label is Code 128 of `TCL-<location id>`. Scanned on the counter app's Scan tab it opens
 * that shelf's count. `?copies=` prints the same label several times (a shelf with two ends);
 * `?native=1` is the Android app's print path, which hands the page to the print service itself. */
export default async function ShelfLabelSheet({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await currentUser();
  if (!user) redirect("/auth");
  const q = await searchParams;
  const locationId = String(q.location || "").trim().slice(0, 64);
  const copies = Math.min(24, Math.max(1, parseInt(q.copies || "1", 10) || 1));
  const native = q.native === "1";
  if (!locationId) redirect("/m/count");

  const rows = await prisma.location.findMany({
    where: { facilityId: user.facilityId },
    select: { id: true, name: true, kind: true, parentId: true, sort: true, archived: true },
  });
  const loc = rows.find((l) => l.id === locationId && !l.archived);
  if (!loc) redirect("/m/count");
  const byId: Record<string, LocationRec> = Object.fromEntries(rows.map((l) => [l.id, l]));
  const trail = loc.parentId ? locTrail(byId, loc.parentId, 0) : "";
  const code = shelfLabelCode(loc.id);
  const svg = barcodeSvg(code, { module: 2, height: 58 });

  return (
    <div style={{ background: "#fff", color: "#201e1d", fontFamily: "var(--font-body)", minHeight: "100vh" }}>
      <style>{`@page{size:A4;margin:12mm} html,body{background:#fff !important} .sheet{display:grid;grid-template-columns:1fr 1fr;gap:6mm;padding:6mm 10mm 10mm} .lbl{-webkit-print-color-adjust:exact;print-color-adjust:exact} .lbl svg{width:100%;height:auto;display:block} @media print{.no-print{display:none !important}}`}</style>
      <div className="no-print" style={{ padding: "10px 16px", borderBottom: "2px solid #201e1d", display: "flex", gap: 12, alignItems: "center", fontSize: 13, flexWrap: "wrap" }}>
        <b>{copies} label{copies === 1 ? "" : "s"}</b>
        <span>{loc.name}</span>
        <span style={{ color: "#57534f", fontFamily: "var(--font-plex-mono), monospace" }}>{code}</span>
        {!native && <AutoPrint />}
      </div>
      <div className="sheet">
        {Array.from({ length: copies }, (_, i) => (
          <div key={i} className="lbl" style={{ border: "1.5px solid #201e1d", padding: "8mm 8mm", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, breakInside: "avoid", pageBreakInside: "avoid" }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em", textAlign: "center", lineHeight: 1.15 }}>{loc.name}</div>
            {trail && <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#57534f", textAlign: "center" }}>{trail}</div>}
            <div style={{ width: "100%" }} dangerouslySetInnerHTML={{ __html: svg }} />
            <div style={{ fontSize: 10, fontFamily: "var(--font-plex-mono), monospace", color: "#57534f" }}>{code}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
