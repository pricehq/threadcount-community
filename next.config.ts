import type { NextConfig } from "next";
import { ANALYTICS_ORIGIN, FRAMABLE_SECTIONS } from "./lib/csp";

/* Security headers. The Content-Security-Policy is NOT here: it carries a per-request nonce, so
 * proxy.ts builds it for every request it sees (lib/csp.ts). What is left is the same on every
 * response. */
const common = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
];
const headers = [{ key: "X-Frame-Options", value: "DENY" }, ...common];
// Framable pages (lib/csp.ts) carry no X-Frame-Options at all: it has no "allow this one origin"
// value, and the policy's frame-ancestors says exactly who may frame them.
const framableHeaders = ANALYTICS_ORIGIN ? common : headers;
const sections = FRAMABLE_SECTIONS.join("|");

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
    // Exactly one of the three rules matches any path, so no header is ever set twice.
    return [
      { source: `/:path((?!(?:${sections})(?:/|$)).+)`, headers },
      { source: "/", headers: framableHeaders },
      { source: `/:path((?:${sections})(?:/.*)?)`, headers: framableHeaders },
    ];
  },
  // The site went from twenty-three pages to nine on 2026-09-15. Every old address still lands
  // somewhere useful, permanently, so nothing indexed, linked from an email or printed on a slip
  // breaks. /product and /reports were older redirects again (to /features and /reporting);
  // they now go straight to where those pages ended up. On 2026-09-18 the page on what the
  // software does moved from /product to /what-it-does ("project, not product"). It could not go
  // back to /features: browsers cache the permanent /features -> /product redirect, and the
  // reverse would loop for anyone who ever followed it.
  async redirects() {
    /* Every redirect below the app block belongs to the website, and a server running the published
     * edition has no website: no pricing page was ever bookmarked there, and /sla, /support and
     * /about would be redirects to pages that do not exist on it. They are left out of that build
     * rather than kept, because a redirect still *answers* — 308, not 404 — and the publisher
     * checks from the outside that none of the hosted doors answers at all. */
    const site = process.env.EDITION === "community" ? [] : [
      { source: "/product", destination: "/what-it-does", permanent: true },
      { source: "/features", destination: "/what-it-does", permanent: true },
      { source: "/how-it-works", destination: "/what-it-does#flow", permanent: true },
      { source: "/reporting", destination: "/what-it-does#reports", permanent: true },
      { source: "/reports", destination: "/what-it-does#reports", permanent: true },
      { source: "/faq", destination: "/what-it-does#questions", permanent: true },
      { source: "/getting-started", destination: "/docs/start/set-up-in-an-afternoon", permanent: true },
      { source: "/guides", destination: "/docs#guides", permanent: true },
      { source: "/roadmap", destination: "/changelog#next", permanent: true },
      // Pricing, Terms, Acceptable use, Service levels, Security and Contact are pages again since
      // free hosted accounts came back on 2026-09-29. Browsers that followed the permanent
      // redirects these addresses had from 17 Sept may still have them cached; that cannot be
      // undone from here, and it only affects someone who visited in those twelve days.
      // Contact lives at /contact; /support, the old address, is temporary so it can change.
      { source: "/support", destination: "/contact", permanent: false },
      { source: "/about", destination: "/", permanent: true },
      { source: "/legal-about", destination: "/contact", permanent: false },
    ];
    return [
      ...site,
      // The coordinator portal's screens folded into seven on the 2026-09 overhaul. These ship in
      // every edition, because /app is the product. Temporary (307) redirects; the incoming query
      // string is merged into the destination.
      { source: "/app/issue", destination: "/app/counter", permanent: false },
      { source: "/app/stocktake", destination: "/app/stock?tab=count", permanent: false },
      { source: "/app/orders/list", destination: "/app/orders", permanent: false },
      { source: "/app/activity", destination: "/app/settings?tab=audit", permanent: false },
      { source: "/app/dashboard", destination: "/app", permanent: false },
    ];
  },
};

export default nextConfig;
