"use client";
/* Analytics.
 *
 * Self-hosted Umami; the tracker address and site ids come from lib/hosted-defaults.ts or the
 * NEXT_PUBLIC_UMAMI_* variables.
 * Cookieless: it derives a rotating daily visitor hash server-side and stores nothing on the
 * device, which is why there is no consent banner. Nothing leaves for a third party, no advertising
 * network is involved, and the browser's Do Not Track setting is honoured.
 *
 * Two separate Umami sites, on purpose:
 *   marketing — the public pages anyone can read.
 *   app       — the signed-in linen room, plus the Android shell (which loads /m from the site).
 * They are different populations carrying very different privacy weight, and keeping them apart
 * means the app's numbers can be reset or deleted without losing the marketing history.
 *
 * The hard rule here is that no record identifier ever reaches the analytics database. Paths carry
 * staff, location and order ids — /m/person/<cuid>, /app/staff/<cuid> — so every path is scrubbed
 * before it is sent, automatic page tracking is turned OFF so nothing is reported that hasn't been
 * through `scrubPath`, and query strings are dropped whole rather than filtered. Event payloads
 * are counts and fixed words only; never a name, a barcode, a facility or a free-text error. */
import { isNative } from "@/lib/nativescan";
import { HOSTED_UMAMI_APP_ID, HOSTED_UMAMI_MARKETING_ID, HOSTED_UMAMI_SRC } from "@/lib/hosted-defaults";

/* The tracker script address. Its origin is admitted by the content-security policy in
 * next.config.ts, which derives it from the same two sources. */
export const UMAMI_SRC = process.env.NEXT_PUBLIC_UMAMI_SRC || HOSTED_UMAMI_SRC;

/** Umami website ids. Overridable; the hosted defaults live in lib/hosted-defaults.ts, which the
 *  Community edition replaces with blanks, so a self-hosted instance reports nowhere by default. */
export const MARKETING_ID = process.env.NEXT_PUBLIC_UMAMI_SITE_ID || HOSTED_UMAMI_MARKETING_ID;
export const APP_ID = process.env.NEXT_PUBLIC_UMAMI_APP_ID || HOSTED_UMAMI_APP_ID;

type Payload = Record<string, unknown>;
type Umami = { track: (fn: (p: Payload) => Payload) => void };
declare global { interface Window { umami?: Umami } }

/* Which of the two Umami sites this page belongs to. Set by <Analytics>, read here so that the
   app's payloads can be scrubbed harder than the public site's. */
let currentSite: "marketing" | "app" = "marketing";
export function setSite(site: "marketing" | "app") { currentSite = site; }

/** A cuid or a uuid — anything long enough to be a record id rather than a route name. */
const ID_LIKE = /^(?:[a-z0-9]{20,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** `/m/person/cmtpldt9f00iab` -> `/m/person/:id`. Query strings are dropped entirely. */
export function scrubPath(path: string): string {
  const clean = (path || "/").split("?")[0].split("#")[0];
  return clean
    .split("/")
    .map((seg) => (ID_LIKE.test(seg) ? ":id" : seg))
    .join("/") || "/";
}

/** Referrers from our own site can carry ids too; outside referrers are the useful ones, kept whole. */
export function scrubReferrer(ref: string): string {
  if (!ref) return "";
  try {
    const u = new URL(ref);
    if (typeof location !== "undefined" && u.origin === location.origin) return scrubPath(u.pathname);
    return u.origin + scrubPath(u.pathname);
  } catch {
    return "";
  }
}

/** Android shell or a browser. Without this, Play installs and real usage can never be reconciled. */
export function surface(): "android" | "web" {
  try { return isNative() ? "android" : "web"; } catch { return "web"; }
}

/* Umami's own `track(name, data)` helper composes `{...defaultPayload, name, data}`, and that
   default payload carries the live `location.pathname + search`. Sending an event from
   /m/person/<id> that way posts the staff id regardless of how carefully page views are scrubbed.
   The function form hands us the whole payload to rewrite, so everything goes through this. */
function send(extra: Payload) {
  const u = typeof window !== "undefined" ? window.umami : undefined;
  if (!u) return;
  try {
    u.track((p: Payload) => {
      const url = scrubPath(String(extra.url ?? (typeof location !== "undefined" ? location.pathname : "/")));
      const out: Payload = {
        ...p,
        ...extra,
        url,
        referrer: scrubReferrer(String(p.referrer || (typeof document !== "undefined" ? document.referrer : "") || "")),
        // The website id, every time. Umami's script initialises once per document and keeps the
        // id of the FIRST tag that loaded it, so after a client-side hop from a public page into
        // /app (the demo, the auth page's own navigation) every page view under /app went to the
        // marketing website — 51 of them by 2026-09-13. Naming the site on the payload makes the
        // destination follow the layout, not the load order.
        website: currentSite === "app" ? APP_ID : MARKETING_ID,
      };
      // Page titles are free text. None of the app's carry a name today, but one added later
      // would leak silently, so the app reports its path instead. The public site's titles are
      // fixed marketing copy and are worth keeping.
      if (currentSite === "app") out.title = url;
      return out;
    });
  } catch { /* analytics must never break a page */ }
}

/** A scrubbed page view. Called on every route change; automatic tracking is off. */
export function pageview(path: string) {
  send({ url: path });
}

/** A named event. `data` may hold counts and fixed words — never anything identifying. */
export function track(event: string, data?: Record<string, string | number | boolean>) {
  send({ name: event, data: { ...data, surface: surface() } });
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
