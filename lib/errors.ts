"use client";
/* One place the app reports a crash from.
 *
 * The error boundaries call this rather than talking to a reporting SDK directly, so that what
 * gets sent — and what gets stripped first — is decided in a single file rather than at each
 * boundary. ThreadCount's URLs carry staff, location and order ids, exactly as they do for
 * analytics, and a crash report is if anything more likely to drag one along: the page URL, the
 * referrer and the breadcrumb trail all contain them.
 *
 * Until the reporter is wired this is a no-op in production and a console line in development,
 * which is deliberately better than the previous behaviour of losing the error entirely. */
import { scrubPath } from "@/lib/analytics";

type Reporter = {
  captureException: (e: unknown, ctx?: Record<string, unknown>) => void;
};

/** Set by the reporting bootstrap once it has initialised. Absent = reporting is off. */
function reporter(): Reporter | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { __tcReporter?: Reporter }).__tcReporter;
}

/** The current location with record ids removed, safe to attach to a report. */
export function safeLocation(): string {
  if (typeof location === "undefined") return "";
  return scrubPath(location.pathname);
}

/**
 * Report a crash.
 * `where` distinguishes a route boundary from the root one — a global error means the layout
 * itself failed, which is a different and more serious shape of problem.
 */
export function reportError(error: unknown, where: "route" | "global" | "client") {
  const r = reporter();
  if (r) {
    try {
      r.captureException(error, { tags: { boundary: where }, extra: { path: safeLocation() } });
      return;
    } catch { /* a reporter that throws must not take the page with it */ }
  }
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.error(`[threadcount:${where}]`, error);
  }
}
