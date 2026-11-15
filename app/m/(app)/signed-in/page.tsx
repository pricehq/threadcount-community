import { redirect } from "next/navigation";

/* The old signed-in welcome. Today is the first screen now; a brand-new facility gets its banner. */
export default async function SignedIn({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  redirect(q.new === "1" ? "/m?flash=created" : "/m");
}
