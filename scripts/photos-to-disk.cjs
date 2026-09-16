/* Move existing photos out of the database and onto disk.
 *
 *   node scripts/photos-to-disk.cjs            # report only
 *   node scripts/photos-to-disk.cjs --write    # actually move them
 *
 * Safe to run repeatedly: it only touches rows that still have base64 in `data` and no `path`,
 * and it clears `data` only after the file is on disk and has been read back and verified byte
 * for byte. A crash halfway leaves rows that are readable from either place, which is why the
 * serving route handles both.
 */
require("dotenv/config");
const path = require("path");
const { mkdir, writeFile, readFile } = require("fs/promises");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const WRITE = process.argv.includes("--write");
const ROOT = process.env.PHOTO_DIR || path.join(process.cwd(), ".photos");
const EXT = { "image/jpeg": "jpg", "image/png": "png" };

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }) });

function parse(data) {
  const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(data || "");
  return m ? { mime: m[1], bytes: Buffer.from(m[2], "base64") } : null;
}

(async () => {
  const rows = await prisma.photo.findMany({
    where: { path: "", NOT: { data: "" } },
    select: { id: true, facilityId: true, data: true },
  });
  console.log(`${rows.length} photo(s) still in the database`);
  if (!rows.length) { await prisma.$disconnect(); return; }

  const total = rows.reduce((n, r) => n + r.data.length, 0);
  console.log(`about ${(total / 1024 / 1024).toFixed(1)} MB of base64`);
  console.log(`destination: ${ROOT}`);
  if (!WRITE) { console.log("\ndry run — pass --write to move them"); await prisma.$disconnect(); return; }

  let moved = 0, skipped = 0;
  for (const r of rows) {
    const p = parse(r.data);
    if (!p) { skipped++; continue; }
    const rel = `${r.facilityId}/${r.id}.${EXT[p.mime] || "bin"}`;
    const full = path.join(ROOT, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, p.bytes);
    // Read it back before dropping the only other copy.
    const back = await readFile(full);
    if (!back.equals(p.bytes)) { console.error("verify failed for", r.id); skipped++; continue; }
    await prisma.photo.update({
      where: { id: r.id },
      data: { path: rel, mime: p.mime, bytes: p.bytes.length, data: "" },
    });
    moved++;
  }
  console.log(`moved ${moved}, skipped ${skipped}`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
