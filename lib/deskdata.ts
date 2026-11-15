import { prisma } from "./db";
import { availability, bagLines, linesSummary, reqLines } from "./staffdata";
import { facilityDate, facilityToday, garmentForGroup, garmentForStyle, isPantItem, isTopItem } from "./compute";
import { garmentCount } from "./staffreq";
import type { StaffSession } from "./staffsession";

/* What a manager raising for one of their own reports sees, and what the ward desk sees when the
 * trolley arrives.
 *
 * Neither list is the facility. The raise list is the manager's reporting line, and the round is
 * one ward's bags. Both queries start from that scope rather than filtering down to it, which is
 * the difference that matters the day somebody adds a search box.
 */

/** Who this manager raises for: their active reports, never themselves. */
const reportsOf = (sess: StaffSession) => ({ facilityId: sess.facilityId, managerId: sess.staffId, inactive: false, id: { not: sess.staffId } });

/** Everyone the raise screen may pick from: the people who name this manager as theirs, wherever
 *  those people happen to sit. That is the same relationship `request.create` enforces on the
 *  server and the same one that makes this person the approver — which is why the request they
 *  raise here goes up a level rather than back to them.
 *
 *  Each row carries the two things whoever is typing is least likely to know: what that person is
 *  holding right now, and the size the record last saw them in.
 *
 *  The awkward part is the hand-in: a garment handed back is gone from the person even though the
 *  issue row never says returned, and a copy of this that forgot it would tell a manager a nurse
 *  still holds three tunics she gave back a fortnight ago, and the request she needs would be
 *  declined as over allowance.
 *
 *  Every issue is read, not just the live ones: a returned garment is spent, but it is still the
 *  best evidence of what fits. Newest first, so the first row wins per garment. */

export async function teamPeople(sess: StaffSession) {
  const staff = await prisma.staff.findMany({
    where: reportsOf(sess),
    orderBy: [{ last: "asc" }, { first: "asc" }],
    select: {
      id: true, first: true, last: true, num: true, group: true, top: true, pants: true,
      account: { select: { id: true } },
    },
  });

  const ids = staff.map((s) => s.id);
  const issues = ids.length
    ? await prisma.issue.findMany({
        where: { staffId: { in: ids } },
        orderBy: { date: "desc" },
        select: { staffId: true, itemId: true, sizeIndex: true, qty: true, returnedDate: true, handedIn: true, item: { select: { sizes: true } } },
      })
    : [];
  const held = new Map<string, Record<string, number>>();
  const lastSizes = new Map<string, Record<string, string>>();
  for (const i of issues) {
    const sizes = lastSizes.get(i.staffId) || {};
    if (!(i.itemId in sizes)) sizes[i.itemId] = String(i.item.sizes[i.sizeIndex] ?? "");
    lastSizes.set(i.staffId, sizes);
    // Nobody has a locker — the uniform lives at their house — so "still holding it" is the only
    // thing this can mean, and a hand-in ends it just as surely as a return does.
    if (i.returnedDate || i.handedIn) continue;
    const mine = held.get(i.staffId) || {};
    mine[i.itemId] = (mine[i.itemId] || 0) + i.qty;
    held.set(i.staffId, mine);
  }

  return staff.map((s) => ({
    id: s.id,
    name: `${s.first} ${s.last}`.trim(),
    num: s.num,
    group: s.group,
    // The design surfaces this on the selected person: whoever is raising needs to know whether the
    // outcome will reach them directly or has to be passed on by hand.
    hasApp: !!s.account,
    recordedTop: s.top,
    recordedPants: s.pants,
    /** Garment id → how many they are holding right now. */
    held: held.get(s.id) || {},
    /** Garment id → the size of the last one they were issued, for everything the register has
     *  no recorded size for. */
    lastSizes: lastSizes.get(s.id) || {},
  }));
}

/** The garments the raise screen offers. The person is picked on the phone, after this list is
 *  drawn, so it cannot be one person's group: it is every garment that is for at least one of the
 *  people in teamPeople() — the same reporting line, so the two lists agree — plus the garments
 *  for every group. The same is asked of the cut: a garment is on the list if one of those people
 *  is offered it — which, for anybody blank or set to Either, is every cut. request.create still
 *  asks both questions of the one person picked, and refuses anything outside their group or their
 *  style. */
