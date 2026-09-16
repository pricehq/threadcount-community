"use client";
import Link from "next/link";
import { useState } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { Empty, LiveRegion } from "@/components/ui";
import { Panel, Tag } from "@/components/portal";
import { HandInDialog, ReturnDialog, printCreditSlip, printHandInReceipt } from "@/components/dialogs";
import { viewPhoto } from "@/lib/photo";
import { statusText } from "@/lib/staffreq";
import { approvalDeparture, facilityDate, fmtDate, issueCost, label, money, statusTag, type ApprovalRec, type IssueRec, type StaffRec } from "@/lib/compute";
import type { RequestRow } from "@/components/requests/RequestList";
import SignedToggle from "./SignedToggle";
import type { RequestsHook } from "./RequestsTab";
import type { Act } from "./shared";

/** A request whose approver is the person it is for, in the words of where it has got to. */
const selfTag = (status: string) => (status === "awaiting" ? "Theirs to approve" : status === "declined" ? "Declined by themselves" : "Self-approved");

type FormRow = { kind: "approval"; on: string; a: ApprovalRec } | { kind: "request"; on: string; r: RequestRow };

export default function HistoryTab({ st, act, setErr, req }: { st: StaffRec; act: Act; setErr: (e: string) => void; req: RequestsHook }) {
  const { s, isAdmin } = useSnap();
  const { byId } = useDerived();
  const [ret, setRet] = useState<IssueRec | null>(null);
  const [handin, setHandin] = useState(false);
  const [hiMsg, setHiMsg] = useState("");
  const [alt, setAlt] = useState({ garment: "", desc: "" });

  const issues = s.issues.filter((i) => i.staffId === st.id).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt.localeCompare(a.createdAt)));
  const handins = s.handins.filter((h) => h.staffId === st.id);
  const alterations = s.alterations.filter((a) => a.staffId === st.id);
  const orders = s.orders.filter((o) => o.staffId === st.id);
  const approvals = s.approvals.filter((a) => a.staffId === st.id).reverse().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const openForm = (qs: string) => window.open(`/print/order-form?${qs}`, "_blank", "noopener");
  /* Approvals come off the snapshot; requests off /api/requests?staff=. Each row is labelled, because a
     signed approval and an unapproved ask weigh differently in an audit. */
  const forms: FormRow[] = [
    ...approvals.map((a) => ({ kind: "approval" as const, on: a.date, a })),
    ...(req.data?.requests ?? []).filter((r) => r.staffId === st.id).map((r) => ({ kind: "request" as const, on: facilityDate(r.createdAt, s.settings.timezone), r })),
  ].sort((x, y) => (x.on < y.on ? 1 : x.on > y.on ? -1 : 0));

  return (
    <div className="tc-people-stack">
      <Panel title="Issue history" aside={issues.length ? `${issues.length} ${issues.length === 1 ? "line" : "lines"}` : undefined}>
        {issues.length === 0 ? <div className="tc-people-pad"><Empty pad={1}>Nothing issued yet.</Empty></div> : (
          <div className="table-wrap">
            <table className="tc-table">
              <thead><tr><th>Date</th><th>Garment</th><th>Size</th><th className="num">Qty</th><th className="num">Value</th><th>Status</th><th>Signed</th><th><span className="sr-only">Action</span></th></tr></thead>
              <tbody>
                {issues.map((i) => {
                  const it = byId[i.itemId];
                  const size = it?.sizes[i.si] ?? "";
                  return (
                    <tr key={i.id}>
                      <td className="tc-mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmtDate(i.date)}</td>
                      <td>{label(it)}</td>
                      <td className="tc-mono">{size}</td>
                      <td className="num">{i.qty}</td>
                      <td className="num">{money(i.qty * issueCost(i, byId))}</td>
                      <td>
                        <span className="tc-people-tags">
                          <Tag tone={i.returned ? "outline" : "quiet"}>{i.returned ? i.returned.cond.replace("Returned - ", "Returned – ") : i.preloved ? "Pre-loved" : i.direct ? "Collected" : "Issued"}</Tag>
                          {i.handedIn && <Tag title={`Handed in ${fmtDate(i.handedIn)}`}>Handed in</Tag>}
                          {i.override && <Tag tone="low">Override</Tag>}
                          {i.returned?.photoId && <button type="button" className="btn btn-ghost tc-people-ghost" onClick={() => viewPhoto(i.returned!.photoId!)}>Photo</button>}
                        </span>
                      </td>
                      <td><SignedToggle issue={i} what={`${label(it)} ${size}`} act={act} /></td>
                      <td style={{ textAlign: "right" }}>
                        {!i.returned && !i.handedIn && <button type="button" className="btn btn-ghost tc-people-ghost" aria-label={`Return ${label(it)} ${size}`} onClick={() => setRet(i)}>Return</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="tc-people-two">
        <div className="tc-people-stack">
          <Panel title="Hand-ins" aside={<button type="button" className="btn btn-secondary" style={{ minHeight: 28, padding: "2px 10px" }} onClick={() => setHandin(true)}>Record hand-in</button>}>
            <LiveRegion msg={hiMsg} className="tc-people-pad" style={{ fontWeight: 600 }} />
            {handins.length === 0 ? <div className="tc-people-pad"><Empty pad={1}>No hand-ins on file.</Empty></div> : (
              <div className="tc-people-list">
                {handins.map((h) => {
                  const good = h.lines.filter((l) => l.cond === "Good").reduce((t, l) => t + l.qty, 0);
                  const rag = h.lines.filter((l) => l.cond === "Rag").reduce((t, l) => t + l.qty, 0);
                  return (
                    <div key={h.id} className="tc-people-item">
                      <span className="d">{fmtDate(h.date)}</span>
                      <span className="grow">{[good ? `${good} good` : "", rag ? `${rag} rag` : ""].filter(Boolean).join(" · ") || "–"} · received by {h.by}</span>
                      {h.credit && <Tag tone="accent">Credited</Tag>}
                      <button type="button" className="btn btn-ghost tc-people-ghost" onClick={() => printHandInReceipt(s, st, h, byId)}>Receipt</button>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title="Alterations">
            <div className="tc-people-pad" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input className="input" style={{ flex: 1, minWidth: 150 }} aria-label="Garment to be altered" placeholder="Garment" value={alt.garment} onChange={(e) => setAlt({ ...alt, garment: e.target.value })} />
              <input className="input" style={{ flex: 1.4, minWidth: 180 }} aria-label="What the alteration is" placeholder="Alteration, e.g. hem 4cm" value={alt.desc} onChange={(e) => setAlt({ ...alt, desc: e.target.value })} />
              <button type="button" className="btn btn-secondary" disabled={!alt.garment.trim()} onClick={async () => { if (await act("alteration.add", { staffId: st.id, ...alt })) setAlt({ garment: "", desc: "" }); }}>Log alteration</button>
            </div>
            {alterations.length === 0 ? <div className="tc-people-pad" style={{ paddingTop: 0 }}><Empty pad={1}>No alterations recorded.</Empty></div> : (
              <div className="tc-people-list" style={{ borderTop: "1px solid #cfcccb" }}>
                {alterations.map((a) => (
                  <div key={a.id} className="tc-people-item">
                    <span className="d">{fmtDate(a.date)}</span>
                    <span style={{ fontWeight: 600 }}>{a.garment}</span>
                    <span className="grow">{a.desc || "–"}</span>
                    <Tag tone={a.status === "Returned to staff" ? "quiet" : a.status === "At tailor" ? "accent" : "outline"}>{a.status}</Tag>
                    {a.status !== "Returned to staff" && <button type="button" className="btn btn-ghost tc-people-ghost" onClick={() => act("alteration.advance", { id: a.id })}>{a.status === "Requested" ? "Send to tailor" : "Mark returned"}</button>}
                    <button type="button" className="btn btn-ghost btn-icon" title="Remove entry" aria-label={`Remove the alteration logged for ${a.garment}`} onClick={() => act("alteration.remove", { id: a.id })}>×</button>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="tc-people-stack">
          <Panel title="Previous order forms">
            <LiveRegion msg={req.error ? "The requests raised for them couldn’t be loaded, so only approvals are listed." : undefined} tone="alert" className="tc-people-pad" style={{ fontWeight: 600, color: "var(--color-accent-700)" }} />
            {req.data?.moreRequests && <div className="tc-people-pad tc-meta-line">Only the latest {req.data.requestLimit} requests are listed.</div>}
            {!req.data && !req.error && <div className="tc-people-pad tc-meta-line">Loading requests…</div>}
            {forms.length === 0 && (req.data || req.error) && <div className="tc-people-pad"><Empty pad={1}>No order form printed or recorded yet.</Empty></div>}
            <div className="tc-people-list">
              {forms.map((x) => x.kind === "approval" ? (
                <ApprovalRow key={`a${x.a.id}`} a={x.a} st={st} today={s.today} isAdmin={isAdmin} act={act} openForm={openForm}
                  credit={() => printCreditSlip(s, st, x.a)} />
              ) : (
                <div key={`r${x.r.id}`} className="tc-people-item">
                  <span className="d">{fmtDate(x.on)}</span>
                  <Tag tone="quiet">Request</Tag>
                  <span className="grow"><b className="tc-mono">{x.r.code}</b> · {x.r.garments} {x.r.garments === 1 ? "garment" : "garments"}{x.r.reason ? ` · ${x.r.reason}` : ""} · {statusText(x.r).label}</span>
                  {x.r.managerId === st.id && <Tag tone="accent">{selfTag(x.r.status)}</Tag>}
                  <button type="button" className="btn btn-ghost tc-people-ghost" aria-label={`Print the order form again for request ${x.r.code}`} onClick={() => openForm(`request=${encodeURIComponent(x.r.id)}`)}>Print the form</button>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title={`Orders for ${st.first || "them"}`}>
            {orders.length === 0 ? <div className="tc-people-pad"><Empty pad={1}>No orders placed for them.</Empty></div> : (
              <div className="tc-people-list">
                {orders.map((o) => (
                  <div key={o.id} className="tc-people-item">
                    <Link href={`/app/orders/${o.id}`} className="tc-mono" style={{ fontWeight: 600 }}>{o.code}</Link>
                    <span className="d" style={{ minWidth: 0 }}>{fmtDate(o.date)}</span>
                    <span className="grow">{o.lines.reduce((t, l) => t + l.qty, 0)} items · {o.supplier}</span>
                    <span className={statusTag(o.status)}>{o.status}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
      {ret && <ReturnDialog issue={ret} onClose={() => setRet(null)} />}
      {handin && <HandInDialog staff={st} onClose={() => setHandin(false)} onDone={(m) => { setErr(""); setHiMsg(m); }} />}
    </div>
  );
}

function ApprovalRow({ a, st, today, isAdmin, act, openForm, credit }: {
  a: ApprovalRec; st: StaffRec; today: string; isAdmin: boolean; act: Act; openForm: (qs: string) => void; credit: () => void;
}) {
  const rem = a.sets - a.used;
  const recorded = a.notes.trim();
  const over = recorded ? null : approvalDeparture(a);
  return (
    <div>
      <div className="tc-people-item">
        <span className="d">{fmtDate(a.date)}</span>
        <Tag>Approval</Tag>
        <span className="grow">{a.sets} {a.sets === 1 ? "set" : "sets"} approved by {a.by}{a.fte ? <> · FTE <span className="tc-mono">{a.fte}</span></> : ""}</span>
        {a.byStaffId === st.id && <Tag tone="accent">Self-approved</Tag>}
        {a.date > today && <Tag title="Dated after today, usually a mistyped year.">Dated ahead of today</Tag>}
        <Tag tone={rem > 0 ? "low" : "quiet"}>{rem > 0 ? `${rem} of ${a.sets} left` : "Fully collected"}</Tag>
        {a.photoId && <button type="button" className="btn btn-ghost tc-people-ghost" aria-label={`Open the signed form photographed on ${fmtDate(a.date)}`} onClick={() => viewPhoto(a.photoId!)}>Signed form</button>}
        <button type="button" className="btn btn-ghost tc-people-ghost" aria-label={`Print the approval recorded ${fmtDate(a.date)} as it was recorded`} onClick={() => openForm(`approval=${encodeURIComponent(a.id)}`)}>Print the form</button>
        <button type="button" className="btn btn-ghost tc-people-ghost" onClick={credit}>Credit slip</button>
        {isAdmin && <button type="button" className="btn btn-ghost btn-icon" title="Remove approval" aria-label={`Remove the ${fmtDate(a.date)} approval by ${a.by}`} onClick={() => { if (confirm("Remove this approval?")) act("approval.remove", { id: a.id }); }}>×</button>}
      </div>
      {(recorded || over) && <div className="tc-people-sub">{recorded || `${over} No reason was written down.`}</div>}
    </div>
  );
}
