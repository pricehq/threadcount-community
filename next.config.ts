import type { NextConfig } from "next";
import { HOSTED_TELEMETRY_HOSTS } from "./lib/hosted-defaults";

// The telemetry hosts the policy admits: the hosted service's own, or none in the Community
// edition (whose lib/hosted-defaults.ts is blank), plus whatever an operator set explicitly.
const telemetry = [...HOSTED_TELEMETRY_HOSTS, ...[process.env.NEXT_PUBLIC_UMAMI_SRC, process.env.NEXT_PUBLIC_GLITCHTIP_DSN].map((u) => { try { return u ? new URL(u).origin : ""; } catch { return ""; } })].filter(Boolean);
const scriptHosts = ["https://challenges.cloudflare.com", ...telemetry].join(" ");
const connectHosts = ["'self'", ...telemetry].join(" ");
// The helpdesk chat widget (Chatwoot) — only when an operator points at one; the Community
// edition ships without. Its SDK, iframe, avatars and websocket all come from that one origin.
const helpdesk = (() => { try { return process.env.NEXT_PUBLIC_CHATWOOT_URL ? new URL(process.env.NEXT_PUBLIC_CHATWOOT_URL).origin : ""; } catch { return ""; } })();
const helpdeskWs = helpdesk ? " " + helpdesk + " " + helpdesk.replace(/^https:/, "wss:") : "";
// Stripe's Payment Element (the on-site checkout) — its script, its iframes and its API — only on
// an instance that takes cards. Everything Stripe needs comes from these three hosts.
const cards = !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripeScript = cards ? " https://js.stripe.com" : "";
const stripeFrames = cards ? " https://js.stripe.com https://hooks.stripe.com" : "";
const stripeConnect = cards ? " https://api.stripe.com" : "";

// Security headers. Inline styles/scripts are part of how Next hydrates and how the print windows are
// built, so CSP allows 'unsafe-inline' for those while still pinning every origin to self.
const csp = [
  "default-src 'self'",
  // Cloudflare Insights is not used and never was — the entries were permissive leftovers.
  `script-src 'self' 'unsafe-inline' ${scriptHosts}${helpdesk ? " " + helpdesk : ""}${stripeScript}`,
  `frame-src https://challenges.cloudflare.com${helpdesk ? " " + helpdesk : ""}${stripeFrames}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${helpdesk ? " " + helpdesk : ""}`,
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src ${connectHosts}${helpdeskWs}${stripeConnect}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const headers = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The Docker image (Community edition) runs Next's standalone server; the hosted box runs
  // `next start` from the full build, which standalone output would warn about. Opt in per build.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  // The deploy builds into a SEPARATE directory (NEXT_DIST_DIR=.next-build) and swaps it in with
  // two renames before the restart, so the running server keeps serving a complete .next for the
  // whole build window. Runtime (`next start`) leaves this unset and reads ".next".
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Browser source maps are built so a deploy can upload them to the error tracker against the
  // release, then delete them from .next/static before the site restarts — they are never served. Symbolicated client stacks in GlitchTip without pulling an SDK into the bundle.
  productionBrowserSourceMaps: true,
  // The manual is Markdown read from docs/manual at request time inside the app (/app/help is
  // rendered per request, behind a session). The standalone server the Community image runs only
  // carries files the tracer can see, and a path built at runtime is invisible to it, so the folder
  // is named here. The website's /docs pages are prerendered and need nothing.
  outputFileTracingIncludes: {
    "/app/help": ["./docs/manual/**/*.md"],
    "/app/help/**": ["./docs/manual/**/*.md"],
  },
  async headers() {
    return [{ source: "/(.*)", headers }];
  },
  // The site went from twenty-three pages to nine on 2026-09-15. Every old address still lands
  // somewhere useful, permanently, so nothing indexed, linked from an email or printed on a slip
  // breaks. /product and /reports were older redirects again (to /features and /reporting);
  // they now go straight to where those pages ended up.
  async redirects() {
    return [
      { source: "/features", destination: "/product", permanent: true },
      { source: "/how-it-works", destination: "/product#flow", permanent: true },
      { source: "/reporting", destination: "/product#reports", permanent: true },
      { source: "/reports", destination: "/product#reports", permanent: true },
      { source: "/faq", destination: "/product#questions", permanent: true },
      { source: "/getting-started", destination: "/docs/start/set-up-in-an-afternoon", permanent: true },
      { source: "/guides", destination: "/docs#guides", permanent: true },
      { source: "/roadmap", destination: "/changelog#next", permanent: true },
      { source: "/contact", destination: "/about#contact", permanent: true },
      { source: "/legal-about", destination: "/about", permanent: true },
      // The coordinator portal's screens folded into seven on the 2026-09 overhaul. Temporary (307)
      // redirects; the incoming query string is merged into the destination.
      { source: "/app/issue", destination: "/app/counter", permanent: false },
      { source: "/app/stocktake", destination: "/app/stock?tab=count", permanent: false },
      { source: "/app/orders/list", destination: "/app/orders", permanent: false },
      { source: "/app/activity", destination: "/app/settings?tab=audit", permanent: false },
      { source: "/app/dashboard", destination: "/app", permanent: false },
    ];
  },
};

export default nextConfig;
