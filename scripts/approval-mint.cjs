/* Mint an approval link token for the e2e suite and print it.
 *
 * The real token only ever exists inside an email to a ward manager, which the suite has no way to
 * read. Rather than skip the emailed-link path — the one route into this product that works
 * without a session, and therefore the one most worth testing — the suite mints its own using the
 * same signing code the app uses.
 *
 * Refuses to run in production. It needs SESSION_SECRET, so anyone who could use it can already
 * forge one — but a guard costs nothing and states the intent.
 *
 *   node scripts/approval-mint.cjs <requestId> <managerStaffId>   -> prints the token
 */
require("dotenv/config");
const { createHash, createHmac } = require("crypto");

if (process.env.NODE_ENV === "production") {
  console.error("refusing to run in production");
  process.exit(2);
}

const [rid, mid] = process.argv.slice(2);
if (!rid || !mid) { console.error("usage: approval-mint.cjs <requestId> <managerStaffId>"); process.exit(2); }
if (!process.env.SESSION_SECRET) { console.error("SESSION_SECRET not set"); process.exit(2); }

// Mirrors lib/approvallink.ts exactly — including the domain separation, which is the point of
// the test: a token signed with the plain session secret must NOT be accepted.
const key = createHash("sha256").update("threadcount:approval:v1:" + process.env.SESSION_SECRET).digest();
const b64url = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const ttl = Number(process.argv[4] || 14 * 24 * 60 * 60 * 1000);
const payload = b64url(Buffer.from(JSON.stringify({ rid, mid, exp: Date.now() + ttl })));
const sig = b64url(createHmac("sha256", key).update(payload).digest());
console.log(`${payload}.${sig}`);
