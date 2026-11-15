// A narrow pass past the human check (Turnstile) for one synthetic-monitoring address.
//
// A nightly job walks the real journeys as a real user would — sign up, sign in, reset a password,
// send the contact form — to catch the failures a "page loads" check never sees (mail that stops
// arriving, a form that says "sent" and drops the message). Turnstile exists to stop automation, so
// the job cannot pass it; instead it sends a long random secret in the `x-canary-token` header.
//
// The pass is deliberately small:
//   - off unless BOTH CANARY_TOKEN (32+ characters) and CANARY_EMAIL are set — an instance that
//     sets neither (every self-hosted install, local dev) behaves exactly as before;
//   - only the exact secret AND the exact configured address together, so a leaked token cannot
//     sign up anyone else and cannot send mail anywhere but the canary's own mailbox;
//   - the secret is compared in constant time (as fixed-length digests);
//   - five wrong secrets from one address in an hour shut that address out of the pass, twenty
//     from anywhere shut it for everyone for the hour, and there are at most 30 passes an hour.
// It only replaces the Turnstile check. Every rate limit, validation rule and email still applies.
import { createHash, timingSafeEqual } from "crypto";
import { allow, fail, over } from "@/lib/ratelimit";

export const CANARY_HEADER = "x-canary-token";

const HOUR = 60 * 60 * 1000;
const MAX_BAD_PER_IP = 5;
const MAX_BAD_TOTAL = 20;
const MAX_PASSES = 30;

const norm = (s: string) => s.trim().toLowerCase();
const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

function config(): { token: string; email: string } | null {
  const token = process.env.CANARY_TOKEN || "";
  const email = norm(process.env.CANARY_EMAIL || "");
  if (token.length < 32 || !email.includes("@")) return null;
  return { token, email };
}

/** True when `email` is the configured canary address (used to keep it out of alerts and stats). */
export function isCanaryEmail(email: unknown): boolean {
  const c = config();
  return !!c && typeof email === "string" && norm(email) === c.email;
}

/**
 * True when this request may skip the Turnstile check: the canary secret is in the header and the
 * address the request acts on is the canary address. Anything else returns false, and the caller
 * falls through to the normal Turnstile check.
 */
export function canaryPass(headers: Headers, email: unknown, ip: string): boolean {
  const c = config();
  if (!c) return false;
  const presented = headers.get(CANARY_HEADER);
  if (!presented) return false;
  const badKey = "canary-bad:" + ip;
  if (over(badKey, MAX_BAD_PER_IP, HOUR) || over("canary-bad", MAX_BAD_TOTAL, HOUR)) return false;
  const tokenOk = timingSafeEqual(digest(presented), digest(c.token));
  const emailOk = typeof email === "string" && norm(email) === c.email;
  if (!tokenOk || !emailOk) {
    fail(badKey, HOUR);
    fail("canary-bad", HOUR);
    console.warn("[canary] refused a canary header", tokenOk ? "(address not the canary)" : "(wrong token)", "from", ip);
    return false;
  }
  return allow("canary-pass", MAX_PASSES, HOUR);
}
