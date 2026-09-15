import { prisma } from "./db";
import type { Prisma } from "@prisma/client";
import { facilityToday, garmentGroups, groupsLabel, key, type Snapshot } from "./compute";
import { AWAITING_HANDOVER } from "./staffreq";
import type { SessionUser } from "./session";
import { daysUntil, entitlements } from "./plan";
import { stripeConfigured } from "./stripe";
import { SWITCH_ROW } from "./switches";

/* How much history the snapshot carries.
 *
 * Both /app and /m rebuild this on every navigation and hand the whole thing to a client
 * component, so anything unbounded here is a payload that grows for the life of the facility and
 * is downloaded again on a ward phone at every tap. The collections below are read newest-first
 * and capped: each is shown as a list and nothing derives a balance from it, so an older row
 * falling off the end costs a line on a history screen, never a wrong number.
 *
 * Issues, stock movements and orders are deliberately NOT capped. On-hand is derived by replaying
 * every one of them (ledger() in lib/compute.ts), and a garment issued three years ago and never
 * handed back is still on that person's record — so a window over any of the three would quietly
 * misstate the one figure this product exists to keep.
 *
 * The numbers clear several years of a busy linen room, and hand-ins in particular are generous:
 * entUsed() credits a hand-in back against the allowance for the whole financial year, so that
 * window has to comfortably outlast one. */
const HISTORY_TAKE = { stocktakes: 200, handins: 5000, alterations: 500 };

/* The plan as the screens see it: the entitlements plus the dates, days and the billing contact —
 * the last for admins only, since it is a contact. `live` is the platform switch: until plans are
 * live the Plan tab stays out of Settings and the banner stays quiet, whatever the columns say. */
function planBlock(fac: Parameters<typeof entitlements>[0] & { billingEmail: string; billingLegalName: string; billingCountry: string; billingCadence: string; lastBackup: string; stripeSubscriptionId: string; org?: { id: string; name: string } | null }, staffCount: number, live: boolean, admin: boolean): Snapshot["plan"] {
  const e = entitlements(fac);
  return {
    code: e.code, label: e.label, state: e.state, readOnly: e.readOnly, maxStaff: e.maxStaff, staff: staffCount, backupDays: e.backupDays,
    endsAt: e.endsAt ? e.endsAt.toISOString() : null, daysLeft: daysUntil(e.endsAt),
    graceEndsAt: e.graceEndsAt ? e.graceEndsAt.toISOString() : null, graceDaysLeft: daysUntil(e.graceEndsAt),
    grandfathered: e.grandfathered, billingEmail: admin ? fac.billingEmail : "", live,
    // The card path: shown only when Stripe is configured on this instance; `card` says a
    // subscription exists, so the screen shows the Billing section instead of "Subscribe by card".
    cardsOn: stripeConfigured(), card: !!fac.stripeSubscriptionId,
    // What the checkout recorded, for the Plan screen's rows; admins only, like the contact.
    billingLegalName: admin ? fac.billingLegalName : "", billingCountry: admin ? fac.billingCountry : "", billingCadence: fac.billingCadence,
    org: fac.org ? { name: fac.org.name } : null,
    // Who invoices, once the entity exists (INVOICE_ENTITY / INVOICE_ABN); blank until then.
    invoicer: process.env.INVOICE_ENTITY ? `${process.env.INVOICE_ENTITY}${process.env.INVOICE_ABN ? ` · ABN ${process.env.INVOICE_ABN}` : ""}` : "",
  };
}

