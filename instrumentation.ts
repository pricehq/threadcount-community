import type { Instrumentation } from "next";
import { report } from "@/lib/glitchtip";
import { turnstileConfig, turnstileRequired } from "@/lib/turnstile";

/* Startup checks.
 *
 * `register` runs once, before the server takes its first request, which makes it the only place a
 * misconfiguration can be caught before it becomes someone else's problem. Everything checked here
 * is silent at runtime if it is wrong: a missing Turnstile secret used to switch bot protection off
 * across sign-in, sign-up, reset, contact and subscribe with nothing in the logs; a missing site key
 * takes every one of those forms down with a message about a security check the person was never
 * shown; and a session secret left at the published placeholder means anyone can forge a cookie.
 *
 * So production refuses to start. A deploy that stops with a named variable in the journal is a
 * five-minute fix; the alternatives are an unprotected front door, an authentication outage
 * discovered by whoever tried to sign in, or a facility whose sessions can be minted by a stranger.
 * A local production-mode smoke test says TURNSTILE_OPTIONAL=1 for the Turnstile half and is left
 * alone — see lib/turnstile.ts.
 */
export function register() {
  // Only the Node runtime: `register` is called in the edge runtime too, and one refusal is enough.
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;

  const missing: string[] = [];

  /* The two the whole product stands on.
   *
   * the hosted deploy checks exactly these before it restarts anything, so the deploy path is
   * already covered — but a plain `systemctl restart threadcount` after a hand-edited
   * the secrets file is not, and that is the shape the failure actually takes. Without
   * a database URL every page 500s; with the .env.example placeholder for a session secret, every
   * cookie in the facility is signed with a key that is published in the repository.
   */
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!process.env.SESSION_SECRET) missing.push("SESSION_SECRET");
  else if (process.env.SESSION_SECRET === "change-me") {
    missing.push("SESSION_SECRET (still the .env.example placeholder — anyone can forge a session)");
  }

  if (turnstileRequired()) {
    const cf = turnstileConfig();
    if (!cf.secret) missing.push("TURNSTILE_SECRET");
    if (!cf.sitekey) missing.push("NEXT_PUBLIC_TURNSTILE_SITEKEY (set it before building — it is compiled in)");
  }

  if (missing.length) {
    throw new Error(`Refusing to start: ${missing.join(", ")} missing or unsafe.`);
  }
}

/* Server-side error reporting.
 *
 * `onRequestError` is where this Next version surfaces errors the server caught — a throw in a
 * Server Component, a route handler, or a server action. Before this existed, a 500 in production
 * left nothing behind but a line in journald that nobody was watching.
 *
 * It does not see an exception a route handler catches itself, so the two mutate endpoints report
 * their own — see the catch in app/api/mutate/route.ts.
 *
 * The error instance may have been reprocessed by React rather than being the original throw, so
 * the digest is carried through: it's the string the branded error page shows the person, which is
 * what makes a support message ("reference 3f2a…") joinable to the event here. */
export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  report({
    error: err,
    where: "server",
    url: request?.path,
    tags: {
      router: context?.routerKind || "unknown",
      route_type: context?.routeType || "unknown",
      // Never the request headers: they carry the session cookie.
    },
  });
};
