import { redirect } from "next/navigation";

/* The stock take moved into Stock as its Count tab. next.config.ts redirects this path too; the
   stub keeps an old bookmark working (with its query) if that redirect is ever missing. */
export default async function StocktakeRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "tab") continue;
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else if (v !== undefined) q.append(k, v);
  }
  const rest = q.toString();
  redirect(`/app/stock?tab=count${rest ? "&" + rest : ""}`);
}
