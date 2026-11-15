/* A part-finished shelf count, parked in the browser while it is being taken.
 *
 * The counting screen writes on every tap and the variance screen reads it back, so the two have to
 * agree on the key and the shape. They used to agree by importing a helper out of the page module,
 * which worked but put the contract in the wrong place; it lives here now so sign-out can reach it
 * too.
 *
 * Scoped to the person as well as the shelf. A counter phone sits on a bench and is shared: keyed
 * on the location alone, an abandoned half-count was pre-filled straight into the next person's
 * screen, and they would commit somebody else's tally under their own name without ever being told
 * a count was already open. The user id keeps them apart, and gives sign-out something it can
 * clear.
 *
 * This is a scratchpad, not a cache. ThreadCount is online-only; nothing here is ever the record,
 * and it is deleted the moment the count commits.
 */

const PREFIX = "tc.count.";

/** Where one person's open count of one shelf lives. */
export const countKey = (userId: string, locationId: string) => `${PREFIX}${userId}.${locationId}`;

export type OpenCount = {
  /** Counted quantity by variant key. */
  n: Record<string, number>;
  /** When the tally was last touched, so variance can say how old it is — a count resumed the next
   *  morning is a different thing from one still in your hand, and the screen should say which. */
  savedAt: string;
};

export function readCount(userId: string, locationId: string): OpenCount | null {
  try {
    const raw = localStorage.getItem(countKey(userId, locationId));
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return null;
    const o = v as Partial<OpenCount>;
    // Anything that isn't the current shape is treated as no count at all rather than half-read:
    // a tally is only worth restoring if it is whole, and starting from zero is honest.
    if (!o.n || typeof o.n !== "object") return null;
    const n: Record<string, number> = {};
    for (const k of Object.keys(o.n)) {
      const q = Math.floor(Number((o.n as Record<string, unknown>)[k]));
      if (Number.isFinite(q) && q > 0) n[k] = q;
    }
    return { n, savedAt: typeof o.savedAt === "string" ? o.savedAt : "" };
  } catch {
    // A cleared, blocked or full store just means there is no count to resume.
    return null;
  }
}

export function writeCount(userId: string, locationId: string, n: Record<string, number>) {
  try {
    localStorage.setItem(countKey(userId, locationId), JSON.stringify({ n, savedAt: new Date().toISOString() } satisfies OpenCount));
  } catch { /* nothing to do if the store is full or blocked — the count carries on in memory */ }
}

export function clearCount(userId: string, locationId: string) {
  try { localStorage.removeItem(countKey(userId, locationId)); } catch { /* already gone */ }
}

/** Everything this person has part-counted, on this device. Sign-out calls it: their tallies are
 *  theirs, and leaving them behind on a shared phone is the leak the per-person key exists to stop
 *  — the keys would otherwise sit there until the browser storage was cleared by hand. */
export function clearAllCounts(userId: string) {
  try {
    const mine = `${PREFIX}${userId}.`;
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(mine)) doomed.push(k);
    }
    for (const k of doomed) localStorage.removeItem(k);
  } catch { /* blocked store — there was nothing written to clear either */ }
}
