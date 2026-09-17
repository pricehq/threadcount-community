/* One purchase order, loaded the way the sheet, the email and the CSV all need it: the supplier's
 * own product codes against each line, a unit cost, the facility's delivery details, and the
 * person it was ordered for when it was. Server only — reads the tables directly. */
import { prisma } from "./db";
import { garmentGroups, groupsLabel, label, money, fmtDate } from "./compute";

export type OrderDocLine = { code: string; description: string; size: string; qty: number; unit: number; total: number };
export type OrderDoc = {
  order: { id: string; code: string; date: string; status: string; ref: string; expected: string; notes: string; cc: string; emailedAt: Date | null; printedAt: Date | null };
  facility: { name: string; location: string; coordinator: string; coordinatorEmail: string; coordinatorPhone: string; slipOrg: string };
  supplier: { name: string; contact: string; phone: string; account: string; email: string; lead: number | null };
  staff: { name: string; dept: string; cc: string } | null;
  lines: OrderDocLine[];
  total: number;
};

export async function loadOrderDoc(facilityId: string, orderId: string): Promise<OrderDoc> {
  const o = await prisma.order.findFirstOrThrow({
    where: { id: orderId, facilityId },
    include: { lines: { orderBy: { sort: "asc" }, include: { item: true } }, staff: { select: { first: true, last: true, dept: true, ccOverride: true } } },
  });
  const [fac, sup, levels] = await Promise.all([
    prisma.facility.findUniqueOrThrow({ where: { id: facilityId }, select: { name: true, location: true, coordinator: true, coordinatorEmail: true, coordinatorPhone: true, slipOrg: true } }),
    prisma.supplier.findFirst({ where: { facilityId, name: o.supplier } }),
    prisma.stockLevel.findMany({ where: { itemId: { in: o.lines.map((l) => l.itemId) } }, select: { itemId: true, sizeIndex: true, supplierCode: true } }),
  ]);
  const codeOf = (itemId: string, si: number) => levels.find((l) => l.itemId === itemId && l.sizeIndex === si)?.supplierCode || "";
  const lines: OrderDocLine[] = o.lines.map((l) => {
    const it = l.item;
    const si = it.sizes.map(String).indexOf(l.size);
    const item = { id: it.id, sort: it.sort, item: it.item, gender: it.gender, type: it.type, sku: it.sku, supplier: it.supplier, cost: it.cost, groups: garmentGroups(it.groups), group: groupsLabel(it.groups), notes: it.notes, sizes: it.sizes, archived: it.archived };
    const unit = it.cost || 0;
    return { code: codeOf(it.id, si) || it.sku || "", description: label(item), size: l.size, qty: l.qty, unit, total: unit * l.qty };
  });
  return {
    order: { id: o.id, code: o.code, date: o.date, status: o.status, ref: o.ref, expected: o.expected, notes: o.notes, cc: o.cc, emailedAt: o.emailedAt, printedAt: o.printedAt },
    facility: fac,
    supplier: { name: o.supplier, contact: sup?.contact || "", phone: sup?.phone || "", account: sup?.account || "", email: sup?.email || "", lead: sup?.lead ?? null },
    staff: o.staff ? { name: `${o.staff.first} ${o.staff.last}`.trim(), dept: o.staff.dept, cc: o.cc || o.staff.ccOverride || "" } : null,
    lines,
    total: lines.reduce((t, l) => t + l.total, 0),
  };
}

/** The email a supplier receives: the same figures as the printed sheet, in the site's mail layout. */
export function supplierOrderEmail(d: OrderDoc): { subject: string; text: string; html: string } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { layout } = require("./mail-html.cjs") as { layout: (o: Record<string, unknown>) => string };
  const refBit = d.order.ref ? ` (${d.order.ref})` : "";
  const subject = `Purchase order ${d.order.code}${refBit} — ${d.facility.name}`;
  const rows: [string, string][] = [
    ["Order no.", d.order.code + refBit],
    ["Date", fmtDate(d.order.date)],
    ...(d.supplier.account ? [["Account", d.supplier.account] as [string, string]] : []),
    ["Deliver to", `${d.facility.name} · ${d.facility.location}`],
    ...(d.staff ? [["Ordered for", `${d.staff.name}${d.staff.dept ? ` · ${d.staff.dept}` : ""}${d.staff.cc ? ` · cost centre ${d.staff.cc}` : ""}`] as [string, string]] : []),
    ...(d.order.expected ? [["Expected", fmtDate(d.order.expected)] as [string, string]] : []),
  ];
  const textLines = d.lines.map((l) => `  ${l.code || "(no code)"}  ${l.description} · ${l.size} · qty ${l.qty}`);
  const text = [
    `Hello ${d.supplier.contact || d.supplier.name},`,
    `Please supply the following to ${d.facility.name}, ${d.facility.location}.`,
    rows.map(([k, v]) => `${k}: ${v}`).join("\n"),
    textLines.join("\n"),
    `Please quote order ${d.order.code} on the invoice.`,
    d.facility.coordinator ? `${d.facility.coordinator}${d.facility.coordinatorPhone ? ` · ${d.facility.coordinatorPhone}` : ""}\n${d.facility.name}` : d.facility.name,
  ].join("\n\n");
  const html = layout({
    eyebrow: "Purchase order",
    title: `Order ${d.order.code}${refBit}`,
    preheader: `${d.facility.name} — ${d.lines.length} line${d.lines.length === 1 ? "" : "s"}`,
    intro: [`Hello ${d.supplier.contact || d.supplier.name},`, `Please supply the following to ${d.facility.name}, ${d.facility.location}.`],
    rows,
    list: d.lines.map((l) => `${l.code || "no code"} · ${l.description} · ${l.size} · qty ${l.qty}`),
    closing: [`Please quote order ${d.order.code} on the invoice.${d.total ? ` Estimated value ${money(d.total)} ex tax at our last known unit costs.` : ""}`],
    footer: { facility: d.facility.name, contact: d.facility.coordinatorEmail || "", links: [] },
  });
  return { subject, text, html };
}
