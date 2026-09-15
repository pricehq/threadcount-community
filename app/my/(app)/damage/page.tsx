import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/staffsession";
import { catalogueData, damageData } from "@/lib/staffdata";
import DamageScreen from "@/components/screens/Damage";

export const dynamic = "force-dynamic";

export default async function MyDamage() {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");
  const [{ holdings }, { managerName }] = await Promise.all([damageData(sess), catalogueData(sess)]);
  return <DamageScreen holdings={holdings} managerName={managerName} />;
}
