import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import ErrorReporting from "@/components/ErrorReporting";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
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

export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" as const };

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://threadcount.tech";
const DESC = "Free, open-source uniform management for any organisation that hands out uniforms — hotels, security firms, shops, cleaners, schools, depots, factories and clinics. Who holds what, what is on the shelf by size, what to order and what it cost each team, on your own server.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "ThreadCount — Uniform management for any organisation", template: "%s — ThreadCount" },
  description: DESC,
  applicationName: "ThreadCount",
  alternates: { canonical: "/" },
  // Without these a link pasted into Slack, Teams or an email renders as a bare URL.
  openGraph: {
    type: "website", siteName: "ThreadCount", url: SITE, locale: "en_AU",
    title: "ThreadCount — Uniform management for any organisation",
    description: DESC,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "ThreadCount — every garment out the door, accounted for." }],
  },
  twitter: { card: "summary_large_image", title: "ThreadCount — Uniform management for any organisation", description: DESC, images: ["/og.png"] },
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
