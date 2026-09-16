"use client";
import { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { itemMap, ledger, staffMap, variantList, type Snapshot } from "./compute";
import { TRACKED_OPS, failureKind, track } from "@/lib/analytics";
import { noteRev, useLiveRefresh } from "@/lib/live";

type Ctx = {
  s: Snapshot;
  isAdmin: boolean;
  busy: boolean;
  refresh: () => void;
  mutate: <T = unknown>(op: string, payload?: unknown) => Promise<{ ok: true; result: T } | { ok: false; error: string }>;
};

const SnapshotContext = createContext<Ctx | null>(null);

export function SnapshotProvider({ snap, children }: { snap: Snapshot; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [inflight, setInflight] = useState(0);
  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);
  useLiveRefresh(refresh);
  const mutate = useCallback(async <T,>(op: string, payload?: unknown) => {
    setInflight((n) => n + 1);
    try {
      const r = await fetch("/api/mutate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, payload }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        /* A dead session, sent back to the door this person actually came in by.
         *
         * This provider is shared by the desktop app and the counter app, and pushing everyone at
         * /auth landed a nurse holding a phone on the website's sign-in pane — which also offers to
         * create a facility — and then, after signing in, on /app rather than back where they were.
         * The server guard and the /m layout both already send /m to /m/login; this was the one path
         * that disagreed. A full navigation rather than a router push: the cookie is gone and every
         * page behind it is server-rendered, so there is nothing left in the client tree worth
         * keeping. */
        if (r.status === 401) {
          const p = typeof location === "undefined" ? "" : location.pathname + location.search;
          const back = encodeURIComponent(p || "/app");
          window.location.assign(p.startsWith("/m") ? `/m/login?next=${back}` : `/auth?next=${back}`);
        }
        const err = (j && j.error) || "Request failed";
        // Refusals are worth counting — a facility repeatedly blocked by the variance gate is
        // telling us something. Only the op name and a coarse category go out, never the message.
        if (TRACKED_OPS[op]) track("action_refused", { action: TRACKED_OPS[op], reason: failureKind(String(err)) });
        return { ok: false as const, error: err };
      }
      // The revision this write produced, so the live poll recognises it as ours and does not
      // refresh the screen a second time a few seconds from now.
      noteRev(j.rev);
      startTransition(() => router.refresh());
      // One event per whitelisted action. Everything else in ops.ts sends nothing at all.
      if (TRACKED_OPS[op]) track(TRACKED_OPS[op]);
      return { ok: true as const, result: j.result as T };
    } catch {
      if (TRACKED_OPS[op]) track("action_refused", { action: TRACKED_OPS[op], reason: "network" });
      /* Not "nothing was saved", which we cannot know.
       *
       * fetch rejects when the answer never arrives, and the request may well have reached the
       * server and committed before the wifi dropped — issuing deducts stock, a request emails a
       * manager. None of the ops carry an idempotency key, so a retry invited by a flat "nothing was
       * saved" writes the whole thing a second time. Telling the truth costs one extra glance at the
       * record and is the only advice that cannot make it worse. */
      return { ok: false as const, error: "The connection dropped before we heard back, so we can’t say whether that saved. Check the record before trying again." };
    } finally {
      setInflight((n) => n - 1);
    }
  }, [router]);
  const value = useMemo<Ctx>(() => ({ s: snap, isAdmin: snap.session.role === "Admin", busy: pending || inflight > 0, refresh, mutate }), [snap, pending, inflight, refresh, mutate]);
  return <SnapshotContext.Provider value={value}>{children}</SnapshotContext.Provider>;
}

export function useSnap() {
  const c = useContext(SnapshotContext);
  if (!c) throw new Error("useSnap outside provider");
  return c;
}

export function useDerived() {
  const { s } = useSnap();
  return useMemo(() => ({ L: ledger(s), byId: itemMap(s), staffById: staffMap(s), variants: variantList(s) }), [s]);
}
