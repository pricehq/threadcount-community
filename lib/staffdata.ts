import { prisma } from "./db";
import {
  addDays, facilityDate, facilityToday, fmtDate, garmentForGroup, garmentForStyle, isKitGroup, isNursingGroup, isPantItem, isTopItem, key, ledger,
  onhand, reorderAt,
  type Snapshot,
} from "./compute";
import { allowance, capState, garmentCounts, setsHeld } from "./sets";
import {
  OPEN_REQUEST, approvedLines, decisionSummary, garmentCount, lineStatusLabel, roundWard, type StockWord,
  stockWord,
} from "./staffreq";
import { transactionalConfigured } from "./mail";
import { pushConfigured } from "./push";
import type { StaffSession } from "./staffsession";

/* Everything the staff screens read.
 *
 * No facility snapshot, anywhere. A wearer's screen has no business
 * holding the register, and the availability queries below are the one place that touches
 * facility-wide data — deliberately, narrowed to the garments being asked about, and only ever to
 * turn a count into a word.
 *
 * The one other reach across is four columns of settings — the site's two lists of which groups
 * take the FTE table and which the starting kit, its ceiling, and how many sets that kit is —
 * selected alongside the wearer's own row where an allowance is being worked out. Without them this
 * screen quotes the standing 3 at a site that issues 4, and cannot tell which route the wearer is
 * on, so it tells somebody owed a starting kit that they start on nothing.
 */

export type Availability = { size: string; si: number; word: StockWord; countedOn: string };

/** Stock as a ward is allowed to see it: words, never numbers.
 *
 * The count itself never leaves this function. That is the product rule and it is also the only
 * honest position — the linen room's count is the audited one, and a number on a ward screen just
 * starts an argument at the counter about whether the shelf really holds four. */
export async function availability(facilityId: string, itemIds: string[]): Promise<Record<string, Availability[]>> {
  if (!itemIds.length) return {};
  const [fac, items, levels, issues, receiptLines, moves, takes] = await Promise.all([
    prisma.facility.findUniqueOrThrow({ where: { id: facilityId }, select: { defaultReorder: true } }),
    prisma.catalogItem.findMany({ where: { id: { in: itemIds }, facilityId }, select: { id: true, sizes: true } }),
    prisma.stockLevel.findMany({ where: { facilityId, itemId: { in: itemIds } }, select: { itemId: true, sizeIndex: true, opening: true, adj: true, reorder: true, preloved: true } }),
    prisma.issue.findMany({ where: { facilityId, itemId: { in: itemIds } }, select: { itemId: true, sizeIndex: true, qty: true, direct: true, preloved: true, returnedDate: true, returnedCond: true } }),
    prisma.receiptLine.findMany({ where: { itemId: { in: itemIds }, receipt: { order: { facilityId } } }, select: { itemId: true, size: true, qty: true, dest: true } }),
    prisma.stockMove.findMany({ where: { facilityId, itemId: { in: itemIds } }, select: { itemId: true, sizeIndex: true, qty: true } }),
    prisma.stocktake.findMany({ where: { facilityId }, orderBy: { date: "desc" }, take: 40, select: { date: true, lines: { select: { itemId: true, sizeIndex: true } } } }),
  ]);

  const counted = new Map<string, string>();
  for (const t of takes) for (const l of t.lines) {
    const k = key(l.itemId, l.sizeIndex);
    if (!counted.has(k)) counted.set(k, t.date); // takes are newest-first, so the first wins
  }

  /* On hand is the linen room's number or it is a fiction.
   *
   * There is one on-hand expression in ThreadCount — ledger() and onhand() in lib/compute.ts:
   * opening plus adjustments, plus what shelf receipts and stock moves brought in, less what has
   * been issued, plus what came back in good condition. The word a ward is shown has to come from
   * that same arithmetic and not from a cheaper sum that happens to be easy to write here. A
   * second formula does not drift a little: this one told wards "None on shelf" for full bays,
   * because stock arriving against a supplier order never touches StockLevel at all.
   *
   * So rather than restate the sum, this loads the four things ledger() actually reads — the
   * catalogue, receipt lines, issues and stock moves — narrowed to the garments being asked
   * about, and hands them to the coordinator's own function. The cast is what that costs:
   * ledger() and onhand() take a whole Snapshot, and a wearer's screen has no business building
   * one. Neither function reads a field outside the ones set below.
   */
  const stock: Snapshot["stock"] = {};
  for (const l of levels) stock[key(l.itemId, l.sizeIndex)] = { opening: l.opening, adj: l.adj, reorder: l.reorder, preloved: l.preloved, supplierCode: "" };
  const scoped = {
    settings: { defaultReorder: fac.defaultReorder },
    catalog: items.map((i) => ({ id: i.id, sizes: i.sizes })),
    stock,
    issues: issues.map((i) => ({
      itemId: i.itemId, si: i.sizeIndex, qty: i.qty, direct: i.direct, preloved: i.preloved,
      returned: i.returnedDate ? { cond: i.returnedCond || "" } : null,
    })),
    orders: [{ receipts: [{ lines: receiptLines }] }],
    moves: moves.map((m) => ({ itemId: m.itemId, si: m.sizeIndex, qty: m.qty })),
  } as unknown as Snapshot;
  const L = ledger(scoped);

  const out: Record<string, Availability[]> = {};
  for (const it of items) {
    out[it.id] = it.sizes.map((size, si) => {
      const k = key(it.id, si);
      // reorderAt() falls back to the facility default, exactly as the linen room's own screens do.
      // Without that fallback a size with no per-size reorder level goes straight from "In stock"
      // to "None on shelf", and "Low" is a word the ward never once sees.
      return { size: String(size), si, word: stockWord(onhand(scoped, L, k), reorderAt(scoped, k)), countedOn: counted.get(k) || "" };
    });
  }
  return out;
}

