import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentStaff } from "@/lib/staffsession";
import { catalogueData, homeData, notifyWays } from "@/lib/staffdata";
import { REQUEST_MAX_LINES, REQUEST_MAX_QTY } from "@/lib/ops";
import { REQUEST_REASONS } from "@/lib/staffreq";
import RequestScreen from "@/components/screens/Request";

export const dynamic = "force-dynamic";

export default async function MyRequest({ searchParams }: {
  searchParams: Promise<{ swap?: string; item?: string; si?: string; again?: string }>;
}) {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");
  const { swap, item, si, again } = await searchParams;

  const [{ items, managerName, holding, allowance }, held, ways, last] = await Promise.all([
    catalogueData(sess),
    // handedIn as well as returnedDate, for the same reason the kit check reads both: a garment
    // handed back at the counter is off the person without ever being marked returned, and the
    // swap flow would otherwise offer to exchange something they no longer hold.
    prisma.issue.findMany({
      where: { staffId: sess.staffId, returnedDate: null, handedIn: null },
      select: { itemId: true }, distinct: ["itemId"],
    }),
    // What this server can really do, so the line after a send says what is true here rather than
    // what is usually true elsewhere.
    notifyWays(sess),
    // Same again: the garment, size and reason of their most recent ask. Read only when asked for.
    again === "1" ? homeData(sess).then((h) => h.lastRequest) : Promise.resolve(null),
  ]);

  // Only honour a pre-selection that actually exists in this facility's catalogue — the ids come
  // off a query string.
  const pre = items.find((i) => i.id === item) || null;
  const preSi = pre ? pre.sizes.find((s) => s.si === parseInt(String(si ?? ""), 10))?.si ?? null : null;

  /* A last request can name a garment this person may no longer ask for. catalogueData() filters by
   * staff group and uniform cut, either of which can have changed since, and the garment can have
   * been archived or lost that size. So the pre-fill is re-checked against the list this screen is
   * actually offering, and anything stale opens the screen empty with no line claiming it was
   * filled in: filling in something the server will then refuse is worse than filling in nothing. */
  const againItem = last ? items.find((i) => i.id === last.itemId) || null : null;
  const againSize = againItem && last ? againItem.sizes.find((s) => s.si === last.si) || null : null;
  const fresh = againItem && againSize ? { item: againItem, size: againSize, code: last!.code, reason: last!.reason } : null;

  const chosen = pre && preSi !== null ? { id: pre.id, si: preSi } : fresh ? { id: fresh.item.id, si: fresh.size.si } : null;

  return (
    <RequestScreen
      items={items}
      managerName={managerName}
      swap={swap === "1"}
      heldItemIds={held.map((h) => h.itemId)}
      preItemId={chosen?.id ?? null}
      preSi={chosen?.si ?? null}
      // A reason is only carried over from Same again, and only one of the four this screen offers:
      // the stored string is whatever the reason list said when that request was raised.
      preReason={!pre && fresh && REQUEST_REASONS.includes(fresh.reason as never) ? fresh.reason : null}
      filledFrom={!pre && fresh ? fresh.code : null}
      holding={holding}
      allowance={allowance}
      notifyWays={ways}
      // The ceilings are the server's, handed down rather than restated in the browser: a screen
      // that let somebody build an eleventh line would only be showing them a refusal.
      maxLines={REQUEST_MAX_LINES}
      maxQty={REQUEST_MAX_QTY}
    />
  );
}
