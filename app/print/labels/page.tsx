import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { buildSnapshot } from "@/lib/snapshot";
import { bcBound, itemMap, key, ledger, onhand } from "@/lib/compute";
import AutoPrint from "@/components/AutoPrint";
import { barcodeKind, barcodeSvg } from "@/lib/barcode";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

/* Garment labels, 6 to an A4 sheet.
 *
 * Two ways in. `?code=` prints one bound code a chosen number of times — the reprint, for a label
 * that has worn off. `?item=` prints a whole garment: every size that carries a code, once per
 * garment on the shelf, which is what labelling a rack of stock that arrived unlabelled actually
 * needs. Six size-14s in the cupboard means six size-14 labels, because each of those six shirts is
 * going to have one stuck on it.
 *
 * Only ever the code that is really bound to the size. ThreadCount's internal 93XXXXXXX fallback
 * appears on no garment, so printing it would put a barcode into the linen room that no scanner has
 * ever seen. */
export default async function LabelSheet({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await currentUser();
  if (!user) redirect("/auth");
  const q = await searchParams;
  const code = String(q.code || "").trim().slice(0, 64);
  const itemId = String(q.item || "").trim().slice(0, 64);
  const copies = Math.min(24, Math.max(1, parseInt(q.copies || "6", 10) || 6));
  const reason = String(q.reason || "").slice(0, 60);
  if (!code && !itemId) redirect("/app/stock");

  const fac = await prisma.facility.findUniqueOrThrow({ where: { id: user.facilityId } });
  const label = (it: { item: string; gender: string; sku: string }) =>
    it.item + (it.gender !== "Unisex" ? ` — ${it.gender}` : "");

  /** One entry per label to be printed, in size order. */
  type Row = { code: string; name: string; size: string; sku: string };
  const rows: Row[] = [];
  let heading = "";

  if (code) {
    const bc = await prisma.barcode.findUnique({
      where: { facilityId_code: { facilityId: user.facilityId, code } },
      include: { item: { select: { item: true, gender: true, sizes: true, sku: true } } },
    });
    if (!bc) redirect("/app/stock");
    const size = String(bc.item.sizes[bc.sizeIndex] ?? bc.sizeIndex);
    for (let i = 0; i < copies; i++) rows.push({ code, name: label(bc.item), size, sku: bc.item.sku });
    heading = `${label(bc.item)} · size ${size}`;
  } else {
    const it = await prisma.catalogItem.findFirst({
      where: { id: itemId, facilityId: user.facilityId },
      select: { id: true, item: true, gender: true, sizes: true, sku: true, barcodes: { select: { code: true, sizeIndex: true } } },
    });
    if (!it) redirect("/app/stock");
    /* How many of each. Read through the same ledger the rest of the product uses rather than
       summing stock rows here: a second on-hand expression is how a screen ends up disagreeing with
       the shelf, and this one decides how much paper comes out of the printer. */
    const snap = await buildSnapshot(user);
    const L = ledger(snap);
    /* Go size by size, not code by code. A size can end up carrying more than one Barcode row — the
       supplier re-labels a range, the new code is scanned onto a size that already carries one and
       the old row survives — so walking the rows printed that size twice over, half of it in the
       code the linen room had just replaced. One garment on the shelf gets one label. The code that
       prints is the one bcBound() picks, which is the code the size's own screens show, so the
       sheet and the screen can never name different numbers for the same size. */
    const snapItem = itemMap(snap)[it.id];
    const bySize = new Map<number, string>();
    for (const b of it.barcodes) if (!bySize.has(b.sizeIndex)) bySize.set(b.sizeIndex, b.code);
    for (const si of [...bySize.keys()].sort((a, z) => a - z)) {
      const code = (snapItem ? bcBound(snap, snapItem, si) : "") || bySize.get(si)!;
      const n = Math.max(0, onhand(snap, L, key(it.id, si)));
      const size = String(it.sizes[si] ?? si);
      for (let i = 0; i < n; i++) rows.push({ code, name: label(it), size, sku: it.sku });
    }
    heading = label(it);
    // Nothing on the shelf, or no size labelled yet: say which, rather than printing a blank sheet.
    if (!rows.length) {
      return (
        <div style={{ background: "#fff", color: "#201e1d", padding: 32, fontFamily: "var(--font-body)" }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{heading}</h1>
          <p style={{ marginTop: 12, maxWidth: "60ch", lineHeight: 1.6 }}>
            {it.barcodes.length === 0
              ? "No size on this garment has a barcode yet, so there is nothing to print. Generate barcodes for it first."
              : "There is nothing on the shelf to label — every size with a barcode is showing zero on hand. Count some in, or print a single size from its own page."}
          </p>
        </div>
      );
    }
  }

  const X_NOMINAL = 0.33;  // EAN-13 at 100% magnification
  const X_MIN = 0.25;      // below this a hand scanner starts refusing the symbol
  const LABEL_MM = 62;     // printable width inside one cell, see below

  /* barcodeSvg sizes itself in CSS pixels at whatever module width it was handed, which says nothing
     about how wide the symbol lands on paper. A 12-digit UPC-A or an alphanumeric supplier asset tag
     is not a valid EAN-13, so it falls through to Code 128 — half as wide again as the EAN-13 this
     sheet was laid out around — and at a fixed pixel width it printed past the edge of its label and
     pushed the second column off the page. So the sheet works the other way round: read back how
     many modules the symbol actually has, then pick the widest X-dimension that still fits the label,
     capped at the 0.33mm EAN-13 nominal so a short code isn't blown up to fill the cell.

     LABEL_MM is the printable width inside one cell: A4 210mm, less the 12mm @page margins, less the
     sheet's 10mm side padding, less the 6mm gutter, halved, less the 8mm padding inside the label —
     rounded down to leave the border somewhere to sit. */
  const drawn = new Map<string, { svg: string; printMm: number; xDim: number }>();
  for (const r of rows) {
    if (drawn.has(r.code)) continue;
    const svg = barcodeSvg(r.code, { module: 2, height: 58 });
    const modules = Math.round(parseFloat(/width="([\d.]+)"/.exec(svg)?.[1] || "0") / 2);
    const xDim = modules > 0 ? Math.min(X_NOMINAL, LABEL_MM / modules) : X_NOMINAL;
    drawn.set(r.code, { svg, printMm: modules * xDim, xDim });
  }
  const tooSmall = [...drawn.entries()].filter(([, d]) => d.xDim < X_MIN).length;

  return (
    <div style={{ background: "#fff", color: "#201e1d", fontFamily: "var(--font-body)", minHeight: "100vh" }}>
      <style>{`@page{size:A4;margin:12mm} html,body{background:#fff !important} .sheet{display:grid;grid-template-columns:1fr 1fr;gap:6mm;padding:6mm 10mm 10mm} .lbl{-webkit-print-color-adjust:exact;print-color-adjust:exact} .lbl svg{width:100%;height:auto;display:block} @media print{.no-print{display:none !important}}`}</style>
      <div className="no-print" style={{ padding: "10px 16px", borderBottom: "2px solid #201e1d", display: "flex", gap: 12, alignItems: "center", fontSize: 13, flexWrap: "wrap" }}>
        <b>{rows.length} label{rows.length === 1 ? "" : "s"}</b>
        <span>{heading}</span>
        {code && <span style={{ color: "#57534f" }}>{code} · {barcodeKind(code)}</span>}
        {itemId && <span style={{ color: "#57534f" }}>one per garment on hand, {drawn.size} size{drawn.size === 1 ? "" : "s"}</span>}
        {reason && <span style={{ color: "#57534f" }}>Reason: {reason}</span>}
        {/* A symbol squeezed below about 0.25mm per module is printed but not reliably readable, and
            finding that out at the shelf with a scanner in your hand is the wrong place to find out. */}
        {tooSmall > 0 && <b style={{ color: "#b8240e" }}>{tooSmall === 1 ? "One code is" : `${tooSmall} codes are`} too long to print at a scannable size on this label — bind a shorter code, or print on a wider label from your own stationery.</b>}
        {/* ?native=1 is the Android app's print path: it hands the page to the print service itself. */}
        {q.native !== "1" && <AutoPrint />}
      </div>
      <div className="sheet">
        {rows.map((r, i) => {
          const d = drawn.get(r.code)!;
          return (
            <div key={i} className="lbl" style={{ border: "1.5px solid #201e1d", padding: "10mm 8mm", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, breakInside: "avoid", pageBreakInside: "avoid" }}>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-0.01em", textAlign: "center", lineHeight: 1.2 }}>{r.name}</div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#57534f" }}>Size {r.size}{r.sku ? ` · ${r.sku}` : ""}</div>
              <div style={{ width: `${d.printMm}mm`, maxWidth: "100%" }} dangerouslySetInnerHTML={{ __html: d.svg }} />
              <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7a7573" }}>{fac.slipOrg || fac.name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
