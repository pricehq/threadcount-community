import { notFound, redirect } from "next/navigation";
import { currentStaff } from "@/lib/staffsession";
import { bagLines, requestData } from "@/lib/staffdata";
import CodeFullScreen from "@/components/screens/CodeFull";

export const dynamic = "force-dynamic";

/* The full-screen collection code.
 *
 * Fenced more narrowly than the order it belongs to, on purpose. requestData() lets the wearer's
 * manager, the clerk who raised it and the ward desk read an order — none of them collect the bag,
 * and the code is what a bag is handed over against, so this screen is the wearer's alone. A
 * request that is no longer `ready` has no code to show either: it has been collected, or it never
 * reached the counter. Both are refusals rather than an empty screen, for the reason every refusal
 * under /my is one — explaining would confirm what exists.
 */
export default async function MyOrderCode({ params }: { params: Promise<{ id: string }> }) {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");
  const { id } = await params;
  const data = await requestData(sess, id);
  if (!data) notFound();
  if (!data.mine || data.status !== "ready" || !data.collectCode) notFound();
  // What is actually in the bag: a declined line is not in it, and naming it at the counter starts
  // an argument with a clerk who cannot settle it.
  const lines = bagLines(data.lines).map((l) => ({ item: l.item, size: l.size, qty: l.qty }));
  return <CodeFullScreen id={data.id} code={data.collectCode} name={data.subjectName} lines={lines} />;
}
