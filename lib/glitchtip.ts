/* Error reporting to a GlitchTip (Sentry-protocol) project.
 *
 * GlitchTip speaks Sentry's protocol, so this posts a Sentry "store" event by hand rather than
 * pulling in @sentry/nextjs. Three reasons that's the right trade here:
 *   - the SDK is tens of kilobytes on a phone that a nurse uses in a linen room;
 *   - it hooks the build (withSentryConfig) on a very new Next, which is a compatibility risk the
 *     project doesn't need;
 *   - and everything that leaves this file has to be scrubbed first, which is far easier to
 *     guarantee when there is exactly one function doing the sending.
 *
 * What it costs: no source maps, so client stack frames are minified, and no automatic
 * breadcrumbs. The message, the scrubbed path and the stack are still vastly better than the
 * nothing that was here before.
 *
 * The DSN's public key is not a secret — Sentry-protocol keys are designed to sit in client
 * bundles — so it is safe in NEXT_PUBLIC_.
 */

/* The default lives in lib/hosted-defaults.ts (blank in the Community edition); an explicit
   NEXT_PUBLIC_GLITCHTIP_DSN wins. The key is public by protocol design. */
import { HOSTED_GLITCHTIP_DSN } from "./hosted-defaults";
const DSN = process.env.NEXT_PUBLIC_GLITCHTIP_DSN || HOSTED_GLITCHTIP_DSN;

type Parsed = { url: string; key: string };

/** `https://<key>@host/<projectId>` -> the store endpoint and the auth key. */
function parseDsn(dsn: string): Parsed | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    if (!u.username || !projectId) return null;
    return { url: `${u.protocol}//${u.host}/api/${projectId}/store/`, key: u.username };
  } catch {
    return null;
  }
}

const PARSED = DSN ? parseDsn(DSN) : null;

/* The default DSN is the hosted service's. It is used only where it belongs: on the server, when
   this is not the community edition; in the browser, when the page is served from threadcount.tech.
   An explicit DSN is honoured anywhere. */
const EXPLICIT = !!process.env.NEXT_PUBLIC_GLITCHTIP_DSN;
function allowed(): boolean {
  if (!PARSED) return false;
  if (EXPLICIT) return true;
  if (typeof window !== "undefined") return /(^|\.)threadcount\.tech$/.test(window.location.hostname);
  // On the server only a real deploy reports: a deploy compiles NEXT_PUBLIC_RELEASE into the
  // build, local `next start`/e2e runs never set it. Without this, every suite run at home
  // filed its scaffolding failures as production issues (44 of them, none from a customer).
  if (!process.env.NEXT_PUBLIC_RELEASE) return false;
  return process.env.EDITION !== "community";
}

/* Browser "Script error." is the cross-origin placeholder the browser substitutes for an error
   thrown by a third-party script (Turnstile, the analytics beacon): no message, no stack, no
   location. It cannot be acted on, so it is dropped rather than paged. */
function ignorable(err: Error): boolean {
  return /^Script error\.?$/.test((err.message || "").trim());
}

/* Prisma errors begin with a blank line and an engine id, which the scrubber turns into "[id]:",
   so the issue title says nothing. Use the first line that carries words instead. */
function headline(value: string): string {
  const lines = value.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.find((l) => !/^\[id\]:?$/.test(l) && !/^Invalid `.*` invocation:?$/.test(l)) || lines[0] || value;
}
export const errorReportingOn = () => allowed();

/* Redaction.
 *
 * An error message is not written by us. A Prisma failure quotes the row it choked on, a
 * constraint violation quotes the value, and a validation error quotes what someone typed. Any of
 * those can carry a staff name, a work email, a payroll number or a record id straight into the
 * error tracker, which would undo the care taken everywhere else. */
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const ID_RE = /\b(?:[a-z0-9]{20,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi;
const LONG_NUM_RE = /\b\d{6,}\b/g;

export function scrubText(s: string, max = 1000): string {
  return String(s || "")
    .replace(EMAIL_RE, "[email]")
    .replace(ID_RE, "[id]")
    .replace(LONG_NUM_RE, "[number]")
    .slice(0, max);
}

/** Paths carry record ids; query strings carry more. Keep the shape, drop the specifics. */
export function scrubUrl(raw: string): string {
  try {
    const u = new URL(raw, "https://threadcount.tech");
    const path = u.pathname
      .split("/")
      .map((seg) => (ID_RE.test(seg) ? ":id" : seg))
      .join("/");
    ID_RE.lastIndex = 0;
    return u.origin + path;
  } catch {
    return scrubText(raw, 200);
  }
}

function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
  } catch { /* fall through */ }
  let s = "";
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

export type ReportInput = {
  error: unknown;
  where: string;
  url?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

/** Fire-and-forget. Reporting must never delay, block or break the thing that failed. */
export function report({ error, where, url, tags, extra }: ReportInput): void {
  if (!PARSED || !allowed()) return;
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    if (ignorable(err)) return;
    const digest = (error as { digest?: string })?.digest;

    const event = {
      event_id: uuid(),
      timestamp: new Date().toISOString(),
      platform: "javascript",
      level: "error",
      logger: where,
      release: process.env.NEXT_PUBLIC_RELEASE || undefined,
      environment: process.env.NODE_ENV === "production" ? "production" : "development",
      exception: {
        values: [{
          type: scrubText(err.name || "Error", 120),
          value: headline(scrubText(err.message || String(error), 600)),
          // Sent as a single scrubbed string: without source maps a structured frame list adds
          // nothing a reader can use, and each frame is another place a path could leak.
          stacktrace: undefined,
        }],
      },
      request: url ? { url: scrubUrl(url) } : undefined,
      tags: { boundary: where, ...(digest ? { digest } : {}), ...(tags || {}) },
      extra: { ...extra, stack: scrubText(err.stack || "", 4000) },
    };

    const body = JSON.stringify(event);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-sentry-auth": `Sentry sentry_version=7, sentry_client=threadcount/1.0, sentry_key=${PARSED.key}`,
    };

    void fetch(PARSED.url, { method: "POST", headers, body, keepalive: true }).catch(() => {});
  } catch { /* a reporter that throws is worse than one that stays quiet */ }
}
