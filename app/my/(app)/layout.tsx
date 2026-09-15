import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentStaff } from "@/lib/staffsession";
import { StaffProvider, type StaffMe } from "@/lib/staffclient";

export const dynamic = "force-dynamic";

/* Everything that needs a signed-in staff member.
 *
 * The role flags are resolved here, once, from the database rather than trusted from the client:
 * "am I a manager" is the answer to "does anybody name me as theirs", and a screen that asked the
 * browser that question would be asking the wrong party.
 */
export default async function StaffAppLayout({ children }: { children: React.ReactNode }) {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");

  const [staff, reports] = await Promise.all([
    prisma.staff.findUniqueOrThrow({
      where: { id: sess.staffId },
      select: { first: true, last: true, num: true, dept: true, wardDesk: true, managerId: true, facility: { select: { name: true, timezone: true } } },
    }),
    prisma.staff.count({ where: { managerId: sess.staffId, inactive: false } }),
  ]);

  const me: StaffMe = {
    staffId: sess.staffId,
    name: `${staff.first} ${staff.last}`.trim(),
    first: staff.first,
    num: staff.num,
    ward: staff.dept,
    facility: staff.facility.name,
    // Resolved here for the same reason the role flags are: it is the facility's answer, not the
    // phone's, and a device set to the wrong zone must not change what a ward round is told.
    tz: staff.facility.timezone,
    isManager: reports > 0,
    wardDesk: staff.wardDesk,
    hasManager: !!staff.managerId,
  };

  return <StaffProvider me={me}>{children}</StaffProvider>;
}
