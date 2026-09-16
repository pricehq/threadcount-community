import type { Metadata } from "next";

/* Sign in is a client component and can't export metadata of its own, so it gets this. Without it
   the page inherited the app shell's title and a browser tab, a history entry and a bookmark for
   the sign-in screen all read as if they were the site's front page. */
export const metadata: Metadata = {
  title: "Sign in",
  alternates: { canonical: "/m/login" },
};

export default function MLoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
