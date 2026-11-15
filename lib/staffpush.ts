"use client";
import { isNative } from "@/lib/nativescan";

/* The phone's half of notifications, as the Account screen sees it.
 *
 * The native side is config-gated: the Android project only compiles its push code when a Firebase
 * config file is present, so a shell built without one answers nothing here. Everything below
 * therefore reports "unavailable" rather than failing — a browser, an older build of the app and a
 * self-hosted bundle with no Firebase all take the same honest path, and the screen says where
 * notifications actually arrive instead of pretending.
 *
 * The bridge is one intercepted navigation, the same shape as the welcome screen's `__server`: the
 * page asks by navigating to https://localhost/__push, the shell requests POST_NOTIFICATIONS
 * (Android 13+) and hands the registration token back by calling window.__tcPush(token). Nothing is
 * ever asked at launch — only when somebody turns a switch on, and the launch-time refresh below
 * asks the phone for nothing it has not already been given.
 */

export type PushAsk =
  | { ok: true; token: string }
  | { ok: false; reason: "unavailable" | "refused" };

/** The last token this device registered, so signing out can hand it back and so a launch knows
 *  whether this person ever turned notifications on. Per browser origin, and never sent anywhere
 *  but `push.register` and `push.forget`. */
const TOKEN_KEY = "tc.push.token";

declare global {
  interface Window {
    /** Called by the shell with a registration token, or with an empty token and a reason when one
     *  is not coming. The second argument is optional, so an older shell still works. */
    __tcPush?: (token: string, reason?: string) => void;
  }
}

/* Which shell this page is running in, as far as notifications are concerned.
 *
 * `isNative()` alone was not enough, and the difference is a page somebody cannot get back from.
 * The /__push interception below is new in version 1.4 of the app; the shell already on people's
 * phones catches only /__server and hands everything else to the WebView, so on that build the ask
 * genuinely LOADED https://localhost/__push — off the site, onto the bundled origin, where no such
 * asset exists and the shell's own error handling leaves a blank page with no way back. The web app
 * reaches those installs the moment it deploys, long before a store update rolls out.
 *
 * So the shell says what it can do, and the page believes nothing else. The marker is a token the
 * staff shell appends to the WebView's user agent (capacitor.config.ts, `appendUserAgent`), which
 * is set before the first page loads, survives every navigation, and is absent from every older
 * build and from every browser. A shell that does not claim it is treated exactly like a browser:
 * nothing is navigated, nothing is asked, and Account says so in one line.
 */
export type PushShell = "none" | "old" | "ready";

/** The marker the staff shell appends to its user agent. The number is the bridge's own version,
 *  not the app's — it is bumped when what the shell understands changes. */
const SHELL_UA = /ThreadCountStaffShell\/(\d+)/;

export function pushShell(): PushShell {
  if (typeof window === "undefined") return "none";
  if (!isNative()) return "none";
  const m = SHELL_UA.exec(navigator.userAgent || "");
  return m && Number(m[1]) >= 1 ? "ready" : "old";
}

/** Is there a shell here that understands the notification bridge? False in every browser, and
 *  false in a shell built before it existed. */
export function pushBridgeAvailable(): boolean {
  return pushShell() === "ready";
}

export function rememberedToken(): string | null {
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function remember(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch { /* a WebView in private mode throws; the token is a convenience, not the record */ }
}

/* One receiver, not one per ask.
 *
 * The shell calls window.__tcPush whenever it has an answer: after a permission dialog, after a
 * silent refresh at launch, and never at a moment the page chose. An ask that installed its own
 * handler and deleted it afterwards would tear down a refresh's handler as it finished, and the
 * next answer would land on nothing at all. So the property is installed once and never removed,
 * and whoever is waiting queues behind it. An answer settles everybody waiting rather than being
 * matched to one asker: the shell sends one token per phone, and there is nothing to tell two
 * answers apart if an ask and a refresh ever overlap. */
type Answer = (token: string, reason: string) => void;
let waiting: Answer[] = [];

function receive() {
  if (typeof window === "undefined" || window.__tcPush) return;
  window.__tcPush = (raw: string, reason?: string) => {
    const token = String(raw || "").trim();
    if (token) remember(token);
    const queued = waiting;
    waiting = [];
    for (const answer of queued) answer(token, String(reason || ""));
  };
}

/** Wait for the shell's next answer, or give up. Running out reads as a refusal: from the screen's
 *  point of view a dialog nobody answered and a dialog somebody dismissed are the same thing. */
function nextAnswer(timeoutMs: number): Promise<PushAsk> {
  return new Promise<PushAsk>((resolve) => {
    let done = false;
    const finish = (r: PushAsk) => { if (!done) { done = true; resolve(r); } };
    waiting.push((token, reason) => {
      if (token) finish({ ok: true, token });
      else finish({ ok: false, reason: reason === "unavailable" ? "unavailable" : "refused" });
    });
    window.setTimeout(() => finish({ ok: false, reason: "refused" }), timeoutMs);
  });
}

/** Ask the phone for permission and a registration token. Resolves `unavailable` in a browser or
 *  in a shell built without notification support, and `refused` when the person said no or the ask
 *  went unanswered. It never throws and never rejects: the switch beside it has to be able to say
 *  something either way. */
export function askForPush(timeoutMs = 20000): Promise<PushAsk> {
  if (typeof window === "undefined" || !pushBridgeAvailable()) return Promise.resolve({ ok: false, reason: "unavailable" });
  receive();
  // A permission dialog is as slow as the person reading it, so the wait is generous.
  const answer = nextAnswer(timeoutMs);
  window.location.href = "https://localhost/__push?ask=1";
  return answer;
}

/**
 * Re-register this phone on launch, for somebody who turned notifications on earlier.
 *
 * Registration tokens rotate — a restore onto a new phone, a reinstall, Android's own rotation —
 * and a stale one is not an error anybody sees: notifications simply stop, silently, which is the
 * worst way for this feature to fail. So the app re-reads the token when it opens and registers
 * whatever comes back, which also keeps the row's last-seen date current.
 *
 * ⛔ It asks for nothing. With no remembered token this returns at once rather than prompting: a
 * permission dialog at launch is exactly what the rules forbid, and somebody who has never turned a
 * switch on has not agreed to anything. The shell's refresh path is equally silent — if the
 * permission is not already granted it answers "no token" rather than asking for one.
 *
 * `register` is normally `(token) => mutate("push.register", { token, platform: "android" })`.
 */
export async function refreshPush(
  register: (token: string) => unknown | Promise<unknown>,
  timeoutMs = 10000,
): Promise<void> {
  if (typeof window === "undefined" || !pushBridgeAvailable()) return;
  if (!rememberedToken()) return;
  receive();
  const answer = nextAnswer(timeoutMs);
  window.location.href = "https://localhost/__push?refresh=1";
  const r = await answer;
  if (!r.ok) return;
  try { await register(r.token); } catch { /* no signal; the next launch tries again */ }
}

/** Tell the shell to stop, and forget the token here. Called on the way out of the app, and it
 *  never blocks signing out: somebody on a ward with no signal still has to be able to leave, and
 *  an orphaned token is reclaimed three other ways — the next registration re-points it, FCM says
 *  it is gone, and a password change clears the lot. Returns the token to hand to `push.forget`. */
export function forgetPush(): string | null {
  const token = rememberedToken();
  remember(null);
  if (typeof window !== "undefined" && pushBridgeAvailable()) {
    try { window.location.href = "https://localhost/__push?forget=1"; } catch { /* nothing to undo */ }
  }
  return token;
}
