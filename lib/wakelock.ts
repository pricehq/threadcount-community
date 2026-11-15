"use client";
/* Keep the screen on while a count is open.
 *
 * A shelf count is minutes of handling garments with the phone held low, and Android's display
 * timeout is often fifteen seconds. Waking the phone, unlocking it and finding your place again
 * every few garments is the difference between counting a bay and giving up on it.
 *
 * This is the Screen Wake Lock API rather than a Capacitor plugin, which means it works the same
 * in the Android shell and in mobile Chrome, and needs no permission — only a secure context,
 * which /m always has. Android drops the lock whenever the page is hidden, so it is re-taken on
 * the way back from a phone call or the app switcher. */
import { useEffect } from "react";

type Sentinel = { released: boolean; release: () => Promise<void>; addEventListener: (t: string, f: () => void) => void };
type WakeLockNav = Navigator & { wakeLock?: { request: (type: "screen") => Promise<Sentinel> } };

/** Holds a screen wake lock for as long as `active` is true. A no-op where it isn't supported. */
export function useKeepAwake(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as WakeLockNav;
    if (!nav.wakeLock) return; // older WebView, or an insecure origin
    let sentinel: Sentinel | null = null;
    let dropped = false;

    const take = async () => {
      if (dropped || sentinel || document.visibilityState !== "visible") return;
      try {
        sentinel = await nav.wakeLock!.request("screen");
        // The system releases it on its own terms too; forget the handle when it does.
        sentinel.addEventListener("release", () => { sentinel = null; });
      } catch { /* battery saver refuses it — the screen just times out as usual */ }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void take(); };

    void take();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      dropped = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (sentinel && !sentinel.released) sentinel.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}
