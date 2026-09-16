"use client";
/* The Scan tab: one camera for a staff badge, a garment or a shelf label, routed by lib/scanroute.
   Under the Android shell MLKit's preview shows through the transparent viewfinder; in a browser a
   <video> fills it through lib/webscan. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSnap } from "@/lib/client";
import { isNative, startLive } from "@/lib/nativescan";
import { startWebLive } from "@/lib/webscan";
import { scanReject, scanTick } from "@/lib/feedback";
import { track } from "@/lib/analytics";
import { useKeepAwake } from "@/lib/wakelock";
import { SCAN_KIND_LABEL, resolveScan, type ScanHit } from "@/lib/scanroute";
import { AC3, GROUND, INK, MBody, MButton, MONO, MPill, MRule, MSection, MTabs, MTop, useScanFlash } from "@/components/m";

type Recent = { kind: string; label: string; code: string; href: string };
/* What this session resolved, newest first. Module memory: it survives moving between tabs and is
   gone when the app is closed. */
let RECENT: Recent[] = [];

const OFF_GREY = "#b5b1af";
const EDGE = "#57534f";
const DEBOUNCE = 1500;

export default function ScanTab() {
  const { s, isAdmin } = useSnap();
  const router = useRouter();
  const flash = useScanFlash();
  const vid = useRef<HTMLVideoElement | null>(null);
  const [armed, setArmed] = useState(true);
  const [miss, setMiss] = useState<Extract<ScanHit, { kind: "unknown" | "inactive" }> | null>(null);
  const [caption, setCaption] = useState<{ msg: string; denied: boolean } | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [typed, setTyped] = useState("");
  const native = isNative();
  const [nativeOk, setNativeOk] = useState(native);
  const [nativeLive, setNativeLive] = useState(false);
  useKeepAwake(true);
  useEffect(() => { setRecent(RECENT); }, []);

  const handle = useCallback((raw: string) => {
    const hit = resolveScan(s, raw);
    if (hit.kind === "unknown" || hit.kind === "inactive") {
      scanReject();
      if (hit.kind === "unknown") track("scan_miss", { kind: "unknown" });
      setArmed(false);
      setMiss(hit);
      return;
    }
    setArmed(false);
    const row: Recent = { kind: SCAN_KIND_LABEL[hit.kind], label: hit.label, code: raw.trim(), href: hit.href };
    RECENT = [row, ...RECENT.filter((r) => r.href !== row.href)].slice(0, 4);
    setRecent(RECENT);
    flash(row.kind, row.label, () => router.push(hit.href));
  }, [s, flash, router]);
  const handleRef = useRef(handle); handleRef.current = handle;

  // Native: MLKit live session behind the WebView while armed.
  useEffect(() => {
    if (!native || !nativeOk || !armed) return;
    let session: { stop: () => Promise<void> } | null = null;
    let cancelled = false;
    let lastRaw = "", lastT = 0;
    (async () => {
      const r = await startLive((raw) => {
        if (raw === lastRaw && Date.now() - lastT < DEBOUNCE) return;
        lastRaw = raw; lastT = Date.now();
        scanTick();
        handleRef.current(raw);
      });
      if (cancelled) { await r.stop(); return; }
      if (r.error === "native-unavailable") { setNativeOk(false); return; }
      if (r.error) { setCaption({ msg: r.error, denied: true }); return; }
      session = r;
      setNativeLive(true);
    })();
    return () => { cancelled = true; setNativeLive(false); if (session) void session.stop(); };
  }, [native, nativeOk, armed]);

  // Browser: the shared BarcodeDetector loop into the viewfinder's video.
  useEffect(() => {
    if (nativeOk || !armed || !vid.current) return;
    const session = startWebLive(vid.current, (raw) => handleRef.current(raw), DEBOUNCE, {
      onStatus: (st) => setCaption(st.state === "ready" ? null : { msg: st.msg, denied: st.state === "denied" }),
    });
    return () => session.stop();
  }, [nativeOk, armed]);

  useEffect(() => {
    track("scan_opened", { mode: "tab", engine: nativeOk ? "mlkit" : native ? "mlkit-missing" : "browser" });
  }, [native, nativeOk]);

  const again = () => { setMiss(null); setCaption(null); setArmed(true); };
  const find = () => { const c = typed.trim(); if (!c) return; setTyped(""); handle(c); };

  return (
    <div className="tcx-scanui" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <MTop title="Scan" />
      <MRule />
      <MBody dark pad className="tcx-scanbody">
        <div style={{ position: "relative", height: 300, margin: "-16px -16px 0", overflow: "hidden", background: nativeLive ? "transparent" : "radial-gradient(ellipse at 50% 45%, #3a3735 0, #151413 70%)" }} className="tcx-camwin">
          {!nativeOk && <video ref={vid} autoPlay playsInline muted aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
          <div aria-hidden="true" style={{ position: "absolute", left: 16, top: 14, display: "flex", gap: 8, alignItems: "center", color: "#fff", fontSize: 12, fontWeight: 800, letterSpacing: "0.1em" }}>
            <i style={{ width: 10, height: 10, background: armed ? "var(--color-accent)" : EDGE }} />LIVE
          </div>
          <div aria-hidden="true" style={{ position: "absolute", left: "14%", right: "14%", top: "22%", bottom: "26%" }}>
            {([["left", "top"], ["right", "top"], ["left", "bottom"], ["right", "bottom"]] as const).map(([x, y]) => (
              <i key={x + y} style={{ position: "absolute", width: 34, height: 34, [x]: 0, [y]: 0, borderStyle: "solid", borderColor: "#fff", borderWidth: 0, [`border${y === "top" ? "Top" : "Bottom"}Width`]: 4, [`border${x === "left" ? "Left" : "Right"}Width`]: 4 }} />
            ))}
          </div>
          {armed && !caption?.denied && <div aria-hidden="true" className="tcx-vf-laser" style={{ position: "absolute", left: "8%", right: "8%", height: 2, background: "var(--color-accent)", boxShadow: "0 0 12px var(--color-accent)" }} />}
          <div role={caption?.denied ? "alert" : undefined} style={{ position: "absolute", left: 12, right: 12, bottom: 16, textAlign: "center", color: caption ? AC3 : "#fff", fontWeight: 800, fontSize: 14, letterSpacing: caption ? 0 : "0.06em", textTransform: caption ? "none" : "uppercase" }}>
            {caption ? caption.msg : "Badge, garment or shelf label"}
          </div>
        </div>

        <div style={{ background: INK, margin: "0 -16px -16px", padding: "0 16px 16px", minHeight: "calc(100% - 268px)" }}>
          <div style={{ height: 1 }} />
          {miss ? (
            <div style={{ paddingTop: 18 }}>
              <MPill tone="accent">{miss.kind === "unknown" ? "Not found" : "Inactive"}</MPill>
              <div style={{ fontFamily: miss.kind === "unknown" ? MONO : undefined, fontSize: 22, fontWeight: miss.kind === "unknown" ? 500 : 800, marginTop: 10, wordBreak: "break-all" }}>
                {miss.kind === "unknown" ? miss.code || "—" : miss.label}
              </div>
              <div style={{ display: "grid", marginTop: 4 }}>
                {miss.kind === "unknown" && (isAdmin
                  ? <DarkButton label="Bind to a garment" href={`/m/catalogue?bind=${encodeURIComponent(miss.code)}`} />
                  : <div style={{ fontSize: 13, color: OFF_GREY, marginTop: 10 }}>Only an admin can bind a code</div>)}
                {miss.kind === "inactive" && <DarkButton label="Open their record" href={`/m/person/${miss.staffId}`} />}
                <DarkButton label="Scan again" onClick={again} />
              </div>
            </div>
          ) : recent.length > 0 && (
            <>
              <MSection label="Recent scans" right={recent.length} />
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {recent.map((r) => (
                  <button key={r.href} type="button" onClick={() => router.push(r.href)}
                    style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 56, border: "2px solid " + EDGE, background: "transparent", color: GROUND, padding: "0 12px", textAlign: "left", fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: OFF_GREY, width: 62, flex: "none" }}>{r.kind}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: OFF_GREY, fontWeight: 500 }}>{r.code}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <form onSubmit={(e) => { e.preventDefault(); find(); }} style={{ marginTop: 22 }}>
            <label htmlFor="scan-typed" style={{ display: "block", fontSize: 12, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: OFF_GREY, marginBottom: 6 }}>Type a code</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input id="scan-typed" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                style={{ flex: 1, minWidth: 0, height: 52, border: "2px solid " + EDGE, background: "transparent", color: GROUND, fontFamily: MONO, fontSize: 16, padding: "0 14px", borderRadius: 0 }} />
              <button type="submit" style={{ minWidth: 72, minHeight: 52, border: "2px solid " + GROUND, background: GROUND, color: INK, fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer" }}>Find</button>
            </div>
          </form>
        </div>
      </MBody>
      <MTabs active="scan" />
    </div>
  );
}

/** MButton's outline, drawn in ground on the ink body. */
function DarkButton({ label, href, onClick }: { label: string; href?: string; onClick?: () => void }) {
  return (
    <div style={{ "--color-text": "var(--color-bg)" } as React.CSSProperties}>
      <MButton label={label} href={href} onClick={onClick} />
    </div>
  );
}
