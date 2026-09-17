import { notFound, redirect } from "next/navigation";
import { currentStaff } from "@/lib/staffsession";
import { requestData } from "@/lib/staffdata";
import ThreadScreen from "@/components/screens/Thread";

export const dynamic = "force-dynamic";

export default async function MyOrderThread({ params }: { params: Promise<{ id: string }> }) {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");
  const { id } = await params;
  const data = await requestData(sess, id);
  if (!data) notFound();
  return <ThreadScreen data={data} />;
}
