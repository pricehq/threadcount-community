import { NextResponse } from "next/server";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://threadcount.tech";

/* Served as text rather than through Next's robots metadata so it can carry a Content-Signal line,
 * which that helper cannot express. The policy (2026-09-15, Kyle's call): search engines and AI
 * search/answer engines may crawl and cite the marketing pages; nothing here may be used to train
 * models. The signal replaces the Cloudflare-managed robots.txt, which blocked the AI search
 * crawlers wholesale and with them every answer-engine referral.
 *
 * Everything behind a login stays out: /m is the phone app (its pages already say noindex, but a
 * crawler has to fetch one to read that, and every one is dynamic and behind a session); /my is the
 * staff self-service view, reached from a printed slip, never from search. */
export function GET() {
  const body = [
    "User-agent: *",
    "Content-Signal: search=yes, ai-input=yes, ai-train=no",
    "Allow: /",
    "Disallow: /app",
    "Disallow: /app/",
    "Disallow: /api/",
    "Disallow: /print",
    "Disallow: /auth",
    "Disallow: /m",
    "Disallow: /m/",
    "Disallow: /my",
    "Disallow: /my/",
    "",
    `Sitemap: ${SITE}/sitemap.xml`,
    "",
  ].join("\n");
  return new NextResponse(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
