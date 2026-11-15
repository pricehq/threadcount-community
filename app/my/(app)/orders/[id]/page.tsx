import { notFound, redirect } from "next/navigation";
import { currentStaff } from "@/lib/staffsession";
import { requestData } from "@/lib/staffdata";
import OrderScreen from "@/components/screens/Order";

export const dynamic = "force-dynamic";

export default async function MyOrder({ params }: { params: Promise<{ id: string }> }) {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");
  const { id } = await params;
  const data = await requestData(sess, id);
  // A request that isn't theirs, their team's, or one they raised is a 404 rather than a 403 —
  // "you may not see this" confirms it exists.
  if (!data) notFound();
  return <OrderScreen data={data} />;
}
