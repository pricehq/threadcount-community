/* The analytics privacy rules as pure functions — no DOM, no React, no Next — so they can be
 * checked by scripts/check-analytics.ts and reused by the browser tracker (lib/analytics.ts).
 *
 * The one rule behind all of it: no record identifier, name, email, facility or free text ever
 * reaches the analytics database. Umami's tracker composes its payloads from the live address
 * bar and the page, so instead of trusting each caller every payload it sends — pageview, event,
 * identify, Web Vitals — passes through scrubPayload() on its way out (wired as the tracker's
 * data-before-send by components/Analytics.tsx):
 *
 *   url       a route template (/m/person/:id), never a record id. The signed-in app keeps NO
 *             query string at all; the public site and sign-up keep only sanitised utm_* and
 *             record an ad click id as the single word data.paid ("google", "meta", …).
 *   referrer  our own pages → canonical host + template; anyone else → origin only.
 *   title     the route template (a page title can name a facility or a person).
 *   hostname  threadcount.tech, whatever the page was served on (www, a preview host).
 *   data      allow-listed keys holding fixed words, flags or small numbers only (cleanData).
 *   id        only a facility analytics id (fa_…), and only on the app website — the public site
 *             and the sign-up pages are never linked to a facility.
 *
 * recorderAllowed() decides where Umami's recorder (session replays + heatmaps) may run. That
 * script posts the RAW address and records DOM attributes, and it has no before-send, so the
 * only control is where it is allowed to run at all. */

type Payload = Record<string, unknown>;
export type AnalyticsSite = "marketing" | "app";

/** The site's own host (NEXT_PUBLIC_SITE_URL, compiled in; threadcount.tech by default), so a
 *  self-hosted instance whose operator points the tracker at their own Umami is scrubbed and gated
 *  for its own address rather than ours. */
export const ROOT_HOST = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://threadcount.tech").hostname.replace(/^www\./, ""); } catch { return "threadcount.tech"; }
})();

/** A path segment that is a record id rather than a route name: a cuid, a uuid, a long hex
 *  string or a long run of letters and digits with no separator. Route names and help/doc slugs
 *  are lower-case words joined by hyphens, which this never matches. */
export const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|c[a-z0-9]{20,}|[a-z0-9]{20,}|[0-9a-f]{16,}|[0-9]{6,})$/i;
/** A data VALUE that is an id or a token: the path rule, plus any long token-like string. */
export const ID_LIKE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|c[a-z0-9]{20,}|[a-z0-9]{20,}|[0-9a-f]{16,}|[0-9]{6,}|[A-Za-z0-9_-]{24,})$/i;
/** Something that looks like an email address, wherever it turns up. */
const EMAILISH = /[^\s/@]+@[^\s/@]+\.[a-z]{2,}/i;

/* Routes whose parameter is a name rather than an id — a ward's own word in the address
 * (/m/round/Ward%203A) — collapse to their template like any id does. */
const NAMED_PARAMS: Array<[RegExp, string]> = [
  [/^\/m\/round\/[^/]+/, "/m/round/:ward"],
];

