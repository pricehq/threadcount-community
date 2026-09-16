import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentStaff } from "@/lib/staffsession";
import { wardData } from "@/lib/managerdata";
import WardScreen from "@/components/screens/Ward";

export const dynamic = "force-dynamic";

export default async function MyWard() {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");
  /* The same fact, read the same way it is read everywhere else: active reports, in this facility.
   *
   * Counting deactivated people let this page render for somebody the rest of the app had decided
   * manages nobody — the layout's `isManager`, teamTabs(), wardData() and reportsOf() all filter
   * them out — so the Team shell drew itself with no tabs above an empty roster while the Team
   * item was missing from the bar. Two answers to "does this person manage anybody" inside one
   * screen is the defect; this is the answer the others give. */
  const reports = await prisma.staff.count({
    where: { facilityId: sess.facilityId, managerId: sess.staffId, inactive: false },
  });
  if (!reports) notFound();
  const { ward, rows, anyCapped } = await wardData(sess);
  return <WardScreen ward={ward} rows={rows} anyCapped={anyCapped} />;
}
