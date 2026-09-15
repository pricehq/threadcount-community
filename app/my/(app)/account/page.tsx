import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/staffsession";
import AccountScreen from "@/components/screens/Account";

export const dynamic = "force-dynamic";

export default async function MyAccount() {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");
  return <AccountScreen email={sess.email} />;
}