/* ---------- a request, as a screen wants it ----------
 *
 * A request covers as many garments as the person needs, one line each, so every screen that used
 * to print "2 × Tunic — 16" off the request itself now walks a list. The shaping is here rather
 * than in each caller because the manager's queue, the wearer's orders, the ward round and the
 * linen room's queue all have to describe the same bag the same way — the day they disagree is the
 * day somebody signs for two garments and goes looking for a third.
 */
export type ReqLine = {
  id: string; itemId: string; item: string; size: string; si: number; qty: number;
  /** The cut, so a slip or a screen can tell two garments of the same name apart. Male | Female |
   *  Unisex, as stored — call genderLabel() for the words. */
  gender: string;
  /** awaiting | approved | declined, and the word for it. */
  status: string; statusLabel: string;
  declineReason: string | null;
};

type LineRecord = {
  id: string; itemId: string; sizeIndex: number; qty: number; status: string; declineReason: string | null;
  item: { item: string; gender: string; sizes: string[] };
};

export function reqLines(lines: readonly LineRecord[]): ReqLine[] {
  return lines.map((l) => ({
    id: l.id, itemId: l.itemId, item: l.item.item, gender: l.item.gender,
    size: String(l.item.sizes[l.sizeIndex] ?? l.sizeIndex), si: l.sizeIndex, qty: l.qty,
    status: l.status, statusLabel: lineStatusLabel(l.status), declineReason: l.declineReason,
  }));
}

/** The lines a row is actually about.
 *
 * Once the manager has left something to pick, that is the bag, and a declined fleece has no
 * business padding out the linen room's pick list or the wearer's "ready to collect" card. Before
 * a decision — and when every line was refused — there is no bag, so the whole ask is the subject.
 * The refusals are never hidden: they stay in `lines` with their own word and reason. */
export function bagLines(lines: readonly ReqLine[]): ReqLine[] {
  const picked = approvedLines(lines);
  return picked.length ? picked : [...lines];
}

/** The one-liner for a collapsed row. A single-garment request reads exactly as it always did; a
 *  longer one leads with the total, because "5 garments" is the thing somebody picking or carrying
 *  a bag needs before the names. */
export function linesSummary(lines: readonly ReqLine[]): string {
  const bag = bagLines(lines);
  if (!bag.length) return "";
  if (bag.length === 1) return `${bag[0].qty} × ${bag[0].item} — ${bag[0].size}`;
  const names = bag.slice(0, 3).map((l) => l.item);
  const rest = bag.length - names.length;
  return `${garmentCount(bag)} garments · ${names.join(", ")}${rest ? ` +${rest} more` : ""}`;
}

export type ReqRow = {
  id: string; code: string; status: string;
  lines: ReqLine[];
  /** The collapsed one-liner, and the totals behind it — all three about the bag, per bagLines(). */
  summary: string; garments: number; lineCount: number;
  /** "2 of 3 approved", or null while it is still with the manager. */
  decision: string | null;
  reason: string; note: string; managerName: string; declineReason: string | null;
  collectCode: string | null; holdUntil: string; route: string | null;
  signerName: string | null; signerRole: string | null;
  subjectName: string; raisedByName: string;
  /** The ward the bag was sent out to, per roundWard() — blank until it goes on a round. Never the
   *  wearer's current ward: that is what made a transferred nurse's order name the wrong desk. */
  ward: string;
  /** Is the viewer the wearer? False on a request they raised for somebody else. */
  mine: boolean;
  createdAt: string;
};

