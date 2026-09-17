import { redirect } from "next/navigation";

/* Issue Stock became the Counter. Old links, bookmarks and badge scans keep their query string. */
export default async function IssueRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else if (v !== undefined) q.set(k, v);
  }
  const qs = q.toString();
  redirect(`/app/counter${qs ? `?${qs}` : ""}`);
}
