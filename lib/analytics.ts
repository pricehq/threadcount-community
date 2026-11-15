"use client";
/* Analytics.
 *
 * Self-hosted Umami; the tracker address and site ids come from lib/hosted-defaults.ts or the
 * NEXT_PUBLIC_UMAMI_* variables. Cookieless: Umami derives a rotating visitor hash server-side and
 * stores nothing on the device, which is why there is no consent banner. Nothing leaves for a
 * third party, no advertising network is involved, and a browser that sends Do Not Track or Global
 * Privacy Control gets no tracker at all.
 *
 * Two separate Umami sites, on purpose:
 *   marketing — the public pages and the sign-up/sign-in pages, so a visit can be followed from the
 *               home page to a created account in one funnel.
 *   app       — the signed-in linen room (/app), the counter phone (/m), the staff app (/my) and both
 *               Android shells, which load those pages from the site.
 * They are different populations carrying very different privacy weight, and keeping them apart
 * means the app's numbers can be reset or deleted without losing the marketing history.
 *
 * The hard rule is that no record identifier, name, email or facility ever reaches the analytics
 * database. It is enforced in ONE place: every payload the tracker sends — page view, event,
 * identify, Web Vitals — goes through the before-send in lib/analyticsscrub.ts (route templates,
 * no query string in the app, allow-listed event data, a facility-level HMAC id at most). Page
 * views are sent from here only (the tracker's automatic ones are off). Session replays and
 * heatmaps (Umami's recorder) run only where recorderAllowed() says the address and the page can
 * carry nothing identifying, and stop for good the first time that stops being true. */
import { isNative } from "@/lib/nativescan";
import { HOSTED_UMAMI_APP_ID, HOSTED_UMAMI_MARKETING_ID, HOSTED_UMAMI_SRC } from "@/lib/hosted-defaults";
import { recorderAllowed, scrubPath as scrub, scrubPayload, type AnalyticsSite } from "@/lib/analyticsscrub";

/* The tracker script address. Its origin is admitted by the content-security policy in
 * next.config.ts, which derives it from the same two sources. */
export const UMAMI_SRC = process.env.NEXT_PUBLIC_UMAMI_SRC || HOSTED_UMAMI_SRC;
/** Umami's replay + heatmap recorder, served by the same host as the tracker. */
export const RECORDER_SRC = (() => {
  try { return UMAMI_SRC ? new URL("/recorder.js", UMAMI_SRC).toString() : ""; } catch { return ""; }
})();

/** Umami website ids. Overridable; the hosted defaults live in lib/hosted-defaults.ts, which the
 *  Community edition replaces with blanks, so a self-hosted instance reports nowhere by default. */
export const MARKETING_ID = process.env.NEXT_PUBLIC_UMAMI_SITE_ID || HOSTED_UMAMI_MARKETING_ID;
export const APP_ID = process.env.NEXT_PUBLIC_UMAMI_APP_ID || HOSTED_UMAMI_APP_ID;

export function websiteFor(site: AnalyticsSite): string {
  return site === "app" ? APP_ID : MARKETING_ID;
}

/** What the server hands the client for identify (lib/analyticsidentity.ts). Never a person. */
export type AnalyticsIdentity = { id: string; role: string; fac_age?: string; fac_size?: string; demo: "yes" | "no" };

type Payload = Record<string, unknown>;
type Umami = {
  track: (a?: unknown, b?: Record<string, unknown>) => unknown;
  identify: (id: unknown, data?: Record<string, unknown>) => unknown;
  getSession?: () => { cache?: string; website?: string | null } | undefined;
  __tc?: true;
};
type State = {
  site: AnalyticsSite;
  manual: boolean;
  raw: Umami | null;
  identified: string | null;
  recorder: AnalyticsSite | null;
  recorderKilled: boolean;
  /** Events sent before the tracker loaded (a screen's mount-time event on a direct page load). */
  queue: Array<[string, Record<string, string | number | boolean>]>;
};
type TcWindow = Window & {
  umami?: Umami;
  __tcBeforeSend?: (type: string, payload: Payload) => Payload | null;
  __tcAnalytics?: State;
};

function win(): TcWindow | null {
  return typeof window === "undefined" ? null : (window as TcWindow);
}

