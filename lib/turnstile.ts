// Cloudflare Turnstile server-side verification for sign-in / sign-up.
//
// Configured by two variables that have to agree: TURNSTILE_SECRET here, and
// NEXT_PUBLIC_TURNSTILE_SITEKEY in the browser, which is baked in at build time. Local dev and the
// e2e suites run with neither, and every check is skipped.
//
// In production it fails *closed*. A rebuilt secrets file that drops TURNSTILE_SECRET used to take
// bot protection off sign-in, sign-up, password reset, the contact form and the newsletter with no
// error, no log line and nothing visible — which is the worst shape a security control can fail in.
// Now the checks refuse instead, and instrumentation.ts stops the server from starting at all, so
// the missing variable is found on deploy rather than after it has been exploited.
export const turnstileEnabled = () => !!process.env.TURNSTILE_SECRET;

/* TURNSTILE_OPTIONAL=1 is the one way out, and it exists for a real case: a local `next start`
 * smoke test runs with NODE_ENV=production against a machine that has no Cloudflare keys and no
 * business having them. It is never set in a production secrets file, so it cannot quietly
 * disarm the live site the way a *missing* variable used to. */
export const turnstileRequired = () =>
  process.env.NODE_ENV === "production" && process.env.TURNSTILE_OPTIONAL !== "1"
  // A Community instance has no Cloudflare account to lean on. Turnstile stays available to it —
  // set both keys and it is enforced — but its absence is not a misconfiguration there; the
  // per-address rate limits on every auth route are what stands in its place.
  && process.env.EDITION !== "community";

export async function verifyTurnstile(token: unknown, ip: string): Promise<string | null> {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) {
    if (!turnstileRequired()) return null;
    console.error("[turnstile] TURNSTILE_SECRET is not set in production — refusing the request");
    return "Security check unavailable — please try again in a moment.";
  }
  const t = typeof token === "string" ? token.slice(0, 2048) : "";
  if (!t) return "Please complete the security check.";
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret, response: t, remoteip: ip }),
      signal: AbortSignal.timeout(6000),
    });
    const j = (await r.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!j.success) return "Security check failed — please try again.";
    return null;
  } catch {
    return "Security check unavailable — please try again in a moment.";
  }
}

/**
 * The pair of variables the checks need, as they are at boot.
 *
 * The site key is read as a plain static reference on purpose: NEXT_PUBLIC_ values are substituted
 * at build time, so this reports what the browser bundle actually got. That catches the mirror
 * failure — a secret present but no site key compiled in, where no widget renders, no token is
 * posted, and every sign-in answers "Please complete the security check."
 */
export function turnstileConfig(): { secret: boolean; sitekey: boolean } {
  return { secret: !!process.env.TURNSTILE_SECRET, sitekey: !!process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY };
}
