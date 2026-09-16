import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentStaff } from "@/lib/staffsession";
import { pushConfigured } from "@/lib/push";
import AccountScreen from "@/components/screens/Account";

export const dynamic = "force-dynamic";

export default async function MyAccount() {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");

  // No row means every default, which is what the schema says and what the sender assumes. The
  // switches are read for this session's own staff member and for nobody else — notify.prefs
  // writes the same way, and takes no staffId at all.
  const pref = await prisma.staffNotifyPref.findUnique({ where: { staffId: sess.staffId } });

  return (
    <AccountScreen
      email={sess.email}
      prefs={{
        approved: pref?.approved ?? true,
        ready: pref?.ready ?? true,
        round: pref?.round ?? true,
        kitcheck: pref?.kitcheck ?? true,
        waiting: pref?.waiting ?? true,
      }}
      // Nothing can be sent at all without a key on the server, and the screen says so rather than
      // offering switches that would do nothing.
      pushReady={pushConfigured()}
    />
  );
}
