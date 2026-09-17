"use client";
import { useId } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { Icon, Kbd, Panel, QtyStepper, Seg, Tag } from "@/components/portal";
import { ccOf, genderLabel, groupsLabel, key, label, money, onhand, plOf, setHalf, type StaffRec } from "@/lib/compute";
import { plural, pronoun, sizeOf, type Source } from "./lib";
import type { CounterCart } from "./useCounterCart";
import styles from "./counter.module.css";

export default function PickupCart({ st, cart: c, mac, onRecord }: { st: StaffRec; cart: CounterCart; mac: boolean; onRecord: () => void }) {
  const { s } = useSnap();
  const { L, byId } = useDerived();
  const reasonsId = useId();
  const pr = pronoun(st);
  const cap = c.cap;
  const costCentre = ccOf(s, st);

  const apClause = c.apN > 0 ? (c.apN === c.apRem ? ` · uses the last ${c.apN} signed` : ` · uses ${c.apN} signed`) : "";

  return (
    <Panel title="This pickup" aside={c.cart.length ? `${plural(c.cart.length, "line", "lines")} · ${plural(c.garments, "garment", "garments")}` : undefined}>
      {c.cart.length === 0 && <div className={styles.empty}>Scan, type or tap a usual to add garments.</div>}
      {c.cart.length > 0 && (
        <div>
          {c.cart.map((line, i) => {
            const it = byId[line.itemId];
            const size = sizeOf(it, line.si);
            const k = key(line.itemId, line.si);
            const oh = onhand(s, L, k), pl = plOf(s, k);
            const opts: Source[] = pl > 0 || line.src === "preloved" ? ["stock", "preloved", "order"] : ["stock", "order"];
            const half = setHalf(it);
            const want = half === "top" ? st.top : half === "pants" ? st.pants : "";
            const offUsual = !!want && !!it && it.sizes.map(String).includes(String(want)) && size !== String(want);
            const shortShelf = line.src === "stock" && line.qty > oh;
            const shortPool = line.src === "preloved" && line.qty > pl;
            return (
              <div key={line.itemId + ":" + line.si} className={styles.cartLine}>
                <div className={styles.lineMain}>
                  <div className={styles.lineTitle}>{label(it)} · <span className="tc-mono">{size}</span></div>
                  <div className={styles.lineSeg}>
                    <Seg<Source> size="sm" label={`Where ${label(it)} ${size} comes from`} opts={opts} value={(line.src ?? "") as Source}
                      onChange={(v) => c.setLine(i, { src: v })}
                      labels={{
                        stock: <>Shelf <b className="tc-mono" style={{ fontWeight: 500 }}>{oh}</b></>,
                        preloved: <>Pre-loved <b className="tc-mono" style={{ fontWeight: 500 }}>{pl}</b></>,
                        order: "Order in",
                      }} />
                    {line.src === null && <span className={styles.hint}>Pick a source</span>}
                    {shortShelf && <Tag tone="low">Not enough on the shelf</Tag>}
                    {shortPool && <Tag tone="low">Not enough pre-loved</Tag>}
                  </div>
                  {offUsual && <div className={styles.hint} style={{ marginTop: 4 }}>Usual size {want}</div>}
                </div>
                <QtyStepper value={line.qty} min={0} label={`${label(it)} ${size}`} onChange={(n) => c.setQty(i, n)} />
                <div className={`tc-mono ${styles.cost}`}>{money(line.src === "preloved" ? 0 : line.qty * (it?.cost || 0))}</div>
              </div>
            );
          })}
        </div>
      )}

      {c.cart.length > 0 && cap && (
        <div className={styles.after}>
          <div className={styles.afterRow}>
            {c.needsTick ? <span className="tc-mark" aria-hidden="true" style={{ marginRight: 6 }} /> : <Icon name="check" size={16} />}
            <span>After this {pr.subj} {pr.holds} <b className="tc-mono">{cap.afterSets} of {cap.cap}</b> sets{apClause}</span>
          </div>
          {c.needsTick && (
            <>
              <div id={reasonsId}>
                {c.overCap && (
                  <div className={styles.reason}>
                    {cap.breach === "other" ? `Past ${cap.otherCap} garments outside a set — holds ${cap.afterOther}` : `Past ${cap.cap} sets — holds ${cap.afterTops} tops and ${cap.afterPants} pairs`}
                  </div>
                )}
                {c.offItems.map((it) => <div key={"g" + it.id} className={styles.reason}>{it.item} is for {groupsLabel(it.groups)}</div>)}
                {c.offStyleItems.map((it) => <div key={"c" + it.id} className={styles.reason}>{it.item} is the {genderLabel(it.gender)} cut</div>)}
              </div>
              <label className={styles.tick}>
                <input type="checkbox" checked={c.override} onChange={() => c.setOverride(!c.override)} aria-describedby={reasonsId} />
                Record as an override
              </label>
            </>
          )}
          {c.ap && (
            <div className={styles.afterRow}>
              <span>Sets off the signed form</span>
              <QtyStepper size="sm" value={c.apN} min={0} max={c.apRem} label="set off the signed form" onChange={(n) => c.setApDeduct(n)} />
              <span className={styles.meta}>{c.apRem} left</span>
            </div>
          )}
        </div>
      )}

      <div className={styles.charge}>
        <div>
          <div className="tc-lbl">Charged to {costCentre || "no cost centre"}</div>
          <div className={`tc-mono ${styles.total}`}>{money(c.cartVal)}</div>
        </div>
        <div className={styles.chargeBtns}>
          <button type="button" className="btn btn-secondary" onClick={c.printSlip} disabled={c.cannot || c.handed.length === 0}><Icon name="print" size={16} /> Collection slip</button>
          <button type="button" className="btn btn-primary" onClick={onRecord} disabled={c.cannot} aria-keyshortcuts="Control+Enter Meta+Enter">
            Record issue <span className={styles.kbdHint}><Kbd onAccent>{mac ? "⌘↵" : "Ctrl↵"}</Kbd></span>
          </button>
        </div>
        {c.inactive && <div className={styles.hint} style={{ width: "100%" }}>Inactive on the register: reactivate to issue</div>}
      </div>
    </Panel>
  );
}
