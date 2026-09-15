import { redirect } from "next/navigation";

/* The person's record opens on its Issue segment. */
export default async function IssueTo({ params }: { params: Promise<{ staffId: string }> }) {
  const { staffId } = await params;
  redirect(`/m/person/${encodeURIComponent(staffId)}`);
}
