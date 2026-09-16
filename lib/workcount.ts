"use client";
/* The counter app's open work, counted once: requests to pick, deliveries to receive, pickups waiting,
 * and wards with a round. The Work tab's badge, the Work segments and Today's rows all read these
 * four numbers, so the three can never disagree. */
import { useMemo } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { useServerCounts } from "@/lib/portalcounts";
import { collectRows, receiveRows, roundSheet } from "@/lib/today";
import { useRequests } from "@/components/requests/RequestList";

export type WorkCount = { picks: number; in: number; pickups: number; rounds: number; total: number; loading: boolean };

/** Request statuses the counter still has to act on: approved, being picked, or held at the counter. */
export const PICK_STATUSES = new Set(["accepted", "picking", "ready"]);

export function useWorkCount(): WorkCount {
  const { s } = useSnap();
  const { byId, staffById } = useDerived();
  const server = useServerCounts();
  const { data, loading } = useRequests();
  return useMemo(() => {
    const picks = data ? data.requests.filter((r) => PICK_STATUSES.has(r.status)).length : server?.pick || 0;
    const inn = receiveRows(s, staffById).length;
    const pickups = collectRows(s, byId, staffById, { includeRound: true }).length;
    const rounds = roundSheet(s, byId, staffById).length;
    return { picks, in: inn, pickups, rounds, total: picks + inn + pickups + rounds, loading: loading && !data };
  }, [s, byId, staffById, server, data, loading]);
}
