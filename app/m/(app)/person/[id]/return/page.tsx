import { redirect } from "next/navigation";

/* Returns are the Hand back segment of the person's record. */
export default async function ReturnFrom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/m/person/${encodeURIComponent(id)}?tab=back`);
}
