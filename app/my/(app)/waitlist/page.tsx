import { notFound, redirect } from "next/navigation";
import { currentStaff } from "@/lib/staffsession";
import { waitlistData } from "@/lib/cycledata";
import WaitlistScreen from "@/components/screens/Waitlist";

export const dynamic = "force-dynamic";

export default async function MyWaitlist({ searchParams }: { searchParams: Promise<{ item?: string; si?: string }> }) {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");
  const { item, si } = await searchParams;
  const data = await waitlistData(sess, String(item || ""), parseInt(String(si ?? "-1"), 10));
  if (!data) notFound();
  return <WaitlistScreen data={data} />;
}
