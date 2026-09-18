"use client";
/* The app's barcode camera. Two modes:
   - "single": read one code and hand it back (issue, hand back, pick, count).
   - "live":   keep decoding, one tally per decode, with a debounce so a garment held in frame
               isn't counted twice. Beep and haptic tick on every accepted scan.
   Native Android gets a real scanner through Capacitor's MLKit plugin when one is present;
   the browser path uses BarcodeDetector through lib/webscan.ts, shared with the Scan tab. */
import { useCallback, useEffect, useRef, useState } from "react";
import { ACCENT, GROUND, INK, IconX, MAction, ON_DARK } from "@/components/m";
import { isNative, scanOnce, startLive } from "@/lib/nativescan";
import { startWebLive } from "@/lib/webscan";
import { scanTick } from "@/lib/feedback";
import { track } from "@/lib/analytics";
import { useKeepAwake } from "@/lib/wakelock";

export default function MScan({ onHit, onClose, live = false, title, figure, log = [], running, onToggle, debounceMs = 900, control }: {
  onHit: (raw: string) => void;
  onClose: () => void;
  live?: boolean;
  title: string;
  figure?: React.ReactNode;
  log?: string[];
  running?: boolean;
  onToggle?: () => void;
  debounceMs?: number;
  /** Drawn in place of the Start/Stop (or Done) bar, e.g. the counting screen's Hands-free switch. */
  control?: React.ReactNode;
}) {
  const vid = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState("Starting the camera…");
  const [denied, setDenied] = useState(false);
  const hit = useRef(onHit); hit.current = onHit;
  // In live mode the header's Start/Stop is the truth about whether a scan counts. Everything that
  // can accept a code checks it, native and web alike.
  const active = live ? !!running : true;
  const on = useRef(active); on.current = active;

  // Inside the Android shell MLKit does the reading; the browser path below is left alone.
  const native = isNative();
  // Whether MLKit is actually there. A shell built without the plugin answers "native-unavailable",
  // and the honest thing to do then is hand the job back to the browser scanner rather than sit on
  // a black screen — so this flips to false and the web effect below stops standing down.
  const [nativeOk, setNativeOk] = useState(native);
  useEffect(() => {
    if (!native || !nativeOk) return;
    let session: { stop: () => Promise<void> } | null = null;
    let cancelled = false;
    let lastRaw = "", lastT = 0;
    const accept = (raw: string) => {
      // Paused is paused. Without this the MLKit listener kept tallying garments onto the count
      // while the header said PAUSED and the phone was being carried to the next bay.
      if (!on.current) return;
      // Same debounce as the web path: a garment held in frame is one garment.
      if (raw === lastRaw && Date.now() - lastT < debounceMs) return;
      lastRaw = raw; lastT = Date.now();
      scanTick();
      hit.current(raw);
    };
    (async () => {
      if (live) {
        // `active` is in the dependency list, so stopping the scan tears this effect down and the
        // cleanup below stops the MLKit session: the camera is off while the header says PAUSED,
        // and starting again re-runs this and asks for the camera afresh.
        if (!active) return;
        const r = await startLive(accept);
        if (cancelled) { await r.stop(); return; }
        if (r.error === "native-unavailable") { setNativeOk(false); return; }
        if (r.error) { setStatus(r.error); setDenied(true); return; }
        setStatus("Hold each garment up to the camera");
        setDenied(false);
        session = r;
      } else {
        const r = await scanOnce();
        if (cancelled) return;
        if (r.error === "native-unavailable") { setNativeOk(false); return; }
        if (r.error) { setStatus(r.error); setDenied(true); return; }
        if (r.code) accept(r.code);
        onClose();
      }
    })();
    return () => { cancelled = true; if (session) session.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native, nativeOk, live, active, debounceMs]);

  useEffect(() => {
    if (nativeOk) return; // the shell has its own scanner running
    const v = vid.current;
    if (!v) return;
    const session = startWebLive(v, (raw) => hit.current(raw), debounceMs, {
      active: () => on.current,
      onStatus: (st) => {
        if (st.state === "ready") { setStatus(live ? "Hold each garment up to the camera" : "Point the camera at the barcode"); return; }
        setStatus(st.msg);
        if (st.state === "denied") setDenied(true);
      },
    });
    return () => session.stop();
  }, [nativeOk, live, debounceMs]);

  // Which scanner actually ran matters: the MLKit path is why the Android app exists, and the
  // browser fallback silently taking over would otherwise be invisible. A shell that had to fall
  // back files a second event naming its own engine, which is the number worth watching.
  useEffect(() => {
    track("scan_opened", { mode: live ? "live" : "single", engine: nativeOk ? "mlkit" : native ? "mlkit-missing" : "browser" });
  }, [native, nativeOk, live]);

  useKeepAwake(true);

  const close = useCallback(() => onClose(), [onClose]);

  // `tcx-scanui` is what spares this overlay while the Android shell scans: globals.css hides every
  // other child of .tcx-app so MLKit's camera preview, painted behind the WebView, can be seen.
  // Drop the class off the root below and the rule hides the scan UI along with everything else,
  // leaving a coordinator mid-count with a bare picture and no "Stop scanning" bar to press.
  return (
    <div className="tcx-scanui" style={{ position: "fixed", inset: 0, zIndex: 90, background: INK, color: GROUND, display: "flex", flexDirection: "column" }}>
      <header className="tcx-topbar" style={{ height: 56, flex: "0 0 56px", display: "flex", alignItems: "center", gap: 10, padding: "0 16px", background: INK }}>
        {live && <span aria-hidden="true" style={{ width: 9, height: 9, background: running ? ACCENT : "var(--color-neutral-600)" }} />}
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 15, letterSpacing: "0.06em", textTransform: "uppercase", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {live ? (running ? "LIVE" : "PAUSED") : title}
        </span>
        <button onClick={close} aria-label="Close the camera" style={{ width: 44, height: 44, marginRight: -12, border: 0, background: "none", color: "inherit", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><IconX /></button>
      </header>
      <div style={{ height: 4, flex: "0 0 4px", background: ACCENT }} />

      <div className="tcx-camwin" style={{ flex: 1, position: "relative", minHeight: 0, background: "var(--color-neutral-900)", overflow: "hidden" }}>
        <video ref={vid} autoPlay playsInline muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        {!denied && (
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: "76%", maxWidth: 380, height: 132, border: "3px solid #fff", position: "relative" }}>
              <span className="tcx-laser" style={{ position: "absolute", left: 0, right: 0, height: 3, background: ACCENT }} />
            </div>
          </div>
        )}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "12px 16px", background: "color-mix(in srgb, #201e1d 82%, transparent)" }}>
          {live && log.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--color-accent-300)" }}>Last scans</div>
              <div style={{ marginTop: 6 }}>
                {log.slice(0, 4).map((l, i) => (
                  <div key={i} style={{ fontSize: 13.5, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? GROUND : ON_DARK, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l}</div>
                ))}
              </div>
            </>
          )}
          {/* Drawn in live mode too. A refused camera or an MLKit that wouldn't start otherwise
              left the person looking at a black rectangle with nothing to read and nothing to do. */}
          <div role={denied ? "alert" : undefined} style={{ fontSize: 13.5, marginTop: live && log.length > 0 ? 8 : 0, color: denied ? "var(--color-accent-300)" : ON_DARK }}>{status}</div>
        </div>
      </div>

      {figure}
      {control !== undefined ? control : live && onToggle ? (
        <MAction label={running ? "Stop scanning" : "Start scanning"} onClick={onToggle} tone={running ? "grey" : "accent"} glyph="scan" />
      ) : (
        <MAction label="Done" onClick={close} tone="grey" />
      )}
    </div>
  );
}
