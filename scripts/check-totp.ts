/* Check the TOTP implementation against RFC 6238's published test vectors.
 *
 * This is the reason it was worth hand-rolling: the algorithm has an official answer sheet, so the
 * code can be *proved* right rather than trusted. The seeds and expected codes below are taken
 * from RFC 6238 Appendix B.
 *
 *   npx tsx scripts/check-totp.ts
 */
import { base32Decode, base32Encode, hotp, totp, totpVerify, newTotpSecret, encryptSecret, decryptSecret, newRecoveryCodes, hashRecoveryCode } from "../lib/totp";

let pass = 0, fail = 0;
const ok = (n: string) => { pass++; console.log("  ✓ " + n); };
const bad = (n: string, got: unknown, want: unknown) => { fail++; console.log(`  ✗ ${n} :: got ${got}, want ${want}`); };
const eq = (n: string, got: unknown, want: unknown) => (String(got) === String(want) ? ok(n) : bad(n, got, want));

// RFC 6238 Appendix B. The ASCII seeds are the shared secrets; times are seconds since the epoch.
const SEED_SHA1 = Buffer.from("12345678901234567890", "ascii");
const SEED_SHA256 = Buffer.from("12345678901234567890123456789012", "ascii");
const SEED_SHA512 = Buffer.from("1234567890123456789012345678901234567890123456789012345678901234", "ascii");

const VECTORS: [number, string, string, Buffer, "sha1" | "sha256" | "sha512"][] = [
  [59, "94287082", "SHA1", SEED_SHA1, "sha1"],
  [59, "46119246", "SHA256", SEED_SHA256, "sha256"],
  [59, "90693936", "SHA512", SEED_SHA512, "sha512"],
  [1111111109, "07081804", "SHA1", SEED_SHA1, "sha1"],
  [1111111111, "14050471", "SHA1", SEED_SHA1, "sha1"],
  [1234567890, "89005924", "SHA1", SEED_SHA1, "sha1"],
  [2000000000, "69279037", "SHA1", SEED_SHA1, "sha1"],
  [20000000000, "65353130", "SHA1", SEED_SHA1, "sha1"],
];

console.log("== RFC 6238 test vectors (8 digits)");
for (const [t, expected, name, seed, algo] of VECTORS) {
  eq(`t=${t} ${name}`, totp(seed, t * 1000, 8, algo), expected);
}

console.log("== base32 round-trips");
for (const s of ["", "A", "hello world", "12345678901234567890"]) {
  const enc = base32Encode(Buffer.from(s, "utf8"));
  eq(`"${s}"`, base32Decode(enc).toString("utf8"), s);
}

console.log("== the 8-byte counter survives past 2^32");
// t=20000000000 above already exercises this; assert the halves explicitly too.
eq("large counter differs from its low 32 bits", hotp(SEED_SHA1, 2 ** 32 + 7) !== hotp(SEED_SHA1, 7), true);

console.log("== verification window");
const secret = newTotpSecret();
const now = Date.now();
const raw = base32Decode(secret);
eq("the current code verifies", totpVerify(secret, totp(raw, now), now), true);
eq("the previous step verifies", totpVerify(secret, totp(raw, now - 30_000), now), true);
eq("the next step verifies", totpVerify(secret, totp(raw, now + 30_000), now), true);
eq("two steps back is refused", totpVerify(secret, totp(raw, now - 90_000), now), false);
eq("two steps forward is refused", totpVerify(secret, totp(raw, now + 90_000), now), false);
eq("a wrong code is refused", totpVerify(secret, "000000", now) && totp(raw, now) !== "000000", false);
eq("a short code is refused", totpVerify(secret, "123", now), false);
eq("an empty code is refused", totpVerify(secret, "", now), false);

console.log("== secret storage");
process.env.SESSION_SECRET ||= "test-secret-for-check-totp";
const enc = encryptSecret(secret);
eq("ciphertext is not the secret", enc.includes(secret), false);
eq("round-trips", decryptSecret(enc), secret);
eq("a tampered tag is rejected", decryptSecret(enc.slice(0, -4) + "AAAA"), null);
eq("rubbish is rejected", decryptSecret("nonsense"), null);

console.log("== recovery codes");
const codes = newRecoveryCodes();
eq("ten codes", codes.length, 10);
eq("all distinct", new Set(codes).size, 10);
eq("hash ignores case and dashes", hashRecoveryCode(codes[0].toLowerCase()), hashRecoveryCode(codes[0]));
eq("different codes hash differently", hashRecoveryCode(codes[0]) === hashRecoveryCode(codes[1]), false);

console.log(`\nPASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
