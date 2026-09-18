import type { Metadata } from "next";
import Analytics from "@/components/Analytics";

export const dynamic = "force-dynamic";

/* `title` has to be absolute here. As a plain string it went through the root layout's
   "%s — ThreadCount" template and every screen of the phone app, sign-in included, was titled
   "ThreadCount — ThreadCount" in the tab, in history and in a bookmark. The template is re-declared
   for the screens below that name themselves, and the canonical points at the app rather than
   inheriting the marketing homepage's. */
export const metadata: Metadata = {
  title: { absolute: "ThreadCount — the uniform store counter", template: "%s — ThreadCount" },
  alternates: { canonical: "/m" },
  robots: { index: false, follow: false },
};
/* The app is a fixed-height column: bars don't scroll, only the body does.
 *
 * No maximumScale. Pinning the zoom kept the layout tidy and took pinch-to-zoom away from everyone
 * on every screen — WCAG 1.4.4, and it matters more than tidiness on a ward phone held at arm's
 * length in bad light. The bundled shell's own index.html had the same line removed. */
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" as const, themeColor: "#201e1d" };

/* Only the shell. Sign in and create account live under /m but must be reachable without a
   session — they are how you get one — so the session check sits in (app) with everything else. */
export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="tcx-app" role="main">
      {/* The shell itself is the main landmark. No skip link on the phone surfaces: navigation is
          the bar at the bottom, after the content, so there is no repeated block in front to bypass.
          role on the existing box rather than a <main> wrapper — the shell is a fixed-height flex
          column, and the display:contents that an extra element would need has a long history of
          dropping the landmark out of the accessibility tree. */}
      {children}
      {/* Mounted on /m rather than inside (app): sign in and create account are app screens too,
          and they are where the Android shell lands first. */}
      <Analytics site="app" />
    </div>
  );
}
