"use client";
/* Mounts the Umami tracker (and, where allowed, its recorder) and reports page views by hand.
 *
 * What the tag is told, and why:
 *   data-before-send  every payload goes through lib/analyticsscrub.ts first (route templates, no
 *                     query in the app, allow-listed data, a facility-level id at most).
 *   data-auto-pageview="false"  page views are sent from here only, after the scrub has a route
 *                     to work with; automatic tracking stays on for Web Vitals and data-umami-event.
 *   data-performance  Web Vitals (LCP, INP, CLS, FCP, TTFB) on every surface.
 *   data-do-not-track a browser asking not to be tracked gets nothing; Global Privacy Control is
 *                     treated the same (the tag is never mounted, see below).
 *
 * The recorder (session replays + heatmaps) is injected only when recorderAllowed() passes for the
 * address the page opened on, and lib/analytics.ts stops it for good the moment a route change
 * leaves the allowed set. What each website records, and how hard it masks, is set per website in
 * Umami: the public site masks inputs, the app masks all text and blocks images and marked areas.
 *
 * identity: the facility-level identify computed on the server (lib/analyticsidentity.ts), or null.
 * It is sent once, before the first app page view, and never on the public site. */
import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  APP_ID, MARKETING_ID, RECORDER_SRC, UMAMI_SRC, type AnalyticsIdentity,
  checkRecorder, claimRecorder, flushQueue, identify, installBeforeSend, isFramed, pageview, privacySignal, registerTracker, setSite, surface, track,
} from "@/lib/analytics";
import { ctaFor } from "@/lib/analyticsscrub";

export default function Analytics({ site, identity = null }: { site: "marketing" | "app"; identity?: AnalyticsIdentity | null }) {
  const id = site === "app" ? APP_ID : MARKETING_ID;
  // usePathname only — never useSearchParams. It would drag every static marketing page into
  // dynamic rendering, and the query strings here (?next=, ?new=) are exactly what we don't want.
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [record, setRecord] = useState(false);
  const last = useRef<string | null>(null);
  const openedSent = useRef(false);
  /* Umami's `tag` — "android" in the shell, "web" in a browser — on every payload, so the
   * dashboard's own filter can split the two. Decided after mount: the server render cannot know
   * which shell it is being sent to and must produce the same markup as the client's first paint. */
  const [tag, setTag] = useState<"android" | "web" | null>(null);

  useEffect(() => {
    /* The hosted defaults report only from a page really served on threadcount.tech: the e2e
       suites render these same layouts on localhost, and without this every local run counted.
       A tracker the operator named explicitly (NEXT_PUBLIC_UMAMI_SRC) mounts wherever it runs.
       Framed pages (Umami's heatmap viewer) and privacy-signalling browsers load nothing. */
    if (!process.env.NEXT_PUBLIC_UMAMI_SRC && !/(^|\.)threadcount\.tech$/.test(location.hostname)) return;
    if (isFramed() || privacySignal()) return;
    setSite(site);
    installBeforeSend();
    setTag(surface());
  }, [site]);

  useEffect(() => {
    if (!ready || !pathname || pathname === last.current) return;
    last.current = pathname;
    pageview();
    checkRecorder();
    // One event per app launch, so installs from Play can be reconciled with people who actually
    // open the thing. Fires once per page-load of the shell, not once per screen.
    if (site === "app" && !openedSent.current) {
      openedSent.current = true;
      track("app_opened");
    }
  }, [ready, pathname, site]);

  /* Calls to action on the public site, counted by where the link goes (lib/analyticsscrub.ts
     ctaFor) rather than by an attribute each button would have to remember. */
  useEffect(() => {
    if (!ready || site !== "marketing") return;
    const onClick = (e: MouseEvent) => {
      try {
        const a = (e.target as Element | null)?.closest?.("a[href]");
        const cta = a ? ctaFor(a.getAttribute("href") || "", location.href) : null;
        if (cta) track("cta_click", { cta, placement: location.pathname.split("/")[1] || "home" });
      } catch { /* ignore */ }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [ready, site]);

  if (!id || !tag || !UMAMI_SRC) return null;
  return (
    <>
      <Script
        src={UMAMI_SRC}
        data-website-id={id}
        data-tag={tag}
        data-before-send="__tcBeforeSend"
        data-auto-pageview="false"
        data-performance="true"
        data-do-not-track="true"
        strategy="afterInteractive"
        onReady={() => {
          try {
            registerTracker();
            setSite(site);
            identify(identity);
            flushQueue();
            if (claimRecorder(site)) setRecord(true);
          } catch { /* analytics must never break a page */ }
          setReady(true);
        }}
      />
      {record && RECORDER_SRC ? <Script src={RECORDER_SRC} data-website-id={id} strategy="afterInteractive" /> : null}
    </>
  );
}
