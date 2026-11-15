import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { layout, siteUrl } from "@/lib/mail-html.cjs";

/* Password reset tokens.
 *
 * The raw token is shown to exactly one person, once, in one email, and is never stored: the
 * database keeps only its SHA-256. That matters because this table lands in every pg_dump, and a
 * plaintext token in a leaked backup is a working key to an account until it expires.
 *
 * SHA-256 rather than bcrypt is the right call here, unusually: the token is 32 bytes of CSPRNG
 * output, so there is no dictionary to attack and no need to be slow — and a reset lookup happens
 * before the user is authenticated, where a deliberately slow hash is a denial-of-service lever. */

/** One hour. Long enough to walk back to a desk, short enough that a forwarded email goes stale. */
export const RESET_TTL_MS = 60 * 60 * 1000;

export function newResetToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashResetToken(token) };
}

export function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time compare, so a mismatched token can't be found a character at a time. */
export function tokenMatches(a: string, b: string) {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** The link a person clicks. Absolute, because it is going into an email client. */
export function resetUrl(token: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://threadcount.tech";
  return `${base}/reset?token=${encodeURIComponent(token)}`;
}

export function resetEmail(firstName: string, url: string) {
  const subject = "Reset your ThreadCount password";
  const text = [
    `Hi ${firstName || "there"},`,
    "",
    "Someone asked to reset the password on your ThreadCount account. If that was you, open this link:",
    "",
    url,
    "",
    "The link works once and expires in an hour.",
    "",
    "If it wasn't you, you can ignore this — your password hasn't changed, and nobody can get in without this link.",
    "",
    "— ThreadCount",
  ].join("\n");
  const { html } = layout({
    eyebrow: "Your account",
    title: "Reset your password",
    preheader: "A password reset was asked for on your ThreadCount account. The link works once and expires in an hour.",
    intro: [`Hi ${firstName || "there"},`, "Someone asked to reset the password on your ThreadCount account. If that was you, use the button below."],
    cta: { label: "Reset my password", href: url },
    closing: ["The link works once and expires in an hour.", "If it wasn't you, you can ignore this — your password hasn't changed, and nobody can get in without this link."],
    footer: {},
  });
  return { subject, text, html };
}
