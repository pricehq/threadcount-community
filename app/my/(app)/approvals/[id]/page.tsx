import { notFound, redirect } from "next/navigation";
import { currentStaff } from "@/lib/staffsession";
import { reviewData } from "@/lib/managerdata";
import ReviewScreen from "@/components/screens/Review";

export const dynamic = "force-dynamic";

export default async function MyReview({ params }: { params: Promise<{ id: string }> }) {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");
  const { id } = await params;
  // reviewData starts from `managerId: sess.staffId`, so a request addressed to another manager
  // is not filtered out afterwards — it is never selected.
  const data = await reviewData(sess, id);
  if (!data) notFound();
  return <ReviewScreen data={data} />;
}
