/* Read the newest reset row for an address, for the e2e suite only.
 *
 * The suite needs to prove a token is single-use and expires, which means holding one — something
 * an attacker cannot do, since the table stores only the SHA-256 and the raw token exists solely
 * in the email. So this prints the hash, and the suite drives the API with a token it mints itself
 * against a row it inserts. Nothing here weakens the running app.
 *
 *   node scripts/reset-token.cjs <email>        -> prints "<id> <tokenHash> <expiresAt> <usedAt>"
 */
require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const email = process.argv[2];
if (!email) { console.error("usage: reset-token.cjs <email>"); process.exit(2); }

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }) });

(async () => {
  const row = await prisma.passwordReset.findFirst({
    where: { user: { email } },
    orderBy: { createdAt: "desc" },
    select: { id: true, tokenHash: true, expiresAt: true, usedAt: true },
  });
  if (row) console.log(`${row.id} ${row.tokenHash} ${row.expiresAt.toISOString()} ${row.usedAt ? row.usedAt.toISOString() : "-"}`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e.message); await prisma.$disconnect(); process.exit(1); });
