import { notFound, redirect } from "next/navigation";
import { currentStaff } from "@/lib/staffsession";
import { kitCheckData } from "@/lib/cycledata";
import KitCheckScreen from "@/components/screens/KitCheck";

export const dynamic = "force-dynamic";

export default async function MyKitCheck() {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");
  const data = await kitCheckData(sess);
  // Between rounds there is no screen. A kit check that was always reachable would be answered at
  // random times and the cycle's numbers would mean nothing.
  if (!data) notFound();
  return <KitCheckScreen dueBy={data.dueBy} lastConfirmed={data.lastConfirmed} rows={data.rows} />;
}
