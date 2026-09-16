import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/staffsession";
import { catalogueData, damageData, notifyWays } from "@/lib/staffdata";
import DamageScreen from "@/components/screens/Damage";

export const dynamic = "force-dynamic";

export default async function MyDamage() {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");
  const [{ holdings }, { managerName }, ways] = await Promise.all([
    damageData(sess),
    catalogueData(sess),
    // The replacement half ends on the same Sent screen a request does, and that screen's one line
    // says how this person will actually hear — a phone, an email, or neither.
    notifyWays(sess),
  ]);
  return <DamageScreen holdings={holdings} managerName={managerName} notifyWays={ways} />;
}
