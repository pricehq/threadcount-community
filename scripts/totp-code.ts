/* Print the current six-digit code for a base32 TOTP secret.
 *
 *   TOTP_SECRET=JBSWY3DPEHPK3PXP npx tsx scripts/totp-code.ts
 *
 * For the end-to-end suites, which enrol a second factor through the real routes and then need a
 * live code to sign in with. The secret comes from the environment, never an argument — argv is
 * visible to every process on the box. Uses the product's own implementation (lib/totp.ts), which
 * scripts/check-totp.ts proves against RFC 6238's published vectors.
 */
import { base32Decode, totp } from "../lib/totp";

const secret = process.env.TOTP_SECRET || "";
if (!secret) { console.error("TOTP_SECRET must be set in the environment"); process.exit(1); }
process.stdout.write(totp(base32Decode(secret)) + "\n");
