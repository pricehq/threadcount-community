/* Mint a reset token for the e2e suite and print the RAW value.
 *
 * The app deliberately never stores the raw token — only its SHA-256 — so there is no way to read
 * one back out of the database, which is the property the whole design rests on. To test the
 * happy path end to end without a live mailbox, the suite therefore mints its own: it writes a row
 * exactly as /api/auth/forgot would and keeps the raw half.
 *
 * Refuses to run in production. It needs DATABASE_URL, so anyone who could use it already owns the
 * database — but a guard costs nothing and states the intent.
 *
 *   node scripts/reset-mint.cjs <email> [ttlMs]   -> prints the raw token
 */
require("dotenv/config");
const { createHash, randomBytes } = require("crypto");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

if (process.env.NODE_ENV === "production") {
  console.error("refusing to run in production");
  process.exit(2);
}

const email = process.argv[2];
const ttl = Number(process.argv[3] || 60 * 60 * 1000);
if (!email) { console.error("usage: reset-mint.cjs <email> [ttlMs]"); process.exit(2); }

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }) });

(async () => {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) { console.error("no such user"); process.exit(1); }
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.passwordReset.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + ttl), requestIp: "e2e" },
  });
  console.log(token);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e.message); await prisma.$disconnect(); process.exit(1); });
