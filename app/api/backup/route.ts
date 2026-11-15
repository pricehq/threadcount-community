import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { exportBackup } from "@/lib/ops";
import { facilityToday } from "@/lib/compute";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const data = await exportBackup(user);
  // The date on the filename is the day where the linen room stands, not where the box is. It has
  // to agree with the lastBackup stamp exportBackup writes against the same facility, or a room
  // taking a backup at eight in the morning ends up with a file named for yesterday sitting beside
  // a settings screen that says it was taken today.
  const fac = await prisma.facility.findUniqueOrThrow({ where: { id: user.facilityId }, select: { timezone: true } });
  return new NextResponse(JSON.stringify(data, null, 1), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="threadcount-backup-${facilityToday(fac.timezone)}.json"`,
    },
  });
}
