"use client";
/* The native barcode scanner, used only when the page is running inside the Android shell.
 *
 * In a browser the app reads barcodes with BarcodeDetector, which is fine on a desk and patchy on
 * a ward: it misses crumpled labels and dim light, and it isn't in every Android WebView. Inside
 * Capacitor we hand the job to MLKit instead, which is the main reason the app exists at all.
 *
 * Everything here is dynamically imported. The plugin must never be pulled into the browser
 * bundle's critical path — most viewers of /m are on the web, where none of this runs. */

import { useSyncExternalStore } from "react";

export type NativeBarcode = { rawValue: string };

type ScannerModule = {
  BarcodeScanner: {
    isSupported: () => Promise<{ supported: boolean }>;
    checkPermissions: () => Promise<{ camera: string }>;
    requestPermissions: () => Promise<{ camera: string }>;
    scan: (opts?: { formats?: unknown[] }) => Promise<{ barcodes: NativeBarcode[] }>;
    startScan: (opts?: { formats?: unknown[] }) => Promise<void>;
    stopScan: () => Promise<void>;
    addListener: (
      event: "barcodeScanned",
      cb: (r: { barcode: NativeBarcode }) => void,
    ) => Promise<{ remove: () => Promise<void> }>;
    isTorchAvailable?: () => Promise<{ available: boolean }>;
    enableTorch?: () => Promise<void>;
    disableTorch?: () => Promise<void>;
    isGoogleBarcodeScannerModuleAvailable?: () => Promise<{ available: boolean }>;
    installGoogleBarcodeScannerModule?: () => Promise<void>;
  };
};

/** True only inside the Capacitor shell. In any browser this is false and the web path is used.
 *  For event handlers and effects. A component that draws something different inside the shell
 *  reads useIsNative() instead: the server can't see the shell, so calling this during render
 *  gives the server's HTML and the phone's first render two different answers. */
export function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

const noSubscribe = () => () => {};
/** isNative() for render: null on the server and while the page hydrates, then the real answer.
 *  Drawing the browser's <video> from isNative() in render made the Scan tab's server HTML
 *  disagree with the Android shell's first render (React #418), and React then threw the whole
 *  server render away. Null is "not known yet": draw neither scanner and start neither. */
export function useIsNative(): boolean | null {
  return useSyncExternalStore(noSubscribe, isNative, () => null);
}

let mod: ScannerModule | null = null;
async function load(): Promise<ScannerModule | null> {
  if (!isNative()) return null;
  if (mod) return mod;
  try {
    mod = (await import("@capacitor-mlkit/barcode-scanning")) as unknown as ScannerModule;
    return mod;
  } catch {
    return null; // shell without the plugin — fall back to the web scanner
  }
}

/** Ask once, and say plainly what a refusal means rather than failing silently. */
async function ensureReady(m: ScannerModule): Promise<string | null> {
  const { BarcodeScanner: S } = m;
  const supported = await S.isSupported().catch(() => ({ supported: false }));
  if (!supported.supported) return "This device can’t scan barcodes.";
  let perm = await S.checkPermissions().catch(() => ({ camera: "denied" }));
  if (perm.camera !== "granted") perm = await S.requestPermissions().catch(() => ({ camera: "denied" }));
  if (perm.camera !== "granted") return "ThreadCount needs the camera to scan. Allow it in Android settings, then try again.";
  // On some devices MLKit ships as a downloadable module rather than in the app.
  if (S.isGoogleBarcodeScannerModuleAvailable && S.installGoogleBarcodeScannerModule) {
    const has = await S.isGoogleBarcodeScannerModuleAvailable().catch(() => ({ available: true }));
    if (!has.available) {
      try { await S.installGoogleBarcodeScannerModule(); } catch { return "The barcode module is still downloading — try again in a moment."; }
    }
  }
  return null;
}

