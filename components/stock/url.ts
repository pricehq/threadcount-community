/* Filters on the Stock tabs live in the address, so a link or the help mark lands on the same view.
   replaceState keeps typing out of the history and Next keeps useSearchParams in step with it. */
export function setQuery(updates: Record<string, string | null | undefined>) {
  if (typeof window === "undefined") return;
  const u = new URL(window.location.href);
  for (const [k, v] of Object.entries(updates)) {
    if (v === null || v === undefined || v === "") u.searchParams.delete(k);
    else u.searchParams.set(k, v);
  }
  window.history.replaceState(null, "", u.pathname + u.search + u.hash);
}

/** Whole dollars for the stock table and totals: $1,008. */
export const wholeMoney = (n: number) => (n < 0 ? "−" : "") + "$" + Math.round(Math.abs(n || 0)).toLocaleString("en-AU");
