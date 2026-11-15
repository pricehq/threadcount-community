import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/staffsession";
import { kitData } from "@/lib/staffdata";
import KitScreen from "@/components/screens/Kit";

export const dynamic = "force-dynamic";

export default async function MyKit() {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");
  return <KitScreen data={await kitData(sess)} />;
}
