import { notFound, redirect } from "next/navigation";
import { currentStaff } from "@/lib/staffsession";
import { roundData } from "@/lib/deskdata";
import { ordersData } from "@/lib/staffdata";
import RoundScreen from "@/components/screens/Round";

export const dynamic = "force-dynamic";

export default async function MyRound() {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");
  const data = await roundData(sess);
  if (!data) notFound();
  /* What this person raised for other people and hasn't seen the end of — as a manager for one
   * of their team, or, on an older request, from the desk route that no longer exists.
   *
   * The three lists above it are only ever about bags arriving today, so a request typed in on
   * Tuesday and approved on Thursday appears on no screen the raiser can reach until it turns up
   * on a trolley — which is why they rang the linen room to ask. It is deliberately the open ones
   * only: the round screen is a day's work, not an archive, and everything that has finished is
   * under Raised in Orders. */
  const { raised } = await ordersData(sess);
  return (
    <RoundScreen
      ward={data.ward}
      toSign={data.toSign}
      unclaimed={data.unclaimed}
      signedToday={data.signedToday}
      raised={raised.open}
    />
  );
}
