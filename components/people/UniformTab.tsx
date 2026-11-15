"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { Empty, Field } from "@/components/ui";
import { Panel, QueueRow, Tag } from "@/components/portal";
import { PhotoButton, ReturnDialog } from "@/components/dialogs";
import { viewPhoto } from "@/lib/photo";
import { PICKUP_LATE_DAYS } from "@/lib/portalcounts";
import { CASUAL_ALLOWED, FTE_CASUAL, allowanceRouteOf, approvalDeparture, capCheck, daysBetween, fmtDate, initialGarments, initialSets, initialUsed, label, openApprovals, setsForFte, type ApprovalRec, type IssueRec, type StaffRec } from "@/lib/compute";
import SignedToggle from "./SignedToggle";
import { dayMonth, fullName, objectPronoun, type Act } from "./shared";

const ROUTE_LABEL = { fte: "FTE table", kit: "Starting kit", approval: "Manager approval" } as const;

export default function UniformTab({ st, act, setErr }: { st: StaffRec; act: Act; setErr: (e: string) => void }) {
  const { s, isAdmin } = useSnap();
  const { byId } = useDerived();
  const [ret, setRet] = useState<IssueRec | null>(null);

  const held = capCheck(s, st);
  const holding = s.issues.filter((i) => i.staffId === st.id && !i.returned && !i.handedIn)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt.localeCompare(a.createdAt)));
  const garments = holding.reduce((t, i) => t + i.qty, 0);
  const pickups = s.pickups.filter((p) => p.staffId === st.id && !p.pickedUp)
    .map((p) => ({ p, days: p.received ? daysBetween(p.received, s.today) : 0 }))
    .sort((a, b) => b.days - a.days);

  return (
    <div className="tc-people-uniform">
      <div className="tc-people-stack">
        <Panel title="Holding" aside={`${garments} ${garments === 1 ? "garment" : "garments"} · ${held.sets} of ${held.cap} sets`}>
          {holding.length === 0 ? <div className="tc-people-pad"><Empty pad={1}>Holding nothing.</Empty></div> : (
            <div className="table-wrap">
              <table className="tc-table">
                <thead><tr><th>Garment</th><th>Size</th><th className="num">Qty</th><th>Issued</th><th>Source</th><th><span className="sr-only">Action</span></th></tr></thead>
                <tbody>
                  {holding.map((i) => {
                    const it = byId[i.itemId];
                    const size = it?.sizes[i.si] ?? "";
                    return (
                      <tr key={i.id}>
                        <td>{label(it)}</td>
                        <td className="tc-mono">{size}</td>
                        <td className="num">{i.qty}</td>
                        <td className="tc-mono" style={{ fontSize: 12, color: "#57534f", whiteSpace: "nowrap" }}>{fmtDate(i.date)}</td>
                        <td style={{ fontSize: 12, color: "#57534f" }}>
                          <span className="tc-people-tags">
                            <span>{i.preloved ? "Pre-loved" : i.direct ? "Collected" : "Shelf"} ·</span>
                            <SignedToggle issue={i} what={`${label(it)} ${size}`} act={act} />
                            {i.override && <Tag tone="low">Override</Tag>}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button type="button" className="btn btn-ghost tc-people-ghost" aria-label={`Return ${label(it)} ${size}`} onClick={() => setRet(i)}>Return</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {pickups.length > 0 && (
          <Panel title={`Waiting for ${objectPronoun(st)}`} aside={`${pickups.length} at the counter`}>
            {pickups.map(({ p, days }) => (
              <QueueRow key={p.id} age={`${days}d`} ageLabel="waiting" urgent={days >= PICKUP_LATE_DAYS}
                title={p.lines.map((l, n) => <span key={n}>{n > 0 && ", "}{label(byId[l.itemId])} · <span className="tc-mono">{l.size}</span> ×{l.qty}</span>)}
                meta={<><Link href={`/app/orders/${p.orderId}`} className="tc-mono">{p.orderCode}</Link>{p.received ? ` · arrived ${dayMonth(p.received)}` : ""}{p.contacted ? " · called" : ""}</>}
                actions={<>
                  {!p.contacted && <button type="button" className="btn btn-ghost tc-people-ghost" onClick={() => act("pickup.contacted", { id: p.id, contacted: true })}>Mark called</button>}
                  <button type="button" className="btn btn-secondary" onClick={() => act("pickup.pickedUp", { id: p.id })}>Picked up</button>
                </>} />
            ))}
          </Panel>
        )}
      </div>

      <div className="tc-people-stack">
        <ApprovalPanel st={st} act={act} setErr={setErr} />
        <NotePanel st={st} isAdmin={isAdmin} setErr={setErr} />
      </div>
      {ret && <ReturnDialog issue={ret} onClose={() => setRet(null)} />}
    </div>
  );
}

function ApprovalPanel({ st, act, setErr }: { st: StaffRec; act: Act; setErr: (e: string) => void }) {
  const { s } = useSnap();
  const [open, setOpen] = useState(false);
  const [ap, setAp] = useState({ sets: "", fte: "", date: s.today, note: "" });
  const [photo, setPhoto] = useState<string | null>(null);

  const noGroup = !(st.group || "").trim();
  const route = allowanceRouteOf(s, st);
  const fte = st.fte || "";
  const casual = fte.trim().toLowerCase() === FTE_CASUAL.toLowerCase();
  const proposed = setsForFte(fte);
  const kitSets = initialSets(s, st), kitOf = initialGarments(s, st), kitUsed = initialUsed(s, st.id);

  const all: ApprovalRec[] = s.approvals.filter((a) => a.staffId === st.id)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const openAps = openApprovals(s, st.id);
  const latestOpen = openAps[openAps.length - 1];
  const used = openAps.reduce((t, a) => t + a.used, 0);
  const left = openAps.reduce((t, a) => t + a.sets - a.used, 0);
  const formPhoto = (latestOpen ?? all[0])?.photoId ?? null;

  /* The form is recorded as signed by the manager on the register: one box, one signer. */
  const mgr = st.managerId ? s.staff.find((x) => x.id === st.managerId) : undefined;
  const apMgr = mgr && !mgr.inactive ? mgr : undefined;
  const apBy = apMgr ? fullName(apMgr) : "";
  const apFte = ap.fte.trim() || fte;
  const apProposed = setsForFte(apFte);
  const apOver = approvalDeparture({ sets: parseInt(ap.sets, 10) || 0, fte: apFte, by: apBy || "the manager" });
  const apFuture = ap.date > s.today;
  const invalid = !apMgr || !(parseInt(ap.sets, 10) > 0) || apFuture;

  async function record() {
    if (!apMgr) return;
    const ok = await act("approval.add", { staffId: st.id, by: apBy, byStaffId: apMgr.id, sets: parseInt(ap.sets, 10), fte: ap.fte, date: ap.date, notes: ap.note.trim(), photoId: photo });
    if (ok) { setAp({ sets: "", fte: "", date: s.today, note: "" }); setPhoto(null); setOpen(false); }
  }

  return (
    <Panel title="Approval" aside={noGroup ? "No staff group" : ROUTE_LABEL[route]}>
      <div>
        {route === "fte" && !noGroup && (
          <div className="tc-people-kv">
            <span className="k">Proposed by FTE {fte && <span className="tc-mono">{fte}</span>}</span>
            <span className="v tc-mono">{!fte ? "no FTE recorded" : casual ? `${CASUAL_ALLOWED} sets` : proposed !== null ? `${proposed} sets` : "–"}</span>
          </div>
        )}
        {route === "kit" && !noGroup && (
          <div className="tc-people-kv">
            <span className="k">Starting kit</span>
            <span className="v tc-mono">{kitSets ?? 0} sets · {kitUsed} of {kitOf ?? 0} issued</span>
          </div>
        )}
        <div className="tc-people-kv">
          <span className="k">Signed by the manager</span>
          <span className="v tc-mono">{latestOpen ? `${latestOpen.sets} sets · ${dayMonth(latestOpen.date)}` : "nothing signed"}</span>
        </div>
        <div className="tc-people-kv">
          <span className="k">Drawn</span>
          <span className="v tc-mono">{used} · {left} left</span>
        </div>
        <div className="tc-people-kv">
          {formPhoto && <button type="button" className="btn btn-ghost tc-people-ghost" onClick={() => viewPhoto(formPhoto)}>View the form</button>}
          <button type="button" className="btn btn-ghost tc-people-ghost" style={{ marginLeft: "auto" }}
            onClick={() => window.open(`/print/order-form?staff=${encodeURIComponent(st.id)}`, "_blank", "noopener")}>Print a new one</button>
        </div>
        <div className="tc-people-kv">
          <button type="button" className="btn btn-ghost tc-people-ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Close the form" : "Record a signed form"}</button>
        </div>
      </div>
      {open && (
        <div className="tc-people-form">
          <div className="row">
            <Field label="Sets" style={{ width: 70 }}>{(c) => <input {...c} className="input" inputMode="numeric" value={ap.sets} onChange={(e) => setAp({ ...ap, sets: e.target.value.replace(/[^0-9]/g, "") })} />}</Field>
            <Field label="FTE" style={{ width: 80 }}>{(c) => <input {...c} className="input" value={ap.fte} placeholder={fte || "1.0"} onChange={(e) => setAp({ ...ap, fte: e.target.value })} />}</Field>
            <Field label="Date signed" style={{ width: 170 }} error={apFuture ? "After today: check the year." : undefined}>
              {(c) => <input {...c} className="input" type="date" max={s.today} value={ap.date} onChange={(e) => setAp({ ...ap, date: e.target.value })} />}
            </Field>
          </div>
          <Field label="Note" style={{ marginTop: 8 }} hint="What the manager wrote beside the number.">
            {(c) => <textarea {...c} className="input" rows={2} maxLength={400} value={ap.note} onChange={(e) => setAp({ ...ap, note: e.target.value })} />}
          </Field>
          <div className="row" style={{ marginTop: 10, alignItems: "center" }}>
            <PhotoButton kind="approval" label="Photo the signed form" attached="Form photo attached" value={photo} onChange={setPhoto} onError={setErr} />
            <button type="button" className="btn btn-secondary" disabled={invalid} onClick={record}>Record approval</button>
          </div>
          {!apMgr && <div className="tc-people-hint">{mgr?.inactive ? "Their manager is inactive: set a new one first." : "Set their manager first."}</div>}
          {route === "fte" && apProposed !== null && <div className="tc-people-hint">The table proposes {apProposed} {apProposed === 1 ? "set" : "sets"} at FTE {apFte}.</div>}
          {apOver && <div className="tc-people-hint"><b>Recorded as:</b> {apOver}</div>}
        </div>
      )}
    </Panel>
  );
}

/* Notes save 600ms after typing stops, and a pending save is flushed (not dropped) when the panel
   goes away: another tab, another record, or off the page. */
function NotePanel({ st, isAdmin, setErr }: { st: StaffRec; isAdmin: boolean; setErr: (e: string) => void }) {
  const { mutate, refresh } = useSnap();
  const [value, setValue] = useState<string | null>(null);
  const [state, setState] = useState<"" | "saving" | "saved">("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const id = st.id;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    const v = pending.current;
    if (v === null) return;
    pending.current = null;
    fetch("/api/mutate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "staff.patch", payload: { id, notes: v } }), keepalive: true })
      .then(() => refresh()).catch(() => {});
  }, [id, refresh]);

  function change(v: string) {
    setValue(v);
    pending.current = v;
    setState("saving");
    if (timer.current) clearTimeout(timer.current);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    timer.current = setTimeout(async () => {
      pending.current = null;
      const r = await mutate("staff.patch", { id, notes: v });
      if (pending.current !== null) return;
      if (!r.ok) { setState(""); setErr(r.error); return; }
      setState("saved");
      savedTimer.current = setTimeout(() => setState(""), 3000);
    }, 600);
  }

  const text = value ?? st.notes;
  return (
    <Panel title="Note" aside={state === "saving" ? "Saving…" : state === "saved" ? "Saved" : undefined}>
      <div className="tc-people-pad">
        {isAdmin
          ? <textarea className="input" rows={3} style={{ width: "100%", boxSizing: "border-box" }} aria-label={`Notes about ${fullName(st)}`} value={text} onChange={(e) => change(e.target.value)} />
          : text.trim() ? <div className="tc-people-noted" aria-label={`Notes about ${fullName(st)}`}>{text}</div> : <span className="tc-meta-line">No note.</span>}
      </div>
    </Panel>
  );
}
