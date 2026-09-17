/* Printing labels from the counter app.
 *
 * In a browser the label pages (/print/labels, /print/shelf) open in a new tab and print themselves.
 * Inside the Android shell a native TcPrint plugin hands the same page to Android's print framework,
 * where the person picks the shelf printer. Nothing is imported: the plugin is looked up on the
 * Capacitor registry, so this stays web-safe and a shell without the plugin says so.
 *
 * The plugin (android/app/src/main/java/tech/threadcount/app/TcPrintPlugin.java) loads the page in an
 * off-screen WebView signed in with the app's cookies and hands it to PrintManager, so any printer
 * with an Android print service works, Bluetooth label printers included. The printer is picked in
 * Android's print dialog; the app cannot tell whether it is switched on. */
import { isNative } from "@/lib/nativescan";

export type PrintState = { state: "ready" | "unavailable" | "browser"; label: string; sub: string };
export type PrintResult = { ok: true } | { ok: false; error: string };

type TcPrint = {
  isAvailable?: () => Promise<{ available: boolean }>;
  print?: (o: { url?: string; html?: string; title: string }) => Promise<unknown>;
};

const READY: PrintState = { state: "ready", label: "Ready", sub: "Android print service" };
const UNAVAILABLE: PrintState = { state: "unavailable", label: "Update the app", sub: "This app version can’t print" };
const BROWSER: PrintState = { state: "browser", label: "Browser", sub: "Prints from this browser" };

function plugin(): TcPrint | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { Plugins?: { TcPrint?: TcPrint } } }).Capacitor;
  return cap?.Plugins?.TcPrint ?? null;
}

/** What the Settings row and the print sheet say about printing on this device. */
export async function printState(): Promise<PrintState> {
  if (typeof window === "undefined" || !isNative()) return BROWSER;
  const p = plugin();
  if (!p?.isAvailable || !p.print) return UNAVAILABLE;
  try {
    const r = await p.isAvailable();
    return r?.available ? READY : UNAVAILABLE;
  } catch {
    return UNAVAILABLE;
  }
}

/** The same answer as printState(), shaped for a yes/no check. */
export async function printingAvailable(): Promise<{ available: boolean; label: string }> {
  const s = await printState();
  return { available: s.state !== "unavailable", label: s.label };
}

const withNative = (path: string) => path + (path.includes("?") ? "&" : "?") + "native=1";

/** Print a same-origin page. Native: TcPrint with `?native=1` (the page skips its own print dialog).
 *  Browser: the page in a new tab, which prints itself. */
export async function printUrl(path: string, title: string): Promise<PrintResult> {
  if (typeof window === "undefined") return { ok: false, error: "Printing needs the app open" };
  if (!isNative()) {
    // With noopener the window handle is always null, so there is nothing to check it against.
    window.open(path, "_blank", "noopener");
    return { ok: true };
  }
  const p = plugin();
  if (!p?.print) return { ok: false, error: UNAVAILABLE.sub };
  try {
    await p.print({ url: window.location.origin + withNative(path), title });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "The label didn’t print" };
  }
}

/** One bound code, `copies` times (the reprint). */
export function printLabels(o: { code: string; copies: number; reason?: string }): Promise<PrintResult> {
  const q = new URLSearchParams({ code: o.code, copies: String(Math.max(1, Math.min(24, Math.round(o.copies || 1)))) });
  if (o.reason) q.set("reason", o.reason);
  return printUrl(`/print/labels?${q.toString()}`, `Labels ${o.code}`);
}

/** A whole garment: every labelled size, one per garment on the shelf. */
export function printItemLabels(o: { itemId: string }): Promise<PrintResult> {
  return printUrl(`/print/labels?item=${encodeURIComponent(o.itemId)}`, "Garment labels");
}

/** A shelf label (Code 128 `TCL-<location id>`), which the Scan tab opens as a count. */
export function printShelfLabel(o: { locationId: string; copies?: number }): Promise<PrintResult> {
  const copies = Math.max(1, Math.min(24, Math.round(o.copies || 1)));
  return printUrl(`/print/shelf?location=${encodeURIComponent(o.locationId)}&copies=${copies}`, "Shelf label");
}
