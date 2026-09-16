import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { switches } from "@/lib/switches";
import AuthForm from "@/components/AuthForm";
import SourceNotice from "@/components/SourceNotice";
import { COMMUNITY } from "@/lib/edition";

export const dynamic = "force-dynamic";

/* Its own identity, and out of the index.
 *
 * Without this the page inherited the root layout's title and its canonical, so the sign-in screen
 * announced itself as the marketing homepage in the browser tab, in a bookmark and in a shared
 * link — and told search engines it *was* the homepage, which is the one thing a canonical must
 * never say about a different page. Nothing here is any use in a search result either: it is a door
 * for people who already have an account. */
export const metadata: Metadata = {
  title: "Log in",
  alternates: { canonical: "/auth" },
  robots: { index: false, follow: false },
};

export default async function AuthPage({ searchParams }: { searchParams: Promise<{ mode?: string; next?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await currentUser();
  // Only ever redirect within the app (never to an absolute or protocol-relative URL).
  // The phone app lives under /m; anything else off-site is refused so ?next= can't be an open redirect.
  const next = sp.next && (sp.next.startsWith("/app") || sp.next === "/m" || sp.next.startsWith("/m/")) && !sp.next.startsWith("//") ? sp.next : "/app";
  if (user) redirect(next);
  const { signupsOpen, plansLive } = await switches();
  return (
    // The whole page is the sign-in form, so it is the main landmark. There is nothing in front of
    // it to bypass, which is why there is no skip link here.
    <main>
      <Suspense>
        <AuthForm initialMode={sp.mode === "signup" && signupsOpen ? "signup" : "login"} next={next} signupsOpen={signupsOpen} plansLive={plansLive} sso={!COMMUNITY} ssoError={typeof sp.error === "string" && sp.error.startsWith("sso_") ? sp.error : ""} />
      </Suspense>
      {/* The AGPL's offer of source, where everyone who uses this server can see it. */}
      <SourceNotice />
    </main>
  );
}
