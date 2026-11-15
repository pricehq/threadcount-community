"use client";
import { useState } from "react";
import type { IssueRec } from "@/lib/compute";
import type { Act } from "./shared";

/** The receipt tick for one issue line (issue.receipt). Issuers may use it. */
export default function SignedToggle({ issue, what, act }: { issue: IssueRec; what: string; act: Act }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={"tc-people-signed" + (issue.receipt ? "" : " no")} aria-pressed={issue.receipt} disabled={busy}
      aria-label={`Receipt signed for ${what}`}
      onClick={async () => { setBusy(true); await act("issue.receipt", { id: issue.id, receipt: !issue.receipt }); setBusy(false); }}>
      {issue.receipt ? "signed" : "not signed"}
    </button>
  );
}
