/* Error codes: "TC-XXXX-XXXX", the short form of an error report's event id.
 *
 * Every error screen, boundary and failed action shows one, so the person who hit it has something
 * to read out or paste, and support can go straight to the event.
 *
 * THE MAPPING (keep lib/errorcode.ts, the two Android ErrorCodes.java copies and
 * scripts/error-code.ts in step — it is the whole contract):
 *   1. The event id is the Sentry-protocol id: 32 hex digits, a UUID without dashes.
 *   2. Its first 10 hex digits are read as a 40-bit number.
 *   3. That number is written in Crockford base32 (0-9, A-Z without I, L, O, U), zero-padded to 8
 *      characters, most significant first.
 *   4. Shown as TC- then the 8 characters in two groups of four: TC-1K3F-9ZQA.
 *   The step is exact, so a code turns back into the 10-hex prefix of its event id
 *   (eventPrefixFromCode). Every report also carries the code as its `error_code` tag, which is
 *   what a GlitchTip search uses: error_code:TC-1K3F-9ZQA. `npx tsx scripts/error-code.ts <code>`
 *   prints both.
 *
 * Reading a code back forgives what people do to them over the phone: lower case, missing dashes,
 * O for 0, I or L for 1.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_RE = /^TC-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
/** Finds a code inside a longer message, e.g. an action's error line. */
export const CODE_IN_TEXT = /\bTC-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}\b/;

/** A fresh Sentry-protocol event id: 32 lowercase hex digits. */
export function newEventId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
  } catch { /* fall through */ }
  let s = "";
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

/** The code for an event id. Anything that is not at least 10 hex digits gets a fresh id's code
 *  rather than a malformed one: a code must always be well formed, even when it can't be looked up. */
export function codeFromEventId(eventId: string): string {
  const hex = String(eventId || "").replace(/-/g, "").toLowerCase();
  const head = /^[0-9a-f]{10}/.test(hex) ? hex.slice(0, 10) : newEventId().slice(0, 10);
  let n = BigInt("0x" + head);
  let out = "";
  for (let i = 0; i < 8; i++) { out = ALPHABET[Number(n & BigInt(31))] + out; n >>= BigInt(5); }
  return `TC-${out.slice(0, 4)}-${out.slice(4)}`;
}

/** Tidies what somebody typed or read out into the canonical form, or null if it can't be a code. */
export function normaliseCode(input: string): string | null {
  const body = String(input || "").toUpperCase().replace(/^\s*TC/, "").replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0").replace(/[IL]/g, "1");
  if (body.length !== 8 || /[U]/.test(body)) return null;
  const code = `TC-${body.slice(0, 4)}-${body.slice(4)}`;
  return CODE_RE.test(code) ? code : null;
}

/** The first 10 hex digits of the event id a code came from, or null. */
export function eventPrefixFromCode(input: string): string | null {
  const code = normaliseCode(input);
  if (!code) return null;
  let n = BigInt(0);
  for (const ch of code.slice(3).replace("-", "")) n = (n << BigInt(5)) | BigInt(ALPHABET.indexOf(ch));
  return n.toString(16).padStart(10, "0");
}

/** The line every error surface shows. */
export const errorLine = (code: string) => `Something went wrong — code ${code}`;
