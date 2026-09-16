"use client";
/* Installs client-side error reporting.
 *
 * Two jobs. It registers the global handlers, because most client crashes never reach a React
 * error boundary — a failed fetch in an event handler, a promise nobody awaited, a script that
 * threw during hydration. And it publishes the reporter that lib/errors.ts looks for, so the
 * branded boundaries in error.tsx and global-error.tsx start sending without importing any of
 * this themselves.
 *
 * Mounted once in the root layout so it covers the marketing site, the desktop app and /m alike. */
import { useEffect } from "react";
import { report, errorReportingOn } from "@/lib/glitchtip";
import { scrubPath } from "@/lib/analytics";

export default function ErrorReporting() {
  useEffect(() => {
    if (!errorReportingOn()) return;

    const path = () => (typeof location === "undefined" ? "" : scrubPath(location.pathname));

    // The seam the error boundaries call. Publishing it here means those files never need to know
    // which reporter is in use.
    (window as unknown as { __tcReporter?: unknown }).__tcReporter = {
      captureException(e: unknown, ctx?: { tags?: Record<string, string>; extra?: Record<string, unknown> }) {
        report({ error: e, where: ctx?.tags?.boundary || "boundary", url: path(), tags: ctx?.tags, extra: ctx?.extra });
      },
    };

    const onError = (ev: ErrorEvent) => {
      report({ error: ev.error ?? ev.message, where: "window", url: path() });
    };
    const onRejection = (ev: PromiseRejectionEvent) => {
      report({ error: ev.reason, where: "unhandled-rejection", url: path() });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
