"use client";
/* What a scan feels like.
 *
 * Counting a shelf is done looking at garments, not at the phone, so every scan has to confirm
 * itself physically. There are two things worth saying, and they have to feel different:
 *
 *   tick   — read one, keep going.
 *   reject — that code isn't on this shelf; look up.
 *
 * On the web that's `navigator.vibrate`. Inside the Android shell it isn't: the WebView only
 * honours navigator.vibrate when the app declares android.permission.VIBRATE, which arrives with
 * @capacitor/haptics — until this plugin was added the tick was silent on a real phone and only
 * the beep survived. Native also gets the platform's own haptic engine, which is a cleaner tap
 * than a raw motor pulse.
 *
 * Settings can turn the lot off; the beep and the buzz share one switch because they are one
 * signal wearing two coats. */
import { isNative } from "@/lib/nativescan";

type HapticsModule = {
  Haptics: {
    impact: (o: { style: string }) => Promise<void>;
    notification: (o: { type: string }) => Promise<void>;
  };
  ImpactStyle: { Light: string; Medium: string; Heavy: string };
  NotificationType: { Success: string; Warning: string; Error: string };
};

let mod: HapticsModule | null = null;
let loading: Promise<HapticsModule | null> | null = null;

/** Dynamically imported: most people meet /m in a browser, where none of this ships. */
function load(): Promise<HapticsModule | null> {
  if (!isNative()) return Promise.resolve(null);
  if (mod) return Promise.resolve(mod);
  if (!loading) {
    loading = import("@capacitor/haptics")
      .then((m) => (mod = m as unknown as HapticsModule))
      .catch(() => null); // shell built without the plugin — the web path still works
  }
  return loading;
}

/** Honours the Settings switch, and survives a browser that blocks storage entirely. */
function wanted(): boolean {
  try { return localStorage.getItem("tc.beep") !== "0"; } catch { return true; }
}

function buzz(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch { /* not every device has a motor */ }
}

function beep(hz: number, seconds: number, gain = 0.05) {
  try {
    const AC = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = AC.AudioContext || AC.webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = hz; g.gain.value = gain;
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + seconds);
    setTimeout(() => ctx.close().catch(() => {}), seconds * 1000 + 200);
  } catch { /* audio is blocked until a gesture — the haptic still fires */ }
}

/** One garment read. Short and high, so a shelf of them doesn't become a drone. */
export function scanTick() {
  if (!wanted()) return;
  void load().then((m) => {
    if (m) m.Haptics.impact({ style: m.ImpactStyle.Light }).catch(() => {});
    else buzz(35);
  });
  beep(1180, 0.06);
}

/** That code doesn't belong here. Two longer pulses and a lower note — unmistakably not a tick. */
export function scanReject() {
  if (!wanted()) return;
  void load().then((m) => {
    if (m) m.Haptics.notification({ type: m.NotificationType.Warning }).catch(() => {});
    else buzz([50, 60, 50]);
  });
  beep(320, 0.16, 0.06);
}
