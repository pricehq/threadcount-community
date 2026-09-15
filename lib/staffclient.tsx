"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { noteRev, useLiveRefresh } from "@/lib/live";
import { TRACKED_STAFF_OPS, failureKind, track } from "@/lib/analytics";

/* The staff app's client context.
 *
 * Deliberately not SnapshotProvider. That one hands the whole facility to the browser, which is
 * right for a coordinator at the counter and wrong here: a wearer's device should never hold the
 * register, so each staff screen is server-rendered from its own narrow query and this context
 * carries only who you are and how to post a change.
 */

export type StaffMe = {
  staffId: string;
  name: string;
  first: string;
  num: string;
  ward: string;
  facility: string;
  /* The facility's IANA zone, carried here so a screen can format a timestamp without a round trip.
   *
   * Every one of these screens is server-rendered and then hydrated, so a date formatted in whatever
   * zone the process happens to sit in is wrong twice: wrong on the server, different again in the
   * browser, and React logs a hydration mismatch in between. Pinning both to the facility's own zone
   * is what makes "signed 08:14" the same string in both places — and the right one. */
  tz: string;
  /** They manage at least one person, so the approvals queue is theirs to see. */
  isManager: boolean;
  /** They are on the ward desk, so they sign for the bags that arrive on the round. */
  wardDesk: boolean;
  /** Nobody is recorded as their approver yet, so they cannot raise a request. */
  hasManager: boolean;
};

type Ctx = {
  me: StaffMe;
  busy: boolean;
  refresh: () => void;
  mutate: <T = unknown>(op: string, payload?: unknown) => Promise<{ ok: true; result: T } | { ok: false; error: string }>;
};

const StaffContext = createContext<Ctx | null>(null);

export function StaffProvider({ me, children }: { me: StaffMe; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [inflight, setInflight] = useState(0);
  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

  const mutate = useCallback(async <T,>(op: string, payload?: unknown) => {
    setInflight((n) => n + 1);
    try {
      const r = await fetch("/api/staff/mutate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ op, payload }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        // A dead session on a ward phone is common — the app sits open in a pocket for days.
        if (r.status === 401) window.location.assign("/my/signin");
        const err = (j && j.error) || "That didn't work.";
        // Refusals are worth counting: a facility whose staff keep being told they have no
        // manager recorded is telling us something. The op name and a coarse category only.
        if (TRACKED_STAFF_OPS[op]) track("action_refused", { action: TRACKED_STAFF_OPS[op], reason: failureKind(String(err)) });
        return { ok: false as const, error: err };
      }
      // Ours, so the watch above recognises the new revision instead of firing again.
      noteRev(j.rev);
      startTransition(() => router.refresh());
      if (TRACKED_STAFF_OPS[op]) track(TRACKED_STAFF_OPS[op]);
      return { ok: true as const, result: j.result as T };
    } catch {
      if (TRACKED_STAFF_OPS[op]) track("action_refused", { action: TRACKED_STAFF_OPS[op], reason: "network" });
      /* "Nothing was saved" was a guess, and on ward wifi it was often the wrong one: the POST can
       * reach the server and commit before the reply gets back, and none of the staff ops are
       * idempotent — a retried request is raised twice and emails the manager twice. So the message
       * says what is actually known, and points at the screen that settles it. */
      return { ok: false as const, error: "No signal — we can’t say whether that went through. Check your orders before trying again." };
    } finally {
      setInflight((n) => n - 1);
    }
  }, [router]);

  /* Kept current, without re-reading the world to find out whether anything happened.
   *
   * Every screen here is server-rendered and none of them poll, so an app left open in a pocket
   * used to show whatever was true when it was last looked at — somebody watching "Being picked"
   * would never see it become "Ready to collect", and a garment the linen room added at the desk
   * did not exist here until the app was reopened.
   *
   * The watch asks one question — the facility's revision number — and only reloads when it has
   * moved. It stops entirely while the app is in the background, so a phone in a pocket on ward
   * wifi costs nothing, and asks immediately on coming back to the front, so opening the app is
   * up to date at once rather than a poll behind. It replaces an unconditional refresh on every
   * glance at the screen, which paid for the whole record to find out that nothing had changed.
   *
   * It lives in the provider rather than in each screen, so a screen added later gets it without
   * anyone remembering. */
  useLiveRefresh(refresh);

  const value = useMemo<Ctx>(() => ({ me, busy: pending || inflight > 0, refresh, mutate }), [me, pending, inflight, refresh, mutate]);
  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export function useStaff() {
  const c = useContext(StaffContext);
  if (!c) throw new Error("useStaff outside provider");
  return c;
}
