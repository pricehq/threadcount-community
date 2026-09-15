"use client";
/* The helpdesk chat widget (Chatwoot, self-hosted).
 *
 * Mounted on the public site and the coordinator web app; never in the phone apps. Off unless an
 * operator sets NEXT_PUBLIC_CHATWOOT_URL + NEXT_PUBLIC_CHATWOOT_TOKEN (the Community edition ships without). Like the
 * analytics tag it only loads on a page really served from threadcount.tech, so the e2e suites
 * on localhost never open conversations against the live desk. The widget itself sets a cookie
 * on the helpdesk host to keep a visitor's conversation across pages; it never reads anything
 * from this page beyond what the visitor types into it. */
import Script from "next/script";
import { useEffect, useState } from "react";

const BASE = (process.env.NEXT_PUBLIC_CHATWOOT_URL || "").replace(/\/$/, "");
const TOKEN = process.env.NEXT_PUBLIC_CHATWOOT_TOKEN || "";

declare global {
  interface Window { chatwootSDK?: { run: (o: { websiteToken: string; baseUrl: string }) => void }; chatwootSettings?: Record<string, unknown>; $chatwoot?: { toggle: (state?: "open" | "close") => void } }
}

export default function Helpdesk() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!TOKEN || !BASE) return;
    // The widget has no built-in default: it exists only where an operator set the two variables,
    // so a Community instance pointing at its own Chatwoot gets it on its own hostname. Local
    // `next start`/e2e runs never set them, which is what keeps the hosted desk out of test noise.
    window.chatwootSettings = { position: "right", type: "standard", launcherTitle: "Chat with us", darkMode: "auto" };
    setOn(true);
  }, []);
  if (!on) return null;
  return (
    <Script
      src={`${BASE}/packs/js/sdk.js`}
      strategy="lazyOnload"
      onLoad={() => window.chatwootSDK?.run({ websiteToken: TOKEN, baseUrl: BASE })}
    />
  );
}
