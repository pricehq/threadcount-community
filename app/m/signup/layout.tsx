import type { Metadata } from "next";

/* Same reason as the sign-in screen next door: a client page can't name itself, and "create an
   account" is not the site's front page. */
export const metadata: Metadata = {
  title: "Create an account",
  alternates: { canonical: "/m/signup" },
};

export default function MSignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