/** `db` may be a transaction client so callers holding a lock read through the same connection. */
export async function buildSnapshot(user: SessionUser, db: Prisma.TransactionClient | typeof prisma = prisma): Promise<Snapshot> {
  const fid = user.facilityId;
  const [fac, catalog, barcodes, stock, moves, depts, suppliers, staff, approvals, alterations, issues, orders, pickups, stocktakes, users, handins, locations, costs, owedLines, switchRow, noticeRow] = await Promise.all([
    db.facility.findUniqueOrThrow({ where: { id: fid }, include: { org: { select: { id: true, name: true, plan: true, planStatus: true, trialEndsAt: true, paidUntil: true } } } }),
    db.catalogItem.findMany({ where: { facilityId: fid }, orderBy: { sort: "asc" } }),
    db.barcode.findMany({ where: { facilityId: fid } }),
    db.stockLevel.findMany({ where: { facilityId: fid } }),
    db.stockMove.findMany({ where: { facilityId: fid }, orderBy: { createdAt: "asc" } }),
    db.department.findMany({ where: { facilityId: fid }, orderBy: [{ sort: "asc" }, { name: "asc" }] }),
    db.supplier.findMany({ where: { facilityId: fid }, orderBy: [{ sort: "asc" }, { name: "asc" }] }),
    db.staff.findMany({ where: { facilityId: fid }, orderBy: [{ last: "asc" }, { first: "asc" }], include: { account: { select: { email: true } } } }),
    db.approval.findMany({ where: { facilityId: fid }, orderBy: { createdAt: "asc" } }),
    db.alteration.findMany({ where: { facilityId: fid }, orderBy: { createdAt: "desc" }, take: HISTORY_TAKE.alterations }),
    db.issue.findMany({ where: { facilityId: fid }, orderBy: { createdAt: "asc" } }),
    db.order.findMany({
      where: { facilityId: fid },
      orderBy: { createdAt: "desc" },
      include: { lines: { orderBy: { sort: "asc" } }, receipts: { orderBy: { createdAt: "asc" }, include: { lines: true } } },
    }),
    // Only the pickups still waiting. Every screen that reads them — the call list, the rounds
    // screen, a staff record, both home pages — filters on `!pickedUp`, and one that has been
    // collected is already on the record as the Issue it created.
    db.pickup.findMany({ where: { facilityId: fid, pickedUp: null }, orderBy: { createdAt: "asc" }, include: { lines: true, order: { select: { code: true } } } }),
    db.stocktake.findMany({ where: { facilityId: fid }, orderBy: { createdAt: "desc" }, include: { lines: true }, take: HISTORY_TAKE.stocktakes }),
    user.role === "ADMIN"
      ? db.user.findMany({ where: { facilityId: fid }, orderBy: { createdAt: "asc" }, select: { id: true, email: true, first: true, last: true, title: true, role: true, inactive: true, ssoBreakGlass: true } })
      : Promise.resolve([]),
    db.handIn.findMany({ where: { facilityId: fid }, orderBy: { createdAt: "desc" }, include: { lines: true }, take: HISTORY_TAKE.handins }),
    db.location.findMany({ where: { facilityId: fid }, orderBy: [{ sort: "asc" }, { name: "asc" }] }),
    db.costChange.findMany({
      where: { facilityId: fid },
      orderBy: { at: "desc" },
      take: 400,
    }),
    // Garments a manager has approved that nobody has handed over yet. They are owed to that person,
    // so they count toward the six sets held on every screen exactly as the counter counts them.
    // Without them a staff record shows room the counter then refuses.
    db.requestLine.findMany({
      where: { status: "approved", request: { facilityId: fid, status: { in: AWAITING_HANDOVER } } },
      select: { itemId: true, qty: true, request: { select: { subjectId: true } } },
    }),
    // Read through `db`, not lib/switches.ts: callers inside lockedTx hold the one connection a
    // single-connection pool has, and a query on the global client would wait for it until the
    // transaction timed out. The environment's override is applied below, as switches() applies it.
    db.platformSwitch.findUnique({ where: { id: SWITCH_ROW }, select: { plansLive: true } }),
    // The ward notice posted from Settings, so the screen can show what is up right now.
    db.linenNotice.findFirst({ where: { facilityId: fid }, orderBy: { createdAt: "desc" }, select: { body: true, endsAt: true } }),
  ]);
  const plansLive = process.env.PLANS_LIVE === "1" || !!switchRow?.plansLive;

  const bc: Record<string, string> = {};
  for (const b of barcodes) bc[b.code] = key(b.itemId, b.sizeIndex);
  const st: Record<string, { opening: number; adj: number; reorder: number | null; preloved: number; supplierCode: string }> = {};
  for (const s of stock) st[key(s.itemId, s.sizeIndex)] = { opening: s.opening, adj: s.adj, reorder: s.reorder, preloved: s.preloved, supplierCode: s.supplierCode };
  const placed: Record<string, string> = {};
  for (const s of stock) if (s.locationId) placed[key(s.itemId, s.sizeIndex)] = s.locationId;

  return {
    session: { userId: user.id, name: `${user.first} ${user.last}`, first: user.first, last: user.last, title: user.title, role: user.role === "ADMIN" ? "Admin" : "Issuer", email: user.email },
    settings: {
      facility: fac.name, location: fac.location, coordinator: fac.coordinator,
      // The order form prints the linen room's own contacts in its footer, the way the collection
      // slip prints the facility's own name. Nothing about a customer's identity is written down in
      // the product, so if these are blank the form's footer is blank.
      coordinatorEmail: fac.coordinatorEmail, coordinatorPhone: fac.coordinatorPhone,
      checklistDismissed: fac.checklistDismissed,
      defaultEntitlement: fac.defaultEntitlement, defaultReorder: fac.defaultReorder,
      // capSets travels with initialSets because they are the two halves of the same question — what
      // a facility hands out to start with, and the most anybody may hold. Leave it out and the
      // coordinator's ceiling is saved but never reaches the screens that have to honour it. The two
      // route lists travel with them: which groups the FTE table proposes for, and which start on the
      // kit. Drop kitGroups and every group on it reads as manager approval, told it starts on
      // nothing while the counter still hands it the kit.
      initialSets: fac.initialSets, capSets: fac.capSets, nursingGroups: fac.nursingGroups, kitGroups: fac.kitGroups,
      exceptionHigh: fac.exceptionHigh, varianceReason: fac.varianceReason, glAccount: fac.glAccount, journalDesc: fac.journalDesc, lastBackup: fac.lastBackup, hasLogo: !!fac.logoData,
      suppliers: suppliers.map((x) => x.name), staffGroups: fac.staffGroups,
      slipCollectionFooter: fac.slipCollectionFooter, slipDeliveryFooter: fac.slipDeliveryFooter, slipOrg: fac.slipOrg,
      barcodeLookup: fac.barcodeLookup,
      timezone: fac.timezone,
      // The switches only; the IdP metadata lives in the SSO service and is read by its own route.
      sso: { enabled: fac.ssoEnabled, required: fac.ssoRequired, staff: fac.ssoStaff, domains: fac.ssoDomains },
    },
    // groups decides; group is only its label, kept because the phone counter's catalogue screens read it.
    catalog: catalog.map((c) => ({ id: c.id, sort: c.sort, item: c.item, gender: c.gender, type: c.type, sku: c.sku, supplier: c.supplier, cost: c.cost, groups: garmentGroups(c.groups), group: groupsLabel(c.groups), notes: c.notes, sizes: c.sizes, archived: c.archived })),
    barcodes: bc,
    stock: st,
    locations: locations.map((l) => ({ id: l.id, name: l.name, kind: l.kind, parentId: l.parentId, sort: l.sort, archived: l.archived })),
    placed,
    moves: moves.map((m) => ({ id: m.id, date: m.date, type: m.type, itemId: m.itemId, si: m.sizeIndex, qty: m.qty, reason: m.reason, byName: m.byName })),
    costs: costs.map((c) => ({ id: c.id, itemId: c.itemId, cost: c.cost, previous: c.previous, at: c.at.toISOString(), byName: c.byName })),
    depts: depts.map((d) => ({ id: d.id, name: d.name, cc: d.cc })),
    supplierDir: suppliers.map((x) => ({ id: x.id, name: x.name, contact: x.contact, phone: x.phone, account: x.account, email: x.email, lead: x.lead })),
    // selfCode is a boolean, never the code itself: an outstanding activation code is a credential,
    // and the snapshot is downloaded whole into every coordinator's browser. The code is shown once,
    // in the response to the op that made it, and then only exists on the printed slip.
    //
    // When it was printed is not a secret, and a screen needs it: slips expire (see the staleness
    // check in app/api/staff/activate/route.ts), so without the date a coordinator looking at an
    // outstanding code cannot tell a slip somebody will use tomorrow from one that died weeks ago
    // and is only ever going to send that person back to the counter.
    staff: staff.map((s) => ({ id: s.id, num: s.num, first: s.first, last: s.last, phone: s.phone, group: s.group, dept: s.dept, top: s.top, pants: s.pants, ccOverride: s.ccOverride, inactive: s.inactive, ent: s.ent, fte: s.fte, uniformStyle: s.uniformStyle, start: s.start, notes: s.notes, selfCode: !!s.activateCode, selfCodeAt: s.activateCodeAt ? s.activateCodeAt.toISOString() : null, selfEmail: s.account?.email ?? "", managerId: s.managerId, wardDesk: s.wardDesk })),
    // Both halves of "approved by" travel: the name as signed, and the link to the register row
    // it was picked from. The link is null on every approval recorded before the search existed and
    // on any approver who was never on the register, so nothing may assume it is there.
    approvals: approvals.map((a) => ({ id: a.id, staffId: a.staffId, date: a.date, by: a.byName, byStaffId: a.byStaffId, sets: a.sets, fte: a.fte, notes: a.notes, used: a.used, photoId: a.photoId })),
    alterations: alterations.map((a) => ({ id: a.id, staffId: a.staffId, date: a.date, garment: a.garment, desc: a.desc, status: a.status })),
    issues: issues.map((i) => ({
      id: i.id, date: i.date, staffId: i.staffId, itemId: i.itemId, si: i.sizeIndex, qty: i.qty, cond: i.cond, cost: i.cost, orderCode: i.orderCode,
      receipt: i.receipt, returned: i.returnedDate ? { date: i.returnedDate, cond: i.returnedCond || "", photoId: i.returnPhotoId } : null, override: i.override, direct: i.direct,
      preloved: i.preloved, handedIn: i.handedIn, createdAt: i.createdAt.toISOString(), offGroup: i.offGroup, offStyle: i.offStyle,
      overrideReason: i.overrideReason, slipId: i.slipId,
    })),
    orders: orders.map((o) => ({
      id: o.id, code: o.code, date: o.date, source: o.source, orderFor: o.orderFor, staffId: o.staffId, supplier: o.supplier, status: o.status,
      ref: o.ref, invoice: o.invoice, tracking: o.tracking, expected: o.expected, received: o.received, cc: o.cc, notes: o.notes, replenish: o.replenish, parentId: o.parentId,
      createdAt: o.createdAt.toISOString(),
      lines: o.lines.map((l) => ({ id: l.id, itemId: l.itemId, size: l.size, qty: l.qty })),
      receipts: o.receipts.map((r) => ({ id: r.id, date: r.date, invoice: r.invoice, note: r.note, photoId: r.photoId, lines: r.lines.map((x) => ({ itemId: x.itemId, size: x.size, qty: x.qty, dest: x.dest, cost: x.cost })) })),
    })),
    pickups: pickups.map((p) => ({ id: p.id, orderId: p.orderId, orderCode: p.order.code, staffId: p.staffId, received: p.received, contacted: p.contacted, pickedUp: p.pickedUp, deliveredTo: p.deliveredTo, sigId: p.sigId, proofId: p.proofId, deliveredRound: p.deliveredRound, lines: p.lines.map((l) => ({ itemId: l.itemId, size: l.size, qty: l.qty })) })),
    owedRequestLines: owedLines.map((l) => ({ staffId: l.request.subjectId, itemId: l.itemId, qty: l.qty })),
    handins: handins.map((h) => ({ id: h.id, date: h.date, staffId: h.staffId, by: h.byName, credit: h.credit, lines: h.lines.map((l) => ({ itemId: l.itemId, si: l.sizeIndex, qty: l.qty, cond: l.cond, laundered: l.laundered, credited: l.credited })) })),
    stocktakes: stocktakes.map((t) => ({ id: t.id, date: t.date, by: t.byName, counted: t.counted, variances: t.variances, mode: t.mode, locationId: t.locationId, lines: t.lines.map((l) => ({ itemId: l.itemId, si: l.sizeIndex, sys: l.sys, counted: l.counted, reason: l.reason })) })),
    users: users.map((u) => ({ id: u.id, email: u.email, first: u.first, last: u.last, title: u.title, role: u.role, inactive: u.inactive, ssoBreakGlass: u.ssoBreakGlass })),
    demo: fac.isDemo ? { resetAt: fac.demoResetAt ? fac.demoResetAt.toISOString() : null } : null,
    notice: noticeRow && (noticeRow.endsAt === "" || noticeRow.endsAt >= facilityToday(fac.timezone)) ? { body: noticeRow.body, endsAt: noticeRow.endsAt } : null,
    plan: planBlock(fac, staff.length, plansLive, user.role === "ADMIN"),
    // Everything downstream measures "today" against the facility's own zone, not the server's, so
    // the snapshot settles it once here and hands the zone out alongside it. `tz` is a copy of
    // settings.timezone, hoisted so a client component formatting a date need not thread settings in.
    today: facilityToday(fac.timezone),
    // When the facility was created: the dashboard checklist stops nagging a room that has been
    // running for two months.
    createdAt: fac.createdAt.toISOString(),
    tz: fac.timezone,
  };
}
