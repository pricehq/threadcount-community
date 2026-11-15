"use client";
/* The person screen is the issue screen: who they are, how near the six sets they hold, and the
 * Issue | Hand back | History segments. Each segment draws its own docked bar through setBar; a
 * finished hand back swaps the whole screen for the Done screen in place. */
import { useCallback, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSnap } from "@/lib/client";
import { approvalRemaining, capCheck, isNursing, staffName } from "@/lib/compute";
import { MBody, MEmpty, MError, MHead, MHeadRow, MMeterPair, MPill, MRule, MSeg, MTop } from "@/components/m";
import { useBasket } from "@/components/MBasket";
import { DoneScreen, type DoneProps } from "@/components/SignFlow";
import HandBackTab from "@/components/person/HandBackTab";
import IssueTab from "@/components/m/issue/IssueTab";
import HistoryTab from "@/components/m/issue/HistoryTab";
import { personMeta, plural } from "@/components/m/issue/meta";

type Tab = "issue" | "back" | "history";
const TABS: { key: Tab; label: string }[] = [
  { key: "issue", label: "Issue" },
  { key: "back", label: "Hand back" },
  { key: "history", label: "History" },
];
const asTab = (v: string | null): Tab => (v === "back" || v === "history" ? v : "issue");

export default function MPersonPage() {
  const { s } = useSnap();
  const id = String(useParams().id || "");
  const sp = useSearchParams();
  const basket = useBasket();
  const st = s.staff.find((x) => x.id === id);
  const [tab, setTab] = useState<Tab>(() => asTab(sp.get("tab")));
  const [bar, setBarNode] = useState<React.ReactNode>(null);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<DoneProps | null>(null);
  const top = useRef<HTMLSpanElement | null>(null);

  const setBar = useCallback((b: React.ReactNode) => setBarNode(b), []);
  const onError = useCallback((m: string) => setErr(m), []);
  const onDone = useCallback((d: DoneProps) => { setErr(""); setDone(d); }, []);

  if (done) return <DoneScreen {...done} />;

  if (!st) {
    return (
      <>
        <MTop title="Person" back />
        <MRule />
        <MBody pad><MEmpty title="No such staff member" /></MBody>
      </>
    );
  }

  const pickTab = (k: Tab) => {
    if (k === tab) return;
    setErr("");
    setTab(k);
    try { window.history.replaceState(null, "", `/m/person/${encodeURIComponent(id)}${k === "issue" ? "" : `?tab=${k}`}`); } catch { /* not fatal */ }
    const body = top.current?.parentElement;
    if (body) body.scrollTop = 0;
  };

  const lines = basket.issue(id);
  const cap = capCheck(s, st, lines);
  const left = approvalRemaining(s, st.id);
  const props = { staffId: st.id, setBar, onDone, onError };

  return (
    <>
      <MTop title={staffName(st)} back />
      <MRule />
      <MError msg={err} onDismiss={() => setErr("")} />
      <MBody pad>
        <span ref={top} aria-hidden="true" style={{ display: "block", height: 0 }} />
        <MHead name={staffName(st)} meta={personMeta(s, st)}>
          {tab === "issue" && (
            <>
              <MMeterPair items={[
                { label: "Tops held", held: cap.tops, adding: cap.addTops, cap: cap.cap },
                { label: "Pants held", held: cap.pants, adding: cap.addPants, cap: cap.cap },
              ]} />
              {isNursing(s, st) && <MHeadRow label="Manager approval" value={`${plural(left, "set")} left`} />}
            </>
          )}
        </MHead>
        {st.inactive && <div style={{ margin: "-4px 0 10px" }}><MPill tone="accent">Inactive</MPill></div>}
        <MSeg label="Record" value={tab} options={TABS} onPick={pickTab} />
        {tab === "issue" ? <IssueTab {...props} /> : tab === "back" ? <HandBackTab {...props} /> : <HistoryTab {...props} />}
      </MBody>
      {bar}
    </>
  );
}
