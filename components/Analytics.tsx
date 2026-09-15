"use client";
/* Mounts the Umami script and reports page views by hand.
 *
 * `data-auto-track="false"` is the important attribute: left on, Umami reports
 * `location.pathname + location.search` by itself, which for this app would mean posting staff and
 * location ids — and every `?next=` — straight into the analytics database. With it off, the only
 * thing ever reported is what `pageview()` sends, and that has been through `scrubPath`.
 *
 * `data-do-not-track="true"` makes the script stand down entirely for anyone whose browser asks
 * not to be tracked. */
import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { APP_ID, MARKETING_ID, UMAMI_SRC, pageview, setSite, surface, track } from "@/lib/analytics";

export default function Analytics({ site }: { site: "marketing" | "app" }) {
  const id = site === "app" ? APP_ID : MARKETING_ID;
  setSite(site);
  // usePathname only — never useSearchParams. It would drag every static marketing page into
  // dynamic rendering, and the query strings here (?next=, ?new=) are exactly what we don't want.
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const last = useRef<string | null>(null);
  const openedSent = useRef(false);
  /* Umami's `tag` — "android" in the shell, "web" in a browser — on every pageview and event, so
   * the dashboard's own filter can split the two without a custom-property pivot. Every event
   * already carries `surface` in its data; this puts the same fact where Umami's UI reads it.
   * Decided after mount: the server render cannot know which shell it is being sent to and must
   * produce the same markup as the client's first paint. */
  const [tag, setTag] = useState<"android" | "web" | null>(null);
  useEffect(() => {
    /* The hosted defaults report only from a page really served on threadcount.tech: the e2e
       suites render these same layouts on localhost, and without this every local run counted.
       A tracker the operator named explicitly (NEXT_PUBLIC_UMAMI_SRC) mounts wherever it runs. */
    if (!process.env.NEXT_PUBLIC_UMAMI_SRC && !/(^|\.)threadcount\.tech$/.test(location.hostname)) return;
    setTag(surface());
  }, []);

  /* Clicks on anything carrying data-umami-event. Umami's own handler for that attribute is part
     of auto-track, which is off here on purpose (it would report raw, id-bearing URLs), so the
     public site's calls to action never counted. One delegated
     listener reads the attribute and its data-umami-event-* companions and sends them through the
     same scrubbing `track()` everything else uses. */
  useEffect(() => {
    if (!ready) return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-umami-event]") as HTMLElement | null;
      if (!el) return;
      const name = el.dataset.umamiEvent;
      if (!name) return;
      const data: Record<string, string> = {};
      for (const [k, v] of Object.entries(el.dataset)) {
        if (k !== "umamiEvent" && k.startsWith("umamiEvent") && v) data[k.slice("umamiEvent".length).toLowerCase()] = v;
      }
      track(name, data);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [ready]);

  useEffect(() => {
    if (!ready || !pathname || pathname === last.current) return;
    last.current = pathname;
    pageview(pathname);
    // One event per app launch, so installs from Play can be reconciled with people who actually
    // open the thing. Fires once per page-load of the shell, not once per screen.
    if (site === "app" && !openedSent.current) {
      openedSent.current = true;
      track("app_opened");
    }
  }, [ready, pathname, site]);

  if (!id || !tag || !UMAMI_SRC) return null;
  return (
    <Script
      src={UMAMI_SRC}
      data-website-id={id}
      data-tag={tag}
      data-auto-track="false"
      data-do-not-track="true"
      strategy="afterInteractive"
      onReady={() => setReady(true)}
    />
  );
}