/** `/m/person/cmtpldt9f00iab?x=1` → `/m/person/:id`. Query and fragment are dropped. */
export function scrubPath(path: string): string {
  let clean = String(path || "/").split("?")[0].split("#")[0] || "/";
  try { clean = decodeURI(clean); } catch { /* keep as sent */ }
  for (const [re, tpl] of NAMED_PARAMS) {
    if (re.test(clean)) clean = clean.replace(re, tpl);
  }
  const out = clean
    .split("/")
    .map((seg) => (ID_SEGMENT.test(seg) || EMAILISH.test(seg) ? ":id" : seg))
    .join("/");
  return out || "/";
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const UTM_VALUE = /^[a-z0-9_-]{1,40}$/;
/* Ad-platform click ids → the one word kept. The id itself is a per-click identifier. */
const CLICK_IDS: Record<string, string> = { gclid: "google", fbclid: "meta", msclkid: "microsoft", ttclid: "tiktok", li_fat_id: "linkedin", twclid: "x" };

/** Sanitised utm_* as a "?a=b&…" suffix ("" when none survive). */
export function utmQuery(params: URLSearchParams): string {
  const out = new URLSearchParams();
  for (const k of UTM_KEYS) {
    const v = (params.get(k) || "").trim().toLowerCase().slice(0, 40);
    if (UTM_VALUE.test(v)) out.set(k, v);
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

/** The ad platform a click id names, or null. */
export function paidPlatform(params: URLSearchParams): string | null {
  for (const [k, word] of Object.entries(CLICK_IDS)) if (params.has(k)) return word;
  return null;
}

/** url → route template (+ UTM on the public site) and the paid word, if any. */
export function scrubUrl(raw: unknown, site: AnalyticsSite, href: string): { url: string; paid: string | null } {
  let u: URL;
  try {
    u = new URL(typeof raw === "string" && raw ? raw : href, href);
  } catch {
    return { url: "/", paid: null };
  }
  const path = scrubPath(u.pathname);
  if (site === "app") return { url: path, paid: null };
  return { url: path + utmQuery(u.searchParams), paid: paidPlatform(u.searchParams) };
}

function isOwnHost(h: string): boolean {
  return h === ROOT_HOST || h.endsWith(`.${ROOT_HOST}`);
}

/** Referrer: our pages → https://threadcount.tech + template; external → origin only; junk → "". */
export function scrubReferrer(ref: unknown): string {
  if (typeof ref !== "string" || !ref.trim()) return "";
  const r = ref.trim();
  // Umami strips a same-origin referrer down to its path ("/m/person/c…?next=/m").
  if (r.startsWith("/") && !r.startsWith("//")) return `https://${ROOT_HOST}${scrubPath(r)}`;
  try {
    const u = new URL(r);
    const h = u.hostname.toLowerCase();
    if (isOwnHost(h)) return `https://${ROOT_HOST}${scrubPath(u.pathname)}`;
    // The Android shell is served from localhost: keep that fact (it is how app traffic is told
    // apart from a browser), never its path.
    if (u.protocol === "http:" || u.protocol === "https:") return u.origin;
    // android-app://com.google.android.gm/ and friends: scheme + host.
    return u.host ? `${u.protocol}//${u.host}` : "";
  } catch {
    return "";
  }
}

/* ---------------------------------------------------------------- event data */

/** Every key any event may carry. Anything else is dropped. */
export const ALLOWED_KEYS: ReadonlySet<string> = new Set([
  "surface", "screen", "reason", "kind", "action", "mode", "engine", "second_factor", "step", "outcome",
  "placement", "cta", "dest", "page", "count", "method", "source", "form", "section", "tab", "role",
  "paid", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "build",
]);
const WORD = /^[a-z0-9_:+<.-]{1,40}$/;
const MAX_NUMBER = 1_000_000;

/** Keep only allow-listed keys holding fixed words, booleans or small numbers. */
export function cleanData(props: Record<string, unknown> | null | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!props || typeof props !== "object") return out;
  for (const [k, v] of Object.entries(props)) {
    if (!ALLOWED_KEYS.has(k) || v === null || v === undefined) continue;
    if (typeof v === "number") {
      if (Number.isFinite(v) && Math.abs(v) <= MAX_NUMBER) out[k] = v;
      continue;
    }
    if (typeof v === "boolean") { out[k] = v; continue; }
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (!WORD.test(s) || ID_LIKE.test(s) || EMAILISH.test(s)) continue;
      out[k] = s;
    }
  }
  return out;
}

/* ---------------------------------------------------------------- the before-send */

/** A facility's analytics id: "fa_" + 16 base32 characters of an HMAC (lib/analyticsidentity.ts). */
export const FACILITY_ID = /^fa_[a-z2-7]{16}$/;
/** Payload fields Umami needs and that carry nothing of ours. */
const KEEP = ["screen", "language", "tag", "name", "timestamp", "lcp", "inp", "cls", "fcp", "ttfb", "duration"];
const TAGS = new Set(["android", "web"]);
const EVENT_NAME = /^[a-z0-9_:-]{1,50}$/;
/** Identify dimensions (fixed words only; see lib/analyticsidentity.ts). */
const ID_DIMS = new Set(["role", "fac_age", "fac_size", "demo", "edition", "surface", "build"]);

export type ScrubContext = {
  /** The surface on screen: decides the query rule, the website and whether an id may ride. */
  site: AnalyticsSite;
  /** That surface's Umami website id. Every payload is re-addressed to it: the tracker keeps
   *  the id of the first tag that loaded it across client-side hops, so without this a hop from a
   *  public page into /app filed every app page view under the marketing site. */
  website: string;
  /** location.href, to resolve relative urls against. */
  href: string;
  /** True only while lib/analytics.ts is sending a manual pageview. The tracker's own automatic
   *  pageviews (auto-pageview is off, but a stray one must still die) are dropped. */
  manualPageview?: boolean;
};

/** The before-send itself. Returns null to drop the payload. Never throws. */
export function scrubPayload(type: string, payload: unknown, ctx: ScrubContext): Payload | null {
  try {
    if (!payload || typeof payload !== "object" || !ctx.website) return null;
    const p = payload as Payload;
    const isEvent = type === "event";
    const named = isEvent && typeof p.name === "string" && p.name !== "";
    if (isEvent && !named && !ctx.manualPageview) return null;
    if (named && !EVENT_NAME.test(p.name as string)) return null;
    if (!isEvent && type !== "identify" && type !== "performance") return null;
    // Nothing on the public site or the sign-up pages is ever tied to a facility.
    if (type === "identify" && ctx.site !== "app") return null;

    const out: Payload = { website: ctx.website };
    for (const k of KEEP) if (p[k] !== undefined) out[k] = p[k];
    if (typeof out.tag === "string" && !TAGS.has(out.tag)) delete out.tag;

    const { url, paid } = scrubUrl(p.url, ctx.site, ctx.href);
    out.url = url;
    out.title = url.split("?")[0];
    out.hostname = ROOT_HOST;
    out.referrer = scrubReferrer(p.referrer);

    if (type === "identify") {
      const dims: Record<string, string> = {};
      for (const [k, v] of Object.entries((p.data as Record<string, unknown>) || {})) {
        if (ID_DIMS.has(k) && typeof v === "string" && WORD.test(v)) dims[k] = v;
      }
      if (Object.keys(dims).length) out.data = dims;
    } else if (type !== "performance") {
      const data = cleanData(p.data as Record<string, unknown> | undefined);
      if (paid && isEvent) data.paid = paid;
      if (Object.keys(data).length) out.data = data;
    }
    if (ctx.site === "app" && typeof p.id === "string" && FACILITY_ID.test(p.id)) out.id = p.id;
    return out;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- the recorder gate
 *
 * recorder.js (Umami's session replays and heatmaps, rrweb underneath) posts the raw
 * location.href and records the page's DOM — text is masked per website on the Umami side, but
 * element ATTRIBUTES are recorded as they are, and the signed-in screens put record ids and names
 * in them (id="req-<cuid>", aria-labels naming a person, links to /app/staff/<cuid>). So it may
 * run only where neither the address nor the page can carry one:
 *
 *   1. https on threadcount.tech (or www) — nothing else.
 *   2. No id-like segment in the path.
 *   3. Public site + sign-up: any page but the ones below, and only utm_* / mode in the query.
 *   4. Signed-in app: an ALLOW-list of screens that show no records — sign-in and sign-up, the
 *      scan screen, the "More" menu and the manual. Everything else, which lists people, stock,
 *      orders or requests, never records. Widening this list means first putting
 *      data-umami-block on every element that carries a name or an id on that screen. */
export const RECORDABLE_APP = new Set(["/m/login", "/m/signup", "/m/scan", "/m/more", "/my/signin", "/app/help"]);
const RECORDABLE_APP_PREFIX = /^\/app\/help\/[a-z0-9-]+(\/[a-z0-9-]+)?$/;
/* Public pages that never record even with a clean address: /reset carries a token and shows who
 * it belongs to; the demo switcher signs you in as someone. */
const MARKETING_DENY = /^\/(reset|api)(\/|$)/;
const RECORDABLE_QUERY = /^(mode|utm_(source|medium|campaign|content|term))$/;

export function recorderAllowed(href: string, site: AnalyticsSite): boolean {
  let u: URL;
  try { u = new URL(href); } catch { return false; }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || (host !== ROOT_HOST && host !== `www.${ROOT_HOST}`)) return false;
  if (scrubPath(u.pathname) !== u.pathname) return false; // an id-like or named segment
  const path = u.pathname.replace(/\/{2,}/g, "/").replace(/(.)\/+$/, "$1").toLowerCase();
  if (site === "app") {
    if (u.search) return false;
    return RECORDABLE_APP.has(path) || RECORDABLE_APP_PREFIX.test(path);
  }
  if (MARKETING_DENY.test(path)) return false;
  for (const k of u.searchParams.keys()) if (!RECORDABLE_QUERY.test(k)) return false;
  return true;
}

/* ---------------------------------------------------------------- call-to-action clicks */

/** A link's destination → the word recorded for a click on it, or null for links not worth
 *  counting. Delegated from the public site's layout, so every CTA on every page is counted
 *  without each button having to remember an attribute. */
export function ctaFor(href: string, base = `https://${ROOT_HOST}/`): string | null {
  let u: URL;
  try { u = new URL(href, base); } catch { return null; }
  const h = u.hostname.toLowerCase();
  if (h === "github.com") return "github";
  if (!isOwnHost(h)) return "outbound";
  const p = u.pathname;
  if (p === "/auth" && u.searchParams.get("mode") === "signup") return "signup";
  if (p === "/m/signup") return "signup";
  if (p === "/auth") return "login";
  if (p === "/demo" || p.startsWith("/api/auth/demo")) return "demo";
  if (p.startsWith("/docs/selfhost")) return "selfhost";
  if (p === "/contact") return "contact";
  if (p === "/pricing") return "pricing";
  if (p === "/compare") return "compare";
  return null;
}
