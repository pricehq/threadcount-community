"use client";
import Link from "next/link";
import { useState } from "react";
import { ErrorLine } from "@/components/ui";
import { Seg } from "@/components/portal";
import RequestList, { requestCounts, type RequestsPayload } from "@/components/requests/RequestList";
import type { StaffRec } from "@/lib/compute";

export type RequestsHook = { data: RequestsPayload | null; error: string; loading: boolean; reload: () => Promise<void> };

export default function RequestsTab({ st, req }: { st: StaffRec; req: RequestsHook }) {
  const [which, setWhich] = useState<"open" | "all">("open");
  const counts = req.data ? requestCounts(req.data, { staffId: st.id }) : null;
  return (
    <div>
      <div className="tc-people-filters">
        <Seg label="Which requests" opts={["open", "all"] as const} value={which} onChange={setWhich}
          labels={{ open: "Open", all: "All" }} counts={counts ? { open: counts.open, all: counts.all } : undefined} />
        <div className="tc-people-right">
          <Link href={`/app/requests?staff=${encodeURIComponent(st.id)}`} className="btn btn-secondary">Open in the queue</Link>
        </div>
      </div>
      <ErrorLine msg={req.error} />
      <div className="tc-pp">
        <RequestList staffId={st.id} filter={which} hidePerson title={null} data={req.data} reload={req.reload} />
      </div>
    </div>
  );
}
