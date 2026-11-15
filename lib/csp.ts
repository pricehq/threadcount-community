/* The content-security policy, built per request in proxy.ts with a fresh nonce.
 *
 * Scripts: no 'unsafe-inline'. Next reads the nonce out of the Content-Security-Policy REQUEST
 * header the proxy forwards (node_modules/next/dist/server/app-render/app-render.js) and puts it
 * on every inline and bootstrap script it renders, so only those run. 'strict-dynamic' then
 * trusts what a nonce'd script loads at run time: Next's chunk loader, next/script's analytics
 * tag (components/Analytics.tsx) and the Cloudflare Turnstile loader (components/Turnstile.tsx).
 * The host list after it is only read by browsers too old for 'strict-dynamic'. A nonce exists
 * only in a page rendered for the request, which is why app/layout.tsx makes every page dynamic.
 *
 * Styles keep 'unsafe-inline': the screens use style={{ … }} attributes throughout, Next inlines
 * the font faces, and the print windows (lib/print.ts) write their own <style> into about:blank,
 * which inherits this policy.
 *
 * No Next imports here: next.config.ts reads FRAMABLE_SECTIONS and ANALYTICS_ORIGIN as well. */
import { HOSTED_TELEMETRY_HOSTS, HOSTED_UMAMI_SRC } from "./hosted-defaults";

function originOf(u: string | undefined): string {
  try { return u ? new URL(u).origin : ""; } catch { return ""; }
}

/* The telemetry hosts the policy admits: the hosted service's own, or none in the Community
 * edition (whose lib/hosted-defaults.ts is blank), plus whatever an operator set explicitly. */
const TELEMETRY = [...new Set([...HOSTED_TELEMETRY_HOSTS, originOf(process.env.NEXT_PUBLIC_UMAMI_SRC), originOf(process.env.NEXT_PUBLIC_GLITCHTIP_DSN)].filter(Boolean))];

const TURNSTILE = "https://challenges.cloudflare.com";

/* Umami's heatmap view draws the page under the clicks in an iframe served from the analytics host,
 * so the public pages and the sign-up page — and nothing else — may be framed by that host. Every
 * other response keeps frame-ancestors 'none' (and X-Frame-Options DENY, next.config.ts). No
 * analytics host (the Community edition) → nothing is framable. */
export const ANALYTICS_ORIGIN = originOf(process.env.NEXT_PUBLIC_UMAMI_SRC || HOSTED_UMAMI_SRC);

/** Top-level sections of app/(site), plus the sign-up/sign-in page. ("/" is the home page.) */
export const FRAMABLE_SECTIONS = [
  "acceptable-use", "auth", "changelog", "compare", "contact", "data-security", "delete-account", "demo", "docs",
  "guides", "pricing", "privacy", "security", "sla", "terms", "what-it-does",
];

export function isFramable(pathname: string): boolean {
  if (!ANALYTICS_ORIGIN) return false;
  if (pathname === "/") return true;
  return FRAMABLE_SECTIONS.includes(pathname.replace(/^\/+/, "").split("/")[0] ?? "");
}

/** CSP_REPORT_ONLY=1 sends the policy as Report-Only: a way out without a rebuild if it ever
 *  blocks something it should not. Unset (the default) enforces it. */
export function cspHeaderName(): string {
  return process.env.CSP_REPORT_ONLY === "1" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}

/** 128 random bits, base64. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function buildCsp(nonce: string, opts: { framable?: boolean } = {}): string {
  // React uses eval() in development for its error overlay; production never needs it.
  const dev = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${[TURNSTILE, ...TELEMETRY].join(" ")}${dev}`,
    `frame-src ${TURNSTILE}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    // Turnstile's api.js runs in this document and posts a feedback report to its own origin when a
    // widget fails; without it here that report is refused and Cloudflare never hears why.
    `connect-src 'self' ${[...TELEMETRY, TURNSTILE].join(" ")}`,
    "worker-src 'self' blob:",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    opts.framable ? `frame-ancestors ${ANALYTICS_ORIGIN}` : "frame-ancestors 'none'",
  ].join("; ");
}
