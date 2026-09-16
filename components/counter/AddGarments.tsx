"use client";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { Icon, Panel, SizeStrip, Tag, type SizeCell } from "@/components/portal";
import { ErrorLine } from "@/components/ui";
import { ALL_GROUPS, bcParse, garmentForStyle, groupBucket, inBucket, key, label, onhand, plOf, reorderAt, setHalf, type IssueRec, type Item, type StaffRec } from "@/lib/compute";
import { dayMonth, pronoun, sizeOf, type HoldGroup } from "./lib";
import styles from "./counter.module.css";

const HOLD_SHOWN = 8;

export default function AddGarments({ st, isAdmin, onAdd, onBind, onCamera, onReturn, onRepeat, repeatDate, groups, owed, inputRef, listOpenRef }: {
  st: StaffRec;
  isAdmin: boolean;
  onAdd: (itemId: string, si: number) => void;
  onBind: (code: string) => void;
  onCamera: () => void;
  onReturn: (issue: IssueRec) => void;
  onRepeat: () => void;
  repeatDate: string | null;
  groups: HoldGroup[];
  owed: number;
  inputRef: React.RefObject<HTMLInputElement | null>;
  listOpenRef: React.RefObject<boolean>;
}) {
  const { s } = useSnap();
  const { L, byId } = useDerived();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [showAll, setShowAll] = useState(false);
  const popId = useId();
  const popRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pr = pronoun(st);

  // For this person's group and cut: the same test the old quick-add list used.
  const bucket = groupBucket(st.group) || ALL_GROUPS;
  const forThem = (it: Item) => inBucket(it, bucket) && garmentForStyle(it, st.uniformStyle);

  const qq = q.trim().toLowerCase();
  const found = useMemo(() => {
    if (qq.length < 2) return { rel: [] as Item[], other: [] as Item[] };
    const all = s.catalog
      .filter((it) => !it.archived && (it.item.toLowerCase().includes(qq) || it.sku.toLowerCase().includes(qq) || label(it).toLowerCase().includes(qq)))
      .sort((a, b) => a.sort - b.sort);
    const rel = all.filter(forThem).slice(0, 8);
    const other = all.filter((it) => !rel.includes(it) && !forThem(it)).slice(0, 8 - rel.length);
    return { rel, other };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.catalog, qq, bucket, st.uniformStyle]);
  const listShown = open && qq.length >= 2;
  useEffect(() => { listOpenRef.current = listShown; }, [listShown, listOpenRef]);

  // Usual chips: set garments at the recorded size, then anything outside a set they have had before,
  // at the size of their latest issue of it. Most issued to them first.
  const usual = useMemo(() => {
    const issued: Record<string, number> = {};
    const latest: Record<string, IssueRec> = {};
    for (const i of s.issues) {
      if (i.staffId !== st.id) continue;
      issued[i.itemId] = (issued[i.itemId] || 0) + i.qty;
      const l = latest[i.itemId];
      if (!l || i.date > l.date || (i.date === l.date && i.createdAt > l.createdAt)) latest[i.itemId] = i;
    }
    const rank = (a: { it: Item }, b: { it: Item }) => (issued[b.it.id] || 0) - (issued[a.it.id] || 0) || a.it.sort - b.it.sort;
    const sets: { it: Item; si: number }[] = [], others: { it: Item; si: number }[] = [];
    for (const it of s.catalog) {
      if (it.archived) continue;
      const half = setHalf(it);
      if (half) {
        const want = half === "top" ? st.top : st.pants;
        if (!want || !forThem(it)) continue;
        const si = it.sizes.map(String).indexOf(String(want));
        if (si >= 0) sets.push({ it, si });
      } else if (latest[it.id] && latest[it.id].si < it.sizes.length) {
        others.push({ it, si: latest[it.id].si });
      }
    }
    return [...sets.sort(rank), ...others.sort(rank)].slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.catalog, s.issues, st.id, st.top, st.pants, bucket, st.uniformStyle]);

  const cells = (it: Item): SizeCell[] => it.sizes.map((sz, si) => {
    const k = key(it.id, si), oh = onhand(s, L, k), pl = plOf(s, k), ro = reorderAt(s, k);
    return { si, size: String(sz), count: oh, state: oh <= 0 ? "out" : ro > 0 && oh <= ro ? "low" : "ok", title: `${oh} on shelf · ${pl} pre-loved` };
  });

  function add(itemId: string, si: number) {
    onAdd(itemId, si);
    setErr("");
    inputRef.current?.focus();
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape" && listShown) { e.preventDefault(); setOpen(false); return; }
    if (e.key === "ArrowDown" && listShown) { e.preventDefault(); popRef.current?.querySelector<HTMLButtonElement>("button")?.focus(); return; }
    if (e.key !== "Enter" || e.ctrlKey || e.metaKey) return;
    const raw = q.trim();
    if (!raw) return;
    e.preventDefault();
    const hit = bcParse(s, raw);
    if (hit) { setQ(""); add(hit.itemId, hit.si); return; }
    // A name with no size can't be added; a code nobody knows gets bound (admins) or reported.
    if (/\d/.test(raw) && !/\s/.test(raw)) {
      setQ("");
      if (isAdmin) onBind(raw);
      else setErr(`No garment has ${raw}.`);
    }
  }

  const option = (it: Item) => (
    <div key={it.id} className={styles.opt}>
      <div className={styles.optHead}><span>{label(it)}</span>{it.sku && <span className="tc-mono" style={{ fontWeight: 400, fontSize: 12, color: "#57534f" }}>{it.sku}</span>}</div>
      <SizeStrip itemLabel={label(it)} cells={cells(it)} action="Add" onCell={(si) => add(it.id, si)} />
    </div>
  );

  const shownGroups = showAll ? groups : groups.slice(0, HOLD_SHOWN);
  const holdingQty = groups.reduce((t, g) => t + g.qty, 0);
  const recordHref = `/app/staff/${st.id}?tab=details${isAdmin ? "&edit=1" : ""}`;

  return (
    <Panel title="Add garments" aside={repeatDate ? <button type="button" className={`btn btn-ghost ${styles.rowGhost}`} onClick={onRepeat}>Repeat last · {dayMonth(repeatDate)}</button> : undefined}>
      <div className={styles.scanWrap} ref={wrapRef}
        onBlur={(e) => { if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
        <div className={styles.scanBox}>
          <Icon name="scan" size={16} />
          <input ref={inputRef} className={styles.scanInput} role="combobox" aria-expanded={listShown} aria-controls={popId} aria-autocomplete="list" aria-haspopup="dialog"
            aria-label="Scan a garment or type a garment name" placeholder="Scan a garment, or type a name" autoFocus autoComplete="off"
            value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setErr(""); }} onFocus={() => setOpen(true)} onKeyDown={onKey} />
          <button type="button" className={`btn btn-ghost ${styles.camBtn}`} onClick={onCamera} aria-label="Scan with the camera"><Icon name="camera" size={16} /></button>
        </div>
        {listShown && (
          <div id={popId} ref={popRef} className={styles.pop} role="dialog" aria-label="Matching garments"
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); inputRef.current?.focus(); } }}>
            {found.rel.length + found.other.length === 0 && <div className={styles.popEmpty}>No garment matches “{q.trim()}”.</div>}
            {found.rel.map(option)}
            {found.other.length > 0 && <div className={`tc-lbl ${styles.optDivider}`}>Other garments</div>}
            {found.other.map(option)}
          </div>
        )}
      </div>
      {err && <div className={styles.scanErr}><ErrorLine msg={err} /></div>}

      <div className={`tc-lbl ${styles.usualLbl}`}>{pr.poss} usual · one tap adds it</div>
      <div className={styles.chips}>
        {usual.map(({ it, si }) => (
          <button type="button" key={it.id} className={`btn btn-secondary ${styles.chip}`} onClick={() => add(it.id, si)} aria-label={`Add ${label(it)} size ${sizeOf(it, si)}`}>
            {label(it)} <Tag tone="ink" mono>{sizeOf(it, si)}</Tag>
          </button>
        ))}
        {!st.top && !st.pants && (
          <span className={styles.meta}>No usual sizes recorded · <Link href={recordHref} className="btn btn-ghost" style={{ minHeight: 0, padding: 0, fontSize: 12 }}>Record them</Link></span>
        )}
      </div>

      <div className={`tc-lbl ${styles.holdLbl}`}>Holding now · {holdingQty} {holdingQty === 1 ? "garment" : "garments"}</div>
      {groups.length === 0 ? (
        <div className={styles.empty} style={{ paddingTop: 0 }}>Nothing out.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className="tc-table">
            <tbody>
              {shownGroups.map((g) => {
                const it = byId[g.itemId];
                return (
                  <tr key={g.itemId + ":" + g.si}>
                    <td>{label(it)} · <span className="tc-mono">{sizeOf(it, g.si)}</span></td>
                    <td className="num">×{g.qty}</td>
                    <td className={styles.meta}>last {dayMonth(g.last)}</td>
                    <td style={{ textAlign: "right" }}>
                      <button type="button" className={`btn btn-ghost ${styles.rowGhost}`} aria-label={`Return ${label(it)} size ${sizeOf(it, g.si)}`} onClick={() => onReturn(g.latest)}>Return</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {(groups.length > HOLD_SHOWN || owed > 0) && (
        <div className={styles.holdFoot}>
          {groups.length > HOLD_SHOWN && <button type="button" className={`btn btn-ghost ${styles.rowGhost}`} aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : "Show all"}</button>}
          {owed > 0 && <span className={styles.meta}>+{owed} on order or waiting</span>}
        </div>
      )}
    </Panel>
  );
}
