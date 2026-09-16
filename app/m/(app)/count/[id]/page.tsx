"use client";
/* Counting: scan a garment and its own line goes up by one and becomes the line being counted.
   Expected figures stay on screen (a sighted count, as the phone has always been). The tally lives
   in localStorage (lib/opencount.ts), so backgrounding the app mid-shelf loses nothing.

   Hands-free keeps the camera reading continuously. Inside the Android shell MLKit runs with its
   preview behind this opaque screen, so the panel and the list stay in view and each garment is a
   beep, a buzz and the figures moving (handsfree.png). In a browser the camera needs a visible,
   playing <video>, so hands-free opens the live camera overlay with the same panel and switch. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSnap } from "@/lib/client";
import { UNPLACED } from "@/lib/compute";
import MScan from "@/components/MScan";
import { isNative, startLive } from "@/lib/nativescan";
import { scanReject, scanTick } from "@/lib/feedback";
import { track } from "@/lib/analytics";
import { useKeepAwake } from "@/lib/wakelock";
import { SHELF_LABEL_PREFIX } from "@/lib/scanroute";
import { readCount, writeCount } from "@/lib/opencount";
import { GROUND, INK, MAction, MBody, MButton, MEmpty, MError, MRow, MRule, MSection, MSplit, MTop, MTopAction } from "@/components/m";
import { CountFigures, CountPanel, HandsFree, TypeCount } from "@/components/m/count/CountPanel";
import { lineTitle, useCountLines } from "@/components/m/count/lines";

const DEBOUNCE_MS = 900;

export default function MCounting() {
  const { s } = useSnap();
  const router = useRouter();
  const locationId = String(useParams().id || "");
  const { lines, locName, locs } = useCountLines(locationId);

  const [counted, setCounted] = useState<Record<string, number>>({});
  // Held by variant key, never by position: the list is rebuilt on every live refresh.
  const [activeKey, setActiveKey] = useState("");
  const [single, setSingle] = useState(false);
  const [hands, setHands] = useState(false);
  // "inline": MLKit behind this screen. "overlay": the live camera overlay (browser, or a shell without MLKit).
  const [handsMode, setHandsMode] = useState<"inline" | "overlay">("inline");
  const [typing, setTyping] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  // Restore this person's open count of this shelf, once per shelf. The key includes the user: the
  // phone is shared. It deliberately does not re-run on `lines`, so a size moved off the shelf from
  // the desktop mid-count keeps what was already counted against it.
  const me = s.session.userId;
  useEffect(() => {
    setCounted(readCount(me, locationId)?.n ?? {});
    // Recount from Check the gaps lands here with ?line=<key>.
    try {
      const line = new URLSearchParams(window.location.search).get("line");
      if (line) setActiveKey(line);
    } catch { /* no query to read */ }
    setLoaded(true);
  }, [me, locationId]);

  useEffect(() => {
    if (!loaded) return;
    writeCount(me, locationId, counted);
  }, [counted, me, locationId, loaded]);

  useKeepAwake(true);

  const total = lines.reduce((t, l) => t + (counted[l.key] ?? 0), 0);
  const expectedAll = lines.reduce((t, l) => t + l.expected, 0);
  const cur = lines.find((l) => l.key === activeKey) || lines[0];
  const curName = cur ? `${lineTitle(cur)} · ${cur.size}` : "";
  const curN = cur ? counted[cur.key] ?? 0 : 0;

  const bump = useCallback((k: string, by: number) => {
    setCounted((c) => ({ ...c, [k]: Math.max(0, (c[k] ?? 0) + by) }));
  }, []);

  /** A scanned code lands on its own line, whichever line was active: the barcode is the truth. */
  const onCode = useCallback((raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const hit = s.barcodes[code];
    const line = hit ? lines.find((l) => l.key === hit) : lines.find((l) => l.code === code);
    if (!line) {
      scanReject();
      const known = Object.prototype.hasOwnProperty.call(s.barcodes, code);
      track("scan_miss", { kind: known ? "wrong_shelf" : "unknown" });
      const shelf = code.startsWith(SHELF_LABEL_PREFIX) ? locs[code.slice(SHELF_LABEL_PREFIX.length)] : undefined;
      const placedAt = hit ? locs[s.placed[hit] || ""]?.name : "";
      setErr(shelf ? `That’s the label for ${shelf.name}`
        : !known ? `${code} isn’t a garment ThreadCount knows`
          : placedAt ? `${code} is on ${placedAt}, not this shelf`
            : locationId === UNPLACED ? `${code} isn’t in this count` : `${code} isn’t on a shelf yet`);
      setLog((g) => [`${code}: not on this shelf`, ...g].slice(0, 8));
      return;
    }
    setActiveKey(line.key);
    setTyping(false);
    bump(line.key, 1);
    setErr("");
    setLog((g) => [`${lineTitle(line)} ${line.size}`, ...g].slice(0, 8));
  }, [s.barcodes, s.placed, lines, locs, locationId, bump]);

  const onCodeRef = useRef(onCode); onCodeRef.current = onCode;

  // Hands-free inside the Android shell: MLKit reads continuously behind this screen. This screen's
  // root carries `tcx-scanui` while it runs, so globals.css leaves it visible and opaque.
  const [inlineLive, setInlineLive] = useState(false);
  useEffect(() => {
    if (!hands || handsMode !== "inline") return;
    if (!isNative()) { setHandsMode("overlay"); return; }
    let session: { stop: () => Promise<void> } | null = null;
    let cancelled = false;
    let lastRaw = "", lastT = 0;
    setInlineLive(true);
    (async () => {
      const r = await startLive((raw) => {
        if (raw === lastRaw && Date.now() - lastT < DEBOUNCE_MS) return;
        lastRaw = raw; lastT = Date.now();
        scanTick();
        onCodeRef.current(raw);
      });
      if (cancelled) { await r.stop(); return; }
      if (r.error === "native-unavailable") { setInlineLive(false); setHandsMode("overlay"); return; }
      if (r.error) { setInlineLive(false); setHands(false); setErr(r.error); return; }
      session = r;
    })();
    track("scan_opened", { mode: "live", engine: "mlkit-inline" });
    return () => { cancelled = true; setInlineLive(false); if (session) session.stop(); };
  }, [hands, handsMode]);

  const toggleHands = () => {
    setTyping(false);
    setSingle(false);
    setHands((h) => !h);
  };

  if (loaded && !lines.length) {
    return (
      <>
        <MTop title={locName} back />
        <MRule />
        <MBody pad><MEmpty title="Nothing on this shelf" sub="Place sizes on it in the portal" /></MBody>
      </>
    );
  }

  const panelInner = cur ? <CountFigures name={curName} counted={curN} expected={cur.expected} /> : null;

  return (
    // display: contents keeps every piece a direct flex child of .tcx-app as before; the class is what
    // spares this screen while MLKit's preview runs behind the WebView.
    <div className={inlineLive ? "tcx-scanui" : undefined} style={{ display: "contents" }}>
      <MTop title={locName} back right={<MTopAction label="Finish" onClick={() => { setHands(false); router.push(`/m/count/${locationId}/variance`); }} />} />
      <MRule n={total} of={expectedAll} />
      <MError msg={err} onDismiss={() => setErr("")} />

      <MBody pad>
        {cur && (
          <CountPanel>
            {panelInner}
            <HandsFree on={hands} onToggle={toggleHands} />
            {typing && (
              <TypeCount key={cur.key} name={curName} value={curN}
                onSet={(n) => { setCounted((c) => ({ ...c, [cur.key]: n })); setTyping(false); }} />
            )}
          </CountPanel>
        )}

        <MSection label="Lines" right={`${total} of ${expectedAll}`} />
        {lines.map((l) => {
          const n = counted[l.key] ?? 0;
          const on = !!cur && l.key === cur.key;
          return (
            <MRow key={l.key} active={on} onClick={() => { setActiveKey(l.key); setTyping(false); }}
              mark={n === l.expected ? "ok" : n > 0 ? "ink" : "mute"}
              title={`${lineTitle(l)} ${l.size}`}
              sub={l.where || undefined}
              right={`${n}/${l.expected}`} />
          );
        })}

        <div style={{ marginTop: 14 }}>
          <MButton label="Type a count" onClick={() => { setHands(false); setTyping((t) => !t); }} disabled={!cur} />
        </div>
      </MBody>

      <MSplit>
        <MAction label="Undo" flex={1} tone="ink" onClick={() => cur && bump(cur.key, -1)} disabled={!cur || curN <= 0} />
        <MAction label="Scan" flex={2} glyph="scan" glyphAt="right" onClick={() => { setHands(false); setTyping(false); setSingle(true); }} />
      </MSplit>

      {single && (
        <MScan title="Scan a garment" onHit={(raw) => { onCode(raw); setSingle(false); }} onClose={() => setSingle(false)} />
      )}

      {hands && handsMode === "overlay" && (
        <MScan
          title="Hands-free"
          live
          running
          log={log}
          debounceMs={DEBOUNCE_MS}
          onHit={onCode}
          onClose={() => setHands(false)}
          figure={cur ? <div style={{ background: INK, color: GROUND, padding: "12px 16px 0" }}>{panelInner}</div> : undefined}
          control={<div style={{ background: INK, padding: "0 16px calc(12px + env(safe-area-inset-bottom, 0px))" }}><HandsFree on onToggle={() => setHands(false)} /></div>}
        />
      )}
    </div>
  );
}
