import { redirect } from "next/navigation";

/* The order list is now the To order column on /app/orders. next.config.ts redirects as well; this
 * stub keeps an old bookmark working if that map ever changes. */
export default async function OrderListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) qs.append(k, x);
  const q = qs.toString();
  redirect(q ? `/app/orders?${q}` : "/app/orders");
}