function reqRow(r: {
  id: string; code: string; status: string; reason: string; note: string; subjectId: string;
  managerName: string; declineReason: string | null;
  /** The four digits a bag is handed over against — null for anybody but the wearer. */
  collectCode: string | null; holdUntil: string;
  route: string | null; signerName: string | null; signerRole: string | null;
  raisedByName: string; createdAt: Date;
  lines: LineRecord[];
  events: readonly { label: string; meta: string }[];
  subject: { first: string; last: string };
}, viewerId: string): ReqRow {
  const lines = reqLines(r.lines);
  const bag = bagLines(lines);
  return {
    id: r.id, code: r.code, status: r.status,
    lines,
    summary: linesSummary(lines), garments: garmentCount(bag), lineCount: lines.length,
    decision: decisionSummary(lines),
    reason: r.reason, note: r.note, managerName: r.managerName, declineReason: r.declineReason,
    /* ⛔ The collection code goes to the wearer, and to nobody else.
     *
     * requestData() admits four parties to an order — the subject, the manager it is addressed to,
     * whoever raised it, and the ward desk physically holding the bag — and the code is what a bag
     * is handed over against. Handed to the other three, it put an approver's own walk to the
     * counter one tap away: exactly what /my/orders/[id]/code refuses, and what no notification
     * body carries. Settled in the row rather than on the screen, so no screen can leak it by
     * forgetting to ask. */
    collectCode: r.subjectId === viewerId ? r.collectCode : null, holdUntil: r.holdUntil, route: r.route,
    signerName: r.signerName, signerRole: r.signerRole,
    subjectName: `${r.subject.first} ${r.subject.last}`.trim(),
    raisedByName: r.raisedByName, ward: roundWard(r.events),
    mine: r.subjectId === viewerId,
    createdAt: r.createdAt.toISOString(),
  };
}

const REQ_INCLUDE = {
  lines: { include: { item: { select: { item: true, gender: true, sizes: true } } }, orderBy: { sort: "asc" } },
  subject: { select: { first: true, last: true } },
  // The timeline comes along on every order row because it is the only record of which ward a bag
  // was actually delivered to — see roundWard().
  events: { select: { label: true, meta: true } },
} as const;

/** How long a decline stays eligible for the home screen's one live card — and for the Orders
 *  badge, which counts the same window from this same constant (app/my/(app)/layout.tsx), so the
 *  card and the badge cannot tell two different stories about the same refusal. */
export const DECLINE_HEADLINE_DAYS = 7;

