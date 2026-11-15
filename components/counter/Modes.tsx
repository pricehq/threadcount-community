"use client";
/* Return, Hand in and Swap a size: the counter's other three modes. */
import { useMemo, useState } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { Panel, QtyStepper, Tag } from "@/components/portal";
import { printHandInReceipt } from "@/components/dialogs";
import { key, label, onhand, plOf, type IssueRec, type StaffRec } from "@/lib/compute";
import { dayMonth, openIssuesOf, owedLinesOf, plural, sizeOf } from "./lib";
import styles from "./counter.module.css";

/** Every open issue line, ungrouped, with the signed toggle; Return when `onReturn` is given. */
export function HoldingPanel({ st, onReturn, onError }: { st: StaffRec; onReturn?: (i: IssueRec) => void; onError: (e: string) => void }) {
  const { s, mutate } = useSnap();
  const { byId } = useDerived();
  const open = useMemo(() => openIssuesOf(s, st.id), [s, st.id]);
  const owed = useMemo(() => owedLinesOf(s, st.id), [s, st.id]);
  const qty = open.reduce((t, i) => t + i.qty, 0);
  async function sign(i: IssueRec) {
    const r = await mutate("issue.receipt", { id: i.id, receipt: !i.receipt });
    if (!r.ok) onError(r.error);
  }
  return (
    <Panel title="Holding" aside={plural(qty, "garment", "garments")}>
      {open.length === 0 ? <div className={styles.empty}>Nothing out.</div> : (
        <div className={styles.tableWrap}>
          <table className="tc-table">
            <thead><tr><th>Garment</th><th>Size</th><th className="num">Qty</th><th>Issued</th><th>Signed</th>{onReturn && <th><span className="sr-only">Action</span></th>}</tr></thead>
            <tbody>
              {open.map((i) => {
                const it = byId[i.itemId];
                return (
                  <tr key={i.id}>
                    <td>{label(it)}{i.preloved ? <span className={styles.meta}> · pre-loved</span> : null}</td>
                    <td className="tc-mono">{sizeOf(it, i.si)}</td>
                    <td className="num">{i.qty}</td>
                    <td className="tc-mono" style={{ fontSize: 12 }}>{dayMonth(i.date)}</td>
                    <td>
                      <button type="button" className={`btn ${i.receipt ? "btn-secondary" : "btn-ghost"} ${styles.rowGhost}`} aria-pressed={i.receipt}
                        aria-label={`${label(it)} size ${sizeOf(it, i.si)} signed for`} onClick={() => sign(i)}>{i.receipt ? "Signed" : "Mark signed"}</button>
                    </td>
                    {onReturn && (
                      <td style={{ textAlign: "right" }}>
                        <button type="button" className={`btn btn-ghost ${styles.rowGhost}`} aria-label={`Return ${label(it)} size ${sizeOf(it, i.si)}`} onClick={() => onReturn(i)}>Return</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {owed.length > 0 && (
        <>
          <div className={`tc-lbl ${styles.subLbl}`}>On order or waiting</div>
          <div className={styles.tableWrap}>
            <table className="tc-table">
              <tbody>
                {owed.map((o) => (
                  <tr key={o.key}>
                    <td>{label(byId[o.itemId])}</td>
                    <td className="tc-mono">{o.size || "–"}</td>
                    <td className="num">{o.qty}</td>
                    <td className={styles.meta}>{o.where}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}

export function ReturnedToday({ st }: { st: StaffRec }) {
  const { s } = useSnap();
  const { byId } = useDerived();
  const rows = s.issues.filter((i) => i.staffId === st.id && i.returned?.date === s.today);
  return (
    <Panel title="Returned today" aside={rows.length ? plural(rows.reduce((t, i) => t + i.qty, 0), "garment", "garments") : undefined}>
      {rows.length === 0 ? <div className={styles.empty}>Nothing returned today.</div> : rows.map((i) => {
        const it = byId[i.itemId];
        const cond = i.returned!.cond;
        return (
          <div key={i.id} className={styles.listRow}>
            <div className={styles.listMain}>{label(it)} · <span className="tc-mono">{sizeOf(it, i.si)}</span> <span className="tc-mono">×{i.qty}</span></div>
            <Tag tone={cond === "Returned - Good" ? "outline" : "low"}>{cond.replace("Returned - ", "")}</Tag>
            {i.returned!.photoId && <a className={`btn btn-ghost ${styles.rowGhost}`} href={`/api/photo/${i.returned!.photoId}`} target="_blank" rel="noopener">Photo</a>}
          </div>
        );
      })}
    </Panel>
  );
}

export function HandInPanel({ st, onRecord }: { st: StaffRec; onRecord: () => void }) {
  const { s } = useSnap();
  const { byId } = useDerived();
  const list = s.handins.filter((h) => h.staffId === st.id).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return (
    <Panel title="Hand in">
      <div className={styles.panelPad}>
        <button type="button" className="btn btn-primary" onClick={onRecord}>Record a hand-in</button>
      </div>
      <div className={`tc-lbl ${styles.subLbl}`}>Hand-ins</div>
      {list.length === 0 ? <div className={styles.empty}>No hand-ins on file.</div> : list.map((h) => {
        const good = h.lines.filter((l) => l.cond === "Good").reduce((t, l) => t + l.qty, 0);
        const rag = h.lines.filter((l) => l.cond === "Rag").reduce((t, l) => t + l.qty, 0);
        return (
          <div key={h.id} className={styles.listRow}>
            <span className="tc-mono" style={{ fontSize: 12, width: 52 }}>{dayMonth(h.date)}</span>
            <div className={styles.listMain}>{good} to pre-loved · {rag} rag</div>
            {h.credit && <Tag>Credited</Tag>}
            <button type="button" className={`btn btn-ghost ${styles.rowGhost}`} onClick={() => printHandInReceipt(s, st, h, byId)} aria-label={`Receipt for the hand-in on ${dayMonth(h.date)}`}>Receipt</button>
          </div>
        );
      })}
    </Panel>
  );
}

function SwapRow({ issue, onDone, onError }: { issue: IssueRec; onDone: (msg: string) => void; onError: (e: string) => void }) {
  const { s, mutate } = useSnap();
  const { L, byId } = useDerived();
  const it = byId[issue.itemId];
  const [si, setSi] = useState(-1);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const n = Math.min(Math.max(1, qty), issue.qty);
  if (!it) return null;
  async function swap() {
    if (si < 0 || busy) return;
    setBusy(true);
    const r = await mutate<{ size: string; qty: number }>("issue.exchange", { id: issue.id, si, qty: n });
    setBusy(false);
    if (!r.ok) { onError(r.error); return; }
    setSi(-1); setQty(1);
    onDone(`Swapped ${label(it)} ${sizeOf(it, issue.si)} for ${r.result.size} ×${r.result.qty}.`);
  }
  return (
    <div className={styles.listRow}>
      <div className={styles.listMain}>{label(it)} · <span className="tc-mono">{sizeOf(it, issue.si)}</span> <span className="tc-mono">×{issue.qty}</span></div>
      <select className={`input ${styles.swapSelect}`} aria-label={`New size for ${label(it)}`} value={si} onChange={(e) => setSi(+e.target.value)}>
        <option value={-1}>New size</option>
        {it.sizes.map((sz, j) => {
          if (j === issue.si) return null;
          const k = key(it.id, j);
          return <option key={j} value={j}>{String(sz)} ({issue.preloved ? `${plOf(s, k)} pre-loved` : `${onhand(s, L, k)} on shelf`})</option>;
        })}
      </select>
      {issue.qty > 1 && <QtyStepper size="sm" value={n} min={1} max={issue.qty} label={`${label(it)} to swap`} onChange={setQty} />}
      <button type="button" className="btn btn-secondary" disabled={si < 0 || busy} onClick={swap}>Swap</button>
    </div>
  );
}

export function SwapPanel({ st, onDone, onError }: { st: StaffRec; onDone: (msg: string) => void; onError: (e: string) => void }) {
  const { s } = useSnap();
  const open = useMemo(() => openIssuesOf(s, st.id), [s, st.id]);
  return (
    <Panel title="Holding" aside={plural(open.reduce((t, i) => t + i.qty, 0), "garment", "garments")}>
      {open.length === 0 ? <div className={styles.empty}>Nothing out.</div> : open.map((i) => <SwapRow key={i.id} issue={i} onDone={onDone} onError={onError} />)}
    </Panel>
  );
}

/** Best effort: today's good returns with a new issue of the same garment, another size, today. */
export function SwappedToday({ st }: { st: StaffRec }) {
  const { s } = useSnap();
  const { byId } = useDerived();
  const mine = s.issues.filter((i) => i.staffId === st.id);
  const rows = mine
    .filter((i) => i.returned?.date === s.today && i.returned.cond === "Returned - Good")
    .flatMap((old) => {
      const nu = mine.find((n) => n.date === s.today && n.itemId === old.itemId && n.si !== old.si && n.qty === old.qty);
      return nu ? [{ old, nu }] : [];
    });
  return (
    <Panel title="Swapped today">
      {rows.length === 0 ? <div className={styles.empty}>Nothing swapped today.</div> : rows.map(({ old, nu }) => {
        const it = byId[old.itemId];
        return (
          <div key={old.id} className={styles.listRow}>
            <div className={styles.listMain}>{label(it)} · <span className="tc-mono">{sizeOf(it, old.si)}</span> → <span className="tc-mono">{sizeOf(it, nu.si)}</span></div>
            <span className="tc-mono">×{old.qty}</span>
          </div>
        );
      })}
    </Panel>
  );
}
