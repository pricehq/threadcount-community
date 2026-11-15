import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import ErrorReporting from "@/components/ErrorReporting";
import { SITE_DESC } from "@/lib/sitemeta";

// The variable face with its width axis and italics: the public site stretches and narrows its
// display type (font-stretch) and sets the accent words in heavy italic. The app uses the same
// family at normal width, so nothing there changes.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  style: ["normal", "italic"],
  display: "swap",
});
// The marketing site sets product codes, size runs, times and cost centres in a monospace face,
// the way a coordinator reads them off a slip. Only the public pages use it (globals.css scopes
// --font-mono to .tcm-site); the app and the two phone apps never see it.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
});

/* Every page is rendered for its request. The content-security policy (lib/csp.ts, proxy.ts) lets a
 * script run only with that request's nonce, and Next can only stamp the nonce on the scripts of a
 * page it is rendering now: a page prerendered at build time would ship scripts without one, and
 * the browser would refuse all of them. */
export const dynamic = "force-dynamic";

export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" as const };

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://threadcount.tech";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  // The name alone in the tab: the long line was cut off at "ThreadCount — Uniform man…" in every
  // tab strip. Link previews below keep the descriptive title, where there is room for it.
  title: { default: "ThreadCount", template: "%s — ThreadCount" },
  description: SITE_DESC,
  applicationName: "ThreadCount",
  alternates: { canonical: "/" },
  // Without these a link pasted into Slack, Teams or an email renders as a bare URL.
  openGraph: {
    type: "website", siteName: "ThreadCount", url: SITE, locale: "en_AU",
    title: "ThreadCount — Uniform management for any organisation",
    description: SITE_DESC,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "ThreadCount — every uniform out the door, accounted for." }],
  },
  twitter: { card: "summary_large_image", title: "ThreadCount — Uniform management for any organisation", description: SITE_DESC, images: ["/og.png"] },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable}`}>
      <body>
        {children}
        {/* Global handlers for the client crashes that never reach a React boundary. */}
        <ErrorReporting />
      </body>
    </html>
  );
}