/** 1A Home. One live thing at the top, then shortcuts. */
export async function homeData(sess: StaffSession) {
  // The facility's own zone decides what "today" is here — which notice is still running, and how
  // recent a decline still counts as. The server's ambient zone gets no say in either.
  const fac = await prisma.facility.findUniqueOrThrow({ where: { id: sess.facilityId }, select: { name: true, timezone: true } });
  const today = facilityToday(fac.timezone);
  const [staff, reqs, raised, notice, holdings] = await Promise.all([
    prisma.staff.findUniqueOrThrow({
      where: { id: sess.staffId },
      select: { num: true, first: true, last: true, dept: true, group: true, top: true, pants: true, managerId: true, wardDesk: true },
    }),
    prisma.request.findMany({ where: { subjectId: sess.staffId }, orderBy: { createdAt: "desc" }, take: 25, include: REQ_INCLUDE }),
    /* What they raised for somebody else — a manager, for one of their own reports.
     *
     * Every list on this app starts from `subjectId`, so a request they raised appeared on no
     * screen they could reach. Keyed on `raisedByStaffId` instead, which also keeps the requests
     * raised from the old desk route in front of the person who typed them. It is not theirs to
     * collect, so it does not compete for the live card; it sits in its own list with the
     * wearer's name on it. */
    prisma.request.findMany({
      where: {
        facilityId: sess.facilityId, raisedByStaffId: sess.staffId,
        subjectId: { not: sess.staffId }, status: { in: [...OPEN_REQUEST] },
      },
      orderBy: { createdAt: "desc" }, take: 25, include: REQ_INCLUDE,
    }),
    prisma.linenNotice.findFirst({
      where: { facilityId: sess.facilityId, OR: [{ endsAt: "" }, { endsAt: { gte: today } }] },
      orderBy: { createdAt: "desc" },
    }),
    prisma.issue.aggregate({ where: { staffId: sess.staffId, returnedDate: null, handedIn: null }, _sum: { qty: true } }),
  ]);

  // "Furthest along" — the one the person most likely wants to act on. Ready to collect beats a
  // bag still out on the round, which beats something waiting on a manager.
  const RANK: Record<string, number> = { ready: 6, round: 5, picking: 4, accepted: 3, awaiting: 2, declined: 1 };
  // A decline is worth the top of the screen while it is news. Kept in the ranking forever it
  // becomes the permanent headline the moment every later request has finished — a refusal from
  // March greeting someone in September, with no way to dismiss it. After a week it lives in
  // Orders with everything else that is over.
  const declinedFrom = addDays(today, -DECLINE_HEADLINE_DAYS);
  const open = reqs.filter((r) => (
    OPEN_REQUEST.has(r.status as never)
    || (r.status === "declined" && facilityDate(r.decidedAt ?? r.createdAt, fac.timezone) >= declinedFrom)
  ));
  const live = open.sort((a, b) => (RANK[b.status] || 0) - (RANK[a.status] || 0))[0];

  /* What "Same again" fills in: the garment, size and reason of the most recent ask, whatever
   * became of it. Null when they have never asked for anything — the tile is drawn only when it
   * can be filled, because a shortcut that opens an empty screen is worse than no shortcut.
   *
   * The request screen re-checks the garment against catalogueData() before filling anything in:
   * a staff group, a uniform cut, an archived garment or a withdrawn size can all have moved since,
   * and filling in something the server would then refuse is worse than filling in nothing. */
  const recent = reqs[0];
  const firstLine = recent?.lines[0];
  const lastRequest = recent && firstLine
    ? { itemId: firstLine.itemId, si: firstLine.sizeIndex, reason: recent.reason, code: recent.code }
    : null;

  return {
    name: `${staff.first} ${staff.last}`.trim(),
    num: staff.num,
    ward: staff.dept,
    // Their staff group, which is what decides the garments they are offered and the allowance they
    // are measured against. It belongs beside the ward and the number on the identity block.
    group: staff.group,
    facility: fac.name,
    hasManager: !!staff.managerId,
    wardDesk: staff.wardDesk,
    holding: holdings._sum.qty || 0,
    live: live ? reqRow(live, sess.staffId) : null,
    openCount: open.filter((r) => OPEN_REQUEST.has(r.status as never)).length,
    raisedOpen: raised.map((r) => reqRow(r, sess.staffId)),
    lastRequest,
    notice: notice?.body || "",
  };
}

