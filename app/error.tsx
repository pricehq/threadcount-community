"use client";
/* The route-level error boundary. Something threw while rendering a page; the shell survives, so
   this keeps the site's own chrome and offers the two things that actually help — try again, and
   a way to tell someone.
   The error's message is deliberately not printed: it is written by the server, can carry internal
   detail, and means nothing to a linen services manager. The digest is shown because it is the one
   string that lets a report be matched to a log line. */
import Link from "next/link";
import { HAS_SITE } from "@/lib/links";
import { useEffect } from "react";
import { reportError } from "@/lib/errors";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportError(error, "route"); }, [error]);

  return (
    <div style={{ fontFamily: "var(--font-body)", color: "var(--color-text)", background: "var(--color-bg)", minHeight: "100vh", display: "flex", alignItems: "center" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "clamp(32px,6vw,64px) clamp(20px,5vw,40px)" }}>
        <div style={{ fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 800, color: "var(--color-accent-700)" }}>
          Something went wrong
        </div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(30px,5vw,52px)", lineHeight: 1.0, letterSpacing: "-0.03em", margin: "16px 0 0" }}>
          This page didn&rsquo;t load.
        </h1>
        <div style={{ width: 60, height: 4, background: "var(--color-accent)", margin: "22px 0 0" }} />
        <p style={{ fontSize: 16.5, lineHeight: 1.7, color: "var(--color-neutral-800)", margin: "22px 0 0" }}>
          The fault is ours, not yours, and nothing you were doing has been lost — ThreadCount only
          changes a record when you commit it. Try again, and if it keeps happening, tell us and
          we&rsquo;ll go and look.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
          <button onClick={reset} className="btn btn-primary" style={{ cursor: "pointer", font: "inherit" }}>Try again</button>
          <Link href="/" className="btn">Back to the start</Link>
          {HAS_SITE && <Link href="/support" className="btn">Tell us</Link>}
        </div>
        {error.digest ? (
          <p style={{ fontSize: 12.5, color: "var(--color-neutral-700)", marginTop: 26, fontFamily: "monospace" }}>
            Reference {error.digest} — quote this and we can find it in the log.
          </p>
        ) : null}
      </div>
    </div>
  );
}