/* What the scanner is allowed to read.
 *
 * Left unrestricted, MLKit reads every symbology it knows — and a garment tag is rarely alone in
 * the frame. A care label, a carton behind it on the shelf and a poster on the wall all get read as
 * eagerly as the swing tag, and whichever the camera locks onto first is what comes back.
 *
 * Two of those symbologies are worse than noise. ITF and Codabar carry no check digit, so a partial
 * read is indistinguishable from a real code: half a carton's ITF-14 decodes cleanly as a shorter,
 * entirely valid ITF number. That is a wrong code that looks right, which is the one failure a
 * barcode is supposed to make impossible.
 *
 * So: the retail codes a garment is actually labelled with (EAN and UPC), plus the Code 39/93/128
 * family that suppliers and internal label printers use, all of which are either check-digited or
 * self-checking. No 2D — nothing in this product is identified by a QR or Data Matrix, and the only
 * QR ThreadCount has anything to do with is the one it draws for two-factor setup. */
const SCAN_FORMATS = ["EAN_13", "EAN_8", "UPC_A", "UPC_E", "CODE_128", "CODE_39", "CODE_93"];

/** One read, using MLKit's own full-screen scanner. Resolves null when the person backs out. */
export async function scanOnce(): Promise<{ code: string | null; error?: string }> {
  const m = await load();
  if (!m) return { code: null, error: "native-unavailable" };
  const err = await ensureReady(m);
  if (err) return { code: null, error: err };
  try {
    const res = await m.BarcodeScanner.scan({ formats: SCAN_FORMATS });
    const raw = res.barcodes?.[0]?.rawValue;
    return { code: raw ? String(raw).trim() : null };
  } catch {
    return { code: null }; // cancelled
  }
}

/** Continuous scanning for a stocktake. The camera preview renders behind the WebView, so the
 *  page has to go transparent while it runs — `stop()` puts it back. */
export async function startLive(onCode: (code: string) => void): Promise<{ stop: () => Promise<void>; error?: string }> {
  const noop = { stop: async () => {} };
  const m = await load();
  if (!m) return { ...noop, error: "native-unavailable" };
  const err = await ensureReady(m);
  if (err) return { ...noop, error: err };

  const S = m.BarcodeScanner;
  document.documentElement.classList.add("tcx-native-scan");
  const handle = await S.addListener("barcodeScanned", (r) => {
    const raw = r?.barcode?.rawValue;
    if (raw) onCode(String(raw).trim());
  });
  try {
    await S.startScan({ formats: SCAN_FORMATS });
  } catch {
    document.documentElement.classList.remove("tcx-native-scan");
    await handle.remove().catch(() => {});
    return { ...noop, error: "The camera wouldn’t start." };
  }
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    window.removeEventListener("pagehide", onHide);
    document.documentElement.classList.remove("tcx-native-scan");
    await S.stopScan().catch(() => {});
    await handle.remove().catch(() => {});
  };
  /* A full page load (a reload, a lapsed session sent to sign-in) never runs React's cleanup, and
   * the MLKit session lives in the native layer, not the page: found on a Pixel, the camera stayed
   * open behind the next screen with the torch still lit. pagehide fires on every such unload. */
  const onHide = () => { void stop(); };
  window.addEventListener("pagehide", onHide);
  return { stop };
}

/* The torch, for a live session only: MLKit's own full-screen scanner (scanOnce) draws a flash
 * button of its own. A linen cupboard or a basement store is often too dim to read a label in,
 * and the camera then shows nothing and reads nothing, which looks exactly like a broken scanner.
 * Only meaningful while startLive is running — CameraX owns the flash through the session. */
export const nativeTorch = {
  has: async (): Promise<boolean> => {
    const m = await load();
    if (!m?.BarcodeScanner.isTorchAvailable) return false;
    return (await m.BarcodeScanner.isTorchAvailable().catch(() => ({ available: false }))).available;
  },
  set: async (on: boolean): Promise<boolean> => {
    const m = await load();
    const f = on ? m?.BarcodeScanner.enableTorch : m?.BarcodeScanner.disableTorch;
    if (!f) return false;
    try { await f(); return true; } catch { return false; }
  },
};