/** 1B My kit. */
export async function kitData(sess: StaffSession) {
  const staff = await prisma.staff.findUniqueOrThrow({
    where: { id: sess.staffId },
    select: { top: true, pants: true, facility: { select: { timezone: true } } },
  });
  const today = facilityToday(staff.facility.timezone);
  const fyFrom = (+today.slice(0, 4) - (+today.slice(5, 7) >= 7 ? 0 : 1)) + "-07-01";
  const issues = await prisma.issue.findMany({
    where: { staffId: sess.staffId },
    orderBy: [{ date: "desc" }],
    select: { id: true, date: true, qty: true, sizeIndex: true, returnedDate: true, returnedCond: true, handedIn: true, item: { select: { id: true, item: true, sizes: true } } },
  });

  // Grouped by garment and size, which is how someone thinks about what they have — not as a
  // list of issuing events.
  const held = new Map<string, { itemId: string; item: string; size: string; si: number; qty: number; last: string; labelIds: string[] }>();
  for (const i of issues) {
    // A hand-in takes the garment off the person without ever setting returnedDate — it joins the
    // pre-loved pool rather than coming back as a return — so skipping only returns left handed-in
    // garments on someone's record here for good, and offered them up to Report damage.
    if (i.returnedDate || i.handedIn) continue;
    const k = `${i.item.id}:${i.sizeIndex}`;
    const cur = held.get(k) || { itemId: i.item.id, item: i.item.item, size: String(i.item.sizes[i.sizeIndex] ?? i.sizeIndex), si: i.sizeIndex, qty: 0, last: "", labelIds: [] };
    cur.qty += i.qty;
    if (i.date > cur.last) cur.last = i.date;
    cur.labelIds.push(i.id);
    held.set(k, cur);
  }
  /* Handed back is both routes off a person's record, and is neither of the two write-offs.
   *
   * A garment brought to the counter is booked as a return and stamped returnedDate; a hand-in is
   * stamped handedIn and never returnedDate, because it joins the pre-loved pool rather than coming
   * back as a return. Counting returnedDate alone therefore told somebody who had carried five
   * garments in "Nothing handed back since 1 July" — the flat contradiction of what they had just
   * done at the counter, on the one screen they would check before arguing about it.
   *
   * Lost and Written Off also stamp returnedDate, and neither is a garment anybody handed back: one
   * never came home and the other was condemned. Crediting a person for them under that word would
   * be the same untruth in the other direction, so they are left out here. Nothing is hidden by it
   * — the write-off is on the linen room's record of the issue either way. */
  const handedBackThisYear = issues.filter((i) => (
    (i.handedIn && i.handedIn >= fyFrom)
    || (i.returnedDate && i.returnedDate >= fyFrom && i.returnedCond !== "Lost" && i.returnedCond !== "Written Off")
  )).reduce((n, i) => n + i.qty, 0);

  /* Signed slips sent to the staff app from the counter phone: the date, the garments, and whether
   * a signature is attached (served by /api/staff/slip/[id]/sig). No cost, no approver, nobody's
   * name — the money rule and the words rule both stand.
   *
   * ⚠ The quantity is the one deliberate exception, and it is narrow. This file used to expand a
   * line of three into three identical rows and called that the staff-app rule; it is not. The rule
   * is that a wearer is never shown the linen room's counts — what is on a shelf, what a ward holds
   * — and this is neither: it is their own hand-over, which they stood at the counter and signed.
   * Three identical lines under one date read as a bug in the app rather than as three trousers, so
   * the lines are grouped and counted here rather than in the screen. Nothing else on a wearer's
   * side of the app gains a number from this. */
  const slipRows = await prisma.slip.findMany({
    where: { staffId: sess.staffId, toStaff: true },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, date: true, sigId: true, lines: true },
  });
  const slipItemIds = [...new Set(slipRows.flatMap((r) => (Array.isArray(r.lines) ? r.lines : []).map((l) => String((l as { itemId?: unknown })?.itemId || ""))))].filter(Boolean);
  const slipItems = slipItemIds.length
    ? new Map((await prisma.catalogItem.findMany({ where: { id: { in: slipItemIds }, facilityId: sess.facilityId }, select: { id: true, item: true, sizes: true } })).map((i) => [i.id, i]))
    : new Map<string, { id: string; item: string; sizes: string[] }>();
  const slips = slipRows.map((r) => {
    // Grouped by garment and size, which is how the slip was signed: "3 × Navy trousers — 12".
    const byKey = new Map<string, { item: string; size: string; qty: number }>();
    for (const raw of Array.isArray(r.lines) ? r.lines : []) {
      const l = (raw || {}) as { itemId?: unknown; si?: unknown; qty?: unknown };
      const it = slipItems.get(String(l.itemId || ""));
      if (!it) continue;
      const si = Number(l.si) || 0;
      const n = Math.max(1, Math.min(50, Number(l.qty) || 1));
      const k = `${it.id}:${si}`;
      const cur = byKey.get(k) || { item: it.item, size: String(it.sizes[si] ?? si), qty: 0 };
      cur.qty += n;
      byKey.set(k, cur);
    }
    return { id: r.id, date: r.date, lines: [...byKey.values()], signed: !!r.sigId };
  });

  return {
    held: [...held.values()].sort((a, b) => a.item.localeCompare(b.item) || a.size.localeCompare(b.size)),
    total: [...held.values()].reduce((n, h) => n + h.qty, 0),
    handedBackThisYear,
    fyFrom,
    sizes: { top: staff.top, pants: staff.pants },
    slips,
  };
}

/** 1C Orders. */
export async function ordersData(sess: StaffSession) {
  const [reqs, raised] = await Promise.all([
    prisma.request.findMany({
      where: { subjectId: sess.staffId }, orderBy: { createdAt: "desc" }, include: REQ_INCLUDE,
    }),
    /* The requests this person raised for other people: a manager, for their own team, plus
     * anything still on the record from the old desk route. Keying on `raisedByStaffId` rather
     * than on a flag is what keeps those older ones reachable. They are deliberately not folded
     * into `open`/`done`: what a wearer does with their own order (collect it, chase it, confirm
     * they picked it up) is not what the person who typed it in does with it, and mixing the two
     * lists is how somebody collects a bag that is not theirs. Every row carries `subjectName`, so
     * the screen can say who it is for. */
    prisma.request.findMany({
      where: { facilityId: sess.facilityId, raisedByStaffId: sess.staffId, subjectId: { not: sess.staffId } },
      orderBy: { createdAt: "desc" }, include: REQ_INCLUDE,
    }),
  ]);
  const rows = reqs.map((r) => reqRow(r, sess.staffId));
  const raisedRows = raised.map((r) => reqRow(r, sess.staffId));
  const isOpen = (r: ReqRow) => OPEN_REQUEST.has(r.status as never);
  return {
    open: rows.filter(isOpen),
    done: rows.filter((r) => !isOpen(r)),
    raised: { open: raisedRows.filter(isOpen), done: raisedRows.filter((r) => !isOpen(r)) },
  };
}

