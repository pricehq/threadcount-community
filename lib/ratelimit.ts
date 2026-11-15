// Small in-memory sliding-window limiter. Single-process deployment, so this is sufficient to blunt
// abuse (signup spam, photo floods, brute force) without external state. Keys are scoped by caller.
//
// Each bucket remembers the window it was created with, and the sweep uses that rather than the
// window of whoever happened to trigger it. The windows in use here run from 60 seconds to 24
// hours, and the 60-second one (/api/mutate) is by far the most frequent caller — so a sweep that
// used the caller's window would continuously evict the 15-minute sign-in lockouts and the 24-hour
// spam ceilings, which is the same as not having them.
type Bucket = { windowMs: number; hits: number[] };
const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

/** Returns true when the call is allowed; false once `max` calls have happened inside `windowMs`. */
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, b] of buckets) if (!b.hits.length || now - b.hits[b.hits.length - 1] > b.windowMs) buckets.delete(k);
  }
  // The window travels with the bucket: a key is always asked about with the same window by the
  // same caller, and taking the current one keeps a changed limit from being ignored until the
  // bucket empties.
  const prev = buckets.get(key);
  const hits = (prev?.hits || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) { buckets.set(key, { windowMs, hits }); return false; }
  hits.push(now); buckets.set(key, { windowMs, hits });
  return true;
}

/** True when the bucket is already at its limit, WITHOUT recording an attempt against it. */
export function over(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key)?.hits || []).filter((t) => now - t < windowMs);
  return hits.length >= max;
}

/** Record one against the bucket. Pairs with `over` for limits that only count failures. */
export function fail(key: string, windowMs: number): void {
  const now = Date.now();
  const hits = (buckets.get(key)?.hits || []).filter((t) => now - t < windowMs);
  hits.push(now);
  buckets.set(key, { windowMs, hits });
}

/* The auth routes count FAILURES, not attempts, and that distinction is what makes the numbers
 * defensible.
 *
 * Every wearer of a uniform in a hospital reaches this product from behind one NAT address, and
 * they all arrive at once at shift change. A ceiling on *attempts* per address therefore has to
 * choose between being a real brute-force defence and not locking out a ward on a Monday morning —
 * there is no number that does both. Counting only the attempts that failed removes the conflict:
 * six hundred nurses signing in successfully never touch the bucket, while an address producing
 * forty failures against forty different accounts is credential-stuffing and is stopped.
 *
 * Until the sweep bug above was fixed none of these ceilings was ever actually reached — every
 * bucket was forgotten within a minute — so their behaviour under a real deployment had never
 * been observed.
 */

/** Client IP as nginx reports it (last X-Forwarded-For entry is the one nginx appended). */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for")?.split(",").map((x) => x.trim()).filter(Boolean) || [];
  return xff[xff.length - 1] || headers.get("x-real-ip") || "local";
}
