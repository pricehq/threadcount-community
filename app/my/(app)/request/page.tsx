import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentStaff } from "@/lib/staffsession";
import { catalogueData } from "@/lib/staffdata";
import { REQUEST_MAX_LINES, REQUEST_MAX_QTY } from "@/lib/ops";
import RequestScreen from "@/components/screens/Request";

export const dynamic = "force-dynamic";

export default async function MyRequest({ searchParams }: { searchParams: Promise<{ swap?: string; item?: string; si?: string }> }) {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");
  const { swap, item, si } = await searchParams;

  const [{ items, managerName, holding, allowance }, held] = await Promise.all([
    catalogueData(sess),
    // handedIn as well as returnedDate, for the same reason the kit check reads both: a garment
    // handed back at the counter is off the person without ever being marked returned, and the
    // swap flow would otherwise offer to exchange something they no longer hold.
    prisma.issue.findMany({
      where: { staffId: sess.staffId, returnedDate: null, handedIn: null },
      select: { itemId: true }, distinct: ["itemId"],
    }),
  ]);

  // Only honour a pre-selection that actually exists in this facility's catalogue — the ids come
  // off a query string.
  const pre = items.find((i) => i.id === item) || null;
  const preSi = pre ? pre.sizes.find((s) => s.si === parseInt(String(si ?? ""), 10))?.si ?? null : null;

  return (
    <RequestScreen
      items={items}
      managerName={managerName}
      swap={swap === "1"}
      heldItemIds={held.map((h) => h.itemId)}
      preItemId={pre?.id ?? null}
      preSi={preSi}
      holding={holding}
      allowance={allowance}
      // The ceilings are the server's, handed down rather than restated in the browser: a screen
      // that let somebody build an eleventh line would only be showing them a refusal.
      maxLines={REQUEST_MAX_LINES}
      maxQty={REQUEST_MAX_QTY}
    />
  );
}
