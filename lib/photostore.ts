import { createHash } from "crypto";
import { mkdir, readFile, rm, unlink, writeFile } from "fs/promises";
import path from "path";

/* Where signatures and damage photographs actually live.
 *
 * They used to be base64 inside Photo.data, which meant every image sat in the database, in every
 * pg_dump, and in the working set of every query that happened to touch the table. A few hundred
 * signatures is fine; a few years of them is a database that is mostly JPEG.
 *
 * On disk instead, addressed by a path derived from ids we generated — never from anything a
 * request supplies. The facility id is part of the path so one room's images are one directory,
 * which makes "delete this facility" and "what is this facility using" both trivial.
 */

/** Overridable so dev writes into the working tree and prod writes to a real data directory. */
export function photoRoot(): string {
  return process.env.PHOTO_DIR || path.join(process.cwd(), ".photos");
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png" };

/** `<facilityId>/<photoId>.<ext>` — stored relative, so the root can move without a data migration. */
export function relPath(facilityId: string, photoId: string, mime: string): string {
  return `${facilityId}/${photoId}.${EXT[mime] || "bin"}`;
}

/** Refuses anything that isn't the shape we write. Belt and braces: these values come from our own
 *  ids, but a path read out of a database is still input, and one `..` would be enough. */
function resolveSafe(rel: string): string | null {
  if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(jpg|png|bin)$/.test(rel)) return null;
  const root = photoRoot();
  const full = path.resolve(root, rel);
  if (!full.startsWith(path.resolve(root) + path.sep)) return null;
  return full;
}

export type ParsedPhoto = { mime: string; bytes: Buffer };

/** Split a `data:image/jpeg;base64,…` URL into its parts, or null if it isn't one. */
export function parseDataUrl(data: string): ParsedPhoto | null {
  const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(data);
  if (!m) return null;
  return { mime: m[1], bytes: Buffer.from(m[2], "base64") };
}

export async function writePhoto(facilityId: string, photoId: string, p: ParsedPhoto): Promise<string> {
  const rel = relPath(facilityId, photoId, p.mime);
  const full = resolveSafe(rel);
  if (!full) throw new Error("refusing to write an unexpected photo path");
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, p.bytes);
  return rel;
}

export async function readPhoto(rel: string): Promise<Buffer | null> {
  const full = resolveSafe(rel);
  if (!full) return null;
  try { return await readFile(full); } catch { return null; }
}

export async function deletePhoto(rel: string): Promise<void> {
  const full = resolveSafe(rel);
  if (!full) return;
  try { await unlink(full); } catch { /* already gone is the desired state */ }
}

/** Every image a facility owns, directory and all.
 *
 *  Deleting a facility cascades its Photo rows away, and once they are gone nothing is left that
 *  could ever name the files again — so the files have to go in the same breath, or a signature
 *  and a photograph of somebody's damaged uniform outlive the record they belonged to. The
 *  facility id being the first path segment is what makes that one call. */
export async function deletePhotoDir(facilityId: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]+$/.test(facilityId)) return;
  const root = path.resolve(photoRoot());
  const full = path.resolve(root, facilityId);
  if (!full.startsWith(root + path.sep)) return;
  try { await rm(full, { recursive: true, force: true }); } catch { /* nothing there is the desired state */ }
}

/** For the JSON backup, which stays base64 so the format — and the promise that a backup is
 *  everything — doesn't change just because storage moved. */
export async function photoAsDataUrl(rel: string, mime: string): Promise<string | null> {
  const bytes = await readPhoto(rel);
  if (!bytes) return null;
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

/** Only used to spot a file written twice; not security-critical. */
export const shortHash = (b: Buffer) => createHash("sha256").update(b).digest("hex").slice(0, 16);
