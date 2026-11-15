import { redirect } from "next/navigation";

/* A size exchange is Swap size on a Hand back line. */
export default async function ExchangeFor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/m/person/${encodeURIComponent(id)}?tab=back`);
}
