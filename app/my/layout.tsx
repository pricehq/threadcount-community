import type { Metadata } from "next";
import Analytics from "@/components/Analytics";

export const dynamic = "force-dynamic";

/* Nothing under /my is public. The sign-in page is reached from a printed slip handed over at the
 * counter, so there is no reason for it to be in an index either. */
export const metadata: Metadata = {
  title: "Your uniform record",
  robots: { index: false, follow: false },
};

/* A fixed-height column, like the counter app: the bars don't scroll, only the body does.
 *
 * No maximumScale, for the same reason it is gone there: pinning the zoom takes pinch-to-zoom away
 * from everyone on every screen of the staff app, which is WCAG 1.4.4. */
export const viewport = {
  width: "device-width", initialScale: 1,
  viewportFit: "cover" as const, themeColor: "#201e1d",
};

/* Only the shell. Sign in and the emailed approval link live under /my but must be reachable
 * without a session — one is how you get a session, and the other is deliberately for a manager
 * who is standing in a corridor with an email open and no intention of signing in. */
export default function MyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="tcx-app" role="main">
      {/* The shell is the main landmark, as on the counter app, and for the same reason it is a
          role rather than a wrapping element. */}
      {children}
      <Analytics site="app" />
    </div>
  );
}
