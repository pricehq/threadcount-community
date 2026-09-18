"use client";
/* The native barcode scanner, used only when the page is running inside the Android shell.
 *
 * In a browser the app reads barcodes with BarcodeDetector, which is fine on a desk and patchy on
 * a ward: it misses crumpled labels and dim light, and it isn't in every Android WebView. Inside
 * Capacitor we hand the job to MLKit instead, which is the main reason the app exists at all.
 *
 * Everything here is dynamically imported. The plugin must never be pulled into the browser
 * bundle's critical path — most viewers of /m are on the web, where none of this runs. */

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
    isGoogleBarcodeScannerModuleAvailable?: () => Promise<{ available: boolean }>;
    installGoogleBarcodeScannerModule?: () => Promise<void>;
  };
};

/** True only inside the Capacitor shell. In any browser this is false and the web path is used. */
export function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
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
  return {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      document.documentElement.classList.remove("tcx-native-scan");
      await S.stopScan().catch(() => {});
      await handle.remove().catch(() => {});
    },
  };
}
