import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

/* Time-based one-time passwords (RFC 6238), and the encryption that keeps the secrets from being
 * useful in a database dump.
 *
 * Hand-rolled rather than pulled from a package because TOTP is small, exactly specified, and
 * testable against the RFC's own vectors — scripts/check-totp.ts does precisely that. A dependency
 * here would be more code, not less, and one that has to be trusted rather than checked.
 *
 * The secret is stored encrypted. A one-time-password secret sitting in plaintext is a second
 * factor that a single leaked pg_dump quietly removes for every account at once. */

const STEP = 30;      // seconds per code, per the RFC and every authenticator app
const DIGITS = 6;
/** Accept the neighbouring windows: phone clocks drift, and a code typed as it rolls over is not
 *  an attack. One step either way is the usual compromise — 90 seconds of validity in total. */
const SKEW = 1;

/* ---------- base32, because that is what authenticator apps consume ---------- */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const idx = B32.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/* ---------- the algorithm ---------- */

/** HOTP: HMAC of the counter, then the RFC's dynamic truncation. */
export function hotp(secret: Buffer, counter: number, digits = DIGITS, algo: "sha1" | "sha256" | "sha512" = "sha1"): string {
  const buf = Buffer.alloc(8);
  // Counters exceed 32 bits eventually; write as two halves rather than lose the top bits.
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const mac = createHmac(algo, secret).update(buf).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export function totp(secret: Buffer, at = Date.now(), digits = DIGITS, algo: "sha1" | "sha256" | "sha512" = "sha1"): string {
  return hotp(secret, Math.floor(at / 1000 / STEP), digits, algo);
}

/** True if `code` is valid now or within one step either side. Constant-time per candidate. */
export function totpVerify(secretB32: string, code: string, at = Date.now()): boolean {
  const cleaned = (code || "").replace(/\D/g, "");
  if (cleaned.length !== DIGITS) return false;
  const secret = base32Decode(secretB32);
  if (!secret.length) return false;
  const counter = Math.floor(at / 1000 / STEP);
  const given = Buffer.from(cleaned, "utf8");
  let match = false;
  for (let w = -SKEW; w <= SKEW; w++) {
    const expect = Buffer.from(hotp(secret, counter + w), "utf8");
    // No early exit: every window is compared so the time taken says nothing about which matched.
    if (expect.length === given.length && timingSafeEqual(expect, given)) match = true;
  }
  return match;
}

/** 20 bytes, the RFC's recommendation for SHA-1. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The URI an authenticator app expects behind a QR code. */
export function otpauthUrl(secretB32: string, account: string, issuer = "ThreadCount"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const q = new URLSearchParams({ secret: secretB32, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP) });
  return `otpauth://totp/${label}?${q.toString()}`;
}

/* ---------- storage ---------- */

/** Key derived from SESSION_SECRET, so there is no new secret to manage or lose. Rotating
 *  SESSION_SECRET invalidates stored TOTP secrets as well as sessions — which is the correct
 *  blast radius for that action, and is why recovery codes exist. */
function key(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is required to store a TOTP secret");
  return createHash("sha256").update(`totp:${s}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptSecret(stored: string): string | null {
  try {
    const [v, iv, tag, enc] = stored.split(".");
    if (v !== "v1") return null;
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/* ---------- recovery codes ---------- */

/** Ten codes, shown once. Without these, a lost phone means a locked-out admin and — because
 *  deleting the last admin deletes the facility — potentially a lost facility. */
export function newRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const raw = randomBytes(5).toString("hex").toUpperCase(); // 10 hex characters
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export const hashRecoveryCode = (code: string) =>
  createHash("sha256").update(code.toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex");
