import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/staffsession";
import { kitCheckData } from "@/lib/cycledata";
import KitCheckScreen from "@/components/screens/KitCheck";

export const dynamic = "force-dynamic";

export default async function MyKitCheck() {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");
  const data = await kitCheckData(sess);
  /* Between rounds this is a state, not a refusal. It used to be a 404, which told somebody who
   * had tapped a notification from the last round that the page did not exist — a refusal is for a
   * record that is not yours, and "no round is open right now" is neither secret nor their mistake.
   * The screen says so and offers the way back. */
  if (!data) return <KitCheckScreen closed />;
  return <KitCheckScreen dueBy={data.dueBy} lastConfirmed={data.lastConfirmed} rows={data.rows} />;
}
