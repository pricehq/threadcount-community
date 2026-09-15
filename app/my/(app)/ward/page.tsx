import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentStaff } from "@/lib/staffsession";
import { wardData } from "@/lib/managerdata";
import WardScreen from "@/components/screens/Ward";

export const dynamic = "force-dynamic";

export default async function MyWard() {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");
  const reports = await prisma.staff.count({ where: { managerId: sess.staffId } });
  if (!reports) notFound();
  const { ward, rows, anyCapped } = await wardData(sess);
  return <WardScreen ward={ward} rows={rows} anyCapped={anyCapped} />;
}
