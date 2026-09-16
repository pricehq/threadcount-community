import { redirect } from "next/navigation";

/* Search became the People tab (stock search is on the Stock tab). The query comes along. */
export default async function Search({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const term = typeof q.q === "string" ? q.q.trim().slice(0, 80) : "";
  redirect(term ? `/m/people?q=${encodeURIComponent(term)}` : "/m/people");
}