function state(): State | null {
  const w = win();
  if (!w) return null;
  if (!w.__tcAnalytics) w.__tcAnalytics = { site: "marketing", manual: false, raw: null, identified: null, recorder: null, recorderKilled: false, queue: [] };
  return w.__tcAnalytics;
}

/** Re-exported for the error reporter and the scan logger, which scrub the same way. */
export function scrubPath(path: string): string {
  return scrub(path);
}

/** Android shell or a browser. Without this, Play installs and real usage can never be reconciled. */
export function surface(): "android" | "web" {
  try { return isNative() ? "android" : "web"; } catch { return "web"; }
}

/** Browser privacy signals: Do Not Track "1" or Global Privacy Control. Either → no tracker. */
export function privacySignal(): boolean {
  try {
    const n = navigator as Navigator & { globalPrivacyControl?: boolean };
    return n.doNotTrack === "1" || n.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

/** Inside a frame (Umami's own heatmap viewer frames the public pages): report nothing. */
export function isFramed(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}

/** Which surface is on screen. Set by <Analytics> on mount; decides the website and the rules. */
export function setSite(site: AnalyticsSite) {
  const s = state();
  if (!s) return;
  // One recorder per surface per document: after a hop from the public site into the app the
  // public recorder would go on posting app screens under the marketing website.
  if (s.recorder && s.recorder !== site) s.recorderKilled = true;
  s.site = site;
}

/** The global scrub every tracker tag names in data-before-send. Idempotent. */
export function installBeforeSend() {
  const w = win();
  if (!w || w.__tcBeforeSend) return;
  w.__tcBeforeSend = (type: string, payload: Payload) => {
    const s = state();
    if (!s || isFramed()) return null;
    return scrubPayload(type, payload, { site: s.site, website: websiteFor(s.site), href: w.location.href, manualPageview: s.manual });
  };
}

/* The recorder's only hook into us is window.umami.getSession().cache — no cache, no send. So
 * window.umami becomes a thin wrapper whose getSession answers only while recording is allowed;
 * the first disallowed look ends recording for the life of the document. */
function recorderMayRun(): boolean {
  const s = state();
  const w = win();
  if (!s || !w || !s.recorder || s.recorderKilled) return false;
  const ok = s.site === s.recorder && !privacySignal() && !isFramed() && recorderAllowed(w.location.href, s.recorder);
  if (!ok) s.recorderKilled = true;
  return ok;
}

/** Called once the tracker script has run: keep the real instance, publish the wrapper. */
export function registerTracker() {
  const s = state();
  const w = win();
  if (!s || !w) return;
  const inst = w.umami;
  if (!inst?.track || inst.__tc) return;
  s.raw = inst;
  w.umami = {
    __tc: true,
    track: (...a) => inst.track(...a),
    identify: (...a) => inst.identify(...a),
    getSession: () => (recorderMayRun() ? inst.getSession?.() : { cache: undefined, website: websiteFor(s.site) }),
  };
}

/** Send what was tracked before the tracker loaded. Called after identify, so it rides along. */
export function flushQueue() {
  const s = state();
  if (!s?.raw || !s.queue.length) return;
  const q = s.queue.splice(0);
  for (const [name, data] of q) {
    try { s.raw.track(name, data); } catch { /* ignore */ }
  }
}

function raw(): Umami | null {
  return state()?.raw ?? null;
}

/** May recorder.js be injected for this surface now? Remembers the decision for the gate. */
export function claimRecorder(site: AnalyticsSite): boolean {
  const s = state();
  const w = win();
  if (!s || !w || s.recorder || s.recorderKilled || !RECORDER_SRC) return false;
  if (privacySignal() || isFramed() || !recorderAllowed(w.location.href, site)) return false;
  s.recorder = site;
  return true;
}

/** Re-check the recorder gate on a route change (kills it on a disallowed address). */
export function checkRecorder() {
  const s = state();
  if (s?.recorder && !s.recorderKilled) recorderMayRun();
}

/** A scrubbed page view for the current address. Called on every route change. */
export function pageview() {
  const s = state();
  const u = raw();
  if (!s || !u) return;
  s.manual = true;
  try {
    u.track((p: Payload) => ({ ...p, url: window.location.href }));
  } catch { /* analytics must never break a page */ } finally {
    s.manual = false;
  }
}

/** Facility-level identify, once per document per facility, before the app's first page view so
 *  every later payload carries it. The before-send drops it anywhere but the app website. */
export function identify(identity: AnalyticsIdentity | null | undefined) {
  const s = state();
  const u = raw();
  if (!s || !u || !identity?.id || s.site !== "app" || s.identified === identity.id) return;
  s.identified = identity.id;
  try {
    u.identify(identity.id, { role: identity.role, fac_age: identity.fac_age, fac_size: identity.fac_size, demo: identity.demo, surface: surface() });
  } catch { /* ignore */ }
}

/** A named event. `data` may hold counts and fixed words — never anything identifying (and the
 *  before-send drops anything that is not on its allow-list anyway). */
export function track(event: string, data?: Record<string, string | number | boolean>) {
  const s = state();
  if (!s) return;
  const payload = { ...data, surface: surface() };
  // Before the tracker has loaded: keep a few (a blocked tracker never loads, so the queue is capped).
  if (!s.raw) { if (s.queue.length < 20) s.queue.push([event, payload]); return; }
  try { s.raw.track(event, payload); } catch { /* analytics must never break a page */ }
}

/* Which mutations are worth recording, and what they are called in the dashboard.
 *
 * A deliberate whitelist rather than every op: there are 57, and most are routine edits whose
 * volume would say more about a facility's day than about whether ThreadCount works. Anything not
 * named here sends nothing at all. */
export const TRACKED_OPS: Record<string, string> = {
  "issue.create": "issue_created",
  "issue.exchange": "size_exchanged",
  "issue.return": "garment_returned",
  "stocktake.apply": "count_committed",
  "order.create": "reorder_created",
  "order.receive": "delivery_received",
  "pickup.pickedUp": "pickup_completed",
  "barcode.bind": "barcode_bound",
  "barcode.generate": "barcode_generated",
  "catalog.removeSize": "size_removed",
  "import.rows": "data_imported",
  "location.save": "location_saved",
  "users.add": "user_invited",
  "settings.update": "settings_changed",
  "me.deleteAccount": "account_deleted",
  // The linen room's half of the staff-app flow (the staff half is below). Without these the
  // dashboard could see a request raised and never see it fulfilled.
  "request.pick": "request_picked",
  "request.round": "request_sent_on_round",
  "request.collected": "request_collected",
  "request.raise": "request_raised_at_counter",
  "approval.add": "approval_recorded",
  // Adoption of the staff app starts here: a code handed to a wearer. Compare with staff_activated.
  "staff.selfCode": "staff_code_issued",
  "order.status": "order_status_changed",
  "backup.restore": "backup_restored",
  // The counter phone: a hand back basket, a ward round signed at once, one line put on the draft order.
  "handback.commit": "handback",
  "pickup.deliverWard": "ward_round_delivered",
  "stock.orderLine": "line_added_to_draft",
  // Setting a new facility up: its garments and its people (staff.save is add and edit alike).
  "catalog.add": "garment_added",
  "staff.save": "staff_saved",
};

/* The staff app's own whitelist, kept separate from the coordinator one because the two surfaces
 * answer different questions. This one is here to tell us whether the app is being used at all,
 * or whether everything still goes through the counter. Same rule as above: a fixed list, and
 * anything not named here sends nothing. */
export const TRACKED_STAFF_OPS: Record<string, string> = {
  "request.create": "staff_request_raised",
  "request.approve": "staff_request_approved",
  "request.decline": "staff_request_declined",
  "request.message": "staff_message_sent",
  "damage.report": "staff_damage_reported",
  "dispute.raise": "staff_record_queried",
  "waitlist.join": "staff_waitlist_joined",
  "waitlist.accept": "staff_waitlist_accepted",
  "kit.answer": "staff_kit_answered",
  "round.sign": "staff_round_signed",
};

/** Coarse buckets for a refusal. The server's message is never sent — only which kind it was. */
export function failureKind(error: string): string {
  const e = (error || "").toLowerCase();
  if (e.includes("needs a reason")) return "variance_reason_required";
  if (e.includes("admin only")) return "not_permitted";
  if (e.includes("not enough")) return "insufficient_stock";
  if (e.includes("already")) return "already_done";
  if (e.includes("unknown")) return "unknown_record";
  if (e.includes("network")) return "network";
  return "other";
}
