import type { Metadata } from "next";

/* A layout for one metadata block.
 *
 * app/reset/page.tsx is a client component — it reads the token out of the query string — and a
 * client component cannot export metadata, so the page was inheriting the root layout's homepage
 * title and its canonical. That left a password-reset screen calling itself "ThreadCount — Uniform
 * management for hospitals, aged care and clinics" in the tab and pointing search engines at the homepage as
 * its canonical. This is the smallest place to say otherwise, and noindex belongs here anyway: the
 * page only works with a one-time token from an email.
 */
export const metadata: Metadata = {
  title: "Reset your password",
  alternates: { canonical: "/reset" },
  robots: { index: false, follow: false },
};

export default function ResetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