/** 1D Order detail + 1F thread. Visible to the subject, their manager, or the clerk who raised it. */
export async function requestData(sess: StaffSession, id: string) {
  const [r, me] = await Promise.all([
    prisma.request.findFirst({
      where: { id, facilityId: sess.facilityId },
      include: { ...REQ_INCLUDE, events: { orderBy: { at: "asc" } }, messages: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.staff.findUnique({ where: { id: sess.staffId }, select: { dept: true, wardDesk: true } }),
  ]);
  if (!r) return null;
  /* The subject, their manager and whoever raised it — plus the desk that is physically holding
   * the bag. /my/round lists a delivered bag to the ward the trolley left it on and offers
   * "Nudge", which opens this order's thread; without this clause that desk got the 404 and the
   * nudge went nowhere. Same fence as round.sign and round.claim: the ward on the timeline, and a
   * blank ward matches nobody. */
  const party = r.subjectId === sess.staffId || r.managerId === sess.staffId || r.raisedByStaffId === sess.staffId;
  const onMyDesk = !!me?.wardDesk && !!me.dept.trim() && (r.status === "round" || r.status === "delivered") && roundWard(r.events) === me.dept;
  if (!party && !onMyDesk) return null;
  return {
    ...reqRow(r, sess.staffId),
    // Only this screen needs it: it is what decides whether the requester is still being asked to
    // confirm they picked the bag up off the ward desk, and the desk's unclaimed list is exactly
    // the delivered requests where it is still null.
    claimedAt: r.claimedAt?.toISOString() ?? null,
    events: r.events.map((e) => ({ id: e.id, label: e.label, meta: e.meta, actorName: e.actorName, at: e.at.toISOString() })),
    messages: r.messages.map((m) => ({ id: m.id, fromStaff: m.fromStaff, authorName: m.authorName, body: m.body, at: m.createdAt.toISOString() })),
    /* Has the linen room said something nobody on this side has opened yet?
     *
     * Read here and cleared by `request.read` when the thread is actually opened by somebody the
     * message was for. Nothing wrote `readAt` before this build, so `ThreadRow.unread` on the
     * Messages list went true the first time the linen room replied and stayed true for ever: an
     * accent edge that never goes out is an accent edge that means nothing. */
    unreadRoom: party && r.messages.some((m) => !m.fromStaff && !m.readAt),
  };
}

/** 1E New request, and 1H Shelf check — both need the catalogue with words against it, and the
 *  request screen also needs to tell the person what they already hold and what they are allowed. */
export async function catalogueData(sess: StaffSession) {
  const [catalog, staff, issues] = await Promise.all([
    prisma.catalogItem.findMany({
      where: { facilityId: sess.facilityId, archived: false },
      orderBy: { sort: "asc" },
      select: { id: true, item: true, type: true, gender: true, sizes: true, groups: true },
    }),
    prisma.staff.findUniqueOrThrow({ where: { id: sess.staffId }, select: { top: true, pants: true, group: true, uniformStyle: true, managerId: true, facility: { select: { nursingGroups: true, kitGroups: true, capSets: true, initialSets: true } } } }),
    /* Every issue, not just the ones still out. The live ones are what they hold; the returned and
     * handed-in ones are still the best evidence of what size fits them, which is the only thing
     * the record knows about a jacket or a fleece. Newest first so the first row wins per garment. */
    prisma.issue.findMany({
      where: { staffId: sess.staffId },
      orderBy: { date: "desc" },
      select: { itemId: true, sizeIndex: true, qty: true, returnedDate: true, handedIn: true, item: { select: { type: true, item: true, sizes: true } } },
    }),
  ]);
  // Their own staff group's garments and those for every group, in the cut they are offered — the
  // same two questions request.create asks before it refuses. Somebody set to Men's sees the men's
  // range and the unisex one; somebody set to Either, or whom nobody has set, sees every cut, which
  // is what everybody sees today. Nothing else, not even another group's or another cut's garment
  // they are holding from before the rule: a request for it is refused, and a damage replacement is
  // raised from the issue itself, not from this list.
  const items = catalog.filter((i) => garmentForGroup(i, staff.group) && garmentForStyle(i, staff.uniformStyle));
  const avail = await availability(sess.facilityId, items.map((i) => i.id));
  const manager = staff.managerId
    ? await prisma.staff.findUnique({ where: { id: staff.managerId }, select: { first: true, last: true } })
    : null;

  /* What they are holding, per garment and per size, and the size the record last saw them in.
   *
   * A hand-in takes a garment off somebody without ever marking it returned, so both have to be
   * excluded from the holdings or the screen tells a person they still have what they gave back. */
  const held = new Map<string, Map<number, number>>();
  const lastSize = new Map<string, string>();
  const holdings: { item: { type: string; item: string }; qty: number }[] = [];
  for (const i of issues) {
    if (!lastSize.has(i.itemId)) lastSize.set(i.itemId, String(i.item.sizes[i.sizeIndex] ?? ""));
    if (i.returnedDate || i.handedIn) continue;
    const bySize = held.get(i.itemId) || new Map<number, number>();
    bySize.set(i.sizeIndex, (bySize.get(i.sizeIndex) || 0) + i.qty);
    held.set(i.itemId, bySize);
    holdings.push({ item: i.item, qty: i.qty });
  }

  /* The same allowance sum the manager sees on the review screen, from the same function.
   *
   * Somebody can be declined "Over allowance" against a number their own app has never shown them,
   * which is the sort of refusal that gets a linen room a phone call rather than an apology. The
   * two screens have to agree, so neither one gets its own arithmetic. */
  const sets = setsHeld(holdings);
  const allow = allowance({
    group: staff.group,
    held: sets,
    // The person reading this screen is the person being measured, so their own group answers it.
    // Both answers are passed rather than left off: without them this screen and the manager's
    // review describe two different allowances, and the wearer is declined against the one they
    // were never shown. Leaving the starting-kit one off tells somebody owed a kit they start on
    // nothing.
    nursing: isNursingGroup(staff.facility.nursingGroups, staff.group),
    kit: isKitGroup(staff.facility.kitGroups, staff.group),
    capSets: staff.facility.capSets, startingSets: staff.facility.initialSets,
  });

  return {
    items: items.map((i) => {
      const bySize = held.get(i.id) || new Map<number, number>();
      /* Only tops and trousers have a size on the register, so a dress, a fleece or a vest has
       * always come up blank and the wearer guessed. The size of the last one they were issued is
       * what the record does know, and it is a better opening bid than nothing — `recordedSource`
       * says which it is so the screen can hint rather than assert. */
      const fromRecord = isTopItem(i) ? staff.top : isPantItem(i) ? staff.pants : "";
      const fromIssue = lastSize.get(i.id) || "";
      const recorded = fromRecord || fromIssue;
      const sizes: Availability[] = avail[i.id]
        || i.sizes.map((s, si) => ({ size: String(s), si, word: "none" as StockWord, countedOn: "" }));
      return {
        id: i.id, item: i.item, type: i.type, gender: i.gender,
        sizes: sizes.map((s) => ({ ...s, held: bySize.get(s.si) || 0 })),
        // Selecting a garment resets the size to the person's recorded size for that garment type.
        recorded,
        recordedSource: recorded ? (fromRecord ? ("record" as const) : ("issued" as const)) : ("" as const),
        held: [...bySize.values()].reduce((n, q) => n + q, 0),
      };
    }),
    managerName: manager ? `${manager.first} ${manager.last}`.trim() : "",
    // Deliberately the same two keys the manager's review screen returns, so the wearer reads the
    // sentence they will be judged on before they ask rather than in the decline.
    holding: { total: holdings.reduce((n, h) => n + h.qty, 0), sets },
    allowance: {
      capped: allow.capped,
      label: allow.capped ? `${allow.used} of ${allow.cap} sets` : `${staff.group || "This role"} — no fixed cap. Your manager's approval is the control.`,
      note: allow.note,
      /* Sets alone under-warn: the ceiling the hand-over applies (lib/sets.ts capState, the same
       * one capCheck uses at the counter) bites per half, so six tops and two pairs is "2 of 6
       * sets" here and yet the next top is refused or stamped as an override. Ask the ceiling's
       * own question as well, so the wearer is warned before they ask rather than after. */
      over: capState({ held: garmentCounts(holdings), capSets: staff.facility.capSets }).over
        || (allow.capped && allow.cap !== null && allow.used >= allow.cap),
    },
  };
}

/** 1G Report damage — their own holdings, each with the issue id the linen room can trace. */
export async function damageData(sess: StaffSession) {
  const issues = await prisma.issue.findMany({
    where: { staffId: sess.staffId, returnedDate: null, handedIn: null },
    orderBy: { date: "desc" },
    select: { id: true, date: true, qty: true, sizeIndex: true, item: { select: { id: true, item: true, sizes: true } } },
  });
  const staff = await prisma.staff.findUniqueOrThrow({ where: { id: sess.staffId }, select: { num: true } });
  const avail = await availability(sess.facilityId, [...new Set(issues.map((i) => i.item.id))]);
  return {
    holdings: issues.map((i) => ({
      issueId: i.id, itemId: i.item.id, item: i.item.item,
      size: String(i.item.sizes[i.sizeIndex] ?? i.sizeIndex), si: i.sizeIndex, qty: i.qty,
      // The label the linen room prints, so a garment in a hand can be matched to a row here.
      labelId: `TC-${staff.num}-${i.id.slice(-4).toUpperCase()}`,
      issued: fmtDate(i.date),
      replacement: (avail[i.item.id] || []).find((a) => a.si === i.sizeIndex)?.word ?? ("none" as StockWord),
    })),
  };
}

/* ---------- 1F Messages ----------
 *
 * There is no inbox and no direct messaging in this product: every message hangs off the request it
 * is about, which is what stops it becoming a chat app nobody staffs. This screen is therefore a
 * list of requests that have been talked about, newest word first — not a mailbox.
 */
export type ThreadRow = {
  id: string; code: string; status: string; summary: string;
  /** Whose uniform it is, for a thread on a request this person raised for somebody else. */
  subjectName: string; mine: boolean;
  last: { body: string; at: string; fromStaff: boolean };
  /** The linen room has written something nobody here has opened yet. */
  unread: boolean;
};

export async function messagesData(sess: StaffSession): Promise<{ threads: ThreadRow[]; startable: ReqRow[] }> {
  // Their own, and the ones they raised for somebody else — the same two lists Orders shows, for
  // the same reason: a manager who asked on a nurse's behalf is a party to that conversation.
  const theirs = { facilityId: sess.facilityId, OR: [{ subjectId: sess.staffId }, { raisedByStaffId: sess.staffId }] };

  /* The threads are found through the MESSAGES, not through the newest requests.
   *
   * Taking the sixty newest requests and keeping the ones that had been talked about capped this
   * screen by request age rather than by conversation: past sixty asks, a reply from the linen room
   * on an older order never appeared here at all, and nor did its unread edge — which is the only
   * unread signal in the app, since the nav badges count orders and team work. Reading the newest
   * messages first and then collecting the orders they hang off caps the list by the thing the
   * screen actually is: "newest word first". */
  const recent = await prisma.requestMessage.findMany({
    where: { request: theirs },
    orderBy: { createdAt: "desc" },
    take: 400,
    select: { requestId: true },
  });
  const threadIds = [...new Set(recent.map((m) => m.requestId))].slice(0, 60);

  const [talked, quiet] = await Promise.all([
    prisma.request.findMany({
      where: { id: { in: threadIds } },
      include: { ...REQ_INCLUDE, messages: { orderBy: { createdAt: "desc" } } },
    }),
    /* "Start one" lists OPEN requests with no thread, not every order without one. A question about
     * a bag collected in March is a question for the counter, and a list that offered it would be a
     * list of everything this person has ever asked for. */
    prisma.request.findMany({
      where: { ...theirs, status: { in: [...OPEN_REQUEST] }, messages: { none: {} } },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: REQ_INCLUDE,
    }),
  ]);

  const threads = talked
    .filter((r) => r.messages.length > 0)
    .map((r) => {
      const row = reqRow(r, sess.staffId);
      const last = r.messages[0];
      return {
        id: row.id, code: row.code, status: row.status, summary: row.summary,
        subjectName: row.subjectName, mine: row.mine,
        last: { body: last.body, at: last.createdAt.toISOString(), fromStaff: last.fromStaff },
        // Unread is only ever about what the linen room said: nobody needs a badge for their own words.
        unread: r.messages.some((m) => !m.fromStaff && !m.readAt),
      };
    })
    .sort((a, b) => b.last.at.localeCompare(a.last.at));

  return { threads, startable: quiet.map((r) => reqRow(r, sess.staffId)) };
}

/** How this person actually finds out what happened — read by the request screen, so that the line
 *  after a send says what is true on this server rather than what is usually true elsewhere. */
export async function notifyWays(sess: StaffSession): Promise<{ email: boolean; push: boolean }> {
  const configured = pushConfigured();
  const [acc, devices] = await Promise.all([
    prisma.staffAccount.findUnique({ where: { id: sess.accountId }, select: { email: true } }),
    // No point asking when nothing could be sent anyway.
    configured ? prisma.staffDevice.count({ where: { staffId: sess.staffId } }) : Promise.resolve(0),
  ]);
  return {
    // Same meaning as `notified` on a request: an email would actually go out, not merely that an
    // address exists.
    email: !!acc?.email && transactionalConfigured(),
    push: configured && devices > 0,
  };
}

export { fmtDate };
