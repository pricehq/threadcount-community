/* The request queue's CSV exports, one file per filter, exactly the files the queue wrote before
 * the redesign. Times are full dates in the facility's zone with the zone named in the preamble,
 * because a spreadsheet is re-sorted the moment it lands. Request rows are one per garment line,
 * so a declined fleece is one filter away. */
import { csvEsc, csvOf, facilityDate, formatInZone, genderLabel, type Snapshot } from "@/lib/compute";
import { downloadCsv } from "@/lib/print";
import type { ReqLine } from "@/lib/staffdata";
import { holdEndsAt, holdExpired, statusText } from "@/lib/staffreq";
import { REQUEST_FILTER_LABEL, requestsFor, type RequestFilter, type RequestsPayload } from "./RequestList";

/** How many rows the export for this filter writes (what "{n} shown" counts). */
export function exportCount(f: RequestFilter, p: RequestsPayload): number {
  if (f === "queries") return p.disputes?.length ?? 0;
  if (f === "damage") return p.damage?.length ?? 0;
  if (f === "cycles") return (p.shortfalls?.length ?? 0) + (p.waiting?.length ?? 0);
  return requestsFor(p.requests, f).length;
}

/** Writes the file for filter `f` from an already-scoped payload. `showing` names the scope. */
export function exportRequestsCsv(s: Snapshot, f: RequestFilter, p: RequestsPayload, showing?: string) {
  const when = (iso: string | null) =>
    iso ? `${facilityDate(iso, s.tz)} ${formatInZone(iso, s.tz, { hour: "2-digit", minute: "2-digit", hour12: false, hourCycle: "h23" })}` : "";
  const preamble = (facts: [string, string | number][]) =>
    [...facts, ...(showing ? ([["Showing", showing]] as [string, string][]) : [])]
      .map(([k, v]) => `${csvEsc(k)},${typeof v === "number" ? v : csvEsc(v)}`).join("\n") + "\n\n";

  if (f === "queries") {
    const rows = p.disputes ?? [];
    downloadCsv(`threadcount-record-queries-${s.today}.csv`,
      preamble([["Record queries", "Raised against a staff record, not yet sorted"], ["Exported", s.today], ["Times shown in", s.tz], ["Queries in this file", rows.length]])
      + csvOf(["Raised", "Staff no.", "Staff member", "Ward", "What they say is wrong"],
        rows.map((d) => [when(d.at), d.staffNum, d.staffName, d.ward, d.body])));
    return;
  }

  if (f === "damage") {
    const rows = p.damage ?? [];
    downloadCsv(`threadcount-damage-${s.today}.csv`,
      preamble([["Damage reported", "Not yet handed in at the counter"], ["Exported", s.today], ["Times shown in", s.tz], ["Reports in this file", rows.length]])
      + csvOf(["Reported", "Staff no.", "Staff member", "Ward", "Garment", "Size", "Damage", "What they said", "Replacement requested", "Photo"],
        rows.map((d) => [when(d.at), d.staffNum, d.staffName, d.ward, d.item || "Garment no longer on file", d.size, d.kind, d.note, d.requestCode, d.photoId ? "Yes" : "No"])));
    return;
  }

  if (f === "cycles") {
    const c = p.cycle ?? null;
    downloadCsv(`threadcount-kit-check-${s.today}.csv`,
      preamble([
        ["Kit check and waitlist", c ? `Running — due by ${c.dueBy}` : "No kit check running"],
        ["Opened by", c ? c.openedBy || "—" : ""],
        ["Answers in", c ? c.answers : 0],
        ["Exported", s.today],
        ["Times shown in", s.tz],
      ])
      + "What people couldn't account for\n"
      + csvOf(["Staff no.", "Staff member", "Ward", "Garment", "Size", "On record", "Confirmed", "Short", "Answered"],
        (p.shortfalls ?? []).map((x) => [x.staffNum, x.staffName, x.ward, x.item, x.size, x.onRecord, x.confirmed, x.short, when(x.at)]))
      + "\nWaiting for a size\n"
      + csvOf(["Staff no.", "Staff member", "Ward", "Garment", "Size", "Waiting since", "Offered", "Held until", "Hold"],
        (p.waiting ?? []).map((w) => {
          const ends = holdEndsAt(w.offeredAt);
          return [w.staffNum, w.staffName, w.ward, w.item, w.size, when(w.since), when(w.offeredAt),
            ends ? when(ends.toISOString()) : "",
            !w.offeredAt ? "Not offered yet" : holdExpired(w.offeredAt) ? "Lapsed — offer to the next person" : "Held"];
        })));
    return;
  }

  const rows = requestsFor(p.requests, f);
  downloadCsv(`threadcount-requests-${f === "noapprover" ? "needs-an-approver" : f}-${s.today}.csv`,
    preamble([
      ["Ward requests", REQUEST_FILTER_LABEL[f]],
      ["Exported", s.today],
      ["Times shown in", s.tz],
      ["Requests in this file", rows.length],
      ...(p.moreRequests
        ? ([["Older requests not in this file", `The screen holds the most recent ${p.requestLimit} requests and there are older ones than those`]] as [string, string][])
        : []),
      ["Rows", "One per line on the request — a request for a tunic and two pairs of trousers is two rows, and the pairs are a Qty of 2 on the second"],
    ])
    + csvOf(["Request", "Raised", "Staff no.", "Staff member", "Ward", "Raised by", "Reason", "Note", "Request status", "Approver", "Approver is the wearer", "Decision summary", "Decided", "Request decline reason", "Collection code", "Garment", "Cut", "Size", "Qty", "Line decision", "Line decline reason"],
      rows.flatMap((r) => {
        const req: (string | number)[] = [
          r.code, when(r.createdAt), r.staffNum, r.staffName, r.ward, r.raisedByName, r.reason, r.note,
          statusText(r).label, r.managerName, r.managerId && r.managerId === r.staffId ? "Yes" : "",
          r.decision ?? "", when(r.decidedAt), r.declineReason ?? "", r.collectCode ?? "",
        ];
        // A request with no lines still appears: it is sitting in somebody's queue.
        const lines: (ReqLine | null)[] = r.lines.length ? r.lines : [null];
        return lines.map((l) => [...req,
          l ? l.item : "", l ? genderLabel(l.gender) : "", l ? l.size : "", l ? l.qty : "",
          l ? l.statusLabel : "", l ? l.declineReason ?? "" : ""]);
      })));
}
