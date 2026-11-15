import { prisma } from "./db";
import { availability } from "./staffdata";
import { facilityDate } from "./compute";
import { holdEndsAt, holdExpired } from "./staffreq";
import type { StaffSession } from "./staffsession";

/* The two periodic surfaces: the kit check cycle and the waitlist. */

/** 2A. Null when there is no cycle open — the screen shouldn't exist between rounds. */
export async function kitCheckData(sess: StaffSession) {
  const cycle = await prisma.kitCheck.findFirst({
    where: { facilityId: sess.facilityId, closedAt: null },
    orderBy: { openedAt: "desc" },
    select: { id: true, dueBy: true, facility: { select: { timezone: true } } },
  });
  if (!cycle) return null;

  const [issues, answers, previous] = await Promise.all([
    // handedIn, not just returnedDate: a garment handed back at the counter joins the pre-loved
    // pool without ever being marked returned, and asking someone to confirm they still hold it
    // is how a kit check teaches people the record is wrong.
    prisma.issue.findMany({
      where: { staffId: sess.staffId, returnedDate: null, handedIn: null },
      select: { qty: true, sizeIndex: true, item: { select: { id: true, item: true, sizes: true } } },
    }),
    prisma.kitCheckAnswer.findMany({
      where: { kitCheckId: cycle.id, staffId: sess.staffId },
      select: { itemId: true, sizeIndex: true, confirmed: true },
    }),
    // "Last confirmed" comes from the previous cycle they actually answered, not from the cycle
    // before this one — somebody who missed the last round should be told the truth.
    prisma.kitCheckAnswer.findFirst({
      where: { staffId: sess.staffId, kitCheckId: { not: cycle.id } },
      orderBy: { answeredAt: "desc" },
      select: { answeredAt: true },
    }),
  ]);

  const byKey = new Map<string, { itemId: string; item: string; size: string; si: number; onRecord: number }>();
  for (const i of issues) {
    const k = `${i.item.id}:${i.sizeIndex}`;
    const cur = byKey.get(k) || { itemId: i.item.id, item: i.item.item, size: String(i.item.sizes[i.sizeIndex] ?? i.sizeIndex), si: i.sizeIndex, onRecord: 0 };
    cur.onRecord += i.qty;
    byKey.set(k, cur);
  }
  const answered = new Map(answers.map((a) => [`${a.itemId}:${a.sizeIndex}`, a.confirmed]));

  return {
    dueBy: cycle.dueBy,
    lastConfirmed: previous ? facilityDate(previous.answeredAt, cycle.facility.timezone) : "",
    rows: [...byKey.values()]
      .sort((a, b) => a.item.localeCompare(b.item) || a.size.localeCompare(b.size))
      .map((r) => ({ ...r, answered: answered.has(`${r.itemId}:${r.si}`) ? answered.get(`${r.itemId}:${r.si}`)! : null })),
  };
}

/** 2B. Position is FIFO on join time, counting only people still waiting. */
export async function waitlistData(sess: StaffSession, itemId: string, si: number) {
  const item = await prisma.catalogItem.findFirst({
    where: { id: itemId, facilityId: sess.facilityId },
    select: { id: true, item: true, sizes: true },
  });
  if (!item || si < 0 || si >= item.sizes.length) return null;

  const [queue, mine, avail] = await Promise.all([
    prisma.waitlistEntry.findMany({
      where: { facilityId: sess.facilityId, itemId, sizeIndex: si, leftAt: null, acceptedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, staffId: true, createdAt: true, offeredAt: true },
    }),
    prisma.waitlistEntry.findFirst({ where: { staffId: sess.staffId, itemId, sizeIndex: si, leftAt: null }, select: { id: true, offeredAt: true, acceptedAt: true } }),
    availability(sess.facilityId, [itemId]),
  ]);

  const sizes = avail[itemId] || [];
  const mineIndex = queue.findIndex((q) => q.staffId === sess.staffId);
  const joined = mineIndex >= 0;

  return {
    itemId: item.id,
    item: item.item,
    size: String(item.sizes[si]),
    si,
    lastRestocked: sizes.find((s) => s.si === si)?.countedOn || "",
    // Already on the list: their real place. Not on it: the place they would take.
    position: joined ? mineIndex + 1 : queue.length + 1,
    ahead: joined ? mineIndex : queue.length,
    joined,
    entryId: mine?.id ?? null,
    offeredAt: mine?.offeredAt?.toISOString() ?? null,
    // The screen and the offer email both promise the garment is held for 48 hours, so the
    // deadline is computed rather than implied, and the screen is told when it has passed —
    // an offer bar that can no longer be accepted is worse than none.
    holdUntil: holdEndsAt(mine?.offeredAt ?? null)?.toISOString() ?? null,
    offerExpired: holdExpired(mine?.offeredAt ?? null),
    // Accepting raises a request and the entry stays put, so without this the screen keeps
    // offering "Accept it" for something already accepted and every tap is refused.
    acceptedAt: mine?.acceptedAt?.toISOString() ?? null,
    // Nearest sizes either way that are actually on the shelf — most people would rather have
    // something that fits approximately today.
    alternatives: sizes
      .filter((s) => s.si !== si && s.word !== "none")
      .sort((a, b) => Math.abs(a.si - si) - Math.abs(b.si - si))
      .slice(0, 3)
      .map((s) => ({ si: s.si, size: s.size, word: s.word })),
  };
}
