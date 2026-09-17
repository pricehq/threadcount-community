"use client";
/* The Sign step shared by the counter phone's three hand-overs (an issue, a request, a ward round),
 * and the Done screen every finished job lands on.
 *
 * SignFlow draws what is being handed over, the caller's extra section (approval, Received by), the
 * signature and the slip switch; uploads the signature as a Photo; hands the id to the caller's
 * commit; and on success replaces the screen with DoneScreen, then router.replace()s the form with
 * /m/done (useShowDone), so Back does not return to a signed, spent form and a refresh keeps Done. */
import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDerived, useSnap } from "@/lib/client";
import { label, onOrderText, onhand, reorderAt, splitKey } from "@/lib/compute";
import { uploadPhoto } from "@/lib/photo";
import { MBar, MBody, MButton, MDone, MError, MRow, MRule, MSection, MShelfNow, MSignature, MSwitchRow, MTop } from "@/components/m";

export type SignKind = "issue" | "request" | "round";
export type DoneProps = { head: string; sub: string; shelfKeys: string[]; next: "scan" | "work" | "today" };
export type SignFlowProps = {
  kind: SignKind;
  /** MHead, or the round head. */
  head: React.ReactNode;
  lines: { key: string; name: string; qty: number }[];
  /** Shown in the signature hint. */
  signerName: string;
  /** Approval section (issue) or Received by field (round). */
  extra?: React.ReactNode;
  /** Undefined for a round (no switch). */
  slip?: { available: boolean };
  /** "Issue 4 items" | "Hand over 3 items" | "Delivered" */
  barLabel: string;
  commit: (a: { sigId: string; slip: boolean }) => Promise<{ ok: true; done: DoneProps } | { ok: false; error: string }>;
  /** A page still under the form in history that is spent once this commits (the request pick list):
   *  it sends Back on to Work instead of reading "moved on". */
  spentHref?: string;
};

/* The Done props of the last finished job: module memory for client navigation and refreshes,
   sessionStorage for a reload of /m/done. */
const DONE_KEY = "tc.m.done";
const SPENT_KEY = "tc.m.spent";
let DONE: DoneProps | null = null;

export function readDone(): DoneProps | null {
  if (DONE) return DONE;
  try {
    const v = window.sessionStorage.getItem(DONE_KEY);
    if (v) DONE = JSON.parse(v) as DoneProps;
  } catch { /* storage blocked: nothing to show */ }
  return DONE;
}

/** True when `href` was the form (or pick list) under a job that has since been finished here. */
export function wasSpent(href: string): boolean {
  try { return (JSON.parse(window.sessionStorage.getItem(SPENT_KEY) || "[]") as string[]).includes(href); } catch { return false; }
}

/** Keeps the Done props and replaces the current entry with /m/done. */
export function useShowDone() {
  const router = useRouter();
  return useCallback((done: DoneProps, spentHref?: string) => {
    DONE = done;
    try {
      window.sessionStorage.setItem(DONE_KEY, JSON.stringify(done));
      if (spentHref) {
        const list = (JSON.parse(window.sessionStorage.getItem(SPENT_KEY) || "[]") as string[]).filter((x) => x !== spentHref);
        window.sessionStorage.setItem(SPENT_KEY, JSON.stringify([spentHref, ...list].slice(0, 20)));
      }
    } catch { /* module memory still carries it this session */ }
    router.replace("/m/done");
  }, [router]);
}

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export default function SignFlow(props: SignFlowProps) {
  const { kind, head, lines, signerName, extra, slip, barLabel, commit, spentHref } = props;
  const { mutate } = useSnap();
  const showDone = useShowDone();
  const pad = useRef<{ clear: () => void; dataUrl: () => string | null } | null>(null);
  const [signed, setSigned] = useState(false);
  const [sendSlip, setSendSlip] = useState(!!slip?.available);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<DoneProps | null>(null);
  const total = lines.reduce((t, l) => t + l.qty, 0);

  if (done) return <DoneScreen {...done} />;

  async function go() {
    if (busy) return;
    const png = pad.current?.dataUrl() || null;
    if (!png) { setErr("Ask them to sign first"); return; }
    setBusy(true); setErr("");
    const up = await uploadPhoto(mutate, "sig", png);
    if ("error" in up) { setBusy(false); setErr(up.error); return; }
    const r = await commit({ sigId: up.id, slip: !!slip?.available && sendSlip });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; } // the signature stays on the pad
    setDone(r.done);
    showDone(r.done, spentHref);
  }

  return (
    <>
      <MTop title="Sign" back />
      <MRule />
      <MError msg={err} onDismiss={() => setErr("")} />
      <MBody pad>
        {head}
        <MSection flush label="Handing over" right={plural(total, "item")} />
        {lines.map((l) => <MRow key={l.key} dense mark="ink" title={l.name} right={`×${l.qty}`} />)}
        {extra}
        <MSection label="Signature" />
        <MSignature name={signerName} onReady={(api) => { pad.current = api; }} onChange={setSigned} />
        <MButton small label="Clear the signature" onClick={() => pad.current?.clear()} />
        {slip && (
          <MSwitchRow title="Send the slip to their staff app" sub={slip.available ? "Garments and sizes only" : "No staff app account"}
            on={slip.available && sendSlip} onToggle={() => setSendSlip((v) => !v)} disabled={!slip.available} />
        )}
      </MBody>
      <MBar label={busy ? "Recording…" : barLabel} glyph={kind === "round" ? "check" : "arrow"} small={busy ? undefined : signed ? "signed" : "needs a signature"}
        disabled={busy || !signed} offReason={busy ? undefined : "Ask them to sign first"} onClick={go} />
    </>
  );
}

/** The finish screen: top bar "Done" (no back), the tick, what is left on the shelf, and the next job. */
export function DoneScreen({ head, sub, shelfKeys, next }: DoneProps) {
  const { s } = useSnap();
  const { L, byId } = useDerived();
  const lines = useMemo(() => [...new Set(shelfKeys)].map((k) => {
    const { itemId, si } = splitKey(k);
    const it = byId[itemId];
    return { key: k, name: `${label(it)} ${String(it?.sizes[si] ?? si)}`, onHand: Math.max(0, onhand(s, L, k)), par: reorderAt(s, k), onOrder: onOrderText(s, itemId, si) };
  }), [shelfKeys, s, L, byId]);
  return (
    <>
      <MTop title="Done" />
      <MRule />
      <MBody pad>
        <MDone head={head} sub={sub}>
          <MShelfNow lines={lines} />
          {next !== "today" && <MButton label="Back to Today" href="/m" />}
        </MDone>
      </MBody>
      {next === "scan" ? <MBar label="Scan next badge" glyph="scan" href="/m/scan" />
        : next === "work" ? <MBar label="Back to Work" href="/m/work" />
        : <MBar label="Back to Today" href="/m" />}
    </>
  );
}
