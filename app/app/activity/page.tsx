import { redirect } from "next/navigation";

/* The activity log now lives in Settings › Data & audit log. next.config.ts redirects this path as
 * well; this stub keeps old links working if that map ever changes. Query strings carry over. */
export default async function Activity({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "tab" || v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) q.append(k, one);
  }
  q.set("tab", "audit");
  redirect(`/app/settings?${q.toString()}`);
}