export async function deskCatalogue(sess: StaffSession) {
  const [all, reports] = await Promise.all([
    prisma.catalogItem.findMany({
      where: { facilityId: sess.facilityId, archived: false },
      orderBy: { sort: "asc" },
      select: { id: true, item: true, type: true, gender: true, sizes: true, groups: true },
    }),
    prisma.staff.findMany({ where: reportsOf(sess), select: { group: true, uniformStyle: true }, distinct: ["group", "uniformStyle"] }),
  ]);
  // A blank group is on nobody's list, so garmentForGroup(it, "") is true of an every-group garment
  // alone — which keeps those on the screen when this manager has no reports. The blank style beside
  // it is the one nobody has set, which is offered every cut, so that fallback hides nothing.
  //
  // Group and cut are asked of the SAME person, one pair at a time, rather than of two lists: a
  // manager with a man in Security and a woman in Nursing must not be offered the women's Nursing
  // tunic for him because somebody on their list is in Nursing and somebody is set to Women's.
  const people = [{ group: "", uniformStyle: "" }, ...reports];
  const items = all.filter((i) => people.some((r) => garmentForGroup(i, r.group) && garmentForStyle(i, r.uniformStyle)));
  const avail = await availability(sess.facilityId, items.map((i) => i.id));
  return items.map((i) => ({
    id: i.id, item: i.item, type: i.type, gender: i.gender,
    sizes: avail[i.id] || i.sizes.map((s, si) => ({ size: String(s), si, word: "none" as const, countedOn: "" })),
    recorded: "",
    isTop: isTopItem(i),
    isPant: isPantItem(i),
  }));
}

/** The label and meta `request.round` stamps on a bag when it goes out (lib/ops.ts). Request has
 *  no column saying which ward the trolley was sent to, so that event is the only durable record
 *  of it, and this screen is fenced on it rather than on where the wearer sits today. */
const ROUTED_TO_ROUND = "Out on the ward round";
const dueOn = (ward: string) => `Due on ${ward}`;

/** 2D. Three lists: what to sign, what nobody collected, and what has been signed today. */
export async function roundData(sess: StaffSession) {
  const me = await prisma.staff.findUniqueOrThrow({
    where: { id: sess.staffId },
    select: { dept: true, wardDesk: true, facility: { select: { timezone: true } } },
  });
  // A blank ward is not a ward. `dept` defaults to an empty string, so querying on it as-is hands
  // a clerk whose ward was never filled in the bags of every other ward-less person in the
  // facility — and the round they could sign for is fenced the same way in lib/staffops.ts, so the
  // screen would only be listing work it then refuses. There is no round without a ward.
  if (!me.wardDesk || !me.dept) return null;

  const rows = await prisma.request.findMany({
    where: {
      facilityId: sess.facilityId,
      // The ward the bag was left on, not the ward the wearer is on now. Selecting on
      // `subject.dept` made the bag follow the person: a nurse who transfers between the trolley
      // leaving and the desk signing took her bag with her on screen — off the round of the ward
      // it is physically sitting on, and onto a ward it never reached, where signing would stamp a
      // delivery, name a real signer and issue the garments against her for a handover that never
      // happened. Nothing edits a staff member's ward through this path, so it changes silently.
      // round.sign fences the same bag in lib/staffops.ts and the two have to agree on the ward,
      // or a bag is either signable by the wrong desk or signable by nobody.
      events: { some: { label: ROUTED_TO_ROUND, meta: dueOn(me.dept) } },
      OR: [{ status: "round" }, { status: "delivered", claimedAt: null }],
    },
    orderBy: { createdAt: "asc" },
    include: {
      lines: { include: { item: { select: { item: true, gender: true, sizes: true } } }, orderBy: { sort: "asc" } },
      subject: { select: { first: true, last: true } },
    },
  });

  // A bag on the round holds the approved lines and nothing else, which is exactly what bagLines()
  // hands back — a declined garment must never appear on a sheet somebody is about to sign for.
  const shape = (r: (typeof rows)[number]) => {
    const lines = bagLines(reqLines(r.lines));
    return {
      id: r.id, code: r.code,
      subjectName: `${r.subject.first} ${r.subject.last}`.trim(),
      lines, summary: linesSummary(lines), garments: garmentCount(lines), lineCount: lines.length,
      status: r.status, signerName: r.signerName, signedAt: r.signedAt?.toISOString() ?? null,
      claimedAt: r.claimedAt?.toISOString() ?? null,
      since: r.createdAt.toISOString(),
    };
  };

  // Which day a bag was signed for is a question about the ward's day, not the server's. Comparing
  // against the process's local midnight put every bag signed before the server's rollover into
  // "unclaimed from earlier rounds" — on a UTC host that is an entire Australian morning round,
  // filed as abandoned on the one screen whose job is telling this morning's work from stale bags.
  const tz = me.facility.timezone;
  const today = facilityToday(tz);
  const delivered = rows.filter((r) => r.status === "delivered");
  const signedOn = (r: (typeof rows)[number]) => (r.signedAt ? facilityDate(r.signedAt, tz) : "");

  return {
    ward: me.dept,
    toSign: rows.filter((r) => r.status === "round").map(shape),
    // Signed for on the ward on an earlier day and still nobody has taken it away.
    unclaimed: delivered.filter((r) => signedOn(r) !== "" && signedOn(r) < today).map(shape),
    signedToday: delivered.filter((r) => signedOn(r) >= today).map(shape),
  };
}
