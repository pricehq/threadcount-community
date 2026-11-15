"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { noteRev, useLiveRefresh } from "@/lib/live";
import { TRACKED_STAFF_OPS, failureKind, track } from "@/lib/analytics";
import { refreshPush } from "@/lib/staffpush";
import type { Terms } from "@/lib/terms";

/* The staff app's client context.
 *
 * Deliberately not SnapshotProvider. That one hands the whole facility to the browser, which is
 * right for a coordinator at the counter and wrong here: a wearer's device should never hold the
 * register, so each staff screen is server-rendered from its own narrow query and this context
 * carries only who you are, what is waiting for you, whether there is a signal, and how to post a
 * change.
 */

export type StaffMe = {
  staffId: string;
  name: string;
  first: string;
  num: string;
  ward: string;
  facility: string;
  /** The facility's own words for team, store, round and desk (lib/terms.ts), always complete. */
  terms: Terms;
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

/** The two badges on the tab bar, and the split the Team tabs need.
 *
 * `team` is the sum of `approvals` and `round` — one number for the tab, the two halves for the
 * tabs inside it, resolved once in the layout so a badge and the list it opens cannot disagree.
 * Nothing else in the app queries for a badge. */
export type StaffCounts = { orders: number; team: number; approvals: number; round: number };

type Ctx = {
  me: StaffMe;
  counts: StaffCounts;
  busy: boolean;
  /** Is there a signal? False after a send that never arrived, and while the browser says so. */
  online: boolean;
  refresh: () => void;
  /** Re-check the signal and reload. It never re-sends anything — see mutate(). */
  retry: () => void;
  mutate: <T = unknown>(op: string, payload?: unknown) => Promise<{ ok: true; result: T } | { ok: false; error: string }>;
};

const StaffContext = createContext<Ctx | null>(null);

export function StaffProvider({ me, counts, children }: { me: StaffMe; counts: StaffCounts; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [inflight, setInflight] = useState(0);
  /* Starts true, and is corrected by the effect below on the first paint.
   *
   * It cannot start from navigator.onLine: this provider is server-rendered, where there is no
   * navigator, and starting from a value the server cannot know would hydrate a different bar than
   * it painted. Nothing is lost by a beat of optimism — the first thing the effect does is ask. */
  const [online, setOnline] = useState(true);
  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

  useEffect(() => {
    const read = () => setOnline(typeof navigator === "undefined" || navigator.onLine !== false);
    read();
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    return () => {
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
    };
  }, []);

  const mutate = useCallback(async <T,>(op: string, payload?: unknown) => {
    setInflight((n) => n + 1);
    try {
      const r = await fetch("/api/staff/mutate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ op, payload }),
      });
      // The server answered, whatever it said: there is a signal.
      setOnline(true);
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
      setOnline(false);
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

  /* Retry asks whether there is a signal. It deliberately does NOT re-send.
   *
   * None of the staff ops are idempotent: a replayed request.create raises a second request and
   * emails the manager a second time, and a replayed round.sign issues garments twice. So the
   * honest refusal above stands — "we can't say whether that went through, check your orders" —
   * and this re-checks the connection and reloads the screen, which is what settles it. */
  const retry = useCallback(() => {
    void (async () => {
      try {
        const r = await fetch("/api/rev", { cache: "no-store" });
        if (!r.ok && r.status !== 401) return;
        setOnline(true);
        startTransition(() => router.refresh());
      } catch {
        setOnline(false);
      }
    })();
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

  /* Re-register this phone when the app opens, for somebody who turned notifications on earlier.
   *
   * FCM registration tokens rotate — a restore onto a new phone, a reinstall, Android's own
   * rotation — and a stale one is not an error anybody sees: notifications simply stop. So the
   * launch asks the shell for whatever token it has now and registers it, which also keeps the
   * row's last-seen date current.
   *
   * ⛔ It asks for nothing and prompts nobody. refreshPush() returns at once in a browser, in a
   * shell built without notification support, and for anybody who has never turned a switch on
   * (there is no remembered token to refresh) — a permission dialog at launch is the thing the
   * rules forbid. It lives here rather than on the Account screen because Account is opened once
   * a year, and a token that went stale in between would stay stale.
   */
  useEffect(() => {
    void refreshPush((token) => mutate("push.register", { token, platform: "android" }));
  }, [mutate]);

  const value = useMemo<Ctx>(
    () => ({ me, counts, busy: pending || inflight > 0, online, refresh, retry, mutate }),
    [me, counts, pending, inflight, online, refresh, retry, mutate],
  );
  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export function useStaff() {
  const c = useContext(StaffContext);
  if (!c) throw new Error("useStaff outside provider");
  return c;
}

/* A text draft that survives a dropped send and a screen change.
 *
 * Ward wifi drops mid-sentence, and the one thing worse than a message that did not send is a
 * message that did not send and is gone. sessionStorage rather than localStorage: this is the tab's
 * unfinished business, not a record, and it should not outlive the app being closed. Every access
 * is wrapped — a WebView in private mode throws on the property itself, and a lost draft must never
 * take the screen down with it.
 */
export function useDraft(key: string): { value: string; set: (v: string) => void; clear: () => void } {
  const k = `tc.draft.${key}`;
  const [value, setValue] = useState("");

  // Read after mount, never during render: the server has no sessionStorage, and a draft painted
  // on the server would hydrate as a mismatch.
  useEffect(() => {
    try { setValue(window.sessionStorage.getItem(k) || ""); } catch { /* private mode */ }
  }, [k]);

  const set = useCallback((v: string) => {
    setValue(v);
    try { window.sessionStorage.setItem(k, v); } catch { /* private mode */ }
  }, [k]);

  const clear = useCallback(() => {
    setValue("");
    try { window.sessionStorage.removeItem(k); } catch { /* private mode */ }
  }, [k]);

  return { value, set, clear };
}
