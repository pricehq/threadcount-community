"use client";
/* The Counter (/app/counter?staff=&mode=): person first, then Issue, Return, Hand in or Swap a size. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDerived, useSnap } from "@/lib/client";
import { ErrorLine, LiveRegion, PageHead } from "@/components/ui";
import { Kbd, Seg } from "@/components/portal";
import { AdjustDialog, BindDialog, HandInDialog, ReturnDialog } from "@/components/dialogs";
import Camera from "@/components/Camera";
import { bcParse, capCheck, label, type IssueRec } from "@/lib/compute";
import { MODES, MODE_LABELS, holdingGroups, openIssuesOf, overlayOpen, sizeOf, type Mode } from "./lib";
import { useCounterCart } from "./useCounterCart";
import PersonPicker from "./PersonPicker";
import PersonPanel from "./PersonPanel";
import AddGarments from "./AddGarments";
import PickupCart from "./PickupCart";
import { HandInPanel, HoldingPanel, ReturnedToday, SwapPanel, SwappedToday } from "./Modes";
import styles from "./counter.module.css";

export default function Counter() {
  const { s, isAdmin } = useSnap();
  const { byId, staffById } = useDerived();
  const router = useRouter();
  const sp = useSearchParams();

  const staffParam = sp.get("staff") || "";
  const sel = staffParam ? staffById[staffParam] || s.staff.find((x) => x.num === staffParam) : undefined;
  const modeParam = sp.get("mode") as Mode | null;
  const mode: Mode = modeParam && MODES.includes(modeParam) ? modeParam : "issue";

  const setUrl = useCallback((staff: string | null, m: Mode) => {
    const q = new URLSearchParams();
    if (staff) q.set("staff", staff);
    if (staff && m !== "issue") q.set("mode", m);
    const qs = q.toString();
    router.replace(`/app/counter${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router]);

  const cart = useCounterCart(sel);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [cam, setCam] = useState(false);
  const [camMsg, setCamMsg] = useState("");
  const [bind, setBind] = useState("");
  const [ret, setRet] = useState<IssueRec | null>(null);
  const [handin, setHandin] = useState(false);
  const [adjust, setAdjust] = useState(false);
  const [mac, setMac] = useState(false);
  useEffect(() => { setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)); }, []);

  // Messages belong to one person.
  const [msgFor, setMsgFor] = useState(sel?.id || "");
  if (msgFor !== (sel?.id || "")) { setMsgFor(sel?.id || ""); setMsg(""); setErr(""); }

  const scanRef = useRef<HTMLInputElement>(null);
  const listOpenRef = useRef(false);

  const held = useMemo(() => (sel ? capCheck(s, sel, []) : null), [s, sel]);
  const open = useMemo(() => (sel ? openIssuesOf(s, sel.id) : []), [s, sel]);
  const groups = useMemo(() => holdingGroups(open), [open]);
  const owed = held ? held.owed.tops + held.owed.pants + held.owed.other : 0;

  // Repeat last issue: every unreturned line from their most recent issue date.
  const lastSet = useMemo(() => {
    if (!open.length) return [];
    const latest = open.reduce((d, i) => (i.date > d ? i.date : d), "");
    return open.filter((i) => i.date === latest && byId[i.itemId] && !byId[i.itemId].archived);
  }, [open, byId]);

  const pick = (id: string) => { setMsg(""); setErr(""); setUrl(id, mode); };
  const changePerson = () => { setMsg(""); setErr(""); setCam(false); setUrl(null, "issue"); };
  const setMode = (m: Mode) => { if (sel) setUrl(staffParam, m); };
  const addGarment = (itemId: string, si: number) => { cart.add(itemId, si); setMsg(""); };

  async function doIssue() {
    setErr("");
    const r = await cart.record();
    if (!r) return;
    if (r.ok) setMsg(r.msg); else setErr(r.error);
    scanRef.current?.focus();
  }

  function camHit(raw: string) {
    const code = raw.trim();
    if (!sel) {
      const st = s.staff.find((x) => x.num === code);
      setCam(false);
      if (st) pick(st.id); else setErr(`No one on the register has ${code}.`);
      return;
    }
    const p = bcParse(s, code);
    if (!p) {
      setCam(false);
      if (isAdmin) setBind(code); else setErr(`No garment has ${code}.`);
      return;
    }
    if (mode !== "issue") setMode("issue");
    addGarment(p.itemId, p.si);
    setCamMsg(`Added ${label(byId[p.itemId])} · ${sizeOf(byId[p.itemId], p.si)}`);
  }

  // Window events and keys read the latest render through a ref.
  const cartLines = cart.cart.length;
  const latest = useRef({ sel, mode, cam, cartLines, setMode, addGarment, changePerson, doIssue });
  useEffect(() => { latest.current = { sel, mode, cam, cartLines, setMode, addGarment, changePerson, doIssue }; });
  useEffect(() => {
    const onScan = () => { setCamMsg(""); setCam(true); };
    const onGarment = (e: Event) => {
      const d = (e as CustomEvent<{ itemId: string; si: number }>).detail;
      const cur = latest.current;
      if (!d || !cur.sel) return;
      if (cur.mode !== "issue") cur.setMode("issue");
      cur.addGarment(d.itemId, d.si);
    };
    const onKey = (e: KeyboardEvent) => {
      const cur = latest.current;
      if (e.defaultPrevented || !cur.sel || cur.cam || overlayOpen()) return;
      if (e.key === "Escape") {
        // A pickup being built is never thrown away by a stray Escape: change person from the panel.
        if (listOpenRef.current || cur.cartLines > 0) return;
        e.preventDefault();
        cur.changePerson();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && cur.mode === "issue") {
        e.preventDefault();
        void cur.doIssue();
      }
    };
    window.addEventListener("tc-scan", onScan);
    window.addEventListener("tc-scan-garment", onGarment);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("tc-scan", onScan);
      window.removeEventListener("tc-scan-garment", onGarment);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <section>
      <PageHead title="Counter">
        <button type="button" className="btn btn-onink" onClick={() => setAdjust(true)}>Hand-in without a person</button>
      </PageHead>

      {!sel ? (
        <div className={styles.stack}>
          {staffParam && <ErrorLine msg="No one on the register matches that link or badge." />}
          <PersonPicker onPick={pick} />
          <ErrorLine msg={err} />
        </div>
      ) : (
        <div className={styles.stack}>
          {held && <PersonPanel st={sel} held={held} onChange={changePerson} />}

          <div className={styles.modeRow}>
            <div className={styles.modeSeg}>
              <Seg<Mode> label="Counter mode" opts={MODES} value={mode} labels={MODE_LABELS} onChange={setMode} />
            </div>
            {!cart.cart.length && <div className={styles.kbdHint}><Kbd>Esc</Kbd> change person</div>}
          </div>

          {mode === "issue" && (
            <div className={`${styles.grid}${cart.cart.length ? " " + styles.cartFirst : ""}`}>
              <div>
                <AddGarments st={sel} isAdmin={isAdmin} onAdd={addGarment} onBind={setBind} onCamera={() => { setCamMsg(""); setCam(true); }}
                  onReturn={setRet} onRepeat={() => { cart.replace(lastSet.map((i) => ({ itemId: i.itemId, si: i.si, qty: i.qty, src: "stock" as const }))); setMsg(""); }}
                  repeatDate={lastSet.length ? lastSet[0].date : null} groups={groups} owed={owed} inputRef={scanRef} listOpenRef={listOpenRef} />
              </div>
              <div className={styles.pickup}>
                <PickupCart st={sel} cart={cart} mac={mac} onRecord={doIssue} />
              </div>
            </div>
          )}
          {mode === "return" && (
            <div className={styles.grid}>
              <HoldingPanel st={sel} onReturn={setRet} onError={setErr} />
              <ReturnedToday st={sel} />
            </div>
          )}
          {mode === "handin" && (
            <div className={styles.grid}>
              <HoldingPanel st={sel} onError={setErr} />
              <HandInPanel st={sel} onRecord={() => setHandin(true)} />
            </div>
          )}
          {mode === "swap" && (
            <div className={styles.grid}>
              <SwapPanel st={sel} onDone={(m) => { setErr(""); setMsg(m); }} onError={(e) => { setMsg(""); setErr(e); }} />
              <SwappedToday st={sel} />
            </div>
          )}

          <LiveRegion msg={msg} className={styles.msg} />
          <ErrorLine msg={err} />
        </div>
      )}

      {cam && <Camera onHit={camHit} message={camMsg} onClose={() => { setCam(false); scanRef.current?.focus(); }} />}
      {bind && <BindDialog code={bind} onClose={() => setBind("")} onBound={(itemId, si) => { if (mode !== "issue") setMode("issue"); addGarment(itemId, si); }} />}
      {ret && <ReturnDialog issue={ret} onClose={() => setRet(null)} />}
      {handin && sel && <HandInDialog staff={sel} onClose={() => setHandin(false)} onDone={(m) => { setErr(""); setMsg(m); }} />}
      {adjust && <AdjustDialog init={{ itemId: "", si: 0, preloved: true }} onClose={() => setAdjust(false)} />}
    </section>
  );
}
