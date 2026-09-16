"use client";
/* The last resort: the root layout itself failed, so this replaces <html> entirely. Nothing from
   the app is available here — not the font, not globals.css, not the site components — so every
   style is inline and the type falls back to a system stack rather than Archivo. Keeping it
   self-contained is the point: this page has to render when everything else has not. */
import { useEffect } from "react";
import { safeLocation } from "@/lib/errors";
import { report } from "@/lib/glitchtip";

const INK = "#201e1d";
const PAPER = "#f3f2f2";
const ACCENT = "#ec3013";
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  /* Reported straight to the reporter, not through lib/errors' window seam.
   *
   * That seam is published by components/ErrorReporting, which is mounted inside the root layout —
   * the very layout that has just failed. When this boundary renders, that effect has by definition
   * not run, so window.__tcReporter is undefined and reportError falls through to a no-op in
   * production: the one boundary that means "everything is broken" was the only one sending
   * nothing. Importing the reporter directly costs a couple of kilobytes in the bundle that renders
   * this page and removes the dependency on a component that cannot have mounted. */
  useEffect(() => { report({ error, where: "global", url: safeLocation() }); }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: PAPER, color: INK, fontFamily: SANS }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center" }}>
          <div style={{ maxWidth: 620, margin: "0 auto", padding: "48px 24px" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 30 }}>
              <span style={{ width: 15, height: 15, background: ACCENT, display: "inline-block" }} />
              <span style={{ fontWeight: 800, fontSize: 19, letterSpacing: "-0.01em" }}>ThreadCount</span>
            </div>
            <div style={{ fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 800, color: ACCENT }}>
              Service error
            </div>
            <h1 style={{ fontWeight: 800, fontSize: "clamp(28px,5vw,46px)", lineHeight: 1.05, letterSpacing: "-0.03em", margin: "14px 0 0" }}>
              ThreadCount is having a moment.
            </h1>
            <div style={{ width: 60, height: 4, background: ACCENT, margin: "22px 0 0" }} />
            <p style={{ fontSize: 16.5, lineHeight: 1.7, margin: "22px 0 0" }}>
              Something failed before the page could be built. Your records are untouched — this is
              the website falling over, not the linen room. Try again in a moment.
            </p>
            <div style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                onClick={reset}
                style={{ font: "inherit", fontWeight: 800, letterSpacing: "0.02em", textTransform: "uppercase", fontSize: 13, background: ACCENT, color: "#fff", border: 0, padding: "14px 22px", cursor: "pointer" }}
              >
                Try again
              </button>
              <a
                href="/"
                style={{ font: "inherit", fontWeight: 800, letterSpacing: "0.02em", textTransform: "uppercase", fontSize: 13, background: "transparent", color: INK, border: `2px solid ${INK}`, padding: "12px 20px", textDecoration: "none" }}
              >
                Back to the start
              </a>
            </div>
            {error.digest ? (
              <p style={{ fontSize: 12.5, color: "#6b6764", marginTop: 26, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                Reference {error.digest}
              </p>
            ) : null}
          </div>
        </div>
      </body>
    </html>
  );
}
