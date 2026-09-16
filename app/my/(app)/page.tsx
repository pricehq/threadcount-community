import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentStaff } from "@/lib/staffsession";
import { fmtDate, homeData } from "@/lib/staffdata";
import HomeScreen from "@/components/screens/Home";

export const dynamic = "force-dynamic";

/* Home asks two questions and then gets out of the way: what is on the way, and what you hold.
 *
 * The badges are NOT re-counted here. The (app) layout resolves them once for the tab bar, and the
 * banner at the top of this screen reads the same numbers off the context — a count per screen is
 * a second query and a second chance to disagree with the list it opens.
 */
export default async function MyHome() {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");

  const data = await homeData(sess);

  const [staff, issues, cycle, lastItem] = await Promise.all([
    prisma.staff.findUniqueOrThrow({ where: { id: sess.staffId }, select: { managerId: true } }),
    /* What they hold, grouped the way kitData() groups it — by garment and size, which is how
     * somebody thinks about their own uniform rather than as a list of issuing events.
     *
     * handedIn as well as returnedDate: a garment handed back at the counter never gets marked
     * returned, so fencing on returnedDate alone leaves it on the record for good. Every
     * equivalent query in lib/ reads both.
     *
     * ⛔ `cost` sits on this row and is never selected. No money reaches a wearer's screen. */
    prisma.issue.findMany({
      where: { staffId: sess.staffId, returnedDate: null, handedIn: null },
      orderBy: { date: "desc" },
      select: { date: true, qty: true, sizeIndex: true, item: { select: { id: true, item: true, sizes: true } } },
    }),
    prisma.kitCheck.findFirst({
      where: { facilityId: sess.facilityId, closedAt: null },
      orderBy: { openedAt: "desc" },
      select: { id: true },
    }),
    // The garment behind "Same again", for the tile's caption. The request screen re-checks it
    // against the catalogue before filling anything in; this is only the name to put on the tile.
    data.lastRequest
      ? prisma.catalogItem.findUnique({ where: { id: data.lastRequest.itemId }, select: { item: true } })
      : Promise.resolve(null),
  ]);

  // Who the ask would go to, by name. The empty state says it plainly, because "your manager" is
  // no help to somebody who has never been told who that is.
  const manager = staff.managerId
    ? await prisma.staff.findUnique({ where: { id: staff.managerId }, select: { first: true, last: true } })
    : null;

  const held = new Map<string, { item: string; size: string; qty: number; last: string }>();
  for (const i of issues) {
    const k = `${i.item.id}:${i.sizeIndex}`;
    const cur = held.get(k) || { item: i.item.item, size: String(i.item.sizes[i.sizeIndex] ?? i.sizeIndex), qty: 0, last: "" };
    cur.qty += i.qty;
    if (i.date > cur.last) cur.last = i.date;
    held.set(k, cur);
  }
  // Most recently issued first, which is the order the wearer last saw them in. Only three are
  // drawn: the section note carries the total, and My kit is where the whole record lives.
  const holdRows = [...held.values()]
    .sort((a, b) => b.last.localeCompare(a.last) || a.item.localeCompare(b.item))
    .slice(0, 3)
    .map((h) => ({ item: h.item, size: h.size, qty: h.qty, last: fmtDate(h.last) }));

  /* Only prompt for a cycle they still owe an answer to — somebody who finished last week should
   * not be nagged for the rest of the month, and somebody holding nothing has nothing to check. */
  let kitCheckOpen = false;
  if (cycle) {
    const answered = await prisma.kitCheckAnswer.count({ where: { kitCheckId: cycle.id, staffId: sess.staffId } });
    kitCheckOpen = issues.length > 0 && answered === 0;
  }

  return (
    <HomeScreen
      data={data}
      held={holdRows}
      lastItem={lastItem?.item || null}
      managerName={manager ? `${manager.first} ${manager.last}`.trim() : ""}
      kitCheckOpen={kitCheckOpen}
    />
  );
}
