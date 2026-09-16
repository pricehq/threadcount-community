import { prisma } from "./db";
import { availability, bagLines, linesSummary, reqLines, type ReqLine } from "./staffdata";
import { addDays, facilityToday, isKitGroup, isNursingGroup } from "./compute";
import { allowance, capState, garmentCounts, setsHeld } from "./sets";
import { decisionSummary, garmentCount, stockLabel } from "./staffreq";
import type { StaffSession } from "./staffsession";

/* What a ward manager sees.
 *
 * Scoped to the people who name them as their manager, never to a ward or a facility. A manager
 * with nobody reporting to them sees nothing here, and a manager cannot reach a request addressed
 * to somebody else — the queries below take `managerId: sess.staffId` as their starting point
 * rather than filtering for it afterwards.
 */

export type QueueRow = {
  id: string; code: string; subjectName: string; subjectGroup: string; subjectNum: string;
  /** The whole ask, in the order it was entered. Nothing is decided yet on this screen, so every
   *  line is still `awaiting` and the summary describes all of them. */
  lines: ReqLine[]; summary: string; garments: number; lineCount: number;
  reason: string; note: string;
  raisedByName: string; createdAt: string;
};

export async function approvalQueue(sess: StaffSession): Promise<QueueRow[]> {
  const rows = await prisma.request.findMany({
    where: { managerId: sess.staffId, status: "awaiting" },
    orderBy: { createdAt: "asc" }, // oldest first: the person waiting longest is the point
    include: {
      lines: { include: { item: { select: { item: true, gender: true, sizes: true } } }, orderBy: { sort: "asc" } },
      subject: { select: { first: true, last: true, group: true, num: true } },
    },
  });
  return rows.map((r) => {
    const lines = reqLines(r.lines);
    return {
      id: r.id, code: r.code,
      subjectName: `${r.subject.first} ${r.subject.last}`.trim(),
      subjectGroup: r.subject.group, subjectNum: r.subject.num,
      lines, summary: linesSummary(lines), garments: garmentCount(bagLines(lines)), lineCount: lines.length,
      reason: r.reason, note: r.note, raisedByName: r.raisedByName,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

/** One line of a request, with the two facts a manager needs to judge that garment on its own:
 *  whether the shelf has it, and how many the person is already holding. */
export type ReviewLine = ReqLine & { stock: string; held: number; heldThisSize: number };

/** One request, with enough about the person to decide without leaving the screen.
 *
 * The decision is one action over the whole ask, but a manager may knock back individual garments
 * — the tunic and the trousers yes, the fleece no — so everything they would weigh up is returned
 * per line as well as per request. */
export async function reviewData(sess: StaffSession, id: string) {
  const r = await prisma.request.findFirst({
    where: { id, managerId: sess.staffId },
    include: {
      lines: { include: { item: { select: { item: true, gender: true, sizes: true } } }, orderBy: { sort: "asc" } },
      subject: { select: { id: true, first: true, last: true, group: true, num: true, dept: true } },
      // What the allowance sum needs from the register: which groups this site puts on the FTE table
      // and which on the starting kit, its ceiling, and how many sets that kit is. They ride along
      // with the request because they belong to the request's own facility, and because a review
      // screen that went and fetched them separately would be quoting settings a second query later.
      facility: { select: { nursingGroups: true, kitGroups: true, capSets: true, initialSets: true } },
    },
  });
  if (!r) return null;

  const itemIds = [...new Set(r.lines.map((l) => l.itemId))];
  const [holdings, approvedThisYear, avail] = await Promise.all([
    // A handed-in garment has left the person even though nothing marked it returned, and
    // counting them here reads as held *and* handed back at once — which pushes a nurse who did
    // exactly what she was asked to over her cap on the very screen that decides her request.
    prisma.issue.findMany({
      where: { staffId: r.subject.id, returnedDate: null, handedIn: null },
      select: { itemId: true, sizeIndex: true, qty: true, item: { select: { type: true, item: true } } },
    }),
    prisma.request.count({ where: { subjectId: r.subject.id, status: { not: "declined" }, decidedAt: { not: null } } }),
    availability(sess.facilityId, itemIds),
  ]);

  const held = holdings.reduce((n, h) => n + h.qty, 0);
  const sets = setsHeld(holdings);
  // Everything here is about the subject of the request, never about the manager reading it. A
  // manager's own group is often on a different route from her staff's, and testing hers instead
  // would describe somebody else's allowance to her. Both route answers go in: left without the
  // starting-kit one, a person whose group starts on a kit is read as starting on nothing.
  const allow = allowance({
    group: r.subject.group, held: sets,
    nursing: isNursingGroup(r.facility.nursingGroups, r.subject.group),
    kit: isKitGroup(r.facility.kitGroups, r.subject.group),
    capSets: r.facility.capSets, startingSets: r.facility.initialSets,
  });

  const lines = reqLines(r.lines);
  const reviewLines: ReviewLine[] = lines.map((l) => ({
    ...l,
    stock: stockLabel((avail[l.itemId] || []).find((a) => a.si === l.si)?.word ?? "none").toLowerCase(),
    // "Over allowance" is the commonest decline, and the manager should be able to see the reason
    // for it against the garment rather than work it out from the totals at the top of the screen.
    held: holdings.filter((h) => h.itemId === l.itemId).reduce((n, h) => n + h.qty, 0),
    heldThisSize: holdings.filter((h) => h.itemId === l.itemId && h.sizeIndex === l.si).reduce((n, h) => n + h.qty, 0),
  }));

  return {
    id: r.id, code: r.code,
    // The screen is reachable from a link in an e-mail as well as from the queue, so it can open
    // on a request somebody has already settled. It has to be able to tell.
    status: r.status,
    subject: {
      // The id, so the screen can tell "this is my own request" by identity rather than by staff
      // number — numbers are allowed blank on import, and two blanks are equal.
      id: r.subject.id,
      name: `${r.subject.first} ${r.subject.last}`.trim(),
      num: r.subject.num, group: r.subject.group, ward: r.subject.dept,
      held, sets, approvedThisYear,
    },
    lines: reviewLines,
    summary: linesSummary(lines), garments: garmentCount(bagLines(lines)), lineCount: lines.length,
    // Not null only when the manager has come back to a request they have already settled — the
    // screen is reachable after the decision, and it should say what the decision was.
    decision: decisionSummary(lines),
    reason: r.reason, note: r.note, raisedByName: r.raisedByName,
    allowance: {
      capped: allow.capped,
      // The manager is told the ceiling this person is measured against, and nothing is released by
      // anybody on the way up to it.
      label: allow.capped ? `${allow.used} of ${allow.cap} sets` : `${r.subject.group || "This role"} — no fixed cap. Your approval is the control.`,
      note: allow.note,
      // Per half as well as in sets — the ceiling the hand-over applies (lib/sets.ts capState).
      // Six tops and two pairs is "2 of 6 sets" and still one top away from an override stamp,
      // and the manager deciding a seventh top should see that here, not on the exceptions report.
      over: capState({ held: garmentCounts(holdings), capSets: r.facility.capSets }).over
        || (allow.capped && allow.cap !== null && allow.used >= allow.cap),
    },
  };
}

/** The ward view: who holds what, so a manager can see the shape of it. */
export async function wardData(sess: StaffSession) {
  const [me, team] = await Promise.all([
    prisma.staff.findUniqueOrThrow({ where: { id: sess.staffId }, select: { dept: true, facility: { select: { timezone: true, nursingGroups: true, kitGroups: true, capSets: true, initialSets: true } } } }),
    prisma.staff.findMany({
      where: { managerId: sess.staffId, inactive: false },
      orderBy: [{ last: "asc" }, { first: "asc" }],
      select: { id: true, first: true, last: true, group: true, start: true },
    }),
  ]);
  if (!team.length) return { ward: me.dept, rows: [], anyCapped: false };

  const ids = team.map((t) => t.id);
  const issues = await prisma.issue.findMany({
    where: { staffId: { in: ids }, returnedDate: null, handedIn: null },
    select: { staffId: true, qty: true, date: true, item: { select: { type: true, item: true } } },
  });

  const byStaff = new Map<string, { qty: number; last: string; lines: { item: { type: string; item: string }; qty: number }[] }>();
  for (const i of issues) {
    const cur = byStaff.get(i.staffId) || { qty: 0, last: "", lines: [] };
    cur.qty += i.qty;
    if (i.date > cur.last) cur.last = i.date;
    cur.lines.push({ item: i.item, qty: i.qty });
    byStaff.set(i.staffId, cur);
  }

  // `start` is a date somebody typed in the facility's own terms, so the 90-day boundary has to be
  // a date in those terms too. Derived from UTC it slides a day for however many hours the
  // facility's morning runs ahead of it, and the flag flickers on and off across a shift.
  const newStarterFrom = addDays(facilityToday(me.facility.timezone), -90);
  const rows = team.map((t) => {
    const mine = byStaff.get(t.id) || { qty: 0, last: "", lines: [] };
    const sets = setsHeld(mine.lines);
    // The row is the team member's, so the route is theirs — the manager's own group decides nothing
    // about what the people reporting to her may hold. The facility's lists and figures come off the
    // row already loaded above, rather than a query per person in a ward-sized loop.
    const allow = allowance({
      group: t.group, held: sets,
      nursing: isNursingGroup(me.facility.nursingGroups, t.group),
      kit: isKitGroup(me.facility.kitGroups, t.group),
      capSets: me.facility.capSets, startingSets: me.facility.initialSets,
    });
    return {
      id: t.id,
      name: `${t.first} ${t.last}`.trim(),
      group: t.group,
      held: mine.qty,
      lastIssued: mine.last,
      capped: allow.capped,
      setsLabel: allow.capped ? `${allow.used} of ${allow.cap} sets` : "",
      isNewStarter: !!t.start && mine.last !== "" && t.start >= newStarterFrom,
    };
  });

  return { ward: me.dept, rows, anyCapped: rows.some((r) => r.capped) };
}
