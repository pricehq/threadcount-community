/* The browser's barcode camera loop, shared by the full-screen scanner (components/MScan.tsx) and the
 * counter app's Scan tab (app/m/(app)/scan). Android's shell reads through MLKit instead
 * (lib/nativescan.ts); this is what a phone browser, or a shell without the plugin, uses.
 *
 * It opens the rear camera into the given <video>, asks BarcodeDetector every 300ms, and hands back
 * each code once per debounce window, so a garment held in frame is one garment. */
import { scanTick } from "@/lib/feedback";

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue?: string }[]> };

/* The same set the native scanner is held to (see lib/nativescan.ts for why ITF and 2D are not). */
export const WEB_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93"];

export type WebScanStatus =
  | { state: "ready" }
  | { state: "unsupported"; msg: string }
  | { state: "denied"; msg: string };

export type WebLive = { stop: () => void };

/** Start reading. `onCode` gets each accepted code (scanTick has already fired). `active` lets a
 *  paused screen keep the camera open without counting; `onStatus` reports whether it is reading. */
export function startWebLive(
  video: HTMLVideoElement,
  onCode: (raw: string) => void,
  debounceMs = 900,
  opts?: { active?: () => boolean; onStatus?: (s: WebScanStatus) => void; tick?: boolean },
): WebLive {
  let stream: MediaStream | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let lastRaw = "", lastT = 0;
  const status = (s: WebScanStatus) => { if (!stopped) opts?.onStatus?.(s); };
  const w = window as unknown as { BarcodeDetector?: new (o?: { formats?: string[] }) => Detector };
  if (!navigator.mediaDevices?.getUserMedia) {
    status({ state: "denied", msg: "This browser has no camera access — type the code instead." });
    return { stop: () => { stopped = true; } };
  }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then((st) => {
    if (stopped) { st.getTracks().forEach((t) => t.stop()); return; }
    stream = st;
    video.srcObject = st;
    video.play().catch(() => {});
    if (!w.BarcodeDetector) { status({ state: "unsupported", msg: "Live reading isn’t supported here — type the code instead." }); return; }
    let bd: Detector;
    try { bd = new w.BarcodeDetector({ formats: WEB_FORMATS }); } catch { bd = new w.BarcodeDetector(); }
    status({ state: "ready" });
    timer = setInterval(() => {
      if (stopped || (opts?.active && !opts.active())) return;
      if (video.readyState < 2) return;
      bd.detect(video).then((codes) => {
        if (stopped || !codes?.length) return;
        const raw = String(codes[0].rawValue || "").trim();
        if (!raw) return;
        // Same code again inside the debounce = the same garment still in frame, not a second one.
        if (raw === lastRaw && Date.now() - lastT < debounceMs) return;
        lastRaw = raw; lastT = Date.now();
        if (opts?.tick !== false) scanTick();
        onCode(raw);
      }).catch(() => {});
    }, 300);
  }).catch((e: Error) => {
    status({ state: "denied", msg: /denied|permission/i.test(e.message) ? "ThreadCount needs the camera to scan. Allow it in your browser or device settings, then try again." : "The camera isn’t available — " + e.message });
  });
  return {
    stop: () => {
      stopped = true;
      if (timer) clearInterval(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    },
  };
}
