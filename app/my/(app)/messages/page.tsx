import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/staffsession";
import { messagesData } from "@/lib/staffdata";
import MessagesScreen from "@/components/screens/Messages";

export const dynamic = "force-dynamic";

/** The screen behind the Messages tab. Empty is a state, not a refusal — see the (b4) table: there
 *  is nothing private about having said nothing yet, and the screen can say where a thread starts. */
export default async function MyMessages() {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");
  const { threads, startable } = await messagesData(sess);
  return <MessagesScreen threads={threads} startable={startable} />;
}
