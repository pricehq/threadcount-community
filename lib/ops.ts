import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { setSessionCookie, type SessionUser } from "./session";
import { buildSnapshot } from "./snapshot";
import { ALT_FLOW, FTE_CASUAL, FTE_OPTIONS, LOCATION_KINDS, OVERRIDE_REASONS, UNIFORM_STYLES, issueLineFlags, itemMap as itemMapOf, reorderAt as reorderAtOf, type LineFlag, addDays, approvalDeparture, capCheck, facilityToday, flaggedNeeds, formatInZone, garmentForGroup, garmentForStyle, garmentGroups, genderLabel, groupKey, groupsLabel, isKitGroup, isNursingGroup, isPantItem, isTopItem, key, ledger, locSubtree, locWouldLoop, normalUniformStyle, onhand, openApprovals, plOf, setsForFte, setsOnStart, sizeIndexOf, variantList, type Item } from "./compute";
import { Prisma, type CatalogItem } from "@prisma/client";
import { deletePhoto, deletePhotoDir, parseDataUrl, photoAsDataUrl, writePhoto } from "@/lib/photostore";
import { newActivateCode } from "./staffsession";
import { AWAITING_HANDOVER, LINE_STATUSES, OPEN_REQUEST, TRANSITIONS, approvedLines, canMove, collectionCode, holdEndsAt, requestCode } from "./staffreq";
import { approvalEmail, approvalUrl, decisionEmail, signApprovalToken, readyEmail, roundEmail, waitlistEmail } from "./approvallink";
import { sendTo, transactionalConfigured } from "./mail";
import { notifyKitCheck, notifyOnRound, notifyReady, notifyWaiting } from "./push";
import { inHouseEan13, isInHouse } from "./barcode";
// Straight from ./sets rather than through ./compute like its neighbour setsOnStart, because
// compute doesn't re-export this one. Same rule either way: the ceiling a coordinator types here
// and the ceiling a wearer's screen quotes have to come out of the one function.
import { setsCap } from "./sets";
import { loadOrderDoc, supplierOrderEmail } from "./orderdoc";
import { allow } from "./ratelimit";

type Tx = Prisma.TransactionClient;
export class OpError extends Error { status: number; constructor(msg: string, status = 400) { super(msg); this.status = status; } }

const str = (v: unknown, max = 500) => (v === undefined || v === null ? "" : String(v)).slice(0, max);
const int = (v: unknown, d = 0) => { const n = parseInt(String(v), 10); return Number.isFinite(n) ? Math.max(-1e9, Math.min(1e9, n)) : d; };
const num = (v: unknown, d = 0) => { const n = parseFloat(String(v)); return Number.isFinite(n) ? n : d; };
const admin = (u: SessionUser) => { if (u.role !== "ADMIN") throw new OpError("Admin only", 403); };
const LOGO_MAX = 400 * 1024;

/** A list of staff group names off the settings screen: trimmed, blanks dropped, and one entry per
 *  group as the app compares names (groupKey), keeping the first spelling sent. Refused rather than
 *  ignored when it isn't a list, because the screen saves a field at a time and answering "Saved."
 *  over a value that was thrown away is a lie the next reload exposes. */
const groupList = (v: unknown, what: string): string[] => {
  if (!Array.isArray(v)) throw new OpError(`Send the ${what} as a list of staff group names`);
  const seen = new Set<string>(), out: string[] = [];
  for (const x of v) {
    const g = str(x, 80).trim(), k = groupKey(g);
    if (k && !seen.has(k)) { seen.add(k); out.push(g); }
  }
  return out;
};

/** The staff groups a garment is for, off whatever a screen sent — or undefined to leave them be.
 *  The desktop sends `groups`, a list, empty meaning every group. The phone counter app still sends
 *  its single `group` and cannot change, and it shows several groups as one label ("Registered
 *  Nurse, Enrolled Nurse"). So a `group` equal to the garment's own label is the phone saving its
 *  other fields and changes nothing — read as one name it would collapse a four-group garment onto a
 *  group nobody is in. A label copied off another garment takes that garment's groups; "All" or
 *  blank is every group; any other value is a list of names split at its commas, or one name if it
 *  has none. */
async function groupsFromPayload(db: Tx, fid: string, p: { groups?: unknown; group?: unknown }, current: string[] | null): Promise<string[] | undefined> {
  if (p.groups !== undefined && p.groups !== null) {
    if (!Array.isArray(p.groups) || p.groups.length > 200) throw new OpError("Send the garment's staff groups as a list of names");
    return garmentGroups(p.groups.map((x: unknown) => str(x, 80)));
  }
  if (p.group === undefined || p.group === null) return undefined;
  const v = str(p.group, 4000).trim();
  if (current && groupKey(v) === groupKey(groupsLabel(current))) return undefined;
  if (v.includes(",")) {
    const tagged = await db.catalogItem.findMany({ where: { facilityId: fid, NOT: { groups: { isEmpty: true } } }, select: { groups: true } });
    const same = tagged.find((t) => t.groups.length > 1 && groupKey(groupsLabel(t.groups)) === groupKey(v));
    if (same) return garmentGroups(same.groups);
    // Nobody's label, so it is a list typed on the phone. Kept whole it would be one group called
    // "A, B" that nobody is in, and the garment would be refused to both A and B. A facility's own
    // group name can carry a comma of its own, though, so the pieces are joined back up wherever
    // they spell a name this facility already uses — on its settings, its register or a garment.
    const [fac, onRegister] = await Promise.all([
      db.facility.findUnique({ where: { id: fid }, select: { staffGroups: true } }),
      db.staff.findMany({ where: { facilityId: fid }, select: { group: true }, distinct: ["group"] }),
    ]);
    return garmentGroups(splitGroupNames(v, [...(fac?.staffGroups || []), ...onRegister.map((s) => s.group), ...tagged.flatMap((t) => t.groups)]));
  }
  return garmentGroups([str(v, 80)]);
}

/** A comma-separated list of staff groups as names, joining neighbouring pieces back together where
 *  they spell one of the `known` names that itself contains a comma. Longest match first, so a
 *  known "Food, Retail" wins over a lone "Food". The pieces are left for garmentGroups() to trim. */
function splitGroupNames(v: string, known: readonly string[]): string[] {
  const commaKey = (s: string) => s.split(",").map((x) => groupKey(x)).join(",");
  const names = new Map<string, string>();
  for (const n of known) if (n.includes(",")) names.set(commaKey(n), n.trim());
  const parts = v.split(",");
  const out: string[] = [];
  for (let i = 0; i < parts.length;) {
    let j = parts.length;
    while (j > i + 1 && !names.has(commaKey(parts.slice(i, j).join(",")))) j--;
    out.push(j > i + 1 ? names.get(commaKey(parts.slice(i, j).join(",")))! : parts[i]);
    i = j;
  }
  return out;
}

/** A date-only value, normalised to YYYY-MM-DD, or "" if it isn't a real calendar date.
 *
 *  `str(v, 10)` used to stand in for this, which is a truncation and not a check: a spreadsheet
 *  saved on an Australian machine writes "11/03/2024", exactly ten characters, and it was stored
 *  verbatim and rendered as the literal text "Invalid Date" ever after. Day-first D/M/Y and D-M-Y
 *  are accepted and converted, because that is what a local spreadsheet produces and refusing a
 *  whole staff import over a date format helps nobody; anything else is refused. */
const isoDate = (v: unknown): string => {
  const s = str(v, 40).trim();
  if (!s) return "";
  let y: number, m: number, d: number;
  // A trailing time is allowed and dropped: a date-only column occasionally receives a full
  // timestamp (an older row, a date picker that sends one), and the day is the part that matters.
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
  else {
    const au = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
    if (!au) return "";
    d = +au[1]; m = +au[2]; y = +au[3];
  }
  // Round-tripped through UTC so 31 February and friends are rejected rather than rolled forward.
  const at = new Date(Date.UTC(y, m - 1, d));
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== m - 1 || at.getUTCDate() !== d) return "";
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};
/** The statuses a request is allowed to hold, read off the state machine itself so a restored file
 *  can never introduce one the screens have no words for. */
const REQ_STATUSES = new Set(Object.keys(TRANSITIONS));
/** A timestamp out of a backup file, or null. `new Date("nonsense")` is an Invalid Date, and
 *  handing one to Prisma fails the whole restore over a single unreadable field. */
const stamp = (v: unknown): Date | null => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};
/** An IANA zone name that this runtime actually knows, or the Brisbane default. Restoring a zone
 *  the box has never heard of would leave every date in the facility being computed against a
 *  fallback while the settings screen claimed otherwise. */
const zoneOf = (v: unknown): string => {
  const z = str(v, 60).trim();
  if (!z) return "Australia/Brisbane";
  try { new Intl.DateTimeFormat("en-AU", { timeZone: z }); return z; } catch { return "Australia/Brisbane"; }
};
/** A combined FTE, spelt the way the order form spells it wherever it can be: "1.0" … "0.1",
 *  "Casual", or "" when nobody has recorded one. null means it is not a fraction at all, and that
 *  is the only thing refused.
 *
 *  Any positive figure is kept, not just the eleven steps the picker offers, because the FTE table
 *  is what decides what a figure means and it decided long ago: setsForFte() reads a figure with no
 *  row of its own as the band it falls in, so 0.75 is a four-set person, deliberately, since the
 *  number is copied off a paper roster. Refusing 0.75 here while the table read it perfectly well
 *  was two answers to the same question — and the one people met first was the one that taught them
 *  to round the roster until the box stopped complaining, which leaves the register holding an FTE
 *  nobody is employed on and a manager signing for the sets that go with it. A coordinator typing a
 *  real roster figure is not making a mistake.
 *
 *  A figure landing exactly on one of the form's own steps is re-spelt as the form spells it, so
 *  "1" and "0.50" are stored as "1.0" and "0.5" and the register reads the way the paper does;
 *  anything else is stored as the number it is, tidied of stray zeroes. Nought and below are the
 *  one arithmetic refusal: nobody is employed at nought FTE, the table proposes nothing for it, and
 *  storing it would only be a blank wearing a number. */
const normalFte = (v: unknown): string | null => {
  const raw = str(v, 20).trim();
  if (!raw) return "";
  if (raw.toLowerCase() === FTE_CASUAL.toLowerCase()) return FTE_CASUAL;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return FTE_OPTIONS.find((o) => o !== FTE_CASUAL && Number(o) === n) ?? String(n);
};
/** What the FTE field will take, for a refusal that says so rather than just saying no. */
const FTE_ALLOWED = `a fraction like ${FTE_OPTIONS[0]} or 0.75, or ${FTE_CASUAL}`;

/** The refusal when a uniform style is a word the rule doesn't know. Blank is never refused: it is
 *  what every record starts as — nobody has said which cut this person wears — and it offers every
 *  style, so leaving it alone is always allowed. */
const STYLE_REFUSAL = `Uniform style has to be ${UNIFORM_STYLES.join(", ")} — leave it blank if nobody has said which cut they wear`;

/** A date-only field off a payload: blank falls back, anything unparseable is refused outright
 *  rather than stored as text that every screen downstream will fail to format. */
const dateField = (v: unknown, fallback: string, what: string): string => {
  if (v === undefined || v === null || str(v, 40).trim() === "") return fallback;
  const d = isoDate(v);
  if (!d) throw new OpError(`${what} has to be a date, written as YYYY-MM-DD`);
  return d;
};

async function nextOrderCode(tx: Tx, facilityId: string, today: string) {
  const f = await tx.facility.update({ where: { id: facilityId }, data: { orderSeq: { increment: 1 } }, select: { orderSeq: true } });
  return `ORD-${today.slice(0, 4)}-${String(f.orderSeq).padStart(4, "0")}`;
}
async function nextSort(tx: Tx, facilityId: string) {
  const f = await tx.facility.update({ where: { id: facilityId }, data: { catalogSeq: { increment: 1 } }, select: { catalogSeq: true } });
  return f.catalogSeq;
}
async function ownItem(tx: Tx, facilityId: string, id: string) {
  const it = await tx.catalogItem.findFirst({ where: { id, facilityId } });
  if (!it) throw new OpError("Unknown catalogue item", 404);
  return it;
}
/** A catalogue row as the snapshot hands it out (lib/snapshot.ts): groups tidied through
 *  garmentGroups() and the display label derived from them. For a path that reads the table itself
 *  but asks a question of lib/compute, which speaks Item. */
function asItem(c: CatalogItem): Item {
  return { id: c.id, sort: c.sort, item: c.item, gender: c.gender, type: c.type, sku: c.sku, supplier: c.supplier, cost: c.cost, groups: garmentGroups(c.groups), group: groupsLabel(c.groups), notes: c.notes, sizes: c.sizes, archived: c.archived };
}
async function ownStaff(tx: Tx, facilityId: string, id: string) {
  const s = await tx.staff.findFirst({ where: { id, facilityId } });
  if (!s) throw new OpError("Unknown staff member", 404);
  return s;
}
/* Self-approval, as the owner decided it on 12 September 2026: anybody may approve for themselves
 * — their own requests, and a signed order form for their own kit. There used to be a test here,
 * managesSomebody(), that allowed it only to somebody with at least one active report on the
 * register. It is gone, not relaxed: on a register where the linen-room coordinator is the only
 * person, nobody manages anybody and nothing could be approved at all.
 *
 * What stands in for it is the record. Every self-approval is marked where it happened and can be
 * read back without any flag of its own — an approval whose byStaffId is its staffId, a request
 * decided by the manager it is for (its timeline says "Self-approved" in words).
 *
 * One rule does stand, in lib/staffops.ts and in request.reassign below: nobody approves a raise
 * they made on somebody else's behalf. Approving your own kit is one person deciding about their
 * own uniform where everyone can see whose it is; asking for somebody else's garments and then
 * granting the ask yourself is one person doing both halves of a decision the ward is told two
 * people made. */
/** Mark the facility as changed, so screens elsewhere know to reload.
 *
 * Called from the three routes that can change anything — the coordinator's mutate, the staff
 * app's, and the emailed approve/decline — rather than from inside each op, for the same reason
 * the audit trail is written there: a new case branch cannot forget to do it.
 *
 * Never allowed to fail a request. The write has already committed and been recorded by the time
 * this runs; a facility that briefly reports a stale number costs somebody a few seconds before
 * their screen catches up on its next focus, which is not worth turning a completed mutation into
 * an error. */
export async function bumpRev(facilityId: string): Promise<number | null> {
  try {
    const f = await prisma.facility.update({ where: { id: facilityId }, data: { rev: { increment: 1 } }, select: { rev: true } });
    return f.rev;
  } catch (e) {
    console.error("[rev] could not bump", facilityId, e);
    return null;
  }
}

/** Refuse a binding that would make a scan ambiguous: a code already on another garment, or one that
 *  collides with the generated 93XXXXXXX code of a different item. `force` is the deliberate re-bind. */
async function assertBindable(tx: Tx | typeof prisma, facilityId: string, code: string, itemId: string, si: number, force: boolean) {
  const cur = await tx.barcode.findUnique({ where: { facilityId_code: { facilityId, code } }, include: { item: { select: { id: true, item: true, sizes: true } } } });
  if (cur && cur.itemId === itemId && cur.sizeIndex === si) return;
  if (cur && !force) throw new OpError(`${code} is already on ${cur.item.item} · size ${cur.item.sizes[cur.sizeIndex] ?? cur.sizeIndex}. Unbind it there first, or re-bind to move it.`);
  if (/^93\d{7}$/.test(code)) {
    const v = +code - 930000000, sort = Math.floor(v / 100);
    const owner = await tx.catalogItem.findFirst({ where: { facilityId, sort }, select: { id: true, item: true } });
    if (owner && owner.id !== itemId) throw new OpError(`${code} is the generated code for ${owner.item} — binding it here would make that garment unscannable. Use the barcode printed on the label.`);
  }
}
async function ownOrder(tx: Tx, facilityId: string, id: string) {
  const o = await tx.order.findFirst({ where: { id, facilityId }, include: { lines: { orderBy: { sort: "asc" } }, receipts: { include: { lines: true } } } });
  if (!o) throw new OpError("Unknown order", 404);
  return o;
}
async function upsertLevel(tx: Tx, facilityId: string, itemId: string, si: number, data: { opening?: number; adj?: { increment: number } | number; reorder?: number | null; preloved?: { increment: number } | number; supplierCode?: string }) {
  await tx.stockLevel.upsert({
    where: { itemId_sizeIndex: { itemId, sizeIndex: si } },
    create: { facilityId, itemId, sizeIndex: si, opening: data.opening ?? 0, adj: typeof data.adj === "number" ? data.adj : data.adj?.increment ?? 0, reorder: data.reorder === undefined ? null : data.reorder, supplierCode: data.supplierCode ?? "", preloved: Math.max(0, typeof data.preloved === "number" ? data.preloved : data.preloved?.increment ?? 0) },
    update: data,
  });
}
const PHOTO_MAX = 700 * 1024;
/** What a backup file may carry in images, and what a restore will take back — one pair of numbers
 *  for both ends, because a file the product writes and then refuses to read is not a backup.
 *  The count is the restore's own limit; the byte budget keeps the finished JSON inside the 60 MB
 *  the import POST accepts, with room for the records themselves (base64 is ~4/3 of the file on
 *  disk). Both are far more than a facility accumulates in the year between a restore drill. */
const BACKUP_PHOTO_MAX = 2000;
const BACKUP_PHOTO_BYTES = 40 * 1024 * 1024;
/** How many images the shared public demo will hold. Enough to sign for every delivery on the
 *  seeded round; nowhere near enough for an anonymous visitor to use the box as image hosting
 *  between resets. */
const DEMO_PHOTO_MAX = 40;
/** Delete photos older than a day that nothing references (abandoned captures). */
async function gcPhotos(fid: string) {
  const [ap, rc, is, pu, sl] = await Promise.all([
    prisma.approval.findMany({ where: { facilityId: fid, photoId: { not: null } }, select: { photoId: true } }),
    prisma.receipt.findMany({ where: { order: { facilityId: fid }, photoId: { not: null } }, select: { photoId: true } }),
    prisma.issue.findMany({ where: { facilityId: fid, returnPhotoId: { not: null } }, select: { returnPhotoId: true } }),
    prisma.pickup.findMany({ where: { facilityId: fid, OR: [{ sigId: { not: null } }, { proofId: { not: null } }] }, select: { sigId: true, proofId: true } }),
    prisma.slip.findMany({ where: { facilityId: fid, sigId: { not: null } }, select: { sigId: true } }),
  ]);
  const keep = new Set<string>([...ap.map((x) => x.photoId!), ...rc.map((x) => x.photoId!), ...is.map((x) => x.returnPhotoId!), ...pu.flatMap((x) => [x.sigId, x.proofId].filter(Boolean) as string[]), ...sl.map((x) => x.sigId!)]);
  const where = { facilityId: fid, createdAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) }, id: { notIn: [...keep] } };
  // Read the paths before deleting the rows: afterwards there is nothing left to say which files
  // to remove, and orphaned images on disk are exactly the mess this move was meant to avoid.
  const doomed = await prisma.photo.findMany({ where, select: { path: true } });
  await prisma.photo.deleteMany({ where });
  for (const d of doomed) if (d.path) await deletePhoto(d.path);
}
/** Delete a facility's Photo rows and hand back the files they pointed at.
 *
 *  The paths have to be read before the rows go: afterwards nothing is left that could say which
 *  files to remove, and an image nobody can identify is an image nobody can ever delete. The
 *  unlinking is deliberately left to the caller so it happens *after* the transaction commits — a
 *  rolled-back wipe that had already erased the files would leave rows pointing at nothing. */
async function purgePhotoRows(tx: Tx, facilityId: string): Promise<string[]> {
  const doomed = await tx.photo.findMany({ where: { facilityId }, select: { path: true } });
  await tx.photo.deleteMany({ where: { facilityId } });
  return doomed.map((d) => d.path).filter(Boolean);
}
const unlinkAll = async (paths: string[]) => { for (const rel of paths) await deletePhoto(rel); };
/** Serialise stock-mutating work per facility: lock the Facility row for the transaction, so two counter
 *  actions (double-click, two terminals) can't both pass the same shelf/pool/approval check. */
async function lockedTx<T>(facilityId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT "id" FROM "Facility" WHERE "id" = ${facilityId} FOR UPDATE`;
    return fn(tx);
  }, { maxWait: 10_000, timeout: 30_000 });
}
/** Resolve a client-supplied photo id to one this facility owns (or null). */
async function ownPhoto(tx: Tx | typeof prisma, facilityId: string, id: unknown): Promise<string | null> {
  const pid = str(id, 40); if (!pid) return null;
  const ph = await tx.photo.findFirst({ where: { id: pid, facilityId }, select: { id: true } });
  if (!ph) throw new OpError("Photo not found — take it again", 404);
  return ph.id;
}
/** Move the pre-loved pool for a variant by `delta`, never below zero. */
async function poolAdd(tx: Tx, facilityId: string, itemId: string, si: number, delta: number) {
  const cur = await tx.stockLevel.findUnique({ where: { itemId_sizeIndex: { itemId, sizeIndex: si } }, select: { preloved: true } });
  await upsertLevel(tx, facilityId, itemId, si, { preloved: Math.max(0, (cur?.preloved || 0) + delta) });
}
/** Make sure the directory holds this supplier, and hand back the name the DIRECTORY spells it with.
 *
 *  The match is deliberately case-insensitive, so a coordinator typing "northline workwear" on the
 *  counter phone finds the existing "Northline Workwear" and no second row is created. Storing what
 *  they typed against the garment is what did the damage: everything downstream matches the name
 *  exactly — the lead time behind an expected date, the contact block on a printed PO, the draft
 *  replenishment order a garment's lines are merged into — so the item pointed at a supplier the
 *  directory does not hold, and the room ended up with two draft orders for the one supplier.
 *  Callers store the name this returns, never the one that was typed. */
async function ensureSupplier(tx: Tx, facilityId: string, name: string): Promise<string> {
  const n = str(name, 80).trim(); if (!n) return "";
  const ex = await tx.supplier.findFirst({ where: { facilityId, name: { equals: n, mode: "insensitive" } } });
  if (ex) return ex.name;
  const count = await tx.supplier.count({ where: { facilityId } });
  await tx.supplier.create({ data: { facilityId, name: n, sort: count } });
  return n;
}
/** Expected delivery for an auto-created order: today + the supplier's lead time (14 days when none is set). */
async function expectedFor(tx: Tx, facilityId: string, supplier: string, today: string) {
  const sp = await tx.supplier.findFirst({ where: { facilityId, name: supplier }, select: { lead: true } });
  return addDays(today, sp?.lead && sp.lead > 0 ? sp.lead : 14);
}
/** Merge lines into the supplier's Draft replenishment order (creating one if needed). mode "add" increments, "max" tops up. */
async function mergeReplenish(tx: Tx, fid: string, today: string, sup: string, lines: { itemId: string; size: string; qty: number }[], mode: "add" | "max", notes: string) {
  let o = await tx.order.findFirst({ where: { facilityId: fid, replenish: true, status: "Draft", supplier: sup }, include: { lines: true } });
  if (!o) {
    const code = await nextOrderCode(tx, fid, today);
    o = await tx.order.create({ data: { facilityId: fid, code, date: today, source: "Supplier Order", orderFor: "Stock", supplier: sup, status: "Draft", expected: await expectedFor(tx, fid, sup, today), notes, replenish: true }, include: { lines: true } });
  }
  let n = 0;
  for (const c of lines) {
    const l = o.lines.find((x) => x.itemId === c.itemId && x.size === c.size);
    if (l) await tx.orderLine.update({ where: { id: l.id }, data: mode === "add" ? { qty: { increment: c.qty } } : { qty: Math.max(l.qty, c.qty) } });
    else { const nl = await tx.orderLine.create({ data: { orderId: o.id, itemId: c.itemId, size: c.size, qty: c.qty, sort: o.lines.length } }); o.lines.push(nl); }
    n++;
  }
  return n;
}

/** buildSnapshot() is shaped around a coordinator session, but the only things it reads off one are
 *  the facility id and the role — which gates the user list nothing here looks at. This stand-in
 *  lets a path with no coordinator (a ward sign-off) read the same ledger the counter reads,
 *  without inventing a second way to work out what is on the shelf. */
const stockReader = (facilityId: string): SessionUser =>
  ({ id: "", facilityId, email: "", first: "", last: "", title: "", role: "ISSUER", isDemo: false, viaSso: false });

/* Approved garments in a bag nobody has collected yet, for one person. The snapshot carries them
 * for everybody, but it is read before the facility lock and, on the hand-over path, before the bag
 * itself has moved — so every server path that asks the ceiling reads this person's afresh at the
 * moment it decides, and replaces the snapshot's list rather than adding to it. A bag being handed
 * over is therefore never counted as both owed and issued. */
async function owedRequestLines(db: Tx | typeof prisma, facilityId: string, staffId: string): Promise<{ staffId: string; itemId: string; qty: number }[]> {
  const rows = await db.requestLine.findMany({
    where: { status: "approved", request: { facilityId, subjectId: staffId, status: { in: AWAITING_HANDOVER } } },
    select: { itemId: true, qty: true },
  });
  return rows.map((l) => ({ staffId, itemId: l.itemId, qty: l.qty }));
}

/* Handing a request's garments over — the half of the flow that touches stock.
 *
 * Two doors reach this moment. The counter is one (request.collected, below); the ward round is
 * the other, where the person who signs for the bag holds a *staff* session and comes in through
 * lib/staffops.ts. Both have to record the same three things or the shelf count silently loses a
 * garment on one of the two routes: the shelf is re-checked, an Issue goes on the wearer's record
 * at the catalogue cost, and a replenishment line puts the garment back on order.
 *
 * Only the APPROVED lines are in the bag. A line the manager knocked back never reaches the linen
 * room, is never picked and must never come off the shelf — so approvedLines() is the one place
 * "what is being handed over" is decided, here as everywhere else.
 *
 * `move` is the caller's own status change, run inside the same lock and after the shelf check, so
 * a request only moves if the garments were actually there to hand over. It is the only part the
 * two doors differ on: the counter moves ready → collected, the ward moves round → delivered.
 */
export async function handOverRequestStock(
  facilityId: string,
  today: string,
  r: { id?: string; subjectId: string; lines: readonly { itemId: string; sizeIndex: number; qty: number; status: string }[] },
  move: (tx: Tx) => Promise<void>,
  /* Which door the garments are leaving by. At the counter a short shelf is a reason to stop: the
   * garment is still on the shelf (or isn't), and the coordinator can count or order. At the ward
   * door the bag physically left the linen room on the trolley (request.round moved nothing), and
   * the clerk signing for it can neither count the shelf nor order anything — and round.sign is
   * the only way out of `round`, so a refusal there stranded the bag and the wearer's order for
   * good. The ward door records the hand-over and lets the shelf go short, which the linen room's
   * next count corrects; that is a stock discrepancy to fix at the counter, not a reason to tell
   * a nurse her uniform didn't arrive. */
  door: "counter" | "ward" = "counter",
  /* A signature taken on the counter phone. A Slip is written for the bag inside the same lock, and
   * the issue rows it becomes are marked signed and point at it. The ward door passes nothing. */
  slip?: { sigId: string | null; toStaff: boolean; byName: string },
): Promise<void> {
  const lines = approvedLines(r.lines);
  if (!lines.length) throw new OpError("Nothing on that request was approved, so there is nothing to hand over.");
  await lockedTx(facilityId, async (tx) => {
    const snap = await buildSnapshot(stockReader(facilityId), tx);
    const led = ledger(snap);
    const picked = lines.map((l) => {
      const it = snap.catalog.find((x) => x.id === l.itemId);
      if (!it) throw new OpError("A garment on that request is no longer in the catalogue", 404);
      return { l, it, size: String(it.sizes[l.sizeIndex] ?? l.sizeIndex) };
    });
    // Totalled per garment and size before anything moves. Two approved lines for the same
    // variant have to clear the shelf together, or the second is checked against stock the first
    // has already taken and the bag leaves the room with one garment more than the shelf held.
    const need = new Map<string, { qty: number; what: string }>();
    for (const p of picked) {
      const k = key(p.l.itemId, p.l.sizeIndex);
      need.set(k, { qty: (need.get(k)?.qty || 0) + p.l.qty, what: `${p.it.item} ${p.size}` });
    }
    for (const [k, n] of need) {
      if (door === "counter" && n.qty > onhand(snap, led, k)) {
        throw new OpError(`Not enough ${n.what} on the shelf to hand over — count the shelf or order it in first.`);
      }
    }
    await move(tx);
    // This bag stopped being owed the moment `move` marked it collected or delivered, and it is about
    // to become issue rows below. Every other approved bag this person hasn't collected is still owed
    // and still counts, so they are read now — after the move, inside the same lock — which is what
    // keeps this bag counted once, as it is handed over, rather than once as owed and again as taken.
    // Counted twice, an ordinary collection at five sets would be stamped as an override.
    snap.owedRequestLines = await owedRequestLines(tx, facilityId, r.subjectId);
    // Past six sets can't block a hand-over the manager has already approved — the ward door records
    // rather than refuses — but it is still stamped as an override so the exceptions report keeps
    // seeing it. The running total matters now a request can carry several garments: the third
    // garment in one bag is measured against a ceiling the first two have already filled, which the
    // snapshot — read before any of these issues existed — cannot see on its own. So the bag grows a
    // line at a time and the whole of it so far goes to capCheck(), which measures what this person
    // holds plus what is being handed over.
    //
    // "Override" on these rows means what it means at the counter and nothing else: this garment took
    // somebody past the six sets one person holds. Asking the counter's own question keeps it that
    // way. A ward route that stamped the flag on a bag the linen room would have handed over without
    // one turns the exceptions report into a list of which door somebody walked through, and every
    // line here is there because a manager approved it — a kitchen hand collecting an approved set on
    // the ward should read no differently from the same collection at the counter.
    //
    // No staff-group check either, and no uniform-style one: a manager approved this bag, and a
    // hand-over is not a second chance to refuse it. But a garment outside the wearer's group is still
    // stamped offGroup, and one that is not their cut offStyle, so the exceptions report sees both.
    // Both doors that raise a request refuse such a garment now, yet one can still arrive here: a
    // request raised before the rule existed, a wearer moved to another group or set to a style since
    // they asked, or a damage replacement of a garment they were already holding.
    const st = snap.staff.find((x) => x.id === r.subjectId);
    let slipId: string | null = null;
    if (slip) {
      slipId = (await tx.slip.create({ data: { facilityId, staffId: r.subjectId, kind: "request", date: today, sigId: slip.sigId, toStaff: slip.toStaff, requestId: r.id ?? null, lines: picked.map((x) => ({ itemId: x.l.itemId, si: x.l.sizeIndex, qty: x.l.qty })), byName: slip.byName } })).id;
    }
    const taken: { itemId: string; qty: number }[] = [];
    for (const p of picked) {
      taken.push({ itemId: p.l.itemId, qty: p.l.qty });
      const over = st ? capCheck(snap, st, taken).over : false;
      await tx.issue.create({ data: { facilityId, date: today, staffId: r.subjectId, itemId: p.l.itemId, sizeIndex: p.l.sizeIndex, qty: p.l.qty, cond: "New", cost: p.it.cost, override: over, receipt: !!slip?.sigId, slipId, offGroup: st ? !garmentForGroup(p.it, st.group) : false, offStyle: st ? !garmentForStyle(p.it, st.uniformStyle) : false } });
    }
    // Replenishment is grouped by supplier, because a replenishment order is one supplier's order:
    // a bag holding a tunic from one supplier and a fleece from another puts a line on each of
    // their draft orders rather than inventing a mixed one nobody can send.
    const bySupplier = new Map<string, { itemId: string; size: string; qty: number }[]>();
    for (const p of picked) {
      const sup = p.it.supplier || snap.settings.suppliers[0] || "Supplier";
      bySupplier.set(sup, [...(bySupplier.get(sup) || []), { itemId: p.l.itemId, size: p.size, qty: p.l.qty }]);
    }
    for (const [sup, rows] of bySupplier) {
      await mergeReplenish(tx, facilityId, today, sup, rows, "add", "Replenishment — replaces issued stock");
    }
  });
}

/* ---------- the garments on a request ----------
 *
 * A nurse who needs a tunic, trousers and a fleece makes ONE ask. Both doors that raise a request
 * — the staff app's raise path in lib/staffops.ts and the counter below — read their garments
 * through here, so the limits, the duplicate rule and the wording of a refusal are stated once.
 */
export type RequestLineInput = { itemId: string; sizeIndex: number; qty: number; item: string; size: string };
/** Ten garments is a long way past a full set of uniform, and a cap keeps one tap from writing a
 *  hundred lines the manager then has to read. Twenty of one garment is the same idea per line. */
export const REQUEST_MAX_LINES = 10;
export const REQUEST_MAX_QTY = 20;

/** Read and check the garments off a request payload: `[{ itemId, si, qty }]`. Throws OpError, so
 *  the staff-app door translates it into its own error type. */
export async function readRequestLines(facilityId: string, raw: unknown): Promise<RequestLineInput[]> {
  const rows = Array.isArray(raw) ? raw : [];
  if (!rows.length) throw new OpError("Add at least one garment to the request");
  if (rows.length > REQUEST_MAX_LINES) throw new OpError(`One request covers up to ${REQUEST_MAX_LINES} garments — raise a second one for the rest.`);
  const wanted = [...new Set(rows.map((r) => str((r as { itemId?: unknown } | null)?.itemId)))].filter(Boolean);
  const items = await prisma.catalogItem.findMany({ where: { id: { in: wanted }, facilityId } });
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: RequestLineInput[] = [];
  for (const row of rows) {
    const r = (row || {}) as { itemId?: unknown; si?: unknown; qty?: unknown };
    const it = byId.get(str(r.itemId));
    if (!it || it.archived) throw new OpError("That garment isn't available", 404);
    const si = int(r.si, -1);
    if (si < 0 || si >= it.sizes.length) throw new OpError(`Pick a size for the ${it.item}`);
    const qty = int(r.qty, 1);
    if (qty < 1 || qty > REQUEST_MAX_QTY) throw new OpError(`Ask for between 1 and ${REQUEST_MAX_QTY} of a garment`);
    // The same garment in the same size twice is one line with the quantity added up, not two
    // identical rows: it is one decision for the manager and one line on the pick list, and a
    // screen that lets somebody tap a size twice should not double everything downstream.
    const same = out.find((x) => x.itemId === it.id && x.sizeIndex === si);
    if (same) {
      same.qty += qty;
      if (same.qty > REQUEST_MAX_QTY) throw new OpError(`Ask for between 1 and ${REQUEST_MAX_QTY} of ${it.item}`);
    } else out.push({ itemId: it.id, sizeIndex: si, qty, item: it.item, size: String(it.sizes[si]) });
  }
  return out;
}

/** One reason a cart is outside what this person is normally handed: each garment with the groups it
 *  is for, then the group the person is in. A clause, not a whole refusal — issueRefusal() adds the
 *  sentence about the override, so a cart wrong on two counts asks for the tick once. */
function offGroupRefusal(name: string, group: string, off: readonly { item: string; groups: string[] }[]): string {
  const each = off.map((i) => `${i.item} is for ${groupsLabel(i.groups)}`).join("; ");
  const g = (group || "").trim();
  const who = g ? `${name} is in ${g}` : `${name} has no staff group recorded`;
  return `${each} — ${who}`;
}
/** The same clause for the wrong cut: each garment with the cut it is, then the style this person is
 *  set to. Only ever built when the list is non-empty, which garmentForStyle() only allows for
 *  somebody set to Men's or Women's — blank and Either are offered everything. */
function offStyleRefusal(name: string, style: string, off: readonly { item: string; gender: string }[]): string {
  const each = off.map((i) => `${i.item} is the ${genderLabel(i.gender)} cut`).join("; ");
  return `${each} — ${name} is set to ${style}`;
}
/** The counter's refusal for a cart the coordinator's override would let through.
 *
 *  EVERY reason that applies is named in it — outside their staff group, the wrong cut, past the sets
 *  one person holds — because one tick answers all of them at once. A refusal that named the first
 *  and stopped would have the coordinator tick the box for that and wave the others through without
 *  anybody ever having been told about them. */
function issueRefusal(reasons: readonly string[], count: number): string {
  return `${reasons.join(". ")}. Tick the coordinator override to issue ${count === 1 ? "it" : "them"} anyway.`;
}

/** The garments among these that are not for this staff group, in the order asked for — the check
 *  both request doors (request.create in lib/staffops.ts, request.raise here) and the staff-member
 *  order paths make. garmentForGroup() is the rule; this only loads the catalogue rows it needs.
 *
 *  `replacing` is the one exemption: a damage replacement for a garment the person is holding right
 *  now (lib/staffops.ts damage.report). Only that garment, and only while the record still has it
 *  out with them. A fresh request for another group's garment is refused even from somebody who
 *  was issued one before the rule existed — holding one is not a reason to be handed another. */
export async function offGroupGarments(facilityId: string, group: string, itemIds: readonly string[], replacing?: { staffId: string; itemId: string }) {
  const ids = [...new Set(itemIds)];
  if (!ids.length) return [];
  const items = await prisma.catalogItem.findMany({ where: { id: { in: ids }, facilityId }, select: { id: true, item: true, groups: true } });
  const off = items.filter((i) => !garmentForGroup(i, group));
  if (!off.length) return [];
  const exempt = replacing && off.some((i) => i.id === replacing.itemId)
    && (await prisma.issue.count({ where: { facilityId, staffId: replacing.staffId, itemId: replacing.itemId, returnedDate: null, handedIn: null } })) > 0
    ? replacing.itemId : null;
  return ids.map((id) => off.find((i) => i.id === id)).filter((i): i is (typeof off)[number] => !!i && i.id !== exempt);
}

/** The garments among these that are not the cut this person is offered, in the order asked for —
 *  the same check offGroupGarments() makes, asked of Uniform style instead of the staff group.
 *  garmentForStyle() is the rule; this only loads the catalogue rows it needs.
 *
 *  `replacing` is the same one exemption, for the same reason: a damage replacement for a garment
 *  the person is holding right now. Somebody set to Men's who was issued the women's cut before
 *  anybody set the field can have that garment replaced like for like, and nothing else. */
export async function offStyleGarments(facilityId: string, style: string, itemIds: readonly string[], replacing?: { staffId: string; itemId: string }) {
  const ids = [...new Set(itemIds)];
  if (!ids.length) return [];
  const items = await prisma.catalogItem.findMany({ where: { id: { in: ids }, facilityId }, select: { id: true, item: true, gender: true } });
  const off = items.filter((i) => !garmentForStyle(i, style));
  if (!off.length) return [];
  const exempt = replacing && off.some((i) => i.id === replacing.itemId)
    && (await prisma.issue.count({ where: { facilityId, staffId: replacing.staffId, itemId: replacing.itemId, returnedDate: null, handedIn: null } })) > 0
    ? replacing.itemId : null;
  return ids.map((id) => off.find((i) => i.id === id)).filter((i): i is (typeof off)[number] => !!i && i.id !== exempt);
}

/** The counter's refusal when it raises a request, or writes an order, for somebody with garments
 *  outside their staff group on it. Neither has an override of its own: the one way to give
 *  somebody another group's garment is the Issue screen with the coordinator override ticked, which
 *  stamps the issue — or, for Order in, the order it raises — so the Exceptions report sees it.
 *  `onOrder` is for garments already on the order being changed, which can also simply come off. */
function offGroupElsewhere(st: { first: string; last: string; group: string }, off: readonly { item: string; groups: string[] }[], doing: "request" | "order", onOrder = false): string {
  const n = off.length === 1 ? "it" : "them";
  const each = off.map((i) => `${i.item} is for ${groupsLabel(i.groups)} only`).join("; ");
  const name = `${st.first} ${st.last}`.trim();
  const g = (st.group || "").trim();
  const who = g ? `${name} is in ${g}` : `${name} has no staff group recorded`;
  return doing === "request"
    ? `${each} — ${who}, and a request can only carry their own group's garments. To give ${n} to ${st.first} anyway, issue ${n} on the Issue screen with the coordinator override ticked.`
    : `${each} — ${who}, and an order for somebody can only carry their own group's garments. ${onOrder ? `Take ${n} off this order first, or to` : "To"} order ${n} in for ${st.first} anyway, use Order in on the Issue screen with the coordinator override ticked.`;
}

/** The same refusal for the wrong cut, said the same way and pointing at the same one override. */
function offStyleElsewhere(st: { first: string; last: string; uniformStyle: string }, off: readonly { item: string; gender: string }[], doing: "request" | "order", onOrder = false): string {
  const n = off.length === 1 ? "it" : "them";
  const each = off.map((i) => `${i.item} is the ${genderLabel(i.gender)} cut`).join("; ");
  const who = `${`${st.first} ${st.last}`.trim()} is set to ${st.uniformStyle}`;
  return doing === "request"
    ? `${each} — ${who}, and a request can only carry their own style. To give ${n} to ${st.first} anyway, issue ${n} on the Issue screen with the coordinator override ticked.`
    : `${each} — ${who}, and an order for somebody can only carry their own style. ${onOrder ? `Take ${n} off this order first, or to` : "To"} order ${n} in for ${st.first} anyway, use Order in on the Issue screen with the coordinator override ticked.`;
}

/** Every path that puts a garment on an order for a staff member asks this: creating one, copying
 *  one, attaching the person to one, adding a line, raising a quantity. What reaches them off it is
 *  issued at pickup with nobody deciding anything, so the order is the moment to refuse. Orders the
 *  counter raises itself (issue.create's Order in, and the back orders split off those) are not
 *  written through here — the override was ticked for them, and the order's note says so. */
async function refuseWrongGarmentOnOrder(facilityId: string, staff: { first: string; last: string; group: string; uniformStyle: string } | null, itemIds: readonly string[], onOrder = false) {
  if (!staff) return;
  const off = await offGroupGarments(facilityId, staff.group, itemIds);
  if (off.length) throw new OpError(offGroupElsewhere(staff, off, "order", onOrder));
  // The cut, asked after the group and refused the same way. Neither has an override of its own, so
  // there is nothing for one refusal to wave through by naming only the other: whichever it names,
  // the answer is the same Issue screen with the same tick.
  const offStyle = await offStyleGarments(facilityId, staff.uniformStyle, itemIds);
  if (offStyle.length) throw new OpError(offStyleElsewhere(staff, offStyle, "order", onOrder));
}
/** The staff member an existing order is for, or null for a stock order. */
const orderStaff = (facilityId: string, o: { staffId: string | null }) =>
  o.staffId ? prisma.staff.findFirst({ where: { id: o.staffId, facilityId }, select: { first: true, last: true, group: true, uniformStyle: true } }) : Promise.resolve(null);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
/** Ops the public demo facility refuses — everyone shares its accounts, so nobody may change them or nuke the data. */
// staff.selfCode is blocked in the demo for a reason worth stating: a claimed staff account holds a
// globally unique email, so a visitor activating one against demo data would take that address out
// of circulation for the real facility that later needs it.
const DEMO_BLOCKED = new Set(["users.add", "users.update", "users.remove", "me.password", "me.profile", "data.wipeActivity", "data.reset", "backup.restore", "me.deleteAccount", "staff.selfCode"]);
/** Settings a demo visitor may not change — see settings.update for why each one is here. Named in
 *  plain words because a refusal that says which field it means is the difference between a message
 *  and a mystery. */
const DEMO_FIXED: Record<string, string> = {
  logoData: "the slip logo",
  facility: "the facility name",
  location: "the stock location",
  coordinator: "the coordinator name",
  // The linen room's own contacts, for the same reason as the coordinator's name and then one
  // more: they print in the footer of every order form, and in a facility everyone is sharing a
  // visitor could put a stranger's e-mail address and phone number in front of every other visitor
  // and onto everything they print. The allowance settings next to them — the starting kit, the set
  // ceiling, which route each group is on — stay open, because changing those moves numbers about in a
  // sandbox that resets in twenty minutes and puts nobody's contact details anywhere.
  coordinatorEmail: "the linen room's e-mail address",
  coordinatorPhone: "the linen room's phone number",
  slipOrg: "the organisation name on slips",
  slipCollectionFooter: "the collection slip footer",
  slipDeliveryFooter: "the delivery slip footer",
  timezone: "the time zone",
};
export function demoGuard(user: SessionUser, op: string) {
  if (user.isDemo && DEMO_BLOCKED.has(op)) throw new OpError("Not available in the demo — it resets every 20 minutes and its accounts are shared.", 403);
}

export async function runOp(user: SessionUser, op: string, p: any): Promise<unknown> {
  demoGuard(user, op);
  const fid = user.facilityId;
  // Every date-only column an op writes is "today" where the linen room stands, not where the
  // server does — a Perth room issuing at 8am must not file the issue against yesterday because
  // the box is set to UTC. One lookup up front, shared with the name in the foot of an email.
  const fac = await prisma.facility.findUniqueOrThrow({ where: { id: fid }, select: { name: true, timezone: true, billingEmail: true } });
  const tz = fac.timezone;
  const today = facilityToday(tz);
  const byName = `${user.first} ${user.last}`;
  /** The facility's own name, for the foot of an email to a wearer. */
  const signOff = () => `${fac.name || "Linen room"} · ThreadCount`;
  p = p || {};

  switch (op) {
    // ---------- settings
    case "settings.update": {
      admin(user);
      // Everyone shares the demo facility, so anything a visitor changes here lands on every other
      // visitor's screen at once — including the director of nursing or the Play reviewer who
      // clicked through from the store listing. Two kinds of field are fixed there: the chrome that
      // appears on every screen and every printed slip, and the time zone, which decides the day
      // every date-only column is filed against — move the demo to Honolulu and the dashboard, the
      // exceptions report and the cost-centre journal re-date themselves under everyone else. The
      // rest of the screen stays a sandbox on purpose. Refused here rather than quietly dropped:
      // greying a control out is the browser's opinion and a POST to /api/mutate never sees it,
      // and the screen — which sends one field per edit — used to answer "Saved." over a value
      // the server had already thrown away, which the next reload exposed as a lie.
      if (user.isDemo) {
        const fixed = Object.keys(DEMO_FIXED).find((k) => p[k] !== undefined);
        if (fixed) throw new OpError(`The demo is one facility shared with everyone looking at it right now, so ${DEMO_FIXED[fixed]} is fixed here. The rest of this screen is yours to change.`, 403);
      }
      const data: Prisma.FacilityUpdateInput = {};
      if (p.facility !== undefined) data.name = str(p.facility, 120) || "Facility";
      if (p.location !== undefined) data.location = str(p.location, 120);
      if (p.coordinator !== undefined) data.coordinator = str(p.coordinator, 120);
      if (p.coordinatorEmail !== undefined) {
        // The footer of the printed order form, and the only place the linen room's own address is
        // held: nothing about a customer is written into the product, so a blank here prints a
        // blank footer rather than falling back to something invented. Checked because the form is
        // what a manager replies to — an address with a typo in it is a form nobody can answer, and
        // nobody finds out until a ward has been waiting a fortnight.
        const em = str(p.coordinatorEmail, 160).trim().toLowerCase();
        if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw new OpError("That doesn't look like an e-mail address. It prints on the order form, so a manager has to be able to reply to it.");
        data.coordinatorEmail = em;
      }
      if (p.coordinatorPhone !== undefined) {
        // Digits, in whatever shape the site writes them — an extension, a pager, a switchboard
        // number with a prefix are all real answers, so only an entry with no number in it at all
        // is refused. A footer reading "linen room" with nothing to ring is worse than a blank one.
        const ph = str(p.coordinatorPhone, 40).trim();
        if (ph && !/\d/.test(ph)) throw new OpError("A phone number needs some digits in it — leave it blank if the linen room doesn't take calls.");
        data.coordinatorPhone = ph;
      }
      // Garments a year, and a reporting figure only: it is what the register, the monthly report and
      // the exceptions list measure a year's drawing against. It stopped being what the counter
      // enforces when the ceiling became six sets held at any time — capSets below — so a site can
      // move this number, or leave it where it has always been, without a soul being turned away at
      // the counter for it.
      if (p.defaultEntitlement !== undefined) data.defaultEntitlement = Math.max(0, int(p.defaultEntitlement));
      // The starting kit for the groups on the starting-kit route (kitGroups), in SETS — a set being
      // a top and a bottom, so the number of garments is twice this. Kept apart from
      // defaultEntitlement, which still counts garments per financial year for the reports that
      // read it. What a blank or a nought falls back to is setsOnStart's answer rather than one of
      // ours: a kit of nought is not a kit, it is an order form that proposes nothing to somebody
      // starting on Monday, and the standing figure it falls back to has to be the same one the
      // wearer's own app quotes them.
      if (p.initialSets !== undefined) data.initialSets = setsOnStart(int(p.initialSets, 0));
      // The ceiling, for everybody in the building, whichever route their group is on. In SETS, like
      // the kit above, so twelve garments at the standing six, and it is a ceiling on what a person
      // HOLDS at any one time rather than an allowance that starts again in July. The routes differ
      // only in how somebody gets up to it — on the FTE table their hours propose a number, on the
      // starting kit they start with one and collect more as needed, on manager approval they
      // collect a set per signature — and this is where all three stop. Past it the ways on are a hand-in, which swaps rather than adds, and a
      // coordinator's override, recorded as the exception it is.
      //
      // What a blank, a nought or a nonsense entry falls back to is setsCap's answer rather than one
      // of ours — the standing six — for the same reason initialSets defers to setsOnStart above:
      // sets.ts applies that fallback again every time an allowance is worked out, so a second rule
      // here would mean the number stored from this screen and the number quoted to the wearer
      // could differ. A ceiling of nought is not a strict facility either way; it is a facility where
      // nobody at all can be issued so much as a shirt without a coordinator standing over it.
      if (p.capSets !== undefined) data.capSets = setsCap(int(p.capSets, 0));
      // Which route each of this facility's staff groups is on: nursingGroups for the FTE table,
      // kitGroups for the starting kit, neither for manager approval. Each is sent as a whole list,
      // and an empty one means exactly that — no group on that route. There is no list of ours to
      // fall back on.
      //
      // Names are not checked against staffGroups. People imported from a roster can be filed under
      // a group the settings list never had, and refusing that name here would leave them with no
      // route anybody could put them on. A group nobody is in matches nobody.
      const nursingIn = p.nursingGroups !== undefined ? groupList(p.nursingGroups, "FTE table groups") : undefined;
      const kitIn = p.kitGroups !== undefined ? groupList(p.kitGroups, "starting-kit groups") : undefined;
      if (p.defaultReorder !== undefined) data.defaultReorder = Math.max(0, int(p.defaultReorder));
      if (p.exceptionHigh !== undefined) data.exceptionHigh = Math.max(0, int(p.exceptionHigh));
      if (p.varianceReason !== undefined) data.varianceReason = Math.max(1, int(p.varianceReason, 5));
      if (p.timezone !== undefined) {
        // The zone every date-only column in the product is written against (see facilityToday).
        // A facility that cannot change it runs on the Brisbane default forever: a Perth late
        // shift issuing at 22:30 on 30 June files the issue against 1 July, so the garment counts
        // against the next financial year's entitlement, drops out of June's exceptions report and
        // cost-centre journal and turns up in July's. Checked against the runtime's own zone table
        // rather than stored as typed — a name this box has never heard of would leave every date
        // computed against a fallback while this screen claimed otherwise.
        const z = str(p.timezone, 60).trim();
        if (!z) throw new OpError("Pick the time zone the linen room is in");
        try { new Intl.DateTimeFormat("en-AU", { timeZone: z }); } catch { throw new OpError(`${z} isn't a time zone this system knows — use a name like Australia/Perth`); }
        data.timezone = z;
      }
      if (p.glAccount !== undefined) data.glAccount = str(p.glAccount, 40);
      if (p.journalDesc !== undefined) data.journalDesc = str(p.journalDesc, 120);
      const staffIn = Array.isArray(p.staffGroups) ? [...new Set(p.staffGroups.map((s: unknown) => str(s, 80).trim()).filter(Boolean))] as string[] : undefined;
      if (p.slipCollectionFooter !== undefined) data.slipCollectionFooter = str(p.slipCollectionFooter, 400);
      if (p.slipDeliveryFooter !== undefined) data.slipDeliveryFooter = str(p.slipDeliveryFooter, 400);
      if (p.slipOrg !== undefined) data.slipOrg = str(p.slipOrg, 120);
      if (p.barcodeLookup !== undefined) data.barcodeLookup = !!p.barcodeLookup;
      if (p.logoData !== undefined) {
        const l = String(p.logoData || "");
        // SVG deliberately excluded: it can carry scripts and is served from the app origin.
        if (l && !/^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(l)) throw new OpError("Logo must be a PNG, JPG, GIF or WebP image");
        if (l.length > LOGO_MAX * 1.4) throw new OpError("Logo is too large — keep it under 400 KB");
        data.logoData = l;
      }
      if (nursingIn === undefined && kitIn === undefined && staffIn === undefined) {
        await prisma.facility.update({ where: { id: fid }, data });
        return { ok: true };
      }
      // The group lists are settled against what is stored, under the facility's lock, because each
      // answer depends on the other lists: a save that read them and wrote a moment after somebody
      // else's would put back whatever that person had just changed.
      await lockedTx(fid, async (tx) => {
        const cur = await tx.facility.findUniqueOrThrow({ where: { id: fid }, select: { staffGroups: true, nursingGroups: true, kitGroups: true } });
        let nursing = nursingIn ?? cur.nursingGroups, kit = kitIn ?? cur.kitGroups;
        if (staffIn) {
          // A group taken off the list comes off both routes with it. Left on one, it would go on
          // deciding the allowance of anybody still filed under it from a list the settings screen no
          // longer shows, and nobody could see why. So a group that still has active staff filed under
          // it can't be taken off at all — the same rule departments keep. Without it, a save from a
          // screen opened before somebody else added or renamed a group would move a whole team to
          // manager approval, with nothing on either screen to say so.
          const kept = new Set(staffIn.map(groupKey));
          const gone = new Set(cur.staffGroups.map(groupKey).filter((k) => !kept.has(k)));
          if (gone.size) {
            const filed = await tx.staff.findMany({ where: { facilityId: fid, inactive: false }, select: { group: true } });
            const still = new Map<string, { name: string; n: number }>();
            for (const x of filed) {
              const k = groupKey(x.group);
              if (gone.has(k)) still.set(k, { name: x.group.trim(), n: (still.get(k)?.n || 0) + 1 });
            }
            const first = [...still.values()][0];
            if (first) throw new OpError(`${first.name} still has ${first.n} ${first.n === 1 ? "person" : "people"} filed under it. Move them to another group, or rename it instead, before taking it off the list.`);
          }
          nursing = nursing.filter((g) => !gone.has(groupKey(g)));
          kit = kit.filter((g) => !gone.has(groupKey(g)));
          data.staffGroups = staffIn;
        }
        // One route per group. Refused by name rather than settled by a rule, because a group quietly
        // dropped from one list is a team's first kit changing with nothing on the screen to say so.
        // Moving a group from one route to the other is one save carrying both lists. Asked only when
        // a route list is being set, so adding or removing a staff group is never refused over it.
        if (nursingIn || kitIn) {
          const both = nursing.find((g) => isKitGroup(kit, g));
          if (both) throw new OpError(`${both} can't be on the FTE table and the starting kit at once. Each group takes one route — take it off one before putting it on the other.`);
        }
        data.nursingGroups = nursing;
        data.kitGroups = kit;
        await tx.facility.update({ where: { id: fid }, data });
      });
      return { ok: true };
    }
    case "settings.checklist": {
      // The dashboard's first-run checklist: an admin can put it away; nothing else about it is
      // stored, every tick is read from the records themselves.
      admin(user);
      await prisma.facility.update({ where: { id: fid }, data: { checklistDismissed: !!p.dismissed } });
      return { ok: true };
    }
    case "settings.renameGroup": {
      admin(user);
      // A staff group's name corrected everywhere the name is held — the settings list, both route
      // lists, and every staff record filed under it — in one go. The name is what decides somebody's
      // route, so a rename that missed any of those would move people onto a different allowance for
      // the sake of a spelling, and nobody's allowance may change because a label was tidied up. Its
      // own op rather than a removal and an addition, because the lists alone cannot tell the two
      // apart, and a removal takes the group off its route.
      const from = str(p.from, 80).trim(), to = str(p.to, 80).trim();
      if (!from) throw new OpError("Say which staff group to rename");
      if (!to) throw new OpError("A staff group needs a name");
      const fromK = groupKey(from), toK = groupKey(to);
      const moved = await lockedTx(fid, async (tx) => {
        const cur = await tx.facility.findUniqueOrThrow({ where: { id: fid }, select: { staffGroups: true, nursingGroups: true, kitGroups: true } });
        const filedAs = (await tx.staff.findMany({ where: { facilityId: fid }, select: { group: true }, distinct: ["group"] })).map((x) => x.group);
        const names = [...cur.staffGroups, ...cur.nursingGroups, ...cur.kitGroups, ...filedAs];
        if (!names.some((g) => groupKey(g) === fromK)) throw new OpError(`${from} isn't one of this facility's staff groups`, 404);
        // Renaming onto a name already in use is a merge, not a rename: two teams under one name, and
        // whichever route the other was on quietly becoming this one's too. The same refusal a
        // department gets, for the same reason. Changing only the case or the spacing is allowed —
        // that is the same group, spelt better.
        if (toK !== fromK && names.some((g) => groupKey(g) === toK)) throw new OpError(`${to} is already a staff group here. Renaming ${from} to it would put two groups under one name — pick a name nobody is using.`);
        const swap = (list: string[]) => [...new Set(list.map((g) => (groupKey(g) === fromK ? to : g)))];
        await tx.facility.update({ where: { id: fid }, data: { staffGroups: swap(cur.staffGroups), nursingGroups: swap(cur.nursingGroups), kitGroups: swap(cur.kitGroups) } });
        const spellings = filedAs.filter((g) => groupKey(g) === fromK && g !== to);
        // Garments tagged for the group follow it too. Left under the old name they would be for a
        // group nobody is in any more, and the staff app refuses a garment outside the person's group.
        const tagged = await tx.catalogItem.findMany({ where: { facilityId: fid, NOT: { groups: { isEmpty: true } } }, select: { id: true, groups: true } });
        let garments = 0;
        for (const it of tagged) {
          if (!it.groups.some((g) => groupKey(g) === fromK && g !== to)) continue;
          await tx.catalogItem.update({ where: { id: it.id }, data: { groups: garmentGroups(it.groups.map((g) => (groupKey(g) === fromK ? to : g))) } });
          garments++;
        }
        const staff = spellings.length ? (await tx.staff.updateMany({ where: { facilityId: fid, group: { in: spellings } }, data: { group: to } })).count : 0;
        return { staff, garments };
      });
      return { ok: true, staff: moved.staff, garments: moved.garments };
    }

    // ---------- suppliers
    case "supplier.add": {
      admin(user);
      const name = str(p.name, 80).trim(); if (!name) throw new OpError("Supplier name required");
      const dup = await prisma.supplier.findFirst({ where: { facilityId: fid, name: { equals: name, mode: "insensitive" } } });
      if (dup) throw new OpError("That supplier is already on the list");
      const count = await prisma.supplier.count({ where: { facilityId: fid } });
      const s = await prisma.supplier.create({ data: { facilityId: fid, name, sort: count } });
      return { id: s.id };
    }
    case "supplier.update": {
      admin(user);
      const s = await prisma.supplier.findFirst({ where: { id: str(p.id), facilityId: fid } }); if (!s) throw new OpError("Unknown supplier", 404);
      const data: Prisma.SupplierUpdateInput = {};
      for (const k of ["contact", "phone", "account"] as const) if (p[k] !== undefined) data[k] = str(p[k], 120);
      if (p.email !== undefined) {
        const em = str(p.email, 160).trim().toLowerCase();
        if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw new OpError("That doesn't look like an email address");
        data.email = em;
      }
      if (p.lead !== undefined) data.lead = p.lead === "" || p.lead === null ? null : Math.max(0, int(p.lead));
      await prisma.supplier.update({ where: { id: s.id }, data });
      return { ok: true };
    }
    case "supplier.remove": {
      admin(user);
      const s = await prisma.supplier.findFirst({ where: { id: str(p.id), facilityId: fid } }); if (!s) throw new OpError("Unknown supplier", 404);
      const used = await prisma.catalogItem.count({ where: { facilityId: fid, supplier: s.name } }) + await prisma.order.count({ where: { facilityId: fid, supplier: s.name } });
      if (used) throw new OpError("This supplier has products or orders and can't be removed.");
      await prisma.supplier.delete({ where: { id: s.id } });
      return { ok: true };
    }

    // ---------- catalogue
    case "catalog.add": {
      admin(user);
      const sizes = (Array.isArray(p.sizes) ? p.sizes : []).map((s: unknown) => str(s, 20).trim()).filter(Boolean);
      if (!str(p.item).trim()) throw new OpError("Item name required");
      if (!sizes.length) throw new OpError("At least one size required");
      // Quick-add from a scan passes the barcode(s) along so the code is bound in the same write —
      // no window where the item exists but the code that created it isn't attached to anything.
      const codes = (Array.isArray(p.barcodes) ? p.barcodes : []).map((b: { si?: unknown; code?: unknown }) => ({ si: int(b?.si, -1), code: str(b?.code, 64).trim() })).filter((b: { si: number; code: string }) => b.code);
      for (const b of codes) if (b.si < 0 || b.si >= sizes.length) throw new OpError("The scanned barcode has to point at one of the sizes you picked");
      if (new Set(codes.map((b: { code: string }) => b.code)).size !== codes.length) throw new OpError("The same barcode is on two sizes — each size needs its own code");
      for (const b of codes) await assertBindable(prisma, fid, b.code, "", b.si, false);
      // Opening stock entered on the form: the counted quantity already on the shelf, per size.
      const opens = (Array.isArray(p.opening) ? p.opening : []).map((o: { si?: unknown; qty?: unknown }) => ({ si: int(o?.si, -1), qty: int(o?.qty, 0) })).filter((o: { si: number; qty: number }) => o.qty !== 0);
      for (const o of opens) {
        if (o.si < 0 || o.si >= sizes.length) throw new OpError("Opening stock has to point at one of the sizes you picked");
        if (o.qty < 0) throw new OpError("Opening stock can't be negative");
      }
      const groups = (await groupsFromPayload(prisma, fid, p, null)) ?? [];
      return prisma.$transaction(async (tx) => {
        const sort = await nextSort(tx, fid);
        const supplier = await ensureSupplier(tx, fid, str(p.supplier, 80));
        const it = await tx.catalogItem.create({ data: { facilityId: fid, sort, item: str(p.item, 160).trim(), gender: str(p.gender, 20) || "Unisex", type: str(p.type, 40).trim(), groups, sku: str(p.sku, 60).trim(), supplier, cost: Math.max(0, num(p.cost)), notes: str(p.notes, 400), sizes } });
        for (const b of codes) await tx.barcode.upsert({ where: { facilityId_code: { facilityId: fid, code: b.code } }, create: { facilityId: fid, code: b.code, itemId: it.id, sizeIndex: b.si, source: "bound" }, update: { itemId: it.id, sizeIndex: b.si } });
        for (const o of opens) await upsertLevel(tx, fid, it.id, o.si, { opening: o.qty });
        // The opening figure, so the history starts at the beginning rather than at the first edit.
        if (it.cost > 0) await tx.costChange.create({ data: { facilityId: fid, itemId: it.id, cost: it.cost, previous: null, byName } });
        return { id: it.id };
      });
    }
    case "catalog.update": {
      admin(user);
      const it = await ownItem(prisma, fid, str(p.id));
      const data: Prisma.CatalogItemUpdateInput = {};
      if (p.item !== undefined) data.item = str(p.item, 160).trim() || it.item;
      if (p.gender !== undefined) data.gender = str(p.gender, 20);
      if (p.type !== undefined) data.type = str(p.type, 40).trim();
      const groups = await groupsFromPayload(prisma, fid, p, it.groups);
      if (groups !== undefined) data.groups = groups;
      if (p.sku !== undefined) data.sku = str(p.sku, 60).trim();
      if (p.supplier !== undefined) data.supplier = await ensureSupplier(prisma, fid, str(p.supplier, 80));
      if (p.notes !== undefined) data.notes = str(p.notes, 400);
      // Captured before the write so the row can say what it moved from — "we used to pay $30" is
      // the half of the answer a single current-value field could never give.
      let costFrom: number | null = null;
      let costTo: number | null = null;
      if (p.cost !== undefined) {
        const c = num(p.cost, NaN);
        if (!(c >= 0)) throw new OpError("Invalid cost");
        data.cost = c;
        if (c !== it.cost) { costFrom = it.cost; costTo = c; }
      }
      if (p.archived !== undefined) data.archived = !!p.archived;
      if (Array.isArray(p.sizes) || p.addSize !== undefined) {
        const sizes: string[] = Array.isArray(p.sizes) ? p.sizes.map((s: unknown) => str(s, 20).trim()).filter(Boolean) : [...it.sizes, str(p.addSize, 20).trim()].filter(Boolean);
        if (!sizes.length) throw new OpError("At least one size required");
        if (new Set(sizes).size !== sizes.length) throw new OpError("That size is already on the item");
        // Only allow appending sizes once the item has history, to keep size indexes stable.
        // Request lines and waitlist places count as history like anything else: both store a
        // POSITION in this array, so reordering it under a pending ward request either points the
        // line past the end of the run — the pick list reads "size 3" and the bag can never be
        // handed over — or, worse, quietly one place further up it, and the nurse is handed the
        // wrong size with every screen agreeing it is right.
        const prefixOk = it.sizes.every((s, i) => sizes[i] === s);
        const hasHistory = (await Promise.all([prisma.issue.count({ where: { itemId: it.id } }), prisma.stockLevel.count({ where: { itemId: it.id } }), prisma.orderLine.count({ where: { itemId: it.id } }), prisma.stockMove.count({ where: { itemId: it.id } }), prisma.barcode.count({ where: { itemId: it.id } }), prisma.stocktakeLine.count({ where: { itemId: it.id } }), prisma.receiptLine.count({ where: { itemId: it.id } }), prisma.pickupLine.count({ where: { itemId: it.id } }), prisma.requestLine.count({ where: { itemId: it.id } }), prisma.waitlistEntry.count({ where: { itemId: it.id } })])).reduce((a, b) => a + b, 0);
        if (hasHistory && !prefixOk) throw new OpError("This item has history — sizes can be added but existing sizes can't be removed or reordered.");
        data.sizes = sizes;
      }
      await prisma.catalogItem.update({ where: { id: it.id }, data });
      if (costTo !== null) {
        await prisma.costChange.create({ data: { facilityId: fid, itemId: it.id, cost: costTo, previous: costFrom, byName } });
      }
      return { ok: true };
    }
    case "catalog.duplicate": {
      // Same garment, different colour/role: one catalogue item per colour, because group routing on
      // the Issue screen and stock/barcodes are all per item. Copies the description and the size run
      // (and the reorder levels, which are a property of the garment) — never barcodes, stock or
      // history, which belong to the colour you're about to scan in.
      admin(user);
      const src = await ownItem(prisma, fid, str(p.id));
      const item = str(p.item, 160).trim() || src.item;
      const groups = (await groupsFromPayload(prisma, fid, p, src.groups)) ?? garmentGroups(src.groups);
      const sku = p.sku !== undefined ? str(p.sku, 60).trim() : src.sku;
      // The same name for the same groups, in any order, is the same garment.
      const setOf = (l: string[]) => garmentGroups(l).map(groupKey).sort().join("\n");
      const sameName = await prisma.catalogItem.findMany({ where: { facilityId: fid, item, archived: false }, select: { groups: true } });
      if (sameName.some((d) => setOf(d.groups) === setOf(groups))) throw new OpError(`“${item}” already exists for ${groups.length ? groupsLabel(groups) : "all groups"}. Give this one a different name.`);
      return prisma.$transaction(async (tx) => {
        const sort = await nextSort(tx, fid);
        const it = await tx.catalogItem.create({ data: { facilityId: fid, sort, item, gender: src.gender, type: src.type, sku, supplier: src.supplier, cost: src.cost, groups, notes: src.notes, sizes: src.sizes } });
        const levels = await tx.stockLevel.findMany({ where: { itemId: src.id }, select: { sizeIndex: true, reorder: true } });
        for (const l of levels) if (l.reorder !== null) await upsertLevel(tx, fid, it.id, l.sizeIndex, { reorder: l.reorder });
        return { id: it.id, sizes: it.sizes.length };
      });
    }
    case "catalog.bulk": {
      // Inventory multi-select actions. Delete is history-safe: anything with issues/orders/stocktake/pickup lines
      // or stock movement is discontinued instead, so records keep resolving.
      admin(user);
      const ids = (Array.isArray(p.ids) ? p.ids : []).map((x: unknown) => str(x)).filter(Boolean);
      const items = await prisma.catalogItem.findMany({ where: { facilityId: fid, id: { in: ids } } });
      if (!items.length) throw new OpError("Select at least one product");
      const action = str(p.action);
      const n = items.length, plural = `${n} product${n === 1 ? "" : "s"}`;
      const idsIn = items.map((i) => i.id);
      if (action === "discontinue") { await prisma.catalogItem.updateMany({ where: { id: { in: idsIn } }, data: { archived: true } }); return { ok: true, message: `${plural} discontinued.` }; }
      if (action === "reinstate") { await prisma.catalogItem.updateMany({ where: { id: { in: idsIn } }, data: { archived: false } }); return { ok: true, message: `${plural} reinstated.` }; }
      if (action === "supplier") { const v = str(p.value, 80).trim(); if (!v) throw new OpError("Pick a supplier"); const canon = await ensureSupplier(prisma, fid, v); await prisma.catalogItem.updateMany({ where: { id: { in: idsIn } }, data: { supplier: canon } }); return { ok: true, message: `${plural} moved to ${canon}.` }; }
      if (action === "group") {
        // `groups` from a tick-list, or the one `value` the select sends — a name, "All", or a
        // garment's label ("A, B"), which takes that garment's groups.
        if ((p.groups === undefined || p.groups === null) && !str(p.value, 4000).trim()) throw new OpError("Pick a group");
        const groups = (await groupsFromPayload(prisma, fid, { groups: p.groups, group: p.value }, null)) ?? [];
        await prisma.catalogItem.updateMany({ where: { id: { in: idsIn } }, data: { groups } });
        return { ok: true, message: `${plural} moved to ${groups.length ? `group${groups.length > 1 ? "s" : ""} ${groupsLabel(groups)}` : "all groups"}.` };
      }
      if (action === "reorder") {
        const lvl = int(p.value, -1); if (lvl < 0) throw new OpError("Enter a reorder level");
        await prisma.$transaction(async (tx) => { for (const it of items) for (let si = 0; si < it.sizes.length; si++) await upsertLevel(tx, fid, it.id, si, { reorder: lvl }); });
        return { ok: true, message: `Reorder level set to ${lvl} on every size of ${plural}.` };
      }
      if (action === "price") {
        const raw = str(p.value, 20).trim();
        const pct = /^[+-]\d+(\.\d+)?%$/.test(raw), abs = /^\$?\d+(\.\d+)?$/.test(raw);
        if (!pct && !abs) throw new OpError("Enter a price like 25.50 or a change like +5%");
        await prisma.$transaction(async (tx) => {
          for (const it of items) {
            const cost = pct ? Math.max(0.01, Math.round(it.cost * (1 + parseFloat(raw.slice(0, -1)) / 100) * 100) / 100) : Math.max(0.01, num(raw.replace("$", "")));
            if (cost === it.cost) continue;
            await tx.catalogItem.update({ where: { id: it.id }, data: { cost } });
            // In the same transaction as the price itself: a bulk uplift that left no CostChange
            // behind put a hole in the one record of what a garment used to cost, and "what did we
            // used to pay for these" is a question finance asks every year.
            await tx.costChange.create({ data: { facilityId: fid, itemId: it.id, cost, previous: it.cost, byName } });
          }
        });
        return { ok: true, message: `Prices updated on ${plural}${pct ? ` (${raw})` : ""}. Past issues keep their recorded price.` };
      }
      if (action === "delete") {
        const gone: string[] = [], kept: string[] = [];
        for (const it of items) {
          // The same list catalog.delete checks, request lines included. They cascade from the
          // garment, so a brand-new item with no stock behind it — a fleece added last week and
          // asked for on a live request — was being hard-deleted from a tidy-up multi-select, and
          // Postgres quietly took the approved line with it: the ward's request lost a garment
          // with no event and no message saying why, and a request whose only line went that way
          // sticks at picking forever because there is nothing left to hand over.
          const used = await prisma.issue.count({ where: { itemId: it.id } }) + await prisma.orderLine.count({ where: { itemId: it.id } }) + await prisma.stocktakeLine.count({ where: { itemId: it.id } })
            + await prisma.pickupLine.count({ where: { itemId: it.id } }) + await prisma.stockMove.count({ where: { itemId: it.id } }) + await prisma.handInLine.count({ where: { itemId: it.id } })
            + await prisma.requestLine.count({ where: { itemId: it.id } })
            + await prisma.stockLevel.count({ where: { itemId: it.id, OR: [{ opening: { gt: 0 } }, { adj: { not: 0 } }, { preloved: { gt: 0 } }] } });
          (used ? kept : gone).push(it.id);
        }
        await prisma.$transaction([
          prisma.catalogItem.deleteMany({ where: { id: { in: gone } } }),
          prisma.catalogItem.updateMany({ where: { id: { in: kept } }, data: { archived: true } }),
        ]);
        const pl = (k: number) => `${k} product${k === 1 ? "" : "s"}`;
        return { ok: true, deleted: gone.length, discontinued: kept.length, message: (gone.length ? `${pl(gone.length)} deleted` : "") + (gone.length && kept.length ? " · " : "") + (kept.length ? `${pl(kept.length)} had history or stock on hand, so they were discontinued instead (records stay intact)` : "") + "." };
      }
      throw new OpError("Unknown bulk action");
    }
    case "catalog.delete": {
      admin(user);
      const it = await ownItem(prisma, fid, str(p.id));
      // Request lines are counted with the rest: they cascade from the garment, so deleting one a
      // ward has asked for would strip the line out from under a live request and leave the
      // manager an ask with nothing on it.
      const used = await prisma.issue.count({ where: { itemId: it.id } }) + await prisma.orderLine.count({ where: { itemId: it.id } }) + await prisma.stocktakeLine.count({ where: { itemId: it.id } }) + await prisma.handInLine.count({ where: { itemId: it.id } }) + await prisma.pickupLine.count({ where: { itemId: it.id } }) + await prisma.stockMove.count({ where: { itemId: it.id } }) + await prisma.requestLine.count({ where: { itemId: it.id } }) + await prisma.stockLevel.count({ where: { itemId: it.id, preloved: { gt: 0 } } });
      if (used) throw new OpError("This item has history. Discontinue it instead of deleting.");
      await prisma.catalogItem.delete({ where: { id: it.id } });
      return { ok: true };
    }
    case "barcode.bind": {
      admin(user);
      const code = str(p.code, 64).trim();
      if (!code) throw new OpError("Barcode required");
      const it = await ownItem(prisma, fid, str(p.itemId));
      const si = int(p.si, -1);
      if (si < 0 || si >= it.sizes.length) throw new OpError("Invalid size");
      await assertBindable(prisma, fid, code, it.id, si, !!p.force);
      await prisma.barcode.upsert({ where: { facilityId_code: { facilityId: fid, code } }, create: { facilityId: fid, code, itemId: it.id, sizeIndex: si, source: "bound" }, update: { itemId: it.id, sizeIndex: si } });
      return { ok: true };
    }
    case "catalog.variantAdd": {
      // Scan-a-size: append the size if it's new and bind the scanned code to it, in one write, so a
      // half-finished scan can't leave a size with no barcode (or a barcode on no size).
      admin(user);
      const it = await ownItem(prisma, fid, str(p.itemId));
      const size = str(p.size, 20).trim();
      if (!size) throw new OpError("Size required");
      const code = str(p.code, 64).trim();
      const existing = it.sizes.findIndex((s) => s.toLowerCase() === size.toLowerCase());
      const si = existing >= 0 ? existing : it.sizes.length;
      if (code) await assertBindable(prisma, fid, code, it.id, si, !!p.force);
      await prisma.$transaction(async (tx) => {
        if (existing < 0) await tx.catalogItem.update({ where: { id: it.id }, data: { sizes: [...it.sizes, size] } });
        if (code) await tx.barcode.upsert({ where: { facilityId_code: { facilityId: fid, code } }, create: { facilityId: fid, code, itemId: it.id, sizeIndex: si, source: "bound" }, update: { itemId: it.id, sizeIndex: si } });
      });
      return { si, size, created: existing < 0 };
    }
    case "catalog.removeSize": {
      /* Take a size off a garment.
       *
       * `sizeIndex` is a POSITION in the sizes array, not a name, so pulling one out shifts every
       * size after it down by one — and ten tables store that position against the item. Left
       * unremapped, a stock level for "14" silently starts describing "16" and an issue against
       * somebody's name changes size under them. So this walks all ten in one transaction.
       *
       * What stops it is anything actually RECORDED against this particular size: an issue, a
       * movement, a count, a hand-in, a request line, a place in a queue. Those are the history the
       * size exists to explain, and deleting them to tidy the list is not a trade worth offering.
       * Scaffolding goes quietly with it — an untouched stock level (a par nobody has counted
       * against) and the barcode bound to that size, which describes a size that is about to stop
       * existing. `catalog.update` still refuses to reorder or remove sizes wholesale for the same
       * reason; this is the narrow, checked way to do one. */
      admin(user);
      const it = await ownItem(prisma, fid, str(p.id));
      const si = int(p.si, -1);
      if (si < 0 || si >= it.sizes.length) throw new OpError("Invalid size");
      if (it.sizes.length <= 1) throw new OpError("A garment needs at least one size — archive it instead.");
      const where = { itemId: it.id, sizeIndex: si };

      // A stock level that has never been counted or adjusted is a par setting, not a record.
      //
      // On hand is DERIVED, not stored (see ledger()/onhand() in lib/compute.ts): opening + adj on
      // the StockLevel row, plus what came in on deliveries and stock moves. So a size whose stock
      // arrived entirely on a supplier delivery — ordered against an empty new garment, received
      // onto the shelf, never issued — has opening/adj/preloved all zero and used to read as empty.
      // Removing it deleted six real garments off the books with no StockMove to explain the loss.
      // Order and receipt lines key on the size STRING rather than the index, which is why they sit
      // outside the `where` above and why they matter twice over: an open order for a removed size
      // stops counting as on order (onOrderMap drops si < 0), and when the box lands the receipt
      // writes a line the ledger then ignores, so twenty garments enter the room and are never added.
      // Only an order still outstanding blocks, on the same test onOrderMap uses: a size whose one
      // order was cancelled, or received years ago, is history the receipt lines already speak for,
      // and counting it would leave a discontinued size on the list with no way to ever take it off.
      const sizeName = String(it.sizes[si]);
      const [issues, moves, takes, handins, reqs, waits, kits, disputes, stocked, received, ordered] = await Promise.all([
        prisma.issue.count({ where }),
        prisma.stockMove.count({ where }),
        prisma.stocktakeLine.count({ where }),
        prisma.handInLine.count({ where }),
        prisma.requestLine.count({ where }),
        prisma.waitlistEntry.count({ where }),
        prisma.kitCheckAnswer.count({ where }),
        prisma.recordDispute.count({ where }),
        prisma.stockLevel.count({ where: { ...where, NOT: { opening: 0, adj: 0, preloved: 0 } } }),
        prisma.receiptLine.count({ where: { itemId: it.id, size: sizeName } }),
        prisma.orderLine.count({ where: { itemId: it.id, size: sizeName, order: { status: { notIn: ["Received", "Cancelled"] } } } }),
      ]);
      const blocked: string[] = [];
      if (issues) blocked.push(`${issues} issue${issues === 1 ? "" : "s"}`);
      if (stocked || received) blocked.push("stock on hand");
      if (ordered) blocked.push("a supplier order");
      if (moves) blocked.push(`${moves} stock movement${moves === 1 ? "" : "s"}`);
      if (takes) blocked.push("a stocktake");
      if (handins) blocked.push("a hand-in");
      if (reqs) blocked.push("a ward request");
      if (waits) blocked.push("somebody waiting for it");
      if (kits) blocked.push("a kit check answer");
      if (disputes) blocked.push("a record query");
      if (blocked.length) {
        throw new OpError(`Size ${it.sizes[si]} has ${blocked.join(", ")} against it, so it can't be removed. Its history would go with it.`);
      }

      const sizes = it.sizes.filter((_, i) => i !== si);
      await prisma.$transaction(async (tx) => {
        // The size itself: its par row and the code on its label, neither of which outlives it.
        await tx.stockLevel.deleteMany({ where });
        await tx.barcode.deleteMany({ where });
        // Everything above it moves down one. Every table that stores the position has to move.
        const shift = { where: { itemId: it.id, sizeIndex: { gt: si } }, data: { sizeIndex: { decrement: 1 } } };
        await tx.stockMove.updateMany(shift);
        await tx.issue.updateMany(shift);
        await tx.barcode.updateMany(shift);
        await tx.stocktakeLine.updateMany(shift);
        await tx.handInLine.updateMany(shift);
        await tx.requestLine.updateMany(shift);
        await tx.recordDispute.updateMany(shift);
        /* StockLevel, WaitlistEntry and KitCheckAnswer carry sizeIndex inside a UNIQUE index, and
         * Postgres checks a unique index as each row is written, not at the end of the statement.
         * One decrementing UPDATE therefore fails the moment it happens to reach XL (3 → 2) before
         * L (still 2) — and the physical order of those rows is whatever the table's last write
         * left behind, so removing a size worked on one garment and rolled the whole transaction
         * back on the next with nothing on screen but "Something went wrong". Parked below zero
         * first, where no real size index can be, then brought back: both passes only ever write
         * values nothing else holds. */
        const PARK = 1_000_000;
        const park = { where: { itemId: it.id, sizeIndex: { gt: si } }, data: { sizeIndex: { decrement: PARK + 1 } } };
        const unpark = { where: { itemId: it.id, sizeIndex: { lt: 0 } }, data: { sizeIndex: { increment: PARK } } };
        await tx.stockLevel.updateMany(park); await tx.stockLevel.updateMany(unpark);
        await tx.waitlistEntry.updateMany(park); await tx.waitlistEntry.updateMany(unpark);
        await tx.kitCheckAnswer.updateMany(park); await tx.kitCheckAnswer.updateMany(unpark);
        await tx.catalogItem.update({ where: { id: it.id }, data: { sizes } });
      });
      return { ok: true, sizes };
    }
    case "barcode.generate": {
      /* Print our own barcode for a garment that arrived without one.
       *
       * Whole ranges turn up unlabelled — the cafe shirts came with nothing on any size — and a
       * garment nobody can scan is invisible to a count and cannot be issued by scanning. The room
       * prints its own label instead, carrying a number GS1 reserves for exactly this (see
       * inHouseEan13): a real EAN-13 in the restricted-circulation range, which every scanner in
       * the building already reads.
       *
       * Only ever fills the gaps. A size that already carries a supplier's code keeps it — the code
       * on the garment is the one the supplier will use on the next delivery note, and replacing it
       * with ours would quietly cut that tie. Pass `si` for one size, or leave it out for every
       * unlabelled size on the garment, which is the usual case: somebody is standing at a rack
       * about to label the lot.
       *
       * The counter lives on the facility and moves inside the same transaction as the binding, so
       * two people labelling different racks cannot mint the same number. The uniqueness check is
       * still there behind it: a supplier code that happens to start 29 would be rare but is not
       * impossible, and quietly re-binding somebody's real barcode is not a failure worth risking. */
      admin(user);
      const it = await ownItem(prisma, fid, str(p.itemId));
      const only = p.si === undefined ? -1 : int(p.si, -1);
      if (only >= 0 && only >= it.sizes.length) throw new OpError("Invalid size");

      const bound = await prisma.barcode.findMany({ where: { itemId: it.id }, select: { sizeIndex: true } });
      const has = new Set(bound.map((b) => b.sizeIndex));
      const wanted = it.sizes.map((_, i) => i).filter((i) => !has.has(i) && (only < 0 || i === only));
      if (!wanted.length) {
        throw new OpError(only >= 0 ? "That size already has a barcode." : "Every size on this garment already has a barcode.");
      }

      const made: { si: number; size: string; code: string }[] = [];
      await prisma.$transaction(async (tx) => {
        for (const si of wanted) {
          // Walk forward past anything already taken rather than failing the whole run: one
          // collision should cost a number, not the rack somebody is standing in front of.
          let code = "";
          for (let tries = 0; tries < 50 && !code; tries++) {
            const f = await tx.facility.update({ where: { id: fid }, data: { barcodeSeq: { increment: 1 } }, select: { barcodeSeq: true } });
            const candidate = inHouseEan13(f.barcodeSeq);
            const clash = await tx.barcode.findUnique({ where: { facilityId_code: { facilityId: fid, code: candidate } }, select: { id: true } });
            if (!clash) code = candidate;
          }
          if (!code) throw new OpError("Couldn't find a free number — tell whoever looks after this.");
          await tx.barcode.create({ data: { facilityId: fid, code, itemId: it.id, sizeIndex: si, source: "generated" } });
          made.push({ si, size: String(it.sizes[si] ?? si), code });
        }
      });
      return { ok: true, made, count: made.length };
    }
    case "barcode.unbind": {
      admin(user);
      await prisma.barcode.deleteMany({ where: { facilityId: fid, code: str(p.code, 64).trim() } });
      return { ok: true };
    }

    // ---------- stock levels
    case "stock.reorder": {
      admin(user);
      const it = await ownItem(prisma, fid, str(p.itemId));
      const si = int(p.si, -1);
      if (si < 0 || si >= it.sizes.length) throw new OpError("Invalid size");
      await upsertLevel(prisma, fid, it.id, si, { reorder: Math.max(0, int(p.reorder)) });
      return { ok: true };
    }
    case "stock.moves": {
      const mode = str(p.mode);
      if (!["Set", "Receive", "Adjust", "Opening", "Pre-loved"].includes(mode)) throw new OpError("Bad mode");
      if (mode === "Opening" || mode === "Adjust" || mode === "Set") admin(user); // write-offs and corrections are an Admin call; Issuers receive and count
      if (mode === "Pre-loved" && (Array.isArray(p.lines) ? p.lines : []).some((l: { qty?: unknown }) => int(l?.qty) < 0)) admin(user);
      const lines = Array.isArray(p.lines) ? p.lines : [];
      if (!lines.length) throw new OpError("No lines");
      await lockedTx(fid, async (tx) => {
        // "Set" is the counted figure, not a movement: work out the difference against on-hand read
        // through this transaction, and record that difference so the ledger still explains itself.
        const snap = mode === "Set" ? await buildSnapshot(user, tx) : null;
        const L = snap ? ledger(snap) : null;
        for (const l of lines) {
          const it = await ownItem(tx, fid, str(l.itemId));
          const si = int(l.si, -1);
          if (si < 0 || si >= it.sizes.length) throw new OpError("Invalid size");
          const qty = int(l.qty);
          if (mode === "Set") {
            if (qty < 0) throw new OpError("A counted quantity can't be negative");
            const have = onhand(snap!, L!, key(it.id, si));
            const delta = qty - have;
            if (delta === 0) continue;
            await tx.stockMove.create({ data: { facilityId: fid, date: today, type: "adjust", itemId: it.id, sizeIndex: si, qty: delta, reason: str(p.reason, 120) || "Counted correction", byName } });
          }
          else if (mode === "Opening") await upsertLevel(tx, fid, it.id, si, { opening: Math.max(0, qty) });
          else if (mode === "Pre-loved") { if (qty !== 0) await poolAdd(tx, fid, it.id, si, qty); }
          else {
            if (qty === 0) continue;
            await tx.stockMove.create({ data: { facilityId: fid, date: today, type: mode.toLowerCase(), itemId: it.id, sizeIndex: si, qty: mode === "Receive" ? Math.abs(qty) : qty, reason: mode === "Receive" ? "Received without order" : str(p.reason, 120) || "Correction", byName } });
          }
        }
      });
      return { ok: true };
    }
    case "stock.orderFlagged": {
      const snap = await buildSnapshot(user);
      const L = ledger(snap);
      const byId = Object.fromEntries(snap.catalog.map((i) => [i.id, i]));
      const needs = flaggedNeeds(snap, L, byId);
      const bySup: Record<string, typeof needs> = {};
      for (const c of needs) (bySup[c.supplier] = bySup[c.supplier] || []).push(c);
      let added = 0;
      await lockedTx(fid, async (tx) => {
        for (const sup in bySup) added += await mergeReplenish(tx, fid, today, sup, bySup[sup].map((c) => ({ itemId: c.itemId, size: c.size, qty: c.qty })), "max", "Reorder — at or below reorder level");
      });
      return { added };
    }

    // ---------- departments & staff
    case "dept.save": {
      admin(user);
      const name = str(p.name, 120).trim(); if (!name) throw new OpError("Department name required");
      if (p.id) {
        const d = await prisma.department.findFirst({ where: { id: str(p.id), facilityId: fid } }); if (!d) throw new OpError("Unknown department", 404);
        // A rename has to clear the same name check a new department does, and for a worse reason.
        // Departments are matched by name further down — staff carry the name, so do orders' cost
        // centres — so renaming Theatres to Emergency doesn't collide, it merges: two wards' staff end
        // up under one entry and nothing on the screen says which of them started where. The list on
        // the settings screen was the only thing stopping it, and a list in a browser stops nothing.
        const clash = await prisma.department.findFirst({ where: { facilityId: fid, name: { equals: name, mode: "insensitive" }, NOT: { id: d.id } } });
        if (clash) throw new OpError("That department is already on the list");
        await prisma.$transaction(async (tx) => {
          await tx.department.update({ where: { id: d.id }, data: { name, cc: str(p.cc, 40).trim() } });
          if (d.name !== name) { await tx.staff.updateMany({ where: { facilityId: fid, dept: d.name }, data: { dept: name } }); await tx.order.updateMany({ where: { facilityId: fid, cc: d.name }, data: { cc: name } }); }
        });
      }
      else {
        const dup = await prisma.department.findFirst({ where: { facilityId: fid, name: { equals: name, mode: "insensitive" } } });
        if (dup) throw new OpError("That department is already on the list");
        const count = await prisma.department.count({ where: { facilityId: fid } });
        await prisma.department.create({ data: { facilityId: fid, name, cc: str(p.cc, 40).trim(), sort: count } });
      }
      return { ok: true };
    }
    case "dept.delete": {
      admin(user);
      const d = await prisma.department.findFirst({ where: { id: str(p.id), facilityId: fid } }); if (!d) throw new OpError("Unknown department", 404);
      const n = await prisma.staff.count({ where: { facilityId: fid, dept: d.name } });
      if (n) throw new OpError("Departments with staff assigned can't be removed.");
      await prisma.department.delete({ where: { id: d.id } });
      return { ok: true };
    }
    case "staff.save": {
      admin(user);
      const numv = str(p.num, 40).trim(), first = str(p.first, 80).trim(), last = str(p.last, 80).trim();
      if (!numv || !first || !last) throw new OpError("Staff number, first and last name are required");
      // FTE is left alone unless this call actually carries one. It has its own control on the
      // profile, which saves through staff.patch the moment it changes, so the details form doesn't
      // send it — and blanking it here would wipe the FTE every time somebody corrected a phone
      // number, taking the nurse's initial kit with it.
      const fte = normalFte(p.fte);
      if (fte === null) throw new OpError(`FTE has to be ${FTE_ALLOWED} — leave it blank if nobody has recorded one`);
      // Uniform style is left alone unless the call carries one, for the same reason FTE is. It is a
      // coordinator's decision about which cut somebody wears, and quietly clearing it every time a
      // phone number was corrected would put that person back to "nobody has said" — offered the
      // whole catalogue again — with nothing on the screen to say it had happened.
      const style = normalUniformStyle(p.uniformStyle);
      if (style === null) throw new OpError(STYLE_REFUSAL);
      const data = { num: numv, first, last, phone: str(p.phone, 40).trim(), group: str(p.group, 80), dept: str(p.dept, 120), top: str(p.top, 20), pants: str(p.pants, 20), ccOverride: str(p.ccOverride, 40).trim(), ent: p.ent === "" || p.ent === null || p.ent === undefined ? null : Math.max(0, int(p.ent)), start: dateField(p.start, "", "Start date"), notes: str(p.notes, 2000), ...(p.fte === undefined ? {} : { fte }), ...(p.uniformStyle === undefined ? {} : { uniformStyle: style }) };
      if (p.id) {
        const ex = await ownStaff(prisma, fid, str(p.id));
        if (ex.num !== numv) throw new OpError("Staff number can't be changed — issue history and reports are keyed to it.");
        await prisma.staff.update({ where: { id: ex.id }, data }); return { id: ex.id };
      }
      const dup = await prisma.staff.findFirst({ where: { facilityId: fid, num: numv } });
      if (dup) throw new OpError(`Staff number ${numv} is already on the register (${dup.first} ${dup.last})`);
      const s = await prisma.staff.create({ data: { facilityId: fid, ...data } });
      return { id: s.id };
    }
    case "staff.patch": {
      // Small field updates that don't require the whole record (notes, inactive, ccOverride,
      // and the two staff-app fields).
      admin(user);
      const s = await ownStaff(prisma, fid, str(p.id));
      const data: Prisma.StaffUpdateInput = {};
      if (p.notes !== undefined) data.notes = str(p.notes, 2000);
      if (p.fte !== undefined) {
        // Stored as the fraction it is, whether or not the picker offers that step: 0.75 is a real
        // roster figure and the table reads it as the band it falls in. What is refused is an entry
        // that is no fraction at all — "full time", "N/A" — because the table proposes no kit for
        // that, and a proposal silently missing is indistinguishable, on the screen, from a person
        // the table genuinely has no number for. Blank is allowed and means what it has always
        // meant: nobody has recorded one yet.
        const f = normalFte(p.fte);
        if (f === null) throw new OpError(`FTE has to be ${FTE_ALLOWED} — leave it blank if nobody has recorded one`);
        data.fte = f;
      }
      if (p.uniformStyle !== undefined) {
        // Blank is an answer here, and the one every record starts with: nobody has said which cut
        // this person wears, so the counter and the staff app offer them every style exactly as
        // "Either" does. Setting it back to blank is therefore allowed — a coordinator who ticked
        // the wrong one has to be able to undo it — while a word the rule doesn't know is refused
        // rather than stored, because a style nothing recognises would silently offer everything.
        const styleIn = normalUniformStyle(p.uniformStyle);
        if (styleIn === null) throw new OpError(STYLE_REFUSAL);
        data.uniformStyle = styleIn;
      }
      if (p.inactive !== undefined) {
        // Taking somebody off the register when other people still name them as their approver
        // strands every one of those people: request.create refuses to address a deactivated
        // manager ("The recorded manager is no longer on the register"), and the wearer has no way
        // to see why or to change it. Line 504 already refuses to *set* an inactive manager; this
        // is the same rule read from the other end, and it is refused here where the coordinator
        // is holding the staff list and can move the reports first.
        if (p.inactive && !s.inactive) {
          // Not counting themselves: somebody who is their own manager names nobody else, and
          // nobody is stranded by taking them off the register.
          const reports = await prisma.staff.count({ where: { facilityId: fid, managerId: s.id, inactive: false, id: { not: s.id } } });
          if (reports) {
            throw new OpError(`${reports} ${reports === 1 ? "person still names" : "people still name"} ${s.first} as their manager, and a request can't be sent to somebody who is off the register. Give them a new manager first.`);
          }
        }
        data.inactive = !!p.inactive;
      }
      // Whether this call is the moment they come off the register, read before the write so their
      // waiting requests can be closed in the same transaction (below).
      const closing = p.inactive !== undefined && !!p.inactive && !s.inactive;
      if (p.ccOverride !== undefined) data.ccOverride = str(p.ccOverride, 40).trim();
      if (p.wardDesk !== undefined) data.wardDesk = !!p.wardDesk;
      if (p.managerId !== undefined) {
        const mid = str(p.managerId);
        if (!mid) data.manager = { disconnect: true };
        else {
          // Anybody may be their own manager — the owner's decision. On a facility where one person
          // is the whole register there is nobody else to put here, and the staff app refuses every
          // request from somebody with no manager set. What that asks of the record is answered
          // where the approvals are made: every request or signed form a person approves for
          // themselves is marked on it as a self-approval, so none of it passes unseen. A raise
          // they make for somebody else still never lands back on them (lib/staffops.ts).
          const m = mid === s.id ? s : await ownStaff(prisma, fid, mid);
          if (m.inactive) throw new OpError("That manager is no longer active on the register.");
          data.manager = { connect: { id: m.id } };
        }
      }
      let closed = 0;
      await prisma.$transaction(async (tx) => {
        await tx.staff.update({ where: { id: s.id }, data });
        if (!closing) return;
        /* Their phones go with their access. A deactivation deletes no rows, so nothing cascades
         * here the way it does when an account or a staff record is removed — and a phone left in
         * a drawer on the ward would go on showing this person's notifications on its lock screen
         * after they came off the register. */
        await tx.staffDevice.deleteMany({ where: { staffId: s.id } });
        // A request still waiting on a manager outlives the person who raised it. The manager's
        // home screen counts it every day from here on and the approvals queue keeps showing a
        // live Approve bar, but both buttons are refused with "That person is no longer on the
        // register" — and there is no op on the ward side that can clear it, so it sits there
        // forever unless a coordinator happens to spot it and withdraw it. Deactivation is the
        // moment somebody is actually looking at the right screen, so it closes them here.
        const open = await tx.request.findMany({ where: { facilityId: fid, subjectId: s.id, status: "awaiting" }, select: { id: true } });
        if (!open.length) return;
        const why = `${s.first} ${s.last}`.trim() + " is no longer on the register";
        for (const { id } of open) {
          // Each one is re-checked as it is written, the way request.withdraw does. A manager
          // sitting on the approvals screen can answer a request in the moment between the read
          // above and this write, and blindly declining it would bury an approval she has already
          // been told landed — with the garments then never picked for a ward that is expecting them.
          const moved = await tx.request.updateMany({ where: { id, status: "awaiting" }, data: { status: "declined", decidedAt: new Date(), declineReason: why } });
          if (!moved.count) continue;
          // The lines are settled in the same breath as the request, as a withdrawal does: garments
          // left at "awaiting approval" under a closed request tell the ward two different things.
          await tx.requestLine.updateMany({ where: { requestId: id }, data: { status: "declined", declineReason: why } });
          await tx.requestEvent.create({ data: { requestId: id, label: "Closed — the wearer came off the register", meta: why, actorName: byName } });
          closed++;
        }
      });
      return { ok: true, closedRequests: closed };
    }
    case "staff.delete": {
      admin(user);
      const s = await ownStaff(prisma, fid, str(p.id));
      // Everything below cascades from the Staff row, so the guard has to name everything, not
      // just the two tables it started with. A staff member with signed manager approvals, a hand-in,
      // a live request or a claimed staff-app account was being deleted silently and taking all
      // of it with her — including requests the linen room was part-way through fulfilling.
      const [issues, orders, approvals, alterations, handins, requests, raised, waitlist, kitAnswers, damage, disputes, account] = await Promise.all([
        prisma.issue.count({ where: { staffId: s.id } }),
        prisma.order.count({ where: { staffId: s.id } }),
        prisma.approval.count({ where: { staffId: s.id } }),
        prisma.alteration.count({ where: { staffId: s.id } }),
        prisma.handIn.count({ where: { staffId: s.id } }),
        prisma.request.count({ where: { subjectId: s.id } }),
        prisma.request.count({ where: { raisedByStaffId: s.id } }),
        prisma.waitlistEntry.count({ where: { staffId: s.id } }),
        prisma.kitCheckAnswer.count({ where: { staffId: s.id } }),
        prisma.damageReport.count({ where: { staffId: s.id } }),
        prisma.recordDispute.count({ where: { staffId: s.id } }),
        prisma.staffAccount.count({ where: { staffId: s.id } }),
      ]);
      const held: string[] = [];
      const note = (n: number, what: string) => { if (n) held.push(`${n} ${what}${n === 1 ? "" : "s"}`); };
      note(issues, "issue"); note(orders, "order"); note(approvals, "manager approval"); note(alterations, "alteration");
      note(handins, "hand-in"); note(requests + raised, "request"); note(waitlist, "waitlist place");
      note(kitAnswers, "kit-check answer"); note(damage, "damage report"); note(disputes, "query");
      if (account) held.push("a staff-app account");
      if (held.length) throw new OpError(`This staff member has history on file (${held.join(", ")}) — deactivate them instead, so the records keep resolving.`);
      await prisma.staff.delete({ where: { id: s.id } });
      return { ok: true };
    }

    // ---------- staff self-service: the code that lets a person claim their own read-only view
    case "staff.selfCode": {
      admin(user);
      const s = await ownStaff(prisma, fid, str(p.id));
      const linked = await prisma.staffAccount.findUnique({ where: { staffId: s.id }, select: { email: true } });
      if (linked) throw new OpError(`${s.first} already has an account (${linked.email}). Remove it first if they need to start again.`);
      // Retry on the vanishingly unlikely collision rather than handing back a confusing error.
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newActivateCode();
        try {
          // The date is stamped with the code, not merely alongside it: a slip is a bearer token
          // on paper, and the activation route refuses one printed more than a fortnight ago. A
          // code written without its date is refused as stale on the day it is handed over.
          await prisma.staff.update({ where: { id: s.id }, data: { activateCode: code, activateCodeAt: new Date() } });
          return { code, name: `${s.first} ${s.last}` };
        } catch (e) {
          if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") throw e;
        }
      }
      throw new OpError("Couldn't generate a code — try again.", 500);
    }
    case "staff.selfClear": {
      admin(user);
      const s = await ownStaff(prisma, fid, str(p.id));
      // The date goes with the code. Left behind, it would outlive the slip it describes and the
      // register would go on reporting an outstanding code that nobody can use.
      await prisma.staff.update({ where: { id: s.id }, data: { activateCode: null, activateCodeAt: null } });
      return { ok: true };
    }
    case "staff.selfUnlink": {
      admin(user);
      const s = await ownStaff(prisma, fid, str(p.id));
      // Deleting the account ends every session it had: currentStaff() looks the row up on each
      // request, so there is no token left to expire.
      await prisma.staffAccount.deleteMany({ where: { staffId: s.id, facilityId: fid } });
      await prisma.staff.update({ where: { id: s.id }, data: { activateCode: null, activateCodeAt: null } });
      return { ok: true };
    }

    /* ---------- staff-app requests: the linen room's half of the state machine
     *
     * The manager's half lives in lib/staffops.ts and is not reachable from here. A coordinator
     * cannot approve a request on a manager's behalf — that would make the approval a formality,
     * and the approval is the entire control for clinical staff.
     */
    case "request.pick":
    case "request.hold":
    case "request.round":
    case "request.collected": {
      const r = await prisma.request.findFirst({
        where: { id: str(p.id), facilityId: fid },
        include: {
          lines: { include: { item: { select: { item: true, gender: true, sizes: true } } }, orderBy: { sort: "asc" } },
          subject: { select: { first: true, last: true, dept: true } },
        },
      });
      if (!r) throw new OpError("No such request", 404);
      const to = op === "request.pick" ? "picking" : op === "request.hold" ? "ready" : op === "request.round" ? "round" : "collected";
      if (!canMove(r.status, to)) {
        throw new OpError(`A request that is "${r.status}" can't move to "${to}".`);
      }

      const data: Prisma.RequestUpdateInput = { status: to };
      let label = "", meta = "";
      if (to === "picking") { label = "Being picked"; meta = str(p.where, 60) || "In the linen room"; }
      if (to === "ready") {
        // The requester never chooses counter versus ward round — the linen room does, and the
        // requester finds out after the fact. Both branches therefore set `route` here.
        data.route = "counter";
        data.holdUntil = str(p.holdUntil, 40);
        // The code itself is picked below, inside the lock, against the bags already waiting.
        label = "Ready at the counter";
        meta = data.holdUntil ? `Held until ${data.holdUntil}` : "Held at the counter";
      }
      if (to === "round") {
        // The round delivers to a ward, so a wearer with no ward recorded has nowhere for the bag
        // to go. Left to the count below, a blank ward would have matched every ward-less desk
        // clerk in the facility and the bag would have gone out to whichever of them happened to
        // open /my/round. The counter is the only honest answer until somebody fills the ward in.
        if (!r.subject.dept) throw new OpError(`${r.subject.first} has no ward recorded, so there is no round to send this on. Hold it at the counter, or record their ward on the staff register first.`);
        // Only a ward-desk account can sign a round bag off (round → delivered lives in
        // lib/staffops.ts and /my/round, which 404s for anyone without the flag). A ward with
        // nobody like that has no way to finish the round, so the bag would be handed over on the
        // floor and the request would sit in the linen room's open queue for ever. Refuse here,
        // where the coordinator still has the counter to fall back on.
        const signers = await prisma.staff.count({ where: { facilityId: fid, dept: r.subject.dept, wardDesk: true, inactive: false, account: { isNot: null } } });
        if (!signers) throw new OpError(`Nobody on ${r.subject.dept} can sign for a round bag — that needs somebody with the ward-desk flag and their own staff-app account. Hold it at the counter instead, or set the flag on their staff record first.`);
        data.route = "ward_round"; label = "Out on the ward round"; meta = r.subject.dept ? `Due on ${r.subject.dept}` : "On today's round";
      }
      if (to === "collected") { label = "Collected"; meta = r.collectCode ? `Code ${r.collectCode}` : "At the counter"; }

      // Conditional on the status we read, so two coordinators on two phones can't both move it.
      const move = async (db: Tx | typeof prisma) => {
        const moved = await db.request.updateMany({ where: { id: r.id, status: r.status }, data: data as Prisma.RequestUpdateManyMutationInput });
        if (moved.count !== 1) throw new OpError("Somebody else moved that request just now — reopen it.");
        await db.requestEvent.create({ data: { requestId: r.id, label, meta, actorName: byName } });
      };
      // Handing the garment over is the moment it leaves the shelf, so that branch goes through
      // handOverRequestStock — the shelf re-check, the Issue and the replenishment line, shared
      // with the ward round so the two routes cannot drift apart. Every other transition is a
      // status change and nothing more.
      if (to === "collected") {
        // The counter phone signs the hand-over, and may send the slip to the wearer's staff app.
        const sigId = await ownPhoto(prisma, fid, p.sigId);
        const hasAccount = sigId && p.slip ? !!(await prisma.staffAccount.findUnique({ where: { staffId: r.subjectId }, select: { id: true } })) : false;
        await handOverRequestStock(fid, today, r, move, "counter", sigId ? { sigId, toStaff: !!p.slip && hasAccount, byName } : undefined);
      }
      else if (to === "ready") {
        /* The collection code has to be unique among the bags it will sit next to, which means
         * reading the codes already out there and writing this one without another counter action
         * getting in between — two coordinators holding two bags a second apart would otherwise
         * both see the same free number and both take it. lockedTx is the facility-wide serialiser
         * that already stops two counter actions passing the same shelf check; this is the same
         * shape of check, so it uses the same lock rather than a second mechanism.
         *
         * "Could be confused with each other" is the bags still waiting at the counter: a request
         * that has been collected has gone home with somebody, and its code is free again. */
        await lockedTx(fid, async (tx) => {
          const waiting = await tx.request.findMany({
            where: { facilityId: fid, status: "ready", collectCode: { not: null }, id: { not: r.id } },
            select: { collectCode: true },
          });
          const code = collectionCode(new Set(waiting.map((w) => w.collectCode).filter((c): c is string => c !== null)));
          if (!code) throw new OpError("Couldn't find a collection code that isn't already on a bag at the counter — hand some of the waiting bags over first.", 500);
          data.collectCode = code;
          await move(tx);
        });
      } else await move(prisma);

      const acct = await prisma.staffAccount.findUnique({ where: { staffId: r.subjectId }, select: { email: true } });
      if (acct?.email && transactionalConfigured() && (to === "ready" || to === "round")) {
        const fresh = await prisma.request.findUniqueOrThrow({ where: { id: r.id }, select: { collectCode: true, holdUntil: true } });
        // The bag holds what the manager approved and nothing else, so a declined line stays off
        // this email as it stays off the pick list — being told a fleece is ready to collect and
        // then not finding one in the bag is worse than never hearing about it.
        const noteLines = approvedLines(r.lines).map((l) => ({ qty: l.qty, item: l.item.item, size: String(l.item.sizes[l.sizeIndex] ?? l.sizeIndex) }));
        // The words live in lib/approvallink.ts (readyEmail / roundEmail) so the preview renders
        // the real thing; the collection code and hold-until ride along as their own slots.
        const em = to === "ready"
          ? readyEmail({ first: r.subject.first, code: r.code, lines: noteLines, collectCode: fresh.collectCode, holdUntil: fresh.holdUntil, foot: signOff() })
          : roundEmail({ first: r.subject.first, code: r.code, lines: noteLines, dept: r.subject.dept, foot: signOff() });
        void sendTo(acct.email, em.subject, em.text, em.html).catch((e) => console.error("[request mail]", (e as Error).message));
      }
      /* ⛔ OUTSIDE the mail block above, on purpose. That block is gated on the wearer having an
       * email address and on this server having SMTP configured; a notification written inside it
       * would never fire in a self-hosted room with no mail set up — which is exactly the room
       * that most needs a phone to be told, and a bug that would never show up in testing here.
       * The sender does the rest: it reads the request, honours the person's switches, and keeps
       * the collection code out of the text. */
      if (to === "ready") notifyReady(r.id);
      if (to === "round") notifyOnRound(r.id);
      return { ok: true, status: to };
    }

    case "request.raise": {
      // The counter raising on somebody's behalf — the same job a manager does in 2C, for the
      // person who walks in without a phone. It still goes to *their* manager: a coordinator who
      // could approve as well as raise would make the approval a formality.
      const staff = await ownStaff(prisma, fid, str(p.staffId));
      if (staff.inactive) throw new OpError("This staff member is inactive — reactivate them first");
      if (!staff.managerId) throw new OpError(`${staff.first} has no manager recorded, so there is nobody to approve this. Set one on their staff record first.`);
      // Off the register means off the register: a deactivated manager cannot sign in to approve
      // anything, so addressing a request to one parks it where nobody can reach it — and it would
      // mint an approval link that outlives their access by a fortnight.
      const manager = await prisma.staff.findFirst({ where: { id: staff.managerId, facilityId: fid, inactive: false } });
      if (!manager) throw new OpError("The recorded manager is no longer on the register.");
      const lines = await readRequestLines(fid, p.lines);
      // The same rule request.create applies in the staff app: only their own staff group's
      // garments, plus those for every group. The hand-over trusts it (handOverRequestStock), so the
      // counter's door has to ask it too, or a raise here is the way round it.
      const off = await offGroupGarments(fid, staff.group, lines.map((l) => l.itemId));
      if (off.length) throw new OpError(offGroupElsewhere(staff, off, "request"));
      // And the same for the cut they are offered. Blank — nobody has said which cut this person
      // wears — and Either take every garment, so this refuses nothing that was allowed before a
      // coordinator set the field.
      const offStyle = await offStyleGarments(fid, staff.uniformStyle, lines.map((l) => l.itemId));
      if (offStyle.length) throw new OpError(offStyleElsewhere(staff, offStyle, "request"));

      const created = await prisma.$transaction(async (tx) => {
        const f = await tx.facility.update({ where: { id: fid }, data: { requestSeq: { increment: 1 } }, select: { requestSeq: true } });
        const req = await tx.request.create({
          data: {
            facilityId: fid, code: requestCode(f.requestSeq), subjectId: staff.id,
            raisedByUserId: user.id, raisedByName: byName,
            reason: str(p.reason, 40), note: str(p.note, 400),
            status: "awaiting", managerId: manager.id, managerName: `${manager.first} ${manager.last}`.trim(),
            lines: { create: lines.map((l, i) => ({ itemId: l.itemId, sizeIndex: l.sizeIndex, qty: l.qty, sort: i })) },
          },
        });
        await tx.requestEvent.create({ data: { requestId: req.id, label: "Requested", meta: `Raised at the counter by ${byName}`, actorName: byName } });
        return req;
      });

      const mgrAccount = await prisma.staffAccount.findUnique({ where: { staffId: manager.id }, select: { email: true } });
      // `notified` says an email actually went out, not that the manager happens to have an
      // account: the send below is gated on transactional mail being configured as well, and a
      // counter that says "we've told them" when nothing was sent is the reason a request sits for
      // three weeks with nobody chasing it.
      const mgrEmail = mgrAccount?.email || "";
      const notified = !!mgrEmail && transactionalConfigured();
      if (notified) {
        const em = approvalEmail({
          managerFirst: manager.first, subjectName: `${staff.first} ${staff.last}`.trim(), raisedByName: byName,
          lines, reason: str(p.reason, 40), note: str(p.note, 400),
          url: approvalUrl(signApprovalToken(created.id, manager.id)),
          facility: fac.name,
        });
        void sendTo(mgrEmail, em.subject, em.text, em.html).catch((e) => console.error("[raise mail]", (e as Error).message));
      }
      // Outside the mail's condition, for the reason set out on request.hold above.
      notifyWaiting(created.id);
      return { id: created.id, code: created.code, manager: `${manager.first} ${manager.last}`.trim(), notified };
    }

    case "request.reply": {
      const r = await prisma.request.findFirst({ where: { id: str(p.id), facilityId: fid } });
      if (!r) throw new OpError("No such request", 404);
      const body = str(p.body, 2000).trim();
      if (!body) throw new OpError("Write something first");
      const m = await prisma.requestMessage.create({
        data: { requestId: r.id, fromStaff: false, authorName: byName, body },
      });
      return { id: m.id };
    }

    case "damage.handedIn": {
      // The counter-side half of the staff app's damage.report. The Damage screen tells the wearer
      // "the damaged item comes off your record when you hand it in at the counter", and this is
      // the hand that does it — a coordinator op, because it is the linen room that has the
      // garment in front of them, not the person who reported it.
      const d = await prisma.damageReport.findFirst({ where: { id: str(p.id), facilityId: fid } });
      if (!d) throw new OpError("No such damage report", 404);
      if (d.handedInAt) return { ok: true };
      await prisma.damageReport.update({ where: { id: d.id }, data: { handedInAt: new Date() } });
      return { ok: true };
    }

    case "request.withdraw":
    case "request.reassign": {
      // A request addressed to a manager who never claimed a staff-app account, or who has since
      // left, waits for a decision that cannot arrive. Neither the wearer nor the manager can clear
      // it — the wearer has no such op and the manager cannot sign in — so the linen room needs a
      // way out of the dead end: send it to somebody who can decide it, or close it off honestly.
      const r = await prisma.request.findFirst({
        where: { id: str(p.id), facilityId: fid },
        include: {
          subject: { select: { id: true, first: true, last: true } },
          lines: { include: { item: { select: { item: true, gender: true, sizes: true } } }, orderBy: { sort: "asc" } },
        },
      });
      if (!r) throw new OpError("No such request", 404);
      if (r.status !== "awaiting") throw new OpError("That request has already been decided — only one still waiting for a manager can be withdrawn or re-addressed.");
      // Nothing has been decided yet at this point in the flow, so every line is still on the ask:
      // both the withdrawal note and the re-addressed approval email list the whole request.
      const reqLines = r.lines.map((l) => ({ qty: l.qty, item: l.item.item, size: String(l.item.sizes[l.sizeIndex] ?? l.sizeIndex) }));
      const subjAccount = await prisma.staffAccount.findUnique({ where: { staffId: r.subject.id }, select: { email: true } });

      if (op === "request.withdraw") {
        const why = str(p.reason, 120).trim() || "Withdrawn by the linen room";
        // The lines are settled in the same breath as the request. A withdrawal ends the whole ask,
        // so leaving the garments sitting at "awaiting approval" under a request that reads
        // "Declined" would have every screen telling the wearer two different things at once.
        await prisma.$transaction(async (tx) => {
          const moved = await tx.request.updateMany({
            where: { id: r.id, status: "awaiting" },
            data: { status: "declined", decidedAt: new Date(), declineReason: why },
          });
          if (moved.count !== 1) throw new OpError("Somebody else moved that request just now — reopen it.");
          await tx.requestLine.updateMany({ where: { requestId: r.id }, data: { status: "declined", declineReason: why } });
          await tx.requestEvent.create({ data: { requestId: r.id, label: "Withdrawn by the linen room", meta: why, actorName: byName } });
        });
        // Told, and told why. The whole flow's rule is that a request never just goes quiet on the
        // person who raised it, and a withdrawal is the one ending nobody on the ward asked for.
        if (subjAccount?.email && transactionalConfigured()) {
          const em = decisionEmail({
            staffFirst: r.subject.first, managerName: byName, approved: false, reason: why,
            lines: reqLines, facility: fac.name,
          });
          void sendTo(subjAccount.email, em.subject, em.text, em.html).catch((e) => console.error("[withdraw mail]", (e as Error).message));
        }
        return { ok: true, status: "declined" };
      }

      // Re-addressing keeps the request exactly as it was raised and only changes who is being
      // asked. The new approver has to be somebody who can actually answer: on the register, and
      // not the person who raised it for somebody else (below).
      const m = await ownStaff(prisma, fid, str(p.managerId));
      if (m.inactive) throw new OpError("That manager is no longer active on the register.");
      // Handing a request back to the person it is for is allowed — anybody may approve their own
      // (the owner's decision). It is never mistaken later for an ordinary approval: the timeline
      // row below says this one is going back to the wearer, and the decision itself is stamped
      // "Self-approved" in lib/staffops.ts.
      const selfApproval = m.id === r.subject.id;
      // Nor the person who typed it. A manager raising for one of her own reports is exactly why
      // the request escalated and landed on this queue with nobody to approve it — and she is the
      // natural pick in the dropdown, because she IS the wearer's manager on the register, with
      // nothing on the screen to say the ask came from her. Handing it back would let her approve
      // her own raise, and that stands whatever else has been relaxed: a manager may sign for the
      // kit she is going to wear, where everyone can see whose it is, but asking for somebody
      // else's garments and then granting the ask herself is one person doing both halves of a
      // decision the ward is told two people made.
      if (r.raisedByStaffId && m.id === r.raisedByStaffId) throw new OpError(`${m.first} raised this request, so it can't be sent back for ${m.first} to approve. Pick somebody else.`);
      // Sending a request back to the person it is for makes them its approver. That is for somebody set
      // as their own manager — the staff record's Manager box is where a person is made self-approving —
      // and nobody else, or their own app would show them a request it can't let them decide.
      if (m.id === r.subject.id && m.managerId !== m.id) throw new OpError(`${m.first} isn't set as their own manager, so this can't be sent to them to approve. Set them as their own manager on their staff record, or pick somebody else.`);
      const mgrName = `${m.first} ${m.last}`.trim();
      const moved = await prisma.request.updateMany({
        where: { id: r.id, status: "awaiting" },
        data: { managerId: m.id, managerName: mgrName },
      });
      if (moved.count !== 1) throw new OpError("Somebody else moved that request just now — reopen it.");
      // Who changed it, and — when it has gone back to the wearer — that it is now theirs to
      // approve. Somebody reading this request in six months sees where the approval came from
      // before they see the approval itself.
      const how = selfApproval
        ? `Changed at the counter by ${byName} — ${m.first} is the person this request is for, so it will be self-approved`
        : `Changed at the counter by ${byName}`;
      await prisma.requestEvent.create({ data: { requestId: r.id, label: `Re-addressed to ${mgrName}`, meta: how, actorName: byName } });

      const mgrAccount = await prisma.staffAccount.findUnique({ where: { staffId: m.id }, select: { email: true } });
      const mgrEmail = mgrAccount?.email || "";
      const notified = !!mgrEmail && transactionalConfigured();
      if (notified) {
        const em = approvalEmail({
          managerFirst: m.first, subjectName: `${r.subject.first} ${r.subject.last}`.trim(), raisedByName: r.raisedByName,
          lines: reqLines, reason: r.reason, note: r.note,
          url: approvalUrl(signApprovalToken(r.id, m.id)),
          facility: fac.name,
        });
        void sendTo(mgrEmail, em.subject, em.text, em.html).catch((e) => console.error("[reassign mail]", (e as Error).message));
      }
      // The person a request has just been re-addressed to may manage nobody at all — that is one
      // of the two ordinary ways it happens — so this is often the only thing that tells them.
      notifyWaiting(r.id);
      return { ok: true, manager: mgrName, notified };
    }

    case "dispute.resolve": {
      const d = await prisma.recordDispute.findFirst({ where: { id: str(p.id), facilityId: fid } });
      if (!d) throw new OpError("No such query", 404);
      await prisma.recordDispute.update({ where: { id: d.id }, data: { resolvedAt: new Date(), resolvedBy: byName } });
      return { ok: true };
    }

    case "notice.set": {
      admin(user);
      const body = str(p.body, 400).trim();
      // An empty body clears the board rather than posting nothing — the linen room's way of
      // saying "that's over now".
      await prisma.linenNotice.deleteMany({ where: { facilityId: fid } });
      if (body) await prisma.linenNotice.create({ data: { facilityId: fid, body, endsAt: dateField(p.endsAt, "", "The end date") } });
      return { ok: true, cleared: !body };
    }

    case "kitcheck.open": {
      admin(user);
      const open = await prisma.kitCheck.findFirst({ where: { facilityId: fid, closedAt: null } });
      if (open) throw new OpError("A kit check is already running. Close that one first.");
      const k = await prisma.kitCheck.create({ data: { facilityId: fid, dueBy: dateField(p.dueBy, addDays(today, 21), "The due date"), openedBy: byName } });
      // The one notification addressed to a room rather than to a person: everybody who is holding
      // something, and nobody who isn't. The sender counts what it sent and names nobody.
      notifyKitCheck(fid, k.dueBy);
      return { id: k.id };
    }
    case "kitcheck.close": {
      admin(user);
      const k = await prisma.kitCheck.findFirst({ where: { id: str(p.id), facilityId: fid, closedAt: null } });
      if (!k) throw new OpError("No kit check to close", 404);
      await prisma.kitCheck.update({ where: { id: k.id }, data: { closedAt: new Date() } });
      return { ok: true };
    }

    case "waitlist.offer": {
      // Stock landed. Offering starts the 48-hour hold; accepting is the person's own act and
      // raises a request that still needs their manager.
      const w = await prisma.waitlistEntry.findFirst({ where: { id: str(p.id), facilityId: fid, leftAt: null, acceptedAt: null } });
      if (!w) throw new OpError("No such waitlist entry", 404);
      // A place joined before the staff-group rule can be for a garment outside the person's group.
      // Offering it would hold the stock for forty-eight hours for somebody whose acceptance is then
      // refused, so it is refused here, where the linen room can take them off the list instead.
      const wStaff = await prisma.staff.findFirst({ where: { id: w.staffId, facilityId: fid }, select: { first: true, last: true, group: true, uniformStyle: true } });
      const wItem = await prisma.catalogItem.findFirst({ where: { id: w.itemId, facilityId: fid }, select: { item: true, gender: true, groups: true } });
      if (wStaff && wItem && !garmentForGroup(wItem, wStaff.group)) {
        throw new OpError(`${wItem.item} is for ${groupsLabel(wItem.groups)} only — ${wStaff.first} ${wStaff.last} is in ${wStaff.group || "no staff group"}, so they can't take it. Take them off this waitlist instead.`);
      }
      // The same for the cut, and for the same reason: a place joined before the uniform-style rule,
      // or before this person was set to one, ends in a request that is now refused.
      if (wStaff && wItem && !garmentForStyle(wItem, wStaff.uniformStyle)) {
        throw new OpError(`${wItem.item} is the ${genderLabel(wItem.gender)} cut — ${wStaff.first} ${wStaff.last} is set to ${wStaff.uniformStyle}, so they can't take it. Take them off this waitlist instead.`);
      }
      const offeredAt = new Date();
      const heldUntil = holdEndsAt(offeredAt);
      await prisma.waitlistEntry.update({ where: { id: w.id }, data: { offeredAt } });
      const acct = await prisma.staffAccount.findUnique({ where: { staffId: w.staffId }, select: { email: true } });
      const it = await prisma.catalogItem.findUnique({ where: { id: w.itemId }, select: { item: true, sizes: true } });
      if (acct?.email && it && transactionalConfigured()) {
        // The deadline is stated as a date and a time in the linen room's own zone rather than as
        // "48 hours", because a duration in an email is unanswerable by the time it matters: the
        // person behind them in the queue is waiting on this exact moment passing. The hours
        // themselves come from staffreq, where the rule that enforces them lives.
        const until = formatInZone(heldUntil ?? offeredAt, tz, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
        const em = waitlistEmail({ item: it.item, size: String(it.sizes[w.sizeIndex]), until, foot: signOff() });
        void sendTo(acct.email, em.subject, em.text, em.html).catch((e) => console.error("[waitlist mail]", (e as Error).message));
      }
      return { ok: true, heldUntil: heldUntil?.toISOString() ?? null };
    }

    // ---------- Manager approvals & alterations
    case "approval.add": {
      const s = await ownStaff(prisma, fid, str(p.staffId));
      // The FTE this approval was signed against. Taken off the staff record when the form doesn't
      // carry one, because that is where it was typed in from the same paper form. Kept as written
      // even when it is no fraction at all: this is a transcription of something already signed,
      // and refusing it would mean a signed approval that cannot be recorded at all.
      const fteIn = str(p.fte, 10).trim();
      const fte = fteIn ? normalFte(fteIn) ?? fteIn : s.fte;
      // What the table proposes for that FTE — null for a casual, and null when nobody has recorded
      // an FTE at all, which is the same answer for a different reason: the app has no number of
      // its own to offer and must not invent one.
      const proposed = setsForFte(fte);
      const given = p.sets === undefined || p.sets === null || String(p.sets).trim() === "" ? null : int(p.sets);
      const sets = given ?? proposed ?? 0;
      if (sets <= 0) {
        if (given === null) throw new OpError(fte.toLowerCase() === FTE_CASUAL.toLowerCase()
          ? "How many sets? The form leaves a casual's number to the manager, so it has to be the one they signed for."
          : "How many sets? There's no FTE on this staff record for the table to work one out from.");
        throw new OpError("Sets must be at least 1");
      }
      /* Who signed the form. Two ways in, and both have to keep working: the staff screen picks
       * the manager out of the register and sends `byStaffId`, while a restored backup, the demo
       * seeder and any older screen send nothing but the typed name. A name on its own is only a
       * string — finding what a manager had approved meant matching a spelling, and the match
       * broke silently the day she was married, promoted, or entered twice.
       *
       * When both arrive the link wins, and the name is taken off the register row rather than
       * from whatever was typed beside it: a record that links to one person and names another
       * cannot be read either way round, and the person picked is the one the coordinator actually
       * chose. It is still a copy, not a lookup, so the form goes on reading as it was signed even
       * after that manager is renamed or leaves the register.
       *
       * An approver who is not on the register at all — an agency manager, somebody covering for
       * the afternoon — still signs forms, so a typed name with no link stays a complete record. */
      const byStaffId = str(p.byStaffId).trim();
      const approver = byStaffId ? await ownStaff(prisma, fid, byStaffId) : null;
      const by = approver ? `${approver.first} ${approver.last}`.trim() : str(p.by, 120).trim();
      if (!by) throw new OpError("Approved-by (manager) is required");
      // The coordinator may pick the wearer as their own approver while typing the form up —
      // anybody may approve their own kit (the owner's decision). It is recorded as exactly that:
      // staffId === byStaffId, which the staff record reads as "Self-approved" (below).
      // A manager may sign for more than the table proposes — the form itself grants that discretion,
      // and this has never been the place to refuse a decision somebody has already made in ink.
      // But it is recorded, in the one column that survives on the record itself, so that months
      // later the extra set reads as a decision with a name on it rather than as a typo nobody can
      // account for. Written after the manager's own note and never instead of it: their words are the
      // reason, this is only the arithmetic.
      //
      // A casual has no table row — the form hands that number to the manager outright — but it does
      // name 1, 2 or 3, and signing six is as much a departure as six against a table that proposed
      // five. Left unrecorded it was the one case that read, months later, as though nothing out of
      // the ordinary had happened, in exactly the case where somebody exercised the most discretion.
      //
      // The sentence itself is approvalDeparture()'s, in lib/compute, because the staff record
      // previews it while the form is being typed in, and the preview has to be the row it becomes.
      const note = str(p.notes, 400);
      const above = approvalDeparture({ sets, fte, by }) ?? "";
      // A manager signing for her own kit lands here as staffId === byStaffId, and that pair is the
      // whole marking — no flag of its own, because a flag is a second answer that can disagree
      // with the two ids it was summarising. Anything showing an approval reads the pair and says
      // so; the sets themselves are no different for having been self-signed.
      const a = await prisma.approval.create({ data: { facilityId: fid, staffId: s.id, date: dateField(p.date, today, "The approval date"), byName: by, byStaffId: approver?.id ?? null, sets, fte, notes: note && above ? `${note} · ${above}` : note || above, photoId: await ownPhoto(prisma, fid, p.photoId) } });
      return { id: a.id, sets, proposedSets: proposed, by, selfApproved: !!approver && approver.id === s.id };
    }
    case "approval.remove": {
      admin(user);
      const a = await prisma.approval.findFirst({ where: { id: str(p.id), facilityId: fid } }); if (!a) throw new OpError("Unknown approval", 404);
      await prisma.approval.delete({ where: { id: a.id } });
      return { ok: true };
    }
    case "alteration.add": {
      const s = await ownStaff(prisma, fid, str(p.staffId));
      const garment = str(p.garment, 120).trim(); if (!garment) throw new OpError("Garment is required");
      const a = await prisma.alteration.create({ data: { facilityId: fid, staffId: s.id, date: today, garment, desc: str(p.desc, 400).trim() } });
      return { id: a.id };
    }
    case "alteration.advance": {
      const a = await prisma.alteration.findFirst({ where: { id: str(p.id), facilityId: fid } }); if (!a) throw new OpError("Unknown alteration", 404);
      const ni = ALT_FLOW.indexOf(a.status) + 1;
      if (ni < ALT_FLOW.length) await prisma.alteration.update({ where: { id: a.id }, data: { status: ALT_FLOW[ni] } });
      return { ok: true };
    }
    case "alteration.remove": {
      const a = await prisma.alteration.findFirst({ where: { id: str(p.id), facilityId: fid } }); if (!a) throw new OpError("Unknown alteration", 404);
      await prisma.alteration.delete({ where: { id: a.id } });
      return { ok: true };
    }

    // ---------- issuing
    case "issue.create": {
      const staff = await ownStaff(prisma, fid, str(p.staffId));
      if (staff.inactive) throw new OpError("This staff member is inactive — reactivate them on their profile first");
      const cart = Array.isArray(p.lines) ? p.lines : [];
      if (!cart.length) throw new OpError("Nothing to issue");
      const snap = await buildSnapshot(user);
      const L = ledger(snap);
      const byId = Object.fromEntries(snap.catalog.map((i) => [i.id, i]));
      const stockLines: { itemId: string; si: number; qty: number; reason: string; idx: number }[] = [], orderLines: { itemId: string; si: number; qty: number; supplier: string }[] = [], plLines: { itemId: string; si: number; qty: number; reason: string; idx: number }[] = [];
      /** Every line in the order it was sent, for the per-line flags the phone reasons against. */
      const sent: { itemId: string; si: number; qty: number; reason: string }[] = [];
      for (const c of cart) {
        const it = byId[str(c.itemId)]; const si = int(c.si, -1); const qty = int(c.qty);
        if (!it || si < 0 || si >= it.sizes.length || qty <= 0) throw new OpError("Invalid cart line");
        if (it.archived) throw new OpError(`${it.item} is discontinued`);
        const reason = str(c.reason, 40);
        if (reason && !(OVERRIDE_REASONS as readonly string[]).includes(reason)) throw new OpError("Pick a reason from the list");
        const idx = sent.length;
        sent.push({ itemId: it.id, si, qty, reason });
        // Order-in supplier always comes from the product's catalogue record.
        if (c.src === "order") orderLines.push({ itemId: it.id, si, qty, supplier: it.supplier || (snap.settings.suppliers[0] || "Supplier") });
        else if (c.src === "preloved") plLines.push({ itemId: it.id, si, qty, reason, idx });
        else stockLines.push({ itemId: it.id, si, qty, reason, idx });
      }
      /* Reasons for the override. The counter phone sends one per flagged line (lineReasons) and they
       * are checked against issueLineFlags() inside the lock; the desktop may send one for the cart
       * (overrideReason). Either lands on the rows' overrideReason beside override/offGroup/offStyle. */
      const lineReasons = p.lineReasons === true;
      const cartReason = str(p.overrideReason, 40);
      if (cartReason && !(OVERRIDE_REASONS as readonly string[]).includes(cartReason)) throw new OpError("Pick a reason from the list");
      // A signature drawn on the phone: a Slip, and the rows marked signed. Sent to the staff app only
      // when asked and when they have an account to see it in.
      const sigId = await ownPhoto(prisma, fid, p.sigId);
      const slipToStaff = !!sigId && !!p.slip && !!(await prisma.staffAccount.findUnique({ where: { staffId: staff.id }, select: { id: true } }));
      // Pre-loved lines draw from the pool (cumulative per variant), free and uncounted.
      const plWanted: Record<string, number> = {};
      for (const c of plLines) plWanted[key(c.itemId, c.si)] = (plWanted[key(c.itemId, c.si)] || 0) + c.qty;
      for (const k in plWanted) if (plWanted[k] > plOf(snap, k)) { const it = byId[k.slice(0, k.lastIndexOf(":"))]; throw new OpError(`Not enough pre-loved ${it?.item} ${it?.sizes[+k.slice(k.lastIndexOf(":") + 1)]} in the pool`); }
      // Shelf check is cumulative per variant (two cart lines for the same size can't each pass alone).
      const wanted: Record<string, number> = {};
      for (const c of stockLines) wanted[key(c.itemId, c.si)] = (wanted[key(c.itemId, c.si)] || 0) + c.qty;
      for (const k in wanted) if (wanted[k] > onhand(snap, L, k)) { const it = byId[k.slice(0, k.lastIndexOf(":"))]; throw new OpError(`Not enough on the shelf for ${it?.item} ${it?.sizes[+k.slice(k.lastIndexOf(":") + 1)]}`); }
      // The ceiling is enforced here and not only in the UI: six sets is the most anyone holds, and
      // past it an issue needs an explicit coordinator override.
      //
      // Six sets at any time, for every group, nursing included — what somebody has on their back and
      // in their locker, not an allowance that starts again in July. So the whole sum is what they
      // have out now plus what is in the bag, there is no date in it, and capCheck() in lib/compute is
      // the one place it is worked out, so the counter screen's warning and this refusal cannot drift
      // apart. The starting kit has stopped being a term in it: a new starter holds nothing and takes
      // three sets, three is inside six, and the head-room that used to be added for them existed only
      // to stop this line turning their own record into an override.
      //
      // The whole cart goes in. Pre-loved lines are free and draw no approval, but six pre-loved tops
      // fill a locker exactly as six new ones do, and leaving them out would make a pre-loved sixth
      // set the way round the ceiling.
      //
      // Garments ordered in count on both sides of the sum. The ones in this cart are added to it; the
      // ones already committed to this person — on an order, waiting at the counter, or approved in a
      // bag nobody has collected — are part of what heldGarments() says they hold. Nothing asks the
      // ceiling again when any of those is handed over, so this is the one moment they are measured:
      // counted only on the day they land, somebody holding nothing could order six sets in today and
      // six more tomorrow, and both carts would pass. The approved bags live outside the snapshot, so
      // they are read in here.
      snap.owedRequestLines = await owedRequestLines(prisma, fid, staff.id);
      const cartLines = [...stockLines, ...plLines, ...orderLines].map((c) => ({ itemId: c.itemId, qty: c.qty }));
      const staffRec = snap.staff.find((x) => x.id === staff.id)!;
      // Somebody is handed their own staff group's garments, plus anything for every group — and, of
      // those, the cut they are offered: the men's range for somebody set to Men's, the women's for
      // Women's, the unisex range for everybody, and the whole catalogue for somebody set to Either or
      // whom nobody has decided yet. Anything else — stock, pre-loved or ordered in — needs the
      // coordinator's override, and is recorded as offGroup or offStyle rather than as `override`,
      // which stays the six-set ceiling's and nothing else's.
      const cartItemIds = [...new Set(cartLines.map((c) => c.itemId))];
      const offGroupOf = (catalog: readonly { id: string; item: string; groups: string[] }[], group: string) =>
        cartItemIds.map((id) => catalog.find((i) => i.id === id)).filter((it): it is NonNullable<typeof it> => !!it && !garmentForGroup(it, group));
      const offStyleOf = (catalog: readonly { id: string; item: string; gender: string }[], style: string) =>
        cartItemIds.map((id) => catalog.find((i) => i.id === id)).filter((it): it is NonNullable<typeof it> => !!it && !garmentForStyle(it, style));
      const offGroup = offGroupOf(snap.catalog, staffRec.group);
      const offStyle = offStyleOf(snap.catalog, staffRec.uniformStyle);
      const fullName = `${staff.first} ${staff.last}`;
      /** Every reason this cart needs the tick, in one refusal — see issueRefusal(). `capNote` is
       *  blank where the ceiling isn't part of it. */
      const refusalFor = (og: readonly { id: string; item: string; groups: string[] }[], os: readonly { id: string; item: string; gender: string }[], group: string, style: string, capNote: string) =>
        issueRefusal([
          og.length ? offGroupRefusal(fullName, group, og) : null,
          os.length ? offStyleRefusal(fullName, style, os) : null,
          capNote ? `It would also take them past what one person holds: ${capNote}` : null,
        ].filter((x): x is string => x !== null), new Set([...og, ...os].map((i) => i.id)).size);
      // Measured before any refusal, because one override tick answers all of them: a cart that is
      // outside the group, or the wrong cut, AND past six sets must say so in one refusal, or ticking
      // the box for the first would wave the rest through without anybody having been told about them.
      const cap = capCheck(snap, staffRec, cartLines);
      if ((offGroup.length || offStyle.length) && !p.override) throw new OpError(refusalFor(offGroup, offStyle, staffRec.group, staffRec.uniformStyle, cap.over ? cap.note : ""));
      if (cap.over && !p.override) {
        // Read by a coordinator with the person standing in front of them, so it says what they have
        // out, what the ceiling is and what makes room — all three checkable against the pile on the
        // counter. A bare refusal sends somebody back to the ward with nothing to tell their manager.
        const plural = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;
        const holds = cap.breach === "other" ? `${plural(cap.other, "garment", "garments")} outside a set` : `${plural(cap.tops, "top", "tops")} and ${plural(cap.pants, "pair", "pairs")}`;
        const hasSome = cap.breach === "other" ? cap.other > 0 : cap.tops + cap.pants > 0;
        // Part of what they hold may not have reached them yet, and nobody can see a garment on order
        // in their locker, so the sentence says how much is still to come — and only when some is, so
        // a refusal for somebody with nothing on the way reads exactly as it always has.
        const coming = cap.breach === "other" ? cap.owed.other : cap.owed.tops + cap.owed.pants;
        throw new OpError(`${staff.first} ${staff.last} ${hasSome ? `is holding ${holds}${coming ? `, ${coming} of them still to come` : ""}` : "has nothing out"}. ${cap.note}`);
      }
      // Manager approvals: draw the requested sets down oldest-first, rolling into the next approval.
      //
      // Never for a pre-loved garment. An approval is a ward manager agreeing to pay for new
      // uniform; a pre-loved garment was handed back by somebody else, costs the ward nothing and
      // is reissued free — every other money surface in the product already filters preloved out.
      // Spending a set on one takes something from the wearer that the ward never spent, and
      // nothing on their screen would ever show it happened. cartQty is already "the garments here
      // that are not pre-loved", so an issue with none of those draws nothing down. Clamped on the
      // server because both the counter phone and the desktop send apDeduct, and a rule enforced
      // in a screen is not enforced at all.
      const cartQty = cart.reduce((t: number, c: { qty: unknown; src?: unknown }) => t + (c.src === "preloved" ? 0 : int(c.qty)), 0);
      const aps = openApprovals(snap, staff.id);
      const apAsked = cartQty > 0 ? int(p.apDeduct, 0) : 0;
      let apDeduct = Math.max(0, Math.min(apAsked, aps.reduce((t, a) => t + a.sets - a.used, 0)));
      const apPlan: { id: string; n: number }[] = [];
      for (const a of aps) { if (apDeduct <= 0) break; const n = Math.min(a.sets - a.used, apDeduct); apPlan.push({ id: a.id, n }); apDeduct -= n; }
      const apDeducted = apPlan.reduce((t, x) => t + x.n, 0);
      let slipId: string | null = null;
      await lockedTx(fid, async (tx) => {
        // Re-check under the facility lock: the pre-lock snapshot may be stale if another issue just landed.
        const fresh = await buildSnapshot(user, tx); const Lf = ledger(fresh);
        for (const k in wanted) if (wanted[k] > onhand(fresh, Lf, k)) throw new OpError("Someone just issued from that shelf — not enough left, refresh and try again");
        for (const k in plWanted) if (plWanted[k] > plOf(fresh, k)) throw new OpError("The pre-loved pool just changed — refresh and try again");
        const freshAps = openApprovals(fresh, staff.id);
        for (const x of apPlan) { const a = freshAps.find((q) => q.id === x.id); if (!a || a.sets - a.used < x.n) throw new OpError("The manager's approval balance just changed — refresh and try again"); }
        // The ceiling asked again, of what is on the record now. Two counters can serve the same
        // person at once, and without this both hand over the sixth set, both pass, and neither is
        // recorded — which is the one thing the override is for.
        //
        // Stamped only where the ceiling was really passed, and only where somebody chose to pass it:
        // a screen that sends the flag out of habit must not put the word "override" on an ordinary
        // collection, because that column is all anybody has, months later, to tell a decision
        // somebody made from a hand-over that went exactly as it should.
        fresh.owedRequestLines = await owedRequestLines(tx, fid, staff.id);
        const freshRec = fresh.staff.find((x) => x.id === staff.id);
        const freshCap = freshRec ? capCheck(fresh, freshRec, cartLines) : cap;
        // Per-line flags, asked of the record as it is now (owed garments loaded above). A flag can
        // appear between the screen loading and the press, so the refusal names the line.
        let flags: LineFlag[] = [];
        if (lineReasons && freshRec) {
          flags = issueLineFlags(fresh, freshRec, sent.map((c) => ({ itemId: c.itemId, qty: c.qty })));
          flags.forEach((f, i) => {
            if (f && !sent[i].reason) { const fit = byId[sent[i].itemId]; throw new OpError(`Pick a reason for ${fit.item} ${fit.sizes[sent[i].si]}: ${f.label}`); }
          });
        }
        const reasonOf = (c: { reason: string; idx: number }) => (lineReasons ? (flags[c.idx] ? c.reason : "") : cartReason);
        if (freshCap.over && !p.override) throw new OpError("Someone just issued to them — that would now take them past what one person holds. Refresh and try again");
        const override = freshCap.over && !!p.override;
        // The staff group and the uniform style asked again, of the catalogue and register as they are
        // now: a garment re-tagged, a person moved group or set to a cut since the screen loaded is
        // measured as it stands. Only the lines that are really outside the group, or really the wrong
        // cut, are stamped, whatever the tick said.
        const freshGroup = freshRec ? freshRec.group : staffRec.group;
        const freshStyle = freshRec ? freshRec.uniformStyle : staffRec.uniformStyle;
        const freshOff = offGroupOf(fresh.catalog, freshGroup);
        const freshOffStyle = offStyleOf(fresh.catalog, freshStyle);
        if ((freshOff.length || freshOffStyle.length) && !p.override) throw new OpError(refusalFor(freshOff, freshOffStyle, freshGroup, freshStyle, ""));
        const offIds = new Set(freshOff.map((i) => i.id));
        const offStyleIds = new Set(freshOffStyle.map((i) => i.id));
        // The slip covers what is in their hands now: stock and pre-loved. Ordered-in lines are not.
        if (sigId && (stockLines.length || plLines.length)) {
          slipId = (await tx.slip.create({ data: { facilityId: fid, staffId: staff.id, kind: "issue", date: today, sigId, toStaff: slipToStaff, lines: [...stockLines, ...plLines].map((c) => ({ itemId: c.itemId, si: c.si, qty: c.qty })), byName } })).id;
        }
        const signed = slipId ? { receipt: true, slipId } : {};
        for (const c of stockLines) await tx.issue.create({ data: { facilityId: fid, date: today, staffId: staff.id, itemId: c.itemId, sizeIndex: c.si, qty: c.qty, cond: "New", cost: byId[c.itemId].cost, override, offGroup: offIds.has(c.itemId), offStyle: offStyleIds.has(c.itemId), overrideReason: reasonOf(c), ...signed } });
        // Pre-loved rows carry the override too. They cost the ward nothing and draw no approval, but
        // they fill a locker like anything else and the ceiling counts them, so a bag of pre-loved
        // garments handed over past six sets was a rule bent — and with the flag left off these rows
        // a wholly pre-loved override would show on nobody's exceptions report at all.
        for (const c of plLines) { await tx.issue.create({ data: { facilityId: fid, date: today, staffId: staff.id, itemId: c.itemId, sizeIndex: c.si, qty: c.qty, cond: "Pre-loved", cost: 0, preloved: true, override, offGroup: offIds.has(c.itemId), offStyle: offStyleIds.has(c.itemId), overrideReason: reasonOf(c), ...signed } }); await poolAdd(tx, fid, c.itemId, c.si, -c.qty); }
        const bySup: Record<string, typeof stockLines> = {};
        for (const c of stockLines) { const sup = byId[c.itemId].supplier || snap.settings.suppliers[0] || "Supplier"; (bySup[sup] = bySup[sup] || []).push(c); }
        for (const sup in bySup) await mergeReplenish(tx, fid, today, sup, bySup[sup].map((c) => ({ itemId: c.itemId, size: String(byId[c.itemId].sizes[c.si]), qty: c.qty })), "add", "Replenishment — replaces issued stock");
        const ordBySup: Record<string, typeof orderLines> = {};
        for (const c of orderLines) (ordBySup[c.supplier] = ordBySup[c.supplier] || []).push(c);
        // An override that went on ordered-in lines is written on the order. There is no issue row to
        // stamp yet, and the rows made when the garments are collected come from the order rather than
        // from this decision, so without the note a cart of nothing but ordered-in lines could go past
        // six and leave no trace of it anywhere.
        // The same goes for ordered-in garments outside the person's staff group, and for ones that
        // are not the cut they are offered.
        for (const sup in ordBySup) {
          const code = await nextOrderCode(tx, fid, today);
          const offNames = [...new Set(ordBySup[sup].filter((c) => offIds.has(c.itemId)).map((c) => byId[c.itemId].item))];
          const offNote = offNames.length ? ` · Outside ${staff.first}'s staff group: ${offNames.join(", ")} — override recorded by ${byName}` : "";
          const styleNames = [...new Set(ordBySup[sup].filter((c) => offStyleIds.has(c.itemId)).map((c) => byId[c.itemId].item))];
          const styleNote = styleNames.length ? ` · Not ${staff.first}'s uniform style: ${styleNames.join(", ")} — override recorded by ${byName}` : "";
          await tx.order.create({ data: { facilityId: fid, code, date: today, source: "Supplier Order", orderFor: "Staff Member", staffId: staff.id, supplier: sup, status: "Ordered", expected: await expectedFor(tx, fid, sup, today), cc: staff.ccOverride || staff.dept, notes: `Ordered at issue for ${staff.first} ${staff.last}` + (override ? ` · Past the ${freshCap.cap} sets one person holds — override recorded by ${byName}` : "") + offNote + styleNote, lines: { create: ordBySup[sup].map((c, i) => ({ itemId: c.itemId, size: String(byId[c.itemId].sizes[c.si]), qty: c.qty, sort: i })) } } });
        }
        for (const x of apPlan) await tx.approval.update({ where: { id: x.id }, data: { used: { increment: x.n } } });
      });
      return { slipId, stock: stockLines.reduce((t, c) => t + c.qty, 0), ordered: orderLines.reduce((t, c) => t + c.qty, 0), preloved: plLines.reduce((t, c) => t + c.qty, 0), apDeducted, apRemaining: aps.reduce((t, a) => t + a.sets - a.used, 0) - apDeducted, offGroup: offGroup.length, offStyle: offStyle.length };
    }
    case "handin.add": {
      // Uniform hand-in: Good lines join the pre-loved pool, Rag lines are tallied for disposal, matched past
      // issues are stamped handedIn — pre-loved ones too — and (coordinator's call) the year's figure / manager's
      // approval balance is credited for the new garments among them.
      //
      // The stamp is what makes room, and it happens whether or not the coordinator ticks credit: a
      // garment marked handed in stops counting towards the six sets this person holds, so somebody
      // who brings a set back can be given a replacement without anybody overriding anything. The
      // tick is a separate kindness — it hands a drawn set back to the manager's approval balance and
      // credits the year's reporting figure — and forgetting it can no longer strand a wearer at the
      // counter with an empty locker.
      const staff = await ownStaff(prisma, fid, str(p.staffId));
      const raw = Array.isArray(p.lines) ? p.lines : [];
      if (!raw.length) throw new OpError("Add at least one garment");
      const snap = await buildSnapshot(user);
      const byId = Object.fromEntries(snap.catalog.map((i) => [i.id, i]));
      const lines: { itemId: string; si: number; qty: number; cond: string; laundered: boolean }[] = [];
      for (const l of raw) {
        const it = byId[str(l.itemId)]; const si = int(l.si, -1); const qty = int(l.qty);
        if (!it || si < 0 || si >= it.sizes.length || qty <= 0) throw new OpError("Invalid hand-in line");
        lines.push({ itemId: it.id, si, qty, cond: l.cond === "Rag" ? "Rag" : "Good", laundered: l.laundered !== false });
      }
      const credit = !!p.credit;
      const good = lines.filter((l) => l.cond === "Good"), rag = lines.filter((l) => l.cond === "Rag");
      const goodN = good.reduce((t, l) => t + l.qty, 0), ragN = rag.reduce((t, l) => t + l.qty, 0);
      let setsBack = 0;
      const rec = await lockedTx(fid, async (tx) => {
        // Stamp the garments' original issues as handed in — pre-loved ones included. A pre-loved garment
        // counts towards the six sets somebody holds, so giving one back has to make the same room as
        // giving back a new one: left unstamped, a wearer at six who hands a pre-loved top back is
        // still at six and is refused its replacement. Credit is the part that still ignores
        // pre-loved. It hands a drawn set back to the manager's approval balance and credits the
        // year's reporting figure, and a pre-loved garment never drew on either — so only Good lines
        // matched to a new issue earn it.
        //
        // When somebody holds a new and a pre-loved copy of the same size, the new one is matched
        // first. Two tunics of one size can't be told apart across the counter, so this is a choice,
        // and it is the one that changes nothing that was already true: every hand-in that matched
        // before matches the same rows and earns the same credit, and pre-loved rows only take up what
        // used to fall through unmatched. Matching pre-loved first would quietly withhold credit a
        // coordinator had ticked for somebody handing back a garment the ward paid for. Newest first
        // within each, as before.
        const credited: number[] = lines.map(() => 0);
        for (let ix = 0; ix < lines.length; ix++) {
          const l = lines[ix]; let left = l.qty;
          const past = await tx.issue.findMany({ where: { facilityId: fid, staffId: staff.id, itemId: l.itemId, sizeIndex: l.si, returnedDate: null, handedIn: null }, orderBy: [{ preloved: "asc" }, { date: "desc" }] });
          for (const i of past) {
            if (left <= 0) break;
            const m = Math.min(left, i.qty);
            if (m < i.qty) {
              // Only part of that line came back. Stamping the whole row would take the garments
              // still in the wearer's possession off her record — five issued, one handed in, four
              // gone from the books — so the row is split the same way a partial exchange splits
              // it: the handed-in quantity becomes its own row and the rest stays out with her.
              await tx.issue.update({ where: { id: i.id }, data: { qty: i.qty - m } });
              await tx.issue.create({ data: { facilityId: fid, date: i.date, staffId: i.staffId, itemId: i.itemId, sizeIndex: i.sizeIndex, qty: m, cond: i.cond, cost: i.cost, cc: i.cc, orderCode: i.orderCode, receipt: i.receipt, preloved: i.preloved, override: i.override, offGroup: i.offGroup, offStyle: i.offStyle, direct: i.direct, handedIn: today } });
            } else {
              await tx.issue.update({ where: { id: i.id }, data: { handedIn: today } });
            }
            left -= m;
            if (credit && l.cond === "Good" && !i.preloved) credited[ix] += m;
          }
        }
        const h = await tx.handIn.create({ data: { facilityId: fid, date: today, staffId: staff.id, byName, credit, lines: { create: lines.map((l, ix) => ({ itemId: l.itemId, sizeIndex: l.si, qty: l.qty, cond: l.cond, laundered: l.laundered, credited: credited[ix] })) } } });
        for (const l of good) await poolAdd(tx, fid, l.itemId, l.si, l.qty);
        // Nursing credit = credited sets (1 set = 1 top + 1 pants), returned to drawn approvals newest-first.
        if (credit) {
          const gt = lines.reduce((t, l, ix) => t + (isTopItem(byId[l.itemId]) ? credited[ix] : 0), 0), gp = lines.reduce((t, l, ix) => t + (isPantItem(byId[l.itemId]) ? credited[ix] : 0), 0);
          setsBack = Math.max(gt, gp);
          let left = setsBack;
          const aps = await tx.approval.findMany({ where: { facilityId: fid, staffId: staff.id, used: { gt: 0 } }, orderBy: { date: "desc" } });
          for (const ap of aps) { if (left <= 0) break; const give = Math.min(ap.used, left); await tx.approval.update({ where: { id: ap.id }, data: { used: ap.used - give } }); left -= give; }
        }
        return h;
      });
      return { id: rec.id, good: goodN, rag: ragN, credit, setsBack, message: `Hand-in recorded for ${staff.first} ${staff.last}: ${goodN ? `${goodN} to the pre-loved pool` : ""}${goodN && ragN ? " · " : ""}${ragN ? `${ragN} to rag disposal` : ""}${credit ? " · allowance credited" : ""}.` };
    }
    case "photo.put": {
      // Camera capture / signature from the device: JPEG or PNG data URL, already downscaled client-side.
      const data = str(p.data, PHOTO_MAX + 200);
      if (!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(data)) throw new OpError("Photo must be a JPEG or PNG");
      if (data.length > PHOTO_MAX) throw new OpError("Photo is too large — try again");
      const kind = ["approval", "receipt", "return", "sig", "proof"].includes(str(p.kind)) ? str(p.kind) : "photo";
      // A demo visitor signs for a delivery like anyone else, but the demo is open to the internet
      // on a shared admin session: without a ceiling that is an anonymous upload endpoint, and the
      // per-facility rate limit resets with the facility every twenty minutes.
      if (user.isDemo && (await prisma.photo.count({ where: { facilityId: fid } })) >= DEMO_PHOTO_MAX) throw new OpError("The demo only keeps a handful of photos — it resets every 20 minutes.");
      const parsed = parseDataUrl(data);
      if (!parsed) throw new OpError("Photo must be a JPEG or PNG");
      // The row is created first so the file can be named after its id, which is what makes the
      // path derivable from data we generated rather than from anything the request supplied.
      const ph = await prisma.photo.create({ data: { facilityId: fid, kind, mime: parsed.mime, bytes: parsed.bytes.length } });
      try {
        const rel = await writePhoto(fid, ph.id, parsed);
        await prisma.photo.update({ where: { id: ph.id }, data: { path: rel } });
      } catch (e) {
        // A row pointing at a file that was never written is worse than no row at all.
        await prisma.photo.delete({ where: { id: ph.id } }).catch(() => {});
        console.error("[photo] could not write to disk:", (e as Error).message);
        throw new OpError("Couldn't save the photo — try again");
      }
      if (Math.random() < 0.05) await gcPhotos(fid).catch(() => {});
      return { id: ph.id };
    }
    case "pickup.deliver": {
      // Delivery round: the receiver signs on screen; same stock effect as a counter pickup (direct issues).
      const pu = await prisma.pickup.findFirst({ where: { id: str(p.id), facilityId: fid }, include: { lines: true, order: true } }); if (!pu) throw new OpError("Unknown pickup", 404);
      if (pu.pickedUp) throw new OpError("Already handed over");
      const sigId = await ownPhoto(prisma, fid, p.sigId), proofId = await ownPhoto(prisma, fid, p.proofId);
      const items = await prisma.catalogItem.findMany({ where: { facilityId: fid } });
      const byId: Record<string, Item> = Object.fromEntries(items.map((i) => [i.id, asItem(i)]));
      await lockedTx(fid, async (tx) => {
        const cur = await tx.pickup.findUnique({ where: { id: pu.id }, select: { pickedUp: true } });
        if (cur?.pickedUp) throw new OpError("Already handed over");
        await tx.pickup.update({ where: { id: pu.id }, data: { pickedUp: today, deliveredTo: str(p.deliveredTo, 120).trim(), sigId, proofId, deliveredRound: true } });
        // No ceiling check and no override stamp here, on purpose. These garments have counted towards
        // the six this person holds since the day they were ordered — as an order line, then as this
        // pickup — so handing them over moves them from owed to issued and the total doesn't change.
        // Asking capCheck() with them as a cart would count them twice and brand an ordinary
        // collection an override; any decision to go past six was made when they were ordered.
        //
        // The staff group and the uniform style are different: neither is refused here — the only way
        // a garment outside either reaches a staff order is the counter's Order in with the override
        // ticked — but both are stamped, so the Exceptions report sees the garment in the month it
        // reaches them.
        const wearer = await tx.staff.findUnique({ where: { id: pu.staffId }, select: { group: true, uniformStyle: true } });
        for (const l of pu.lines) {
          const it = byId[l.itemId] as Item | undefined;
          const si = sizeIndexOf(it, l.size);
          if (si < 0) throw new OpError(`Size ${l.size} is no longer on ${it?.item || "the item"} — fix the catalogue before marking this delivered`);
          await tx.issue.create({ data: { facilityId: fid, date: today, staffId: pu.staffId, itemId: l.itemId, sizeIndex: si, qty: l.qty, cond: "New", cost: it?.cost || 0, orderCode: pu.order.code, direct: true, receipt: !!sigId, offGroup: !!it && !garmentForGroup(it, wearer?.group), offStyle: !!it && !garmentForStyle(it, wearer?.uniformStyle) } });
        }
      });
      return { ok: true };
    }
    // ---------- the counter phone's hand back basket: returns, and size swaps, in one record
    case "handback.commit": {
      const staff = await ownStaff(prisma, fid, str(p.staffId));
      const raw: unknown[] = Array.isArray(p.lines) ? p.lines : [];
      if (!raw.length) throw new OpError("Nothing to hand back");
      if (raw.length > 30) throw new OpError("Hand back up to 30 garments at a time");
      const CONDS = ["Returned - Good", "Returned - Damaged", "Written Off", "Lost"];
      const lines = raw.map((x) => {
        const r = (x || {}) as { itemId?: unknown; si?: unknown; cond?: unknown; swapSi?: unknown };
        return { itemId: str(r.itemId), si: int(r.si, -1), cond: str(r.cond, 40), swapSi: r.swapSi === null || r.swapSi === undefined || r.swapSi === "" ? null : int(r.swapSi, -1) };
      });
      for (const l of lines) if (!CONDS.includes(l.cond)) throw new OpError("Bad condition");
      let back = 0, swaps = 0;
      await lockedTx(fid, async (tx) => {
        const fresh = await buildSnapshot(user, tx);
        const Lf = ledger(fresh);
        const byIdF = itemMapOf(fresh);
        const open = await tx.issue.findMany({ where: { facilityId: fid, staffId: staff.id, returnedDate: null, handedIn: null } });
        const left = new Map(open.map((r) => [r.id, r.qty]));
        // What this basket has already put back or taken, so a swap can use a size another line returned.
        const goodBack: Record<string, number> = {}, poolBack: Record<string, number> = {};
        const shelfOut: Record<string, number> = {}, poolOut: Record<string, number> = {};
        let newTop: string | null = null, newPants: string | null = null;
        for (const l of lines) {
          const it = byIdF[l.itemId];
          if (!it || l.si < 0 || l.si >= it.sizes.length) throw new OpError("A garment on the list isn’t in the catalogue any more — refresh");
          const size = String(it.sizes[l.si]);
          // Oldest open row of that size first, new before pre-loved: one unit per line.
          const row = open
            .filter((r) => r.itemId === l.itemId && r.sizeIndex === l.si && (left.get(r.id) || 0) > 0)
            .sort((a, b) => Number(a.preloved) - Number(b.preloved) || a.date.localeCompare(b.date) || a.createdAt.getTime() - b.createdAt.getTime())[0];
          if (!row) throw new OpError(`${it.item} ${size} isn’t on their record any more — refresh`);
          const remaining = left.get(row.id) || 0;
          if (remaining > 1) {
            // Split the row exactly as issue.return does, so the rest stays out in their name.
            await tx.issue.update({ where: { id: row.id }, data: { qty: remaining - 1 } });
            await tx.issue.create({ data: { facilityId: fid, date: row.date, staffId: row.staffId, itemId: row.itemId, sizeIndex: row.sizeIndex, qty: 1, cond: row.cond, cost: row.cost, cc: row.cc, orderCode: row.orderCode, receipt: row.receipt, slipId: row.slipId, preloved: row.preloved, override: row.override, overrideReason: row.overrideReason, offGroup: row.offGroup, offStyle: row.offStyle, direct: row.direct, returnedDate: today, returnedCond: l.cond } });
          } else {
            await tx.issue.update({ where: { id: row.id }, data: { returnedDate: today, returnedCond: l.cond } });
          }
          left.set(row.id, remaining - 1);
          back++;
          const k0 = key(it.id, l.si);
          if (l.cond === "Returned - Good") {
            if (row.preloved) { await poolAdd(tx, fid, row.itemId, row.sizeIndex, 1); poolBack[k0] = (poolBack[k0] || 0) + 1; }
            else goodBack[k0] = (goodBack[k0] || 0) + 1;
          }
          if (l.swapSi === null) continue;
          // A swap is one out and one in, as issue.exchange: no ceiling check. That only holds when the
          // garment goes back on the shelf; a damaged, written off or lost one is replaced, and a
          // replacement is an issue (approval deduction, reorder line, signature) through issue.create.
          if (l.cond !== "Returned - Good") throw new OpError(`Only a garment handed back in good condition can swap size — issue a replacement for ${it.item} ${size}`);
          if (l.swapSi === l.si || l.swapSi < 0 || l.swapSi >= it.sizes.length) throw new OpError(`Pick a different size for ${it.item} ${size}`);
          const k = key(it.id, l.swapSi);
          const newSize = String(it.sizes[l.swapSi]);
          if (row.preloved) {
            poolOut[k] = (poolOut[k] || 0) + 1;
            if (poolOut[k] > plOf(fresh, k) + (poolBack[k] || 0)) throw new OpError(`Not enough pre-loved ${it.item} ${newSize} in the pool`);
          } else {
            shelfOut[k] = (shelfOut[k] || 0) + 1;
            if (shelfOut[k] > onhand(fresh, Lf, k) + (goodBack[k] || 0)) throw new OpError(`Not enough ${it.item} ${newSize} on the shelf`);
          }
          await tx.issue.create({ data: { facilityId: fid, date: today, staffId: staff.id, itemId: it.id, sizeIndex: l.swapSi, qty: 1, cond: row.preloved ? "Pre-loved" : "New", cost: row.preloved ? 0 : it.cost, cc: row.cc, preloved: row.preloved, offGroup: row.offGroup, offStyle: row.offStyle } });
          if (row.preloved) await poolAdd(tx, fid, it.id, l.swapSi, -1);
          if (isTopItem(it)) newTop = newSize;
          if (isPantItem(it)) newPants = newSize;
          swaps++;
        }
        // The size they swapped to goes on their record, or they'll be handed the wrong one next time.
        const sizes: { top?: string; pants?: string } = {};
        if (newTop !== null && newTop !== staff.top) sizes.top = newTop;
        if (newPants !== null && newPants !== staff.pants) sizes.pants = newPants;
        if (sizes.top !== undefined || sizes.pants !== undefined) await tx.staff.update({ where: { id: staff.id }, data: sizes });
      });
      return { back, swaps };
    }
    // ---------- a whole ward's round signed for at once (counter phone)
    case "pickup.deliverWard": {
      const ids = [...new Set((Array.isArray(p.ids) ? p.ids : []).map((x: unknown) => str(x, 40)).filter(Boolean))] as string[];
      if (!ids.length || ids.length > 40) throw new OpError("Deliver between 1 and 40 bags at a time");
      const sigId = await ownPhoto(prisma, fid, p.sigId);
      if (!sigId) throw new OpError("Ask them to sign first");
      const proofId = await ownPhoto(prisma, fid, p.proofId);
      const deliveredTo = str(p.deliveredTo, 120).trim();
      const pus = await prisma.pickup.findMany({ where: { id: { in: ids }, facilityId: fid }, include: { lines: true, order: true } });
      if (pus.length !== ids.length) throw new OpError("One of those bags isn’t on this round any more — refresh", 404);
      if (pus.some((x) => x.pickedUp)) throw new OpError("One of those bags has already been handed over — refresh");
      const items = await prisma.catalogItem.findMany({ where: { facilityId: fid } });
      const byId: Record<string, Item> = Object.fromEntries(items.map((i) => [i.id, asItem(i)]));
      await lockedTx(fid, async (tx) => {
        const cur = await tx.pickup.findMany({ where: { id: { in: ids }, facilityId: fid }, select: { pickedUp: true } });
        if (cur.length !== ids.length) throw new OpError("One of those bags isn’t on this round any more — refresh", 404);
        if (cur.some((c) => c.pickedUp)) throw new OpError("One of those bags was just handed over — refresh");
        for (const pu of pus) {
          // Exactly pickup.deliver's write, with the one signature for the ward.
          await tx.pickup.update({ where: { id: pu.id }, data: { pickedUp: today, deliveredTo, sigId, proofId, deliveredRound: true } });
          const wearer = await tx.staff.findUnique({ where: { id: pu.staffId }, select: { group: true, uniformStyle: true } });
          for (const l of pu.lines) {
            const it = byId[l.itemId] as Item | undefined;
            const si = sizeIndexOf(it, l.size);
            if (si < 0) throw new OpError(`Size ${l.size} is no longer on ${it?.item || "the item"} — fix the catalogue before marking this delivered`);
            await tx.issue.create({ data: { facilityId: fid, date: today, staffId: pu.staffId, itemId: l.itemId, sizeIndex: si, qty: l.qty, cond: "New", cost: it?.cost || 0, orderCode: pu.order.code, direct: true, receipt: true, offGroup: !!it && !garmentForGroup(it, wearer?.group), offStyle: !!it && !garmentForStyle(it, wearer?.uniformStyle) } });
          }
        }
      });
      return { ok: true, delivered: pus.length };
    }
    // ---------- one size onto the supplier's draft order (counter phone line page)
    case "stock.orderLine": {
      const snap = await buildSnapshot(user);
      const L = ledger(snap);
      const byId: Record<string, Item> = Object.fromEntries(snap.catalog.map((i) => [i.id, i]));
      const it = byId[str(p.itemId)];
      const si = int(p.si, -1);
      if (!it || it.archived || si < 0 || si >= it.sizes.length) throw new OpError("Unknown garment", 404);
      const k = key(it.id, si);
      const size = String(it.sizes[si]);
      const need = flaggedNeeds(snap, L, byId).find((n) => n.itemId === it.id && n.si === si);
      const qty = need ? need.qty : Math.max(1, reorderAtOf(snap, k) * 2 - onhand(snap, L, k));
      const sup = need?.supplier || it.supplier || snap.settings.suppliers[0] || "Supplier";
      let added = 0;
      await lockedTx(fid, async (tx) => {
        const draft = await tx.order.findFirst({ where: { facilityId: fid, replenish: true, status: "Draft", supplier: sup }, include: { lines: true } });
        const have = draft?.lines.find((l) => l.itemId === it.id && l.size === size)?.qty || 0;
        if (have >= qty) return; // already covered
        await mergeReplenish(tx, fid, today, sup, [{ itemId: it.id, size, qty }], "max", "Reorder — at or below reorder level");
        added = qty - have;
      });
      return { added, qty };
    }
    case "issue.receipt": {
      const i = await prisma.issue.findFirst({ where: { id: str(p.id), facilityId: fid } }); if (!i) throw new OpError("Unknown issue", 404);
      await prisma.issue.update({ where: { id: i.id }, data: { receipt: !!p.receipt } });
      return { ok: true };
    }
    case "issue.return": {
      const i = await prisma.issue.findFirst({ where: { id: str(p.id), facilityId: fid } }); if (!i) throw new OpError("Unknown issue", 404);
      if (i.returnedDate) throw new OpError("This issue has already been returned / written off");
      if (i.handedIn) throw new OpError("This garment was handed in on " + i.handedIn + " — it's already back in the pool");
      const cond = str(p.cond, 40);
      if (!["Returned - Good", "Returned - Damaged", "Lost", "Written Off"].includes(cond)) throw new OpError("Bad condition");
      const photoId = await ownPhoto(prisma, fid, p.photoId);
      /* Part of a line can come back on its own.
       *
       * An issue row is a quantity — three tunics handed over in one act — and returning the row
       * used to be all-or-nothing, so bringing one of the three back credited the shelf with all
       * three and cleared the other two off the wearer's record. ledger() reads the row's qty, not
       * how many garments were physically handed over the counter, so the stock figure was simply
       * wrong from that moment on. Splitting the row the way issue.exchange already does keeps the
       * rest out in the person's name. A missing or oversized qty still means the whole line, so
       * every caller that never knew about this carries on behaving exactly as it did. */
      const qty = Math.min(i.qty, Math.max(1, int(p.qty, i.qty)));
      await lockedTx(fid, async (tx) => {
        if (qty < i.qty) {
          await tx.issue.update({ where: { id: i.id }, data: { qty: i.qty - qty } });
          await tx.issue.create({ data: { facilityId: fid, date: i.date, staffId: i.staffId, itemId: i.itemId, sizeIndex: i.sizeIndex, qty, cond: i.cond, cost: i.cost, cc: i.cc, orderCode: i.orderCode, preloved: i.preloved, override: i.override, offGroup: i.offGroup, offStyle: i.offStyle, direct: i.direct, returnedDate: today, returnedCond: cond, returnPhotoId: photoId } });
        } else {
          await tx.issue.update({ where: { id: i.id }, data: { returnedDate: today, returnedCond: cond, returnPhotoId: photoId } });
        }
        if (i.preloved && cond === "Returned - Good") await poolAdd(tx, fid, i.itemId, i.sizeIndex, qty); // a pre-loved garment returns to the pool, not the shelf
      });
      return { ok: true };
    }
    case "issue.delete": {
      admin(user);
      const i = await prisma.issue.findFirst({ where: { id: str(p.id), facilityId: fid } }); if (!i) throw new OpError("Unknown issue", 404);
      await prisma.issue.delete({ where: { id: i.id } });
      return { ok: true };
    }

    // ---------- orders
    case "order.create": {
      const orderFor = p.orderFor === "Staff Member" ? "Staff Member" : "Stock";
      const staff = orderFor === "Staff Member" ? await ownStaff(prisma, fid, str(p.staffId)) : null;
      const lines = Array.isArray(p.lines) ? p.lines : [];
      if (!lines.length) throw new OpError("Add at least one line");
      await refuseWrongGarmentOnOrder(fid, staff, lines.map((l: { itemId?: unknown }) => str(l?.itemId)));
      return prisma.$transaction(async (tx) => {
        const code = await nextOrderCode(tx, fid, today);
        const create: { itemId: string; size: string; qty: number; sort: number }[] = [];
        for (const [i, l] of lines.entries()) { const it = await ownItem(tx, fid, str(l.itemId)); const size = str(l.size, 20); if (!it.sizes.map(String).includes(size)) throw new OpError("Invalid size"); const qty = int(l.qty); if (qty <= 0) throw new OpError("Invalid quantity"); create.push({ itemId: it.id, size, qty, sort: i }); }
        const o = await tx.order.create({ data: { facilityId: fid, code, date: today, source: "Supplier Order", orderFor, staffId: staff?.id ?? null, supplier: str(p.supplier, 80), status: "Draft", expected: dateField(p.expected, addDays(today, 14), "The expected date"), cc: str(p.cc, 120) || (staff ? staff.ccOverride || staff.dept : ""), notes: str(p.notes, 400), replenish: !!p.replenish, lines: { create } } });
        return { id: o.id, code };
      });
    }
    case "stock.supplierCode": {
      admin(user);
      const it = await ownItem(prisma, fid, str(p.itemId));
      const si = int(p.si, -1);
      if (si < 0 || si >= it.sizes.length) throw new OpError("Invalid size");
      await upsertLevel(prisma, fid, it.id, si, { supplierCode: str(p.code, 60).trim() });
      return { ok: true };
    }
    case "order.raiseList": {
      /* The order list, raised. A stock group becomes one new order per supplier, marked Ordered
       * with the supplier's own order number as its ref. An existing draft — a person's "order in",
       * a replenishment draft — is raised as it is, so an order placed under someone's account at
       * the supplier stays its own order rather than merging into the shelf's. */
      admin(user);
      const groups = Array.isArray(p.groups) ? p.groups : [];
      if (!groups.length) throw new OpError("Nothing to raise");
      const raised: { id: string; code: string; supplier: string; ref: string; lines: { itemId: string; size: string; qty: number }[] }[] = [];
      await lockedTx(fid, async (tx) => {
        for (const g of groups as Record<string, unknown>[]) {
          const ref = str(g?.ref, 120).trim();
          if (g?.kind === "draft") {
            const o = await ownOrder(tx, fid, str(g.id));
            if (o.status !== "Draft") throw new OpError(`${o.code} is not a draft`);
            if (!o.lines.length) throw new OpError(`${o.code} has no lines`);
            await tx.order.update({ where: { id: o.id }, data: { status: "Ordered", ...(ref ? { ref } : {}) } });
            raised.push({ id: o.id, code: o.code, supplier: o.supplier, ref: ref || o.ref, lines: o.lines.map((l) => ({ itemId: l.itemId, size: l.size, qty: l.qty })) });
            continue;
          }
          const supplier = str(g?.supplier, 80).trim();
          const lines = Array.isArray(g?.lines) ? (g.lines as Record<string, unknown>[]) : [];
          const create: { itemId: string; size: string; qty: number; sort: number }[] = [];
          for (const l of lines) {
            const it = await ownItem(tx, fid, str(l?.itemId));
            const size = str(l?.size, 20);
            if (!it.sizes.map(String).includes(size)) throw new OpError(`Invalid size for ${it.item}`);
            const qty = int(l?.qty);
            if (qty <= 0) continue;
            create.push({ itemId: it.id, size, qty, sort: create.length });
          }
          if (!create.length) continue;
          const code = await nextOrderCode(tx, fid, today);
          const o = await tx.order.create({ data: { facilityId: fid, code, date: today, source: "Supplier Order", orderFor: "Stock", supplier, status: "Ordered", ref, expected: await expectedFor(tx, fid, supplier, today), notes: "Raised from the order list", lines: { create } } });
          raised.push({ id: o.id, code, supplier, ref, lines: create.map((c) => ({ itemId: c.itemId, size: c.size, qty: c.qty })) });
        }
      });
      if (!raised.length) throw new OpError("Nothing to raise — every line was zero");
      return { raised };
    }
    case "order.email": {
      admin(user);
      const o = await ownOrder(prisma, fid, str(p.id));
      if (o.status === "Draft") throw new OpError("Raise the order first — a draft is not sent to anyone");
      if (o.status === "Cancelled") throw new OpError("This order is cancelled");
      const doc = await loadOrderDoc(fid, o.id);
      if (!doc.supplier.email) throw new OpError(`${o.supplier || "This supplier"} has no email address yet — add one under Settings › Suppliers, or print the order.`);
      if (!transactionalConfigured()) throw new OpError("Email is not set up on this server — print the order instead.");
      const em = supplierOrderEmail(doc);
      const sent = await sendTo(doc.supplier.email, em.subject, em.text, em.html, user.email);
      if (!sent) throw new OpError("The email could not be sent — try again in a minute, or print the order.");
      await prisma.order.update({ where: { id: o.id }, data: { emailedAt: new Date() } });
      return { ok: true, sentTo: doc.supplier.email };
    }
    case "order.printed": {
      const o = await ownOrder(prisma, fid, str(p.id));
      await prisma.order.update({ where: { id: o.id }, data: { printedAt: new Date() } });
      return { ok: true };
    }
    case "order.duplicate": {
      const o = await ownOrder(prisma, fid, str(p.id));
      // A copy is a new decision. An order the counter raised on the override (Order in) carries
      // garments outside the person's group, and copying it must not carry the override with it.
      await refuseWrongGarmentOnOrder(fid, await orderStaff(fid, o), o.lines.map((l) => l.itemId));
      return prisma.$transaction(async (tx) => {
        const code = await nextOrderCode(tx, fid, today);
        const n = await tx.order.create({ data: { facilityId: fid, code, date: today, source: "Supplier Order", orderFor: o.orderFor, staffId: o.staffId, supplier: o.supplier, status: "Draft", expected: "", cc: o.cc, notes: `Duplicated from ${o.code}`, lines: { create: o.lines.map((l, i) => ({ itemId: l.itemId, size: l.size, qty: l.qty, sort: i })) } } });
        return { id: n.id, code };
      });
    }
    case "order.update": {
      const o = await ownOrder(prisma, fid, str(p.id));
      if (o.status === "Received" || o.status === "Cancelled") throw new OpError(`This order is ${o.status.toLowerCase()} — its details are locked`);
      const data: Prisma.OrderUpdateInput = {};
      for (const k of ["ref", "invoice", "tracking", "cc", "notes", "supplier"] as const) if (p[k] !== undefined) data[k] = str(p[k], k === "notes" ? 400 : 120);
      // The expected date is a date, not free text: stored unvalidated it reaches the orders
      // screen as something no formatter can read, on the one column the overdue list sorts on.
      if (p.expected !== undefined) data.expected = dateField(p.expected, "", "The expected date");
      if (p.staffId !== undefined) {
        const sid = str(p.staffId);
        if (sid) {
          const s = await ownStaff(prisma, fid, sid);
          // Only a change of person is measured. Saving the same person back — the order screen's
          // picker does — must not refuse an order the counter raised on the override for them.
          if (s.id !== o.staffId) await refuseWrongGarmentOnOrder(fid, s, o.lines.map((l) => l.itemId), true);
          data.staff = { connect: { id: s.id } }; data.orderFor = "Staff Member"; data.cc = s.ccOverride || s.dept;
        }
        else { data.staff = { disconnect: true }; data.orderFor = "Stock"; data.cc = ""; }
      }
      await prisma.order.update({ where: { id: o.id }, data });
      return { ok: true };
    }
    case "order.status": {
      const o = await ownOrder(prisma, fid, str(p.id));
      const st = str(p.status, 20);
      if (st === "Cancelled") { admin(user); if (!["Draft", "Ordered", "Back Order", "Shipped"].includes(o.status)) throw new OpError("Order can't be cancelled"); }
      else if (st === "Ordered") { if (o.status !== "Draft") throw new OpError("Only drafts can be marked ordered"); if (!o.lines.length) throw new OpError("Order has no lines"); }
      else if (st === "Shipped") { if (!["Ordered", "Back Order"].includes(o.status)) throw new OpError("Not an open order"); }
      else throw new OpError("Bad status");
      await prisma.order.update({ where: { id: o.id }, data: { status: st } });
      return { ok: true };
    }
    case "order.lineRemove": {
      const o = await ownOrder(prisma, fid, str(p.id));
      if (o.status !== "Draft") throw new OpError("Only draft lines can be removed");
      if (o.lines.length <= 1) throw new OpError("An order needs at least one line");
      await prisma.orderLine.deleteMany({ where: { id: str(p.lineId), orderId: o.id } });
      return { ok: true };
    }
    case "order.lineAdd": {
      const o = await ownOrder(prisma, fid, str(p.id));
      if (o.status !== "Draft") throw new OpError("Only drafts can be edited");
      const it = await ownItem(prisma, fid, str(p.itemId)); const size = str(p.size, 20); const qty = Math.max(1, int(p.qty, 1));
      if (!it.sizes.map(String).includes(size)) throw new OpError("Invalid size");
      await refuseWrongGarmentOnOrder(fid, await orderStaff(fid, o), [it.id]);
      const ex = o.lines.find((l) => l.itemId === it.id && l.size === size);
      if (ex) await prisma.orderLine.update({ where: { id: ex.id }, data: { qty: { increment: qty } } });
      else await prisma.orderLine.create({ data: { orderId: o.id, itemId: it.id, size, qty, sort: o.lines.length } });
      return { ok: true };
    }
    case "order.lineQty": {
      const o = await ownOrder(prisma, fid, str(p.id));
      if (o.status !== "Draft") throw new OpError("Only drafts can be edited");
      const qty = int(p.qty);
      if (qty <= 0) throw new OpError("Quantity must be at least 1");
      // More of a garment is more of it on their record; fewer is always allowed, so a line that
      // would now be refused can still be brought down or taken off.
      const line = o.lines.find((l) => l.id === str(p.lineId));
      if (line && qty > line.qty) await refuseWrongGarmentOnOrder(fid, await orderStaff(fid, o), [line.itemId], true);
      await prisma.orderLine.updateMany({ where: { id: str(p.lineId), orderId: o.id }, data: { qty } });
      return { ok: true };
    }
    case "order.receive": {
      const o0 = await ownOrder(prisma, fid, str(p.id));
      if (!["Ordered", "Shipped", "Back Order"].includes(o0.status)) throw new OpError(o0.status === "Draft" ? "Mark the order as ordered before receiving it" : "Order isn't receivable");
      const lines = Array.isArray(p.lines) ? p.lines : [];
      const items = await prisma.catalogItem.findMany({ where: { facilityId: fid } });
      const byId = Object.fromEntries(items.map((i) => [i.id, i]));
      const date = dateField(p.date, today, "The delivery date"), invoice = str(p.invoice, 80), note = str(p.note, 400);
      await lockedTx(fid, async (tx) => {
        // Re-read inside the transaction so two simultaneous receives can't both see the full quantity outstanding.
        const o = await ownOrder(tx, fid, o0.id);
        if (o.status === "Received") throw new OpError("This order has already been received");
        const recLines: { itemId: string; size: string; qty: number; dest: string; cost: number }[] = [], shorts: { itemId: string; size: string; qty: number }[] = [], puLines: { itemId: string; size: string; qty: number }[] = [];
        for (const ol of o.lines) {
          const l = lines.find((x: { lineId?: string; itemId?: string; size?: string }) => (x.lineId && x.lineId === ol.id) || (x.itemId === ol.itemId && String(x.size) === ol.size));
          const it = byId[ol.itemId]; if (!it) continue;
          const already = o.receipts.reduce((t, r) => t + r.lines.filter((x) => x.itemId === ol.itemId && x.size === ol.size).reduce((s, x) => s + x.qty, 0), 0);
          const outstanding = Math.max(0, ol.qty - already);
          if (int(l?.arrived, 0) > outstanding) throw new OpError(`${it.item} ${ol.size}: ${int(l?.arrived, 0)} arrived but only ${outstanding} outstanding — receive the surplus as stock without an order`);
          const a = Math.max(0, Math.min(int(l?.arrived, 0), outstanding));
          const dest = l?.dest === "pickup" && o.staffId ? "pickup" : "shelf";
          const cost = l && l.cost !== "" && l.cost !== undefined ? num(l.cost, it.cost) : it.cost;
          if (!(cost >= 0 && cost <= 100000)) throw new OpError("Invoiced cost must be between $0 and $100,000");
          if (a > 0) { const line = { itemId: it.id, size: ol.size, qty: a, dest, cost }; recLines.push(line); if (dest === "pickup") puLines.push(line); }
          if (a < outstanding) shorts.push({ itemId: it.id, size: ol.size, qty: outstanding - a });
          // Correcting the catalogue from the invoice is a price change like any other, so it
          // leaves the same trail: without it the cost history jumps from the old figure straight
          // to the next manual edit, and the "up from …" line on that entry is wrong.
          if (l?.priceAction === "update" && user.role === "ADMIN" && Number.isFinite(cost) && cost > 0 && cost !== it.cost) {
            await tx.catalogItem.update({ where: { id: it.id }, data: { cost } });
            await tx.costChange.create({ data: { facilityId: fid, itemId: it.id, cost, previous: it.cost, byName } });
          }
        }
        if (!recLines.length) throw new OpError("Nothing arrived — enter at least one quantity");
        await tx.receipt.create({ data: { orderId: o.id, date, invoice, note, photoId: await ownPhoto(tx, fid, p.photoId), lines: { create: recLines } } });
        await tx.order.update({ where: { id: o.id }, data: { invoice: invoice || o.invoice, received: date, status: "Received", notes: note ? (o.notes ? o.notes + " · " : "") + note : o.notes } });
        if (shorts.length) {
          const code = await nextOrderCode(tx, fid, today);
          await tx.order.create({ data: { facilityId: fid, code, date: today, source: "Supplier Order", orderFor: o.orderFor, staffId: o.staffId, supplier: o.supplier, status: "Back Order", ref: o.ref, expected: await expectedFor(tx, fid, o.supplier, today), cc: o.cc, notes: `Back order — short on ${o.code}`, replenish: o.replenish, parentId: o.id, lines: { create: shorts.map((s, i) => ({ ...s, sort: i })) } } });
        }
        if (puLines.length && o.staffId) await tx.pickup.create({ data: { facilityId: fid, orderId: o.id, staffId: o.staffId, received: date, lines: { create: puLines.map((l) => ({ itemId: l.itemId, size: l.size, qty: l.qty })) } } });
      });
      return { ok: true };
    }

    // ---------- pickups
    case "pickup.contacted": {
      const pu = await prisma.pickup.findFirst({ where: { id: str(p.id), facilityId: fid } }); if (!pu) throw new OpError("Unknown pickup", 404);
      await prisma.pickup.update({ where: { id: pu.id }, data: { contacted: p.contacted === undefined ? true : !!p.contacted } });
      return { ok: true };
    }
    case "pickup.pickedUp": {
      const pu = await prisma.pickup.findFirst({ where: { id: str(p.id), facilityId: fid }, include: { lines: true, order: true } }); if (!pu) throw new OpError("Unknown pickup", 404);
      if (pu.pickedUp) return { ok: true };
      const items = await prisma.catalogItem.findMany({ where: { facilityId: fid } });
      const byId: Record<string, Item> = Object.fromEntries(items.map((i) => [i.id, asItem(i)]));
      await lockedTx(fid, async (tx) => {
        const cur = await tx.pickup.findUnique({ where: { id: pu.id }, select: { pickedUp: true } });
        if (cur?.pickedUp) return; // already collected by a concurrent click
        await tx.pickup.update({ where: { id: pu.id }, data: { pickedUp: today } });
        // The same as a delivery on the round: no ceiling check and no override stamp. These garments
        // have counted towards the six this person holds since the day they were ordered — as an order
        // line, then as this pickup — so handing them over moves them from owed to issued and the
        // total doesn't change.
        // Asking capCheck() with them as a cart would count them twice and brand an ordinary
        // collection an override; any decision to go past six was made when they were ordered.
        //
        // And, as on the round, a garment outside their staff group is stamped offGroup — and one
        // that is not their cut offStyle — rather than refused: either can only be on their order
        // because the counter ordered it in on the override.
        const wearer = await tx.staff.findUnique({ where: { id: pu.staffId }, select: { group: true, uniformStyle: true } });
        for (const l of pu.lines) {
          const it = byId[l.itemId] as Item | undefined;
          const si = sizeIndexOf(it, l.size);
          if (si < 0) throw new OpError(`Size ${l.size} is no longer on ${it?.item || "the item"} — fix the catalogue before marking this picked up`);
          await tx.issue.create({ data: { facilityId: fid, date: today, staffId: pu.staffId, itemId: l.itemId, sizeIndex: si, qty: l.qty, cond: "New", cost: it?.cost || 0, orderCode: pu.order.code, direct: true, offGroup: !!it && !garmentForGroup(it, wearer?.group), offStyle: !!it && !garmentForStyle(it, wearer?.uniformStyle) } });
        }
      });
      return { ok: true };
    }

    // ---------- stocktake
    case "stocktake.apply": {
      const counts = Array.isArray(p.lines) ? p.lines : [];
      if (!counts.length) throw new OpError("Nothing counted");
      const snap = await buildSnapshot(user);
      const L = ledger(snap);
      const variants = variantList(snap);
      const vk = new Set(variants.map((v) => v.key));
      const plMode = p.mode === "preloved"; // pre-loved counts write the pool directly (at $0)
      // A count can be scoped to a location (and everything under it), so a shelf take files as a shelf take.
      const locationId = str(p.locationId) || null;
      if (locationId && !snap.locations.some((l) => l.id === locationId)) throw new OpError("Unknown location", 404);
      const scope = locationId ? locSubtree(snap, locationId) : null;
      // Every counted line is filed (so "last counted" is right even when it matched); only variances adjust stock.
      const lines: { itemId: string; si: number; sys: number; counted: number; reason: string }[] = [];
      const seen = new Set<string>();
      for (const c of counts) {
        const it = str(c.itemId), si = int(c.si, -1); const k = key(it, si);
        if (!vk.has(k) || seen.has(k)) continue;
        if (scope && !scope.has(snap.placed[k] || "")) throw new OpError("A counted line isn't on that shelf — refresh and start the count again");
        seen.add(k);
        lines.push({ itemId: it, si, sys: plMode ? plOf(snap, k) : onhand(snap, L, k), counted: Math.max(0, int(c.counted)), reason: str(c.reason, 40) });
      }
      if (!lines.length) throw new OpError("Nothing counted");
      const variances = lines.filter((l) => l.counted !== l.sys);
      // A large gap has to say why, or a shelf quietly loses garments with nothing on the record.
      const gate = Math.max(1, snap.settings.varianceReason);
      const unexplained = variances.find((l) => Math.abs(l.counted - l.sys) >= gate && !l.reason);
      if (unexplained) throw new OpError("A gap that size needs a reason before the count can be committed");
      await lockedTx(fid, async (tx) => {
        for (const l of variances) { if (plMode) await upsertLevel(tx, fid, l.itemId, l.si, { preloved: l.counted }); else await upsertLevel(tx, fid, l.itemId, l.si, { adj: { increment: l.counted - l.sys } }); }
        await tx.stocktake.create({ data: { facilityId: fid, date: today, byName, counted: lines.length, variances: variances.length, mode: plMode ? "preloved" : "shelf", locationId, lines: { create: lines.map((l) => ({ itemId: l.itemId, sizeIndex: l.si, sys: l.sys, counted: l.counted, reason: l.reason })) } } });
      });
      return { counted: lines.length, variances: variances.length };
    }

    // ---------- locations
    case "location.save": {
      admin(user);
      const id = str(p.id);
      const name = str(p.name, 60).trim();
      if (!name) throw new OpError("Give the location a name");
      const kind = LOCATION_KINDS.includes(str(p.kind)) ? str(p.kind) : "Shelf";
      const parentId = str(p.parentId) || null;
      if (parentId) {
        const par = await prisma.location.findFirst({ where: { id: parentId, facilityId: fid } });
        if (!par) throw new OpError("Unknown parent location", 404);
      }
      const clash = await prisma.location.findFirst({ where: { facilityId: fid, name, NOT: id ? { id } : undefined } });
      if (clash) throw new OpError(`There is already a location called ${name}`);
      if (id) {
        const cur = await prisma.location.findFirst({ where: { id, facilityId: fid } });
        if (!cur) throw new OpError("Unknown location", 404);
        // A location can't be moved inside itself — that would orphan the whole branch from the tree.
        if (parentId) {
          const snap = await buildSnapshot(user);
          if (locWouldLoop(snap, id, parentId)) throw new OpError("A location can't sit inside itself");
        }
        await prisma.location.update({ where: { id }, data: { name, kind, parentId, sort: int(p.sort, cur.sort), archived: p.archived === undefined ? cur.archived : !!p.archived } });
        return { id };
      }
      const made = await prisma.location.create({ data: { facilityId: fid, name, kind, parentId, sort: int(p.sort, 0) } });
      return { id: made.id };
    }
    case "location.delete": {
      admin(user);
      const l = await prisma.location.findFirst({ where: { id: str(p.id), facilityId: fid } });
      if (!l) throw new OpError("Unknown location", 404);
      // Children and placements survive: the children move up to this location's parent and the
      // garments become unplaced, so deleting a shelf never quietly loses a bay or a garment.
      await prisma.$transaction(async (tx) => {
        await tx.location.updateMany({ where: { parentId: l.id }, data: { parentId: l.parentId } });
        await tx.location.delete({ where: { id: l.id } });
      });
      return { ok: true };
    }
    case "location.place": {
      // Give variants a home shelf. Coordinators do this while they tidy, so it isn't admin-only.
      const raw = Array.isArray(p.lines) ? p.lines : [{ itemId: p.itemId, si: p.si }];
      const locationId = str(p.locationId) || null;
      if (locationId) {
        const l = await prisma.location.findFirst({ where: { id: locationId, facilityId: fid } });
        if (!l) throw new OpError("Unknown location", 404);
      }
      // Checked before anything is written, because the sizes may have moved under the screen that
      // sent this: another coordinator removing a size shifts every later size down one, so a Stock
      // page opened before that still shows the old run and its last row now points past the end.
      // Writing that placement creates a stock level for a size that doesn't exist — variantList()
      // only walks it.sizes, so it is invisible on every screen, the shelf label she meant to set is
      // never set, and the garment reads as unplaced on the next stocktake of that shelf.
      const places: { itemId: string; si: number }[] = [];
      for (const r of raw) {
        const itemId = str(r.itemId), si = int(r.si, -1);
        if (!itemId || si < 0) continue;
        const it = await ownItem(prisma, fid, itemId);
        if (si >= it.sizes.length) throw new OpError(`That size isn't on the ${it.item} any more — reload the page and place it again.`);
        places.push({ itemId, si });
      }
      let n = 0;
      for (const { itemId, si } of places) {
        await upsertLevel(prisma, fid, itemId, si, {});
        await prisma.stockLevel.update({ where: { itemId_sizeIndex: { itemId, sizeIndex: si } }, data: { locationId } });
        n++;
      }
      if (!n) throw new OpError("Nothing to place");
      return { placed: n };
    }

    // ---------- size exchange: one movement, not a return followed by an issue
    case "issue.exchange": {
      const old = await prisma.issue.findFirst({ where: { id: str(p.id), facilityId: fid } });
      if (!old) throw new OpError("Unknown issue", 404);
      if (old.returnedDate) throw new OpError("That garment has already been returned");
      if (old.handedIn) throw new OpError("That garment was handed in on " + old.handedIn);
      const si = int(p.si, -1);
      if (si === old.sizeIndex) throw new OpError("Pick a different size");
      const snap = await buildSnapshot(user);
      const it = snap.catalog.find((x) => x.id === old.itemId);
      if (!it) throw new OpError("Unknown garment", 404);
      if (si < 0 || si >= it.sizes.length) throw new OpError("Unknown size");
      const qty = Math.min(old.qty, Math.max(1, int(p.qty, old.qty)));
      const k = key(it.id, si);
      if (!old.preloved && qty > onhand(snap, ledger(snap), k)) throw new OpError(`Not enough size ${it.sizes[si]} on the shelf`);
      if (old.preloved && qty > plOf(snap, k)) throw new OpError(`Not enough pre-loved size ${it.sizes[si]} in the pool`);
      const staff = await ownStaff(prisma, fid, old.staffId);
      await lockedTx(fid, async (tx) => {
        const fresh = await buildSnapshot(user, tx);
        if (!old.preloved && qty > onhand(fresh, ledger(fresh), k)) throw new OpError("Someone just took that size — refresh and try again");
        if (old.preloved && qty > plOf(fresh, k)) throw new OpError("The pre-loved pool just changed — refresh and try again");
        if (qty < old.qty) {
          // Only part of the line is swapped: split it so the rest stays out with the staff member.
          await tx.issue.update({ where: { id: old.id }, data: { qty: old.qty - qty } });
          await tx.issue.create({ data: { facilityId: fid, date: old.date, staffId: old.staffId, itemId: old.itemId, sizeIndex: old.sizeIndex, qty, cond: old.cond, cost: old.cost, cc: old.cc, orderCode: old.orderCode, preloved: old.preloved, override: old.override, offGroup: old.offGroup, offStyle: old.offStyle, direct: old.direct, returnedDate: today, returnedCond: "Returned - Good" } });
        } else {
          await tx.issue.update({ where: { id: old.id }, data: { returnedDate: today, returnedCond: "Returned - Good" } });
        }
        if (old.preloved) await poolAdd(tx, fid, old.itemId, old.sizeIndex, qty);
        // The other size of the same garment, so whatever took it outside their staff group or their
        // cut still stands: the new row carries the old one's offGroup and offStyle, as the split
        // above does.
        await tx.issue.create({ data: { facilityId: fid, date: today, staffId: old.staffId, itemId: old.itemId, sizeIndex: si, qty, cond: old.preloved ? "Pre-loved" : "New", cost: old.preloved ? 0 : it.cost, cc: old.cc, preloved: old.preloved, offGroup: old.offGroup, offStyle: old.offStyle } });
        if (old.preloved) await poolAdd(tx, fid, old.itemId, si, -qty);
        // The wrong size is on the staff record too, or they'll be handed it again next time.
        if (p.updateSizes !== false) {
          const size = String(it.sizes[si]);
          if (isTopItem(it) && staff.top !== size) await tx.staff.update({ where: { id: staff.id }, data: { top: size } });
          if (isPantItem(it) && staff.pants !== size) await tx.staff.update({ where: { id: staff.id }, data: { pants: size } });
        }
      });
      return { size: String(it.sizes[si]), qty };
    }

    // ---------- users
    case "users.add": {
      admin(user);
      const email = str(p.email, 160).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new OpError("Valid email required");
      if (str(p.password).length < 8) throw new OpError("Password must be at least 8 characters");
      if (await prisma.user.findUnique({ where: { email } })) throw new OpError("That email already has an account");
      const u = await prisma.user.create({ data: { facilityId: fid, email, passwordHash: await bcrypt.hash(str(p.password, 200), 12), first: str(p.first, 80).trim() || "New", last: str(p.last, 80).trim() || "User", title: str(p.title, 80), role: p.role === "ADMIN" ? "ADMIN" : "ISSUER" } });
      return { id: u.id };
    }
    case "users.update": {
      admin(user);
      const u = await prisma.user.findFirst({ where: { id: str(p.id), facilityId: fid } }); if (!u) throw new OpError("Unknown user", 404);
      const data: Prisma.UserUpdateInput = {};
      if (p.first !== undefined) data.first = str(p.first, 80).trim() || u.first;
      if (p.last !== undefined) data.last = str(p.last, 80).trim() || u.last;
      if (p.title !== undefined) data.title = str(p.title, 80);
      if (p.role !== undefined) {
        const role = p.role === "ADMIN" ? "ADMIN" : "ISSUER";
        if (role === "ISSUER" && u.role === "ADMIN" && !u.inactive) { const admins = await prisma.user.count({ where: { facilityId: fid, role: "ADMIN", inactive: false } }); if (admins <= 1) throw new OpError("Keep at least one active admin"); }
        data.role = role;
      }
      if (p.inactive === false && u.inactive) data.inactive = false; // reactivate
      // The fire escape when the facility requires single sign-on: an admin who keeps a password.
      if (p.ssoBreakGlass !== undefined) { if (u.role !== "ADMIN" && p.role !== "ADMIN") throw new OpError("Only an admin can be the break-glass account"); data.ssoBreakGlass = !!p.ssoBreakGlass; }
      if (p.password !== undefined && p.password !== "") { if (str(p.password).length < 8) throw new OpError("Password must be at least 8 characters"); data.passwordHash = await bcrypt.hash(str(p.password, 200), 12); }
      await prisma.user.update({ where: { id: u.id }, data });
      return { ok: true };
    }
    case "users.remove": {
      admin(user);
      const u = await prisma.user.findFirst({ where: { id: str(p.id), facilityId: fid } }); if (!u) throw new OpError("Unknown user", 404);
      if (u.id === user.id) throw new OpError("You can't remove yourself");
      if (u.role === "ADMIN" && !u.inactive) { const admins = await prisma.user.count({ where: { facilityId: fid, role: "ADMIN", inactive: false } }); if (admins <= 1) throw new OpError("Keep at least one active admin"); }
      // Soft removal: history is stamped with the user's name, and the account can be reactivated.
      await prisma.user.update({ where: { id: u.id }, data: { inactive: true } });
      return { ok: true };
    }
    case "me.profile": {
      const data: Prisma.UserUpdateInput = {};
      if (p.first !== undefined) { const v = str(p.first, 80).trim(); if (!v) throw new OpError("First name is required"); data.first = v; }
      if (p.last !== undefined) { const v = str(p.last, 80).trim(); if (!v) throw new OpError("Last name is required"); data.last = v; }
      if (p.title !== undefined) data.title = str(p.title, 80).trim();
      await prisma.user.update({ where: { id: user.id }, data });
      return { ok: true };
    }
    case "me.password": {
      const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      if (!(await bcrypt.compare(str(p.current, 200), u.passwordHash))) throw new OpError("Current password doesn't match");
      if (str(p.next).length < 8) throw new OpError("New password must be at least 8 characters");
      const passwordHash = await bcrypt.hash(str(p.next, 200), 12);
      await prisma.user.update({ where: { id: u.id }, data: { passwordHash } });
      // Re-issued in the same breath, as the staff app does. A session token carries a fingerprint
      // of the password hash, so a new password ends every session signed against the old one —
      // which is the point, except that it also ends the one belonging to the person who just
      // changed it. They were thrown out to /auth before the confirmation was readable, read it as
      // a failure, and retyped the OLD password at the sign-in screen — each attempt counting
      // against the login lockout. This is the one session that should survive.
      await setSessionCookie(u.id, passwordHash);
      return { ok: true };
    }

    case "me.deleteAccount": {
      // Google Play requires a deletion path that actually completes. Removing the last active
      // admin would otherwise orphan a facility — data nobody can reach and nobody can erase — so
      // that case takes the whole facility with it, behind the password and the typed name.
      const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      if (!(await bcrypt.compare(str(p.password, 200), u.passwordHash))) throw new OpError("That password doesn't match");
      const isDemo = (await prisma.facility.findUniqueOrThrow({ where: { id: fid }, select: { isDemo: true } })).isDemo;
      if (isDemo) throw new OpError("The demo facility is shared — it resets on its own every 20 minutes.");
      const others = await prisma.user.count({ where: { facilityId: fid, inactive: false, id: { not: u.id } } });
      const last = others === 0;
      if (last && user.role !== "ADMIN") throw new OpError("You're the last person who can sign in, so deleting you would delete the facility — that needs an admin account.");
      if (last && str(p.confirm).trim() !== fac.name) throw new OpError(`Type the facility name exactly — ${fac.name} — to confirm`);
      if (last) {
        // A card plan is ended first. Deleting the rows alone left the subscription running at
        // Stripe, charging a card for a facility that no longer exists, and the webhook could not
        // find the row to stop it. If it cannot be ended, nothing is deleted.
        const sub = (await prisma.facility.findUniqueOrThrow({ where: { id: fid }, select: { stripeSubscriptionId: true } })).stripeSubscriptionId;
        if (sub) {
          const { stripeConfigured, cancelSubscriptionNow } = await import("./stripe");
          if (!stripeConfigured()) throw new OpError("The card plan could not be stopped, so nothing was deleted. Stop it under Settings › Plan, then delete.");
          try { await cancelSubscriptionNow(sub); }
          catch { throw new OpError("The card plan could not be stopped just now, so nothing was deleted. Try again in a minute."); }
        }
        // Everything hangs off Facility with onDelete: Cascade, so one delete takes the lot — and
        // then the images, which the cascade cannot reach. Photo rows carry the only record of
        // which files on disk belonged to this facility, so they go in the same breath: a
        // signature or a photograph of somebody's damaged uniform must not outlive the deletion
        // the user was told had happened.
        await prisma.facility.delete({ where: { id: fid } });
        await deletePhotoDir(fid);
        return { deleted: "facility", facility: fac.name };
      }
      // Somebody else still runs this facility: only the person goes. History keeps the name it was
      // stamped with at the time, which is what an audit trail is for.
      if (u.role === "ADMIN") {
        const admins = await prisma.user.count({ where: { facilityId: fid, role: "ADMIN", inactive: false, id: { not: u.id } } });
        if (admins === 0) throw new OpError("You're the only admin left. Make someone else an admin first, or delete the whole facility.");
      }
      await prisma.user.delete({ where: { id: u.id } });
      return { deleted: "user" };
    }

    // ---------- import / data
    case "import.rows": return importRows(user, str(p.kind), Array.isArray(p.rows) ? p.rows : []);
    case "data.wipeActivity": {
      admin(user);
      if (p.confirm !== "WIPE") throw new OpError("Type WIPE to confirm");
      const wiped = await prisma.$transaction(async (tx) => {
        await tx.issue.deleteMany({ where: { facilityId: fid } });
        await tx.slip.deleteMany({ where: { facilityId: fid } });
        await tx.pickup.deleteMany({ where: { facilityId: fid } });
        await tx.order.deleteMany({ where: { facilityId: fid } });
        await tx.stocktake.deleteMany({ where: { facilityId: fid } });
        await tx.stockMove.deleteMany({ where: { facilityId: fid } });
        await tx.approval.deleteMany({ where: { facilityId: fid } });
        await tx.alteration.deleteMany({ where: { facilityId: fid } });
        await tx.handIn.deleteMany({ where: { facilityId: fid } });
        // The staff app's side of the same activity. Leaving it behind is what made the screens
        // disagree: a wearer's collected orders still listed while the issues behind them were
        // gone, an open kit check still asking about holdings that no longer exist, and a request
        // queue against a facility that has just been cleared.
        await tx.request.deleteMany({ where: { facilityId: fid } }); // events and messages cascade
        await tx.waitlistEntry.deleteMany({ where: { facilityId: fid } });
        await tx.kitCheck.deleteMany({ where: { facilityId: fid } }); // answers cascade
        await tx.damageReport.deleteMany({ where: { facilityId: fid } });
        await tx.recordDispute.deleteMany({ where: { facilityId: fid } });
        await tx.linenNotice.deleteMany({ where: { facilityId: fid } });
        const paths = await purgePhotoRows(tx, fid);
        await tx.stockLevel.updateMany({ where: { facilityId: fid }, data: { adj: 0, preloved: 0 } });
        // Request numbering restarts with the order numbering, so R-0001 and ORD-YYYY-0001 mean
        // the same thing again after a wipe.
        await tx.facility.update({ where: { id: fid }, data: { orderSeq: 0, requestSeq: 0 } });
        return paths;
      }, { timeout: 120000 });
      await unlinkAll(wiped);
      return { ok: true };
    }
    case "data.reset": {
      // Start fresh: everything the facility has entered goes, logins and the facility's own settings
      // stay. Deliberately harder to reach than wipeActivity — this also takes the catalogue and staff.
      admin(user);
      if (p.confirm !== "RESET") throw new OpError("Type RESET to confirm");
      const reset = await prisma.$transaction(async (tx) => {
        await tx.issue.deleteMany({ where: { facilityId: fid } });
        await tx.slip.deleteMany({ where: { facilityId: fid } });
        await tx.pickup.deleteMany({ where: { facilityId: fid } });
        await tx.order.deleteMany({ where: { facilityId: fid } });
        await tx.stocktake.deleteMany({ where: { facilityId: fid } });
        await tx.handIn.deleteMany({ where: { facilityId: fid } });
        const paths = await purgePhotoRows(tx, fid);
        await tx.stockMove.deleteMany({ where: { facilityId: fid } });
        await tx.stockLevel.deleteMany({ where: { facilityId: fid } });
        await tx.barcode.deleteMany({ where: { facilityId: fid } });
        await tx.approval.deleteMany({ where: { facilityId: fid } });
        await tx.alteration.deleteMany({ where: { facilityId: fid } });
        await tx.catalogItem.deleteMany({ where: { facilityId: fid } });
        await tx.department.deleteMany({ where: { facilityId: fid } });
        await tx.staff.deleteMany({ where: { facilityId: fid } });
        await tx.location.deleteMany({ where: { facilityId: fid } });
        // Requests, the waitlist, kit-check answers, damage reports, disputes and staff accounts
        // all cascade from the staff and catalogue rows above. These two hang off the facility
        // alone, so a reset would otherwise leave an open kit check and a notice board addressing
        // a facility that no longer has anybody to answer them.
        await tx.kitCheck.deleteMany({ where: { facilityId: fid } });
        await tx.linenNotice.deleteMany({ where: { facilityId: fid } });
        if (p.keepSuppliers !== true) await tx.supplier.deleteMany({ where: { facilityId: fid } });
        // Numbering restarts too, so the first order of the fresh facility is ORD-YYYY-0001.
        await tx.facility.update({ where: { id: fid }, data: { orderSeq: 0, catalogSeq: 0, requestSeq: 0 } });
        return paths;
      }, { timeout: 120000 });
      await unlinkAll(reset);
      return { ok: true };
    }
    default:
      throw new OpError(`Unknown op ${op}`, 404);
  }
}

// CSV / row importers. Row keys are lower-case headers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function importRows(user: SessionUser, kind: string, rows: any[]) {
  admin(user);
  const fid = user.facilityId;
  // `styles` counts the uniform styles the staff import set, and stays 0 for every other kind. It is
  // declared here beside the rest because they are all reported back from the one return below.
  let created = 0, updated = 0, skipped = 0, styles = 0; const errors: string[] = [];
  if (rows.length > 20000) throw new OpError("Import at most 20,000 rows at a time");
  const g = (r: Record<string, unknown>, ...ks: string[]) => { for (const k of ks) { const v = r[k]; if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim().slice(0, 400); } return ""; };
  const norm = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase().replace(/[^a-z0-9]/g, ""), v]));
  if (kind === "catalog") {
    const existing = await prisma.catalogItem.findMany({ where: { facilityId: fid } });
    for (const [i, raw] of rows.entries()) {
      const r = norm(raw);
      const item = g(r, "item", "name", "itemname", "garment"); if (!item) { skipped++; continue; }
      const genderRaw = g(r, "gender").toLowerCase();
      const gender = genderRaw.startsWith("m") ? "Male" : genderRaw.startsWith("f") || genderRaw.startsWith("w") ? "Female" : "Unisex";
      const sku = g(r, "sku", "code", "productcode");
      const sizes = g(r, "sizes", "size").split(/[|,;/]/).map((s) => s.trim()).filter(Boolean);
      const cost = parseFloat(g(r, "cost", "unitcost", "price").replace(/[^0-9.]/g, "")) || 0;
      const supplierIn = g(r, "supplier", "vendor");
      // Blank means "don't change it", not "All". A supplier price list carries item, sku and cost
      // and no group column at all, and re-importing one used to move every matched garment back
      // to All — which silently re-scopes what the Issue screen offers each staff group.
      // Several groups are separated by |; "All" is every group, stored as no list at all.
      const groupIn = g(r, "group", "staffgroup");
      const groups = garmentGroups(groupIn.split("|"));
      const notes = g(r, "notes", "note");
      const type = g(r, "type", "producttype", "garmenttype").slice(0, 40);
      try {
        // The directory's spelling, not the spreadsheet's: a price list that writes the supplier in
        // lower case must not leave the garment pointing at a name the supplier directory doesn't hold.
        const supplier = supplierIn ? await ensureSupplier(prisma, fid, supplierIn) : "";
        const ex = existing.find((e) => e.item === item && e.gender === gender && (sku ? e.sku === sku : true));
        if (ex) {
          const merged = [...ex.sizes]; for (const s of sizes) if (!merged.includes(s)) merged.push(s);
          const patch = { sku: sku || ex.sku, cost: cost || ex.cost, supplier: supplier || ex.supplier, groups: groupIn ? groups : ex.groups, notes: notes || ex.notes, type: type || ex.type, sizes: merged };
          await prisma.catalogItem.update({ where: { id: ex.id }, data: patch });
          // Folded back into the list this loop matches against, because one garment routinely spans
          // several rows — a supplier price list has a row per SKU-size, and the templates are all
          // one row per size. `existing` is read once before the loop, so without this the next row
          // for the same garment merges its size into the sizes the item had BEFORE the import and
          // writes that back: every size but the last is silently dropped, and a nurse who wears M
          // can never be issued one although the CSV plainly listed it.
          Object.assign(ex, patch);
          updated++;
        } else {
          if (!sizes.length) { errors.push(`Row ${i + 1}: ${item} has no sizes`); skipped++; continue; }
          await prisma.$transaction(async (tx) => { const sort = await nextSort(tx, fid); const c = await tx.catalogItem.create({ data: { facilityId: fid, sort, item, gender, type, sku, supplier, cost, groups, notes, sizes } }); existing.push(c); });
          created++;
        }
      } catch (e) { errors.push(`Row ${i + 1}: ${(e as Error).message}`); }
    }
  } else if (kind === "staff") {
    // Counted and reported back, because `gender` is among the column names this reads: a coordinator
    // re-importing a roster export sets the cut for the whole register in one go, and a change that
    // size should say how many records it touched rather than happen quietly. The counter itself is
    // declared with the others at the top, because the return that reports it is shared by every kind.
    const depts = await prisma.department.findMany({ where: { facilityId: fid } });
    for (const [i, raw] of rows.entries()) {
      const r = norm(raw);
      const numv = g(r, "num", "staffnumber", "staffno", "number", "payroll", "payrollnumber", "id");
      let first = g(r, "first", "firstname", "given"); let last = g(r, "last", "lastname", "surname", "family");
      const name = g(r, "name", "fullname"); if (!first && !last && name) { const parts = name.split(/\s+/); first = parts.shift() || ""; last = parts.join(" "); }
      if (!numv || !first) { skipped++; continue; }
      const dept = g(r, "dept", "department", "ward", "wardunit"); const cc = g(r, "cc", "costcentre", "costcenter", "departmentcostcentre");
      if (dept && cc && !depts.find((d) => d.name === dept)) { const d = await prisma.department.create({ data: { facilityId: fid, name: dept, cc, sort: depts.length } }); depts.push(d); }
      const entRaw = g(r, "ent", "entitlement", "annualentitlement");
      const entN = parseInt(entRaw, 10);
      // A start date typed in a spreadsheet arrives as whatever the machine's locale writes.
      // Day-first is converted; anything else is reported and left blank rather than stored as
      // text the register would then render as "Invalid Date" for the rest of the person's career.
      const startRaw = g(r, "start", "startdate", "commenced");
      const start = isoDate(startRaw);
      if (startRaw && !start) errors.push(`Row ${i + 1}: start date “${startRaw}” isn't a date — write it as YYYY-MM-DD. Left blank.`);
      // Combined FTE, off whatever the roster export calls the column. Whatever fraction the export
      // carries is kept — a roster is where these figures come from, and the table reads one it has
      // no row for as the band it falls in. A cell that is no fraction at all is reported and left
      // blank, the way a bad start date is: it proposes no kit, and a whole register import is not
      // worth failing over one odd cell — but nor should it pass silently, because the kit an FTE
      // works out to is the number a manager will be asked to sign for.
      const fteRaw = g(r, "fte", "combinedfte", "totalcombinedfte", "totalfte", "employmentfraction", "fraction");
      const fteIn = normalFte(fteRaw);
      if (fteRaw && fteIn === null) errors.push(`Row ${i + 1}: FTE “${fteRaw}” isn't a fraction — write ${FTE_ALLOWED}. Left blank.`);
      // Which cut of uniform this person is offered, off whatever the file calls the column —
      // `gender` among the names, because a register exported from a payroll or a roster system is
      // the file this gets loaded from and that is the header it will have. The words are read
      // through normalUniformStyle(), so "M", "Male" and "Men's" all land on the same value.
      //
      // A cell the rule can't read is reported and left blank, the way a bad FTE is: blank is what
      // every record is today and it offers every style, so nothing is refused at the counter over
      // it — but nor does it pass in silence, because a coordinator who meant to set the whole
      // register would otherwise never learn that a column of "M/F" spelt some other way did nothing.
      const styleRaw = g(r, "style", "uniformstyle", "uniform", "cut", "gender");
      const styleIn = normalUniformStyle(styleRaw);
      if (styleRaw && styleIn === null) errors.push(`Row ${i + 1}: uniform style “${styleRaw}” isn't ${UNIFORM_STYLES.join(", ")} or blank. Left blank.`);
      const data = { first, last: last || "—", phone: g(r, "phone", "mobile", "contact"), group: g(r, "group", "staffgroup", "classification"), dept, top: g(r, "top", "topsize", "shirt", "shirtsize"), pants: g(r, "pants", "pantsize", "pant", "trouser"), ccOverride: g(r, "ccoverride", "costcentreoverride"), ent: Number.isFinite(entN) ? entN : null, fte: fteIn ?? "", uniformStyle: styleIn ?? "", start, notes: g(r, "notes", "note") };
      try {
        const ex = await prisma.staff.findFirst({ where: { facilityId: fid, num: numv } });
        if (ex) {
          // Re-import only overwrites columns the row actually provides — blank cells keep the existing value.
          const patch: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(data)) if (v !== "" && v !== null && v !== "—") patch[k] = v;
          await prisma.staff.update({ where: { id: ex.id }, data: patch }); updated++;
          if (patch.uniformStyle) styles++;
        } else {
          await prisma.staff.create({ data: { facilityId: fid, num: numv, ...data } }); created++; if (styleIn) styles++;
        }
      } catch (e) { errors.push(`Row ${i + 1}: ${(e as Error).message}`); }
    }
    // Managers are linked in a second pass, on purpose: a manager can appear further down the same
    // file than the people reporting to them, so nothing can be linked until every row exists.
    // The column holds a staff number, not a name — names repeat on a big register, and a wrong
    // link here would send somebody's approvals to a stranger.
    const byNum = new Map((await prisma.staff.findMany({ where: { facilityId: fid }, select: { id: true, num: true } })).map((x) => [x.num, x.id] as const));
    for (const [i, raw] of rows.entries()) {
      const r = norm(raw);
      const numv = g(r, "num", "staffnumber", "staffno", "number", "payroll", "payrollnumber", "id");
      const mgr = g(r, "manager", "managernum", "managernumber", "approver", "reportsto");
      if (!numv || !mgr) continue;
      const meId = byNum.get(numv), mgrId = byNum.get(mgr);
      if (!meId) continue;
      if (!mgrId) { errors.push(`Row ${i + 1}: no staff member with number ${mgr} to be the manager`); continue; }
      // A row naming its own staff number as the manager is kept as written: anybody may be their
      // own manager, and staff.patch sets it the same way.
      try { await prisma.staff.update({ where: { id: meId }, data: { managerId: mgrId } }); }
      catch (e) { errors.push(`Row ${i + 1}: ${(e as Error).message}`); }
    }
  } else if (kind === "depts") {
    for (const [i, raw] of rows.entries()) {
      const r = norm(raw);
      const name = g(r, "dept", "department", "name", "ward"); const cc = g(r, "cc", "costcentre", "costcenter", "code");
      if (!name) { skipped++; continue; }
      // A blank cost-centre cell means "not in this file", not "clear it" — the same rule the staff
      // importer follows. A ward that had no cost centre when the list was first imported and had
      // one typed in on Settings afterwards was losing it again the next time the unedited file was
      // re-imported to add a couple of wards, and every issue on that ward then reported with an
      // empty cost centre and landed in the monthly journal under UNALLOCATED.
      try { const ex = await prisma.department.findFirst({ where: { facilityId: fid, name } }); if (ex) { await prisma.department.update({ where: { id: ex.id }, data: { cc: cc || ex.cc, sort: i } }); updated++; } else { await prisma.department.create({ data: { facilityId: fid, name, cc, sort: i } }); created++; } }
      catch (e) { errors.push(`Row ${i + 1}: ${(e as Error).message}`); }
    }
  } else if (kind === "barcodes" || kind === "opening" || kind === "reorder") {
    const items = await prisma.catalogItem.findMany({ where: { facilityId: fid } });
    for (const [i, raw] of rows.entries()) {
      const r = norm(raw);
      const sku = g(r, "sku", "code", "productcode"), item = g(r, "item", "name", "itemname", "garment"), size = g(r, "size"), genderRaw = g(r, "gender").toLowerCase();
      const gender = genderRaw ? (genderRaw.startsWith("m") ? "Male" : genderRaw.startsWith("f") || genderRaw.startsWith("w") ? "Female" : "Unisex") : "";
      const cands = items.filter((it) => (sku ? it.sku === sku : true) && (item ? it.item === item : true) && (gender ? it.gender === gender : true));
      if (cands.length !== 1) { errors.push(`Row ${i + 1}: ${cands.length === 0 ? "no" : "several"} catalogue items match sku=${sku || "?"} item=${item || "?"} gender=${gender || "?"}`); skipped++; continue; }
      const it = cands[0]; const si = it.sizes.map(String).indexOf(size);
      if (si < 0) { errors.push(`Row ${i + 1}: size ${size} not on ${it.item}`); skipped++; continue; }
      try {
        if (kind === "barcodes") {
          const code = g(r, "barcode", "ean", "code128", "scan"); if (!code) { skipped++; continue; }
          // A supplier price list often carries one code per STYLE rather than per size, so the
          // same number arrives on the S, M and L rows. The upsert is keyed on the code alone, so
          // it just walked the single binding down the rows: S and M ended up unlabelled while L
          // looked fine, and every garment on the rack then scanned as an L — tallying against L in
          // a stocktake and decrementing L when a size S was handed over. Refused here, naming
          // where the code already sits, so the coordinator can see the list is per style.
          await assertBindable(prisma, fid, code, it.id, si, false);
          await prisma.barcode.upsert({ where: { facilityId_code: { facilityId: fid, code } }, create: { facilityId: fid, code, itemId: it.id, sizeIndex: si, source: "supplier" }, update: { itemId: it.id, sizeIndex: si } });
        }
        else if (kind === "opening") {
          // A blank quantity is "I haven't counted this shelf", not "there are none". These sheets
          // are usually every size of every garment with only this week's recount filled in, and
          // writing 0 for the rest wiped opening balances set months earlier through the UI or a
          // previous import — the shelf reads empty with garments on it, the row is counted as a
          // success, and the reorder engine starts ordering stock the room already has.
          const qRaw = g(r, "opening", "qty", "quantity", "onhand", "count");
          const ro = g(r, "reorder", "reorderat", "reorderlevel");
          const q = parseInt(qRaw, 10);
          if (qRaw && !Number.isFinite(q)) { errors.push(`Row ${i + 1}: opening “${qRaw}” isn't a number — that size was left as it was`); skipped++; continue; }
          if (!qRaw && !ro) { skipped++; continue; }
          if (qRaw) await upsertLevel(prisma, fid, it.id, si, { opening: Math.max(0, q) });
          if (ro) await upsertLevel(prisma, fid, it.id, si, { reorder: Math.max(0, parseInt(ro, 10) || 0) });
        }
        else { const ro = parseInt(g(r, "reorder", "reorderat", "reorderlevel", "level"), 10); if (!Number.isFinite(ro)) { skipped++; continue; } await upsertLevel(prisma, fid, it.id, si, { reorder: Math.max(0, ro) }); }
        created++;
      } catch (e) { errors.push(`Row ${i + 1}: ${(e as Error).message}`); }
    }
  } else throw new OpError("Unknown import kind");
  return { created, updated, skipped, styles, errors: errors.slice(0, 40) };
}

export async function exportBackup(user: SessionUser) {
  const fid = user.facilityId;
  const [fac, items, barcodes, stock, moves, depts, suppliers, staff, approvals, alterations, issues, orders, pickups, stocktakes, handins, photos, locations, costs, requests, waitlist, kitChecks, damage, disputes, notices, slips] = await Promise.all([
    prisma.facility.findUniqueOrThrow({ where: { id: fid } }),
    prisma.catalogItem.findMany({ where: { facilityId: fid }, orderBy: { sort: "asc" } }),
    prisma.barcode.findMany({ where: { facilityId: fid } }),
    prisma.stockLevel.findMany({ where: { facilityId: fid } }),
    prisma.stockMove.findMany({ where: { facilityId: fid } }),
    prisma.department.findMany({ where: { facilityId: fid } }),
    // In the directory's own order: the first supplier is the facility's default, and the file has
    // to carry that rather than whatever order the rows happen to come back in.
    prisma.supplier.findMany({ where: { facilityId: fid }, orderBy: [{ sort: "asc" }, { name: "asc" }] }),
    prisma.staff.findMany({ where: { facilityId: fid } }),
    prisma.approval.findMany({ where: { facilityId: fid } }),
    prisma.alteration.findMany({ where: { facilityId: fid } }),
    prisma.issue.findMany({ where: { facilityId: fid } }),
    prisma.order.findMany({ where: { facilityId: fid }, include: { lines: true, receipts: { include: { lines: true } } } }),
    prisma.pickup.findMany({ where: { facilityId: fid }, include: { lines: true } }),
    prisma.stocktake.findMany({ where: { facilityId: fid }, include: { lines: true } }),
    prisma.handIn.findMany({ where: { facilityId: fid }, include: { lines: true } }),
    prisma.photo.findMany({ where: { facilityId: fid } }),
    prisma.location.findMany({ where: { facilityId: fid }, orderBy: { sort: "asc" } }),
    prisma.costChange.findMany({ where: { facilityId: fid }, orderBy: { at: "asc" } }),
    // The staff app's half of the facility. It used to be missing entirely, which made "one JSON
    // file with everything in it" untrue in the worst possible way: restoring wiped every request,
    // every message thread and every manager link, and none of it was in the file to come back.
    prisma.request.findMany({ where: { facilityId: fid }, orderBy: { createdAt: "asc" }, include: { lines: { orderBy: { sort: "asc" } }, events: { orderBy: { at: "asc" } }, messages: { orderBy: { createdAt: "asc" } } } }),
    prisma.waitlistEntry.findMany({ where: { facilityId: fid } }),
    prisma.kitCheck.findMany({ where: { facilityId: fid }, include: { answers: true } }),
    prisma.damageReport.findMany({ where: { facilityId: fid } }),
    prisma.recordDispute.findMany({ where: { facilityId: fid } }),
    prisma.linenNotice.findMany({ where: { facilityId: fid } }),
    prisma.slip.findMany({ where: { facilityId: fid }, orderBy: { createdAt: "asc" } }),
  ]);
  /* Backups stay self-contained: images are read back off disk and embedded, so the format is the
   * same as before the move and "take the data and go" still means everything.
   *
   * Everything except the images beyond what a restore will take back. A room that signs for a
   * delivery round every day passes the 2000-photo cap inside a year or two and the import POST's
   * size limit well before that, and neither end said a word: the export succeeded, Settings
   * showed "Last backup: today", and the file turned out to be unrestorable months later when it
   * was the only copy left. Records are the point of a backup and images are attachments to them,
   * so the newest images travel, the rest are counted in `photosOmitted`, and the file restores. */
  const newestFirst = [...photos].sort((a, c) => c.createdAt.getTime() - a.createdAt.getTime());
  const photosOut: (typeof photos[number] & { data: string })[] = [];
  let budget = BACKUP_PHOTO_BYTES, photosOmitted = 0;
  for (const ph of newestFirst) {
    const data = ph.path ? (await photoAsDataUrl(ph.path, ph.mime)) ?? "" : ph.data;
    if (!data || photosOut.length >= BACKUP_PHOTO_MAX || data.length > budget) { photosOmitted++; continue; }
    budget -= data.length;
    photosOut.push({ ...ph, data });
  }
  await prisma.facility.update({ where: { id: fid }, data: { lastBackup: facilityToday(fac.timezone) } });
  // Staff accounts are deliberately absent: the row is an email and a password hash, and a backup
  // is a file that gets emailed to people. They survive a restore in place instead — see
  // restoreBackup, which re-attaches them by staff number.
  // Each garment carries its `groups` list and, beside it, `group` written the way the catalogue CSV
  // writes it — the names joined by |, or All — so a file read by hand or by an older build still
  // says who the garment is for. Restore reads the list whenever it is there.
  // The plan label and note are ThreadCount's notes about the facility, not the
  // facility's own record: they stay out of the file, and restore never reads them either.
  const { plan: _plan, planNote: _planNote, ...facOut } = fac;
  void _plan; void _planNote;
  return { format: "threadcount-backup-v2", exportedAt: new Date().toISOString(), photosOmitted, facility: facOut, items: items.map((it) => ({ ...it, group: it.groups.length ? it.groups.join("|") : "All" })), barcodes, stock, moves, depts, suppliers, staff, approvals, alterations, issues, orders, pickups, stocktakes, handins, photos: photosOut, locations, costs, requests, waitlist, kitChecks, damage, disputes, notices, slips };
}

/** How the starting kit was decided before a facility could list its own kit groups: any group with
 *  these letters in its name. Read only off a backup file written under that rule, so that it
 *  restores exactly as it ran. Nothing live asks it. */
const KIT_BEFORE_THE_LIST = /operational/i;
/* The FTE-table groups a facility was assumed to have before it could name its own — what an empty
 * list stood for in a backup written before the starting-kit list existed. Only restore reads it, to
 * read such a file the way the facility that wrote it was running; nothing offers these names to
 * anybody, and a facility created now starts with an empty list that stays empty until it says. */
const NURSING_BEFORE_THE_LIST = ["Registered Nurse", "Enrolled Nurse", "Assistant in Nursing", "USINS"];

// Full restore into the current facility: wipes facility data (not users) and re-creates with fresh ids.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function restoreBackup(user: SessionUser, b: any) {
  const cap = (arr: unknown, n: number, what: string) => { if (Array.isArray(arr) && arr.length > n) throw new OpError(`Backup has too many ${what} (${arr.length} > ${n})`); };
  // Photos are trimmed rather than refused, unlike every other cap here. The rest of the file is
  // the facility's records; images are attachments to them, and turning away a year of issues,
  // orders and requests because an older file carries more signatures than we will take back
  // leaves the room with nothing at all. The extras are dropped and counted, the records come back.
  const photoRows: { id?: unknown; kind?: unknown; data?: unknown; createdAt?: unknown }[] = Array.isArray(b?.photos) ? b.photos.slice(0, BACKUP_PHOTO_MAX) : [];
  const photosSkipped = Array.isArray(b?.photos) ? b.photos.length - photoRows.length : 0;
  cap(b?.items, 5000, "items"); cap(b?.staff, 20000, "staff"); cap(b?.issues, 300000, "issues"); cap(b?.orders, 50000, "orders"); cap(b?.stocktakes, 5000, "stocktakes"); cap(b?.pickups, 50000, "pickups"); cap(b?.handins, 50000, "hand-ins"); cap(b?.moves, 100000, "moves"); cap(b?.barcodes, 50000, "barcodes"); cap(b?.stock, 100000, "stock lines"); cap(b?.locations, 5000, "locations"); cap(b?.costs, 100000, "cost changes");
  cap(b?.requests, 200000, "requests"); cap(b?.waitlist, 50000, "waitlist entries"); cap(b?.kitChecks, 5000, "kit checks"); cap(b?.damage, 50000, "damage reports"); cap(b?.disputes, 50000, "queries"); cap(b?.notices, 1000, "notices"); cap(b?.slips, 300000, "slips");
  admin(user);
  if (!b || !["threadcount-backup-v1", "threadcount-backup-v2"].includes(b.format) || !Array.isArray(b.items)) throw new OpError("Not a ThreadCount backup file");
  const fid = user.facilityId;
  // Every image this restore lays down, so a restore that doesn't commit can take them back off
  // disk again — see the catch below.
  const written: string[] = [];
  const orphanedFiles = await prisma.$transaction(async (tx) => {
    // Read before anything is deleted. Staff accounts are the one part of the staff app that is
    // not in the file and must never be — the row is an email and a password hash — so they are
    // carried across the restore in place and re-attached by staff number, the only identifier
    // that survives it. Without this a restore silently ends every wearer's login.
    const keptAccounts = (await tx.staffAccount.findMany({ where: { facilityId: fid }, include: { staff: { select: { num: true } } } }))
      .map((a) => ({ num: a.staff.num, email: a.email, passwordHash: a.passwordHash, createdAt: a.createdAt, lastSeenAt: a.lastSeenAt }));
    const ourUsers = new Set((await tx.user.findMany({ where: { facilityId: fid }, select: { id: true } })).map((u) => u.id));
    await tx.issue.deleteMany({ where: { facilityId: fid } });
    await tx.slip.deleteMany({ where: { facilityId: fid } });
    await tx.pickup.deleteMany({ where: { facilityId: fid } });
    await tx.order.deleteMany({ where: { facilityId: fid } });
    await tx.stocktake.deleteMany({ where: { facilityId: fid } });
    await tx.handIn.deleteMany({ where: { facilityId: fid } });
    const orphans = await purgePhotoRows(tx, fid);
    await tx.stockMove.deleteMany({ where: { facilityId: fid } });
    await tx.stockLevel.deleteMany({ where: { facilityId: fid } });
    await tx.barcode.deleteMany({ where: { facilityId: fid } });
    await tx.approval.deleteMany({ where: { facilityId: fid } });
    await tx.alteration.deleteMany({ where: { facilityId: fid } });
    // The staff app's tables go explicitly rather than by cascade, so that what a restore removes
    // is written down here where anyone reading it can see the whole list.
    await tx.request.deleteMany({ where: { facilityId: fid } }); // events and messages cascade
    await tx.waitlistEntry.deleteMany({ where: { facilityId: fid } });
    await tx.kitCheck.deleteMany({ where: { facilityId: fid } }); // answers cascade
    await tx.damageReport.deleteMany({ where: { facilityId: fid } });
    await tx.recordDispute.deleteMany({ where: { facilityId: fid } });
    await tx.linenNotice.deleteMany({ where: { facilityId: fid } });
    await tx.catalogItem.deleteMany({ where: { facilityId: fid } });
    await tx.department.deleteMany({ where: { facilityId: fid } });
    await tx.supplier.deleteMany({ where: { facilityId: fid } });
    await tx.staff.deleteMany({ where: { facilityId: fid } });
    await tx.location.deleteMany({ where: { facilityId: fid } });
    const f = b.facility || {};
    /* The in-house barcode counter travels with the file. Left at zero in a fresh facility, the
     * first press of "Generate a barcode" mints 2900000000018 — a code the restore has just put
     * back — then walks through 49 more that are all taken and gives up; and because the throw
     * aborts the transaction, the 50 increments roll back too, so the next press does exactly the
     * same thing. Generating a label becomes permanently impossible and unlabelled stock can never
     * be scanned into a count. Floored at the highest 29… code actually restored as well as the
     * stored counter, because a file written before this column existed carries no counter at all. */
    const restoredSeq: number = (Array.isArray(b.barcodes) ? b.barcodes : []).reduce((mx: number, bc: { code?: unknown }) => {
      const c = str(bc?.code, 64);
      return isInHouse(c) ? Math.max(mx, int(c.slice(2, 12))) : mx;
    }, 0);
    /* Which route each group is on. The export writes the whole facility row, so a file from now on
     * carries both lists and they come back as written.
     *
     * The FTE-table list is left as it is when the file hasn't got one, rather than emptied like
     * staffGroups. Such a file was written before the list existed, when a different test decided
     * who was on the table, so the facility's own list as it stands is a better answer than the
     * file's silence — and an empty list now means no group on the table at all, which would take
     * every first kit the table proposes away with it.
     *
     * The starting-kit list, when the file hasn't got one, is read the way that file's facility was
     * running when it was written. Until the list existed the kit went to any group with
     * "operational" in its name, so exactly those groups — in the file's settings and on its staff
     * records — go on it, which is what the migration that added the list did to every facility
     * already running. Left empty instead, a restore would put every starting-kit wearer on manager
     * approval, at the one moment nobody is checking who is on what.
     *
     * A group on both lists — only possible in a file edited by hand — comes off the kit list. The
     * FTE table wins wherever the two meet (allowanceRoute in lib/sets), and a stored overlap would
     * have the next settings save refused over a group nobody touched. */
    // A file written before the starting-kit list existed has no kitGroups key, and in those files an
    // empty or missing FTE list meant the nursing groups the product used to assume. It is read that
    // way here, as the migration read every facility already running: read literally, restoring an old
    // file — onto a fresh signup especially — would put every nurse on manager approval. A file written
    // since means exactly what it says.
    const beforeTheList = !Array.isArray(f.kitGroups);
    const fileNursing: string[] | null = Array.isArray(f.nursingGroups) ? f.nursingGroups.map((s: unknown) => str(s, 80)) : null;
    const nursingRestored: string[] = beforeTheList && !(fileNursing && fileNursing.length)
      ? [...NURSING_BEFORE_THE_LIST]
      : fileNursing ?? (await tx.facility.findUniqueOrThrow({ where: { id: fid }, select: { nursingGroups: true } })).nursingGroups;
    const kitFrom: unknown[] = Array.isArray(f.kitGroups)
      ? f.kitGroups
      : [...(Array.isArray(f.staffGroups) ? f.staffGroups : []), ...(Array.isArray(b.staff) ? b.staff.map((s: { group?: unknown }) => s?.group) : [])]
          .filter((g) => KIT_BEFORE_THE_LIST.test(str(g, 80)));
    const kitRestored: string[] = [];
    for (const raw of kitFrom) {
      const g = str(raw, 80).trim();
      if (groupKey(g) && !isNursingGroup(nursingRestored, g) && !isKitGroup(kitRestored, g)) kitRestored.push(g);
    }
    // capSets travels because the whole facility row is exported: leave it out of this half and a
    // restore quietly hands everybody back the standing six, which is a different answer from the
    // one the facility agreed with its managers. An older file carries no ceiling at all, and for
    // that one the standing six is the honest reading.
    await tx.facility.update({ where: { id: fid }, data: { barcodeSeq: Math.max(int(f.barcodeSeq, 0), restoredSeq), name: str(f.name, 120) || undefined, location: str(f.location, 120), coordinator: str(f.coordinator, 120), coordinatorEmail: str(f.coordinatorEmail, 160), coordinatorPhone: str(f.coordinatorPhone, 40), defaultEntitlement: int(f.defaultEntitlement, 5), initialSets: setsOnStart(int(f.initialSets, 0)), capSets: setsCap(int(f.capSets, 0)), nursingGroups: nursingRestored, kitGroups: kitRestored, defaultReorder: int(f.defaultReorder, 3), exceptionHigh: int(f.exceptionHigh, 10), varianceReason: Math.max(1, int(f.varianceReason, 5)), glAccount: str(f.glAccount, 40), journalDesc: str(f.journalDesc, 120) || "Uniform issues", logoData: typeof f.logoData === "string" && f.logoData.length <= LOGO_MAX * 1.4 && /^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(f.logoData) ? f.logoData : "", staffGroups: Array.isArray(f.staffGroups) ? f.staffGroups.map((s: unknown) => str(s, 80)) : [], orderSeq: int(f.orderSeq, 0), catalogSeq: int(f.catalogSeq, 0), requestSeq: int(f.requestSeq, 0), timezone: zoneOf(f.timezone), slipCollectionFooter: str(f.slipCollectionFooter, 400), slipDeliveryFooter: str(f.slipDeliveryFooter, 400), slipOrg: str(f.slipOrg, 120), barcodeLookup: !!f.barcodeLookup } });
    // Suppliers: v2 rows, or v1 facility.suppliers[] names.
    const supNames: string[] = Array.isArray(b.suppliers) ? b.suppliers.map((s: { name: string }) => str(s.name, 80)) : Array.isArray(f.suppliers) ? f.suppliers.map((s: unknown) => str(s, 80)) : [];
    // `sort` is carried across rather than re-derived from the array position. It decides the
    // facility's default supplier — the one a new catalogue item and an auto-created replenishment
    // order are addressed to — and the export reads the rows in whatever order Postgres hands them
    // back, which changes the moment somebody edits a supplier's phone number. Re-numbering on the
    // way in was quietly promoting whichever supplier had been edited most recently, so a restored
    // facility started sending its replenishment orders to the wrong company.
    for (const [i, name] of supNames.entries()) if (name) { const src = Array.isArray(b.suppliers) ? b.suppliers[i] : {}; await tx.supplier.create({ data: { facilityId: fid, name, contact: str(src.contact, 120), phone: str(src.phone, 120), account: str(src.account, 120), lead: src.lead === null || src.lead === undefined ? null : int(src.lead), sort: src && src.sort !== undefined && src.sort !== null ? int(src.sort, i) : i } }); }
    const photoMap: Record<string, string> = {};
    // A restored backup carries its images as base64; they land on disk like any new capture, so a
    // restore doesn't quietly reintroduce the database bloat this move removed.
    for (const ph of photoRows) {
      const d = str(ph.data, PHOTO_MAX + 200);
      const parsed = parseDataUrl(d);
      if (!parsed) continue;
      const c = await tx.photo.create({ data: { facilityId: fid, kind: str(ph.kind, 20) || "photo", mime: parsed.mime, bytes: parsed.bytes.length, createdAt: stamp(ph.createdAt) ?? undefined } });
      const rel = await writePhoto(fid, c.id, parsed);
      written.push(rel);
      await tx.photo.update({ where: { id: c.id }, data: { path: rel } });
      photoMap[String(ph.id)] = c.id;
    }
    const pm = (id: unknown): string | null => (id ? photoMap[String(id)] || null : null);
    const itemMap: Record<string, string> = {}; const staffMap: Record<string, string> = {}; const orderMap: Record<string, string> = {};
    const issueMap: Record<string, string> = {}; const requestMap: Record<string, string> = {};
    // A garment's groups: the list a file written since carries, or else its `group` — one name in an
    // older file, names joined by | as the CSV writes them — with "All" or blank being every group,
    // which garmentGroups() makes the empty list.
    for (const it of b.items) { const c = await tx.catalogItem.create({ data: { facilityId: fid, sort: int(it.sort), item: str(it.item, 160), gender: str(it.gender, 20), type: str(it.type, 40), sku: str(it.sku, 60), supplier: str(it.supplier, 80), cost: num(it.cost), groups: garmentGroups(Array.isArray(it.groups) ? it.groups.map((s: unknown) => str(s, 80)) : str(it.group, 4000).split("|")), notes: str(it.notes, 400), sizes: (it.sizes || []).map((s: unknown) => str(s, 20)), archived: !!it.archived } }); itemMap[it.id] = c.id; }
    for (const d of b.depts || []) await tx.department.create({ data: { facilityId: fid, name: str(d.name, 120), cc: str(d.cc, 40), sort: int(d.sort) } });
    // Activation codes are globally unique because a code has to identify a person before we know
    // which facility they are in. This facility's own codes went with the staff rows above; a code
    // still held by some other facility is dropped rather than failing the whole restore.
    const wantedCodes = (b.staff || []).map((s: { activateCode?: unknown }) => str(s.activateCode, 40)).filter(Boolean);
    const takenCodes = new Set(wantedCodes.length
      ? (await tx.staff.findMany({ where: { activateCode: { in: wantedCodes } }, select: { activateCode: true } })).map((x) => x.activateCode as string)
      : []);
    for (const s of b.staff || []) {
      const code = str(s.activateCode, 40);
      // FTE comes back exactly as the file has it, not re-judged on the way in. It was written by
      // this app in the first place, and a restore that quietly blanks a figure it no longer likes
      // would move that nurse onto no proposed kit at all with nothing on the screen to say so —
      // the one failure a backup exists to prevent. Approval.fte has always been carried across
      // this way for the same reason: it is a record of what was signed, not a fresh entry.
      // Uniform style is read through the same normaliser the register and the importer use rather
      // than taken verbatim, because only the words the rule knows decide anything. A file written
      // before the field existed carries none, and those records come back blank — offered every
      // style, which is exactly what they were being offered on the day the backup was written.
      const c = await tx.staff.create({ data: { facilityId: fid, num: str(s.num, 40), first: str(s.first, 80), last: str(s.last, 80), phone: str(s.phone, 40), group: str(s.group, 80), dept: str(s.dept, 120), top: str(s.top, 20), pants: str(s.pants, 20), ccOverride: str(s.ccOverride, 40), inactive: !!s.inactive, ent: s.ent === null || s.ent === undefined ? null : int(s.ent), fte: str(s.fte, 20), uniformStyle: normalUniformStyle(s.uniformStyle) ?? "", start: isoDate(s.start), notes: str(s.notes, 2000), wardDesk: !!s.wardDesk, activateCode: code && !takenCodes.has(code) ? code : null, activateCodeAt: stamp(s.activateCodeAt) } });
      staffMap[s.id] = c.id;
    }
    // Manager links in a second pass: a manager can appear later in the file than the people who
    // report to them, and until every row exists there is nothing to point at. Without this a
    // restored facility has nobody who can approve anything, so no request can be raised at all.
    // Somebody who is their own manager comes back as their own manager — staffMap maps their id
    // to their own new row on both sides.
    for (const s of b.staff || []) if (s.managerId && staffMap[s.id] && staffMap[s.managerId]) await tx.staff.update({ where: { id: staffMap[s.id] }, data: { managerId: staffMap[s.managerId] } });
    // Their own logins, re-attached to the freshly minted staff rows by staff number.
    const staffByNum = new Map((await tx.staff.findMany({ where: { facilityId: fid }, select: { id: true, num: true } })).map((x) => [x.num, x.id] as const));
    for (const a of keptAccounts) {
      const sid = staffByNum.get(a.num);
      if (sid) await tx.staffAccount.create({ data: { facilityId: fid, staffId: sid, email: a.email, passwordHash: a.passwordHash, createdAt: a.createdAt, lastSeenAt: a.lastSeenAt } });
    }
    for (const bc of b.barcodes || []) if (itemMap[bc.itemId]) await tx.barcode.create({ data: { facilityId: fid, code: str(bc.code, 64), itemId: itemMap[bc.itemId], sizeIndex: int(bc.sizeIndex), source: str(bc.source, 20) } });
    // Locations first, then their parents wired up, so a bay restored before its shelf still lands in the tree.
    const locMapB: Record<string, string> = {};
    for (const l of b.locations || []) { const c = await tx.location.create({ data: { facilityId: fid, name: str(l.name, 60), kind: LOCATION_KINDS.includes(str(l.kind)) ? str(l.kind) : "Shelf", sort: int(l.sort), archived: !!l.archived } }); locMapB[l.id] = c.id; }
    for (const l of b.locations || []) if (l.parentId && locMapB[l.id] && locMapB[l.parentId]) await tx.location.update({ where: { id: locMapB[l.id] }, data: { parentId: locMapB[l.parentId] } });
    for (const s of b.stock || []) if (itemMap[s.itemId]) await tx.stockLevel.create({ data: { facilityId: fid, itemId: itemMap[s.itemId], sizeIndex: Math.max(0, int(s.sizeIndex)), opening: int(s.opening), adj: int(s.adj), reorder: s.reorder === null || s.reorder === undefined ? null : int(s.reorder), preloved: Math.max(0, int(s.preloved)), locationId: s.locationId ? locMapB[s.locationId] ?? null : null } });
    for (const m of b.moves || []) if (itemMap[m.itemId]) await tx.stockMove.create({ data: { facilityId: fid, date: isoDate(m.date), type: str(m.type, 20), itemId: itemMap[m.itemId], sizeIndex: int(m.sizeIndex), qty: int(m.qty), reason: str(m.reason, 120), byName: str(m.byName, 120) } });
    // Cost history follows its garment; a row whose item didn't survive the restore is dropped
    // rather than orphaned, exactly as movements are.
    for (const c of b.costs || []) if (itemMap[c.itemId]) await tx.costChange.create({ data: { facilityId: fid, itemId: itemMap[c.itemId], cost: num(c.cost), previous: c.previous === null || c.previous === undefined ? null : num(c.previous), at: c.at ? new Date(c.at) : new Date(), byName: str(c.byName, 120) } });
    for (const o of [...(b.orders || [])].sort((a, c) => String(a.createdAt).localeCompare(String(c.createdAt)))) {
      const c = await tx.order.create({ data: { facilityId: fid, code: str(o.code, 20), date: isoDate(o.date), source: str(o.source, 40), orderFor: str(o.orderFor, 20), staffId: o.staffId ? staffMap[o.staffId] ?? null : null, supplier: str(o.supplier, 80), status: str(o.status, 20), ref: str(o.ref, 120), invoice: str(o.invoice, 120), tracking: str(o.tracking, 120), expected: isoDate(o.expected), received: isoDate(o.received), cc: str(o.cc, 120), notes: str(o.notes, 400), replenish: !!o.replenish, createdAt: o.createdAt ? new Date(o.createdAt) : undefined,
        lines: { create: (o.lines || []).filter((l: { itemId: string }) => itemMap[l.itemId]).map((l: { itemId: string; size: string; qty: number; sort?: number }, i: number) => ({ itemId: itemMap[l.itemId], size: str(l.size, 20), qty: int(l.qty), sort: int(l.sort, i) })) } } });
      orderMap[o.id] = c.id;
      if (o.parentId && orderMap[o.parentId]) await tx.order.update({ where: { id: c.id }, data: { parentId: orderMap[o.parentId] } });
      for (const r of o.receipts || []) await tx.receipt.create({ data: { orderId: c.id, date: isoDate(r.date), invoice: str(r.invoice, 120), note: str(r.note, 400), photoId: pm(r.photoId), lines: { create: (r.lines || []).filter((l: { itemId: string }) => itemMap[l.itemId]).map((l: { itemId: string; size: string; qty: number; dest: string; cost: number }) => ({ itemId: itemMap[l.itemId], size: str(l.size, 20), qty: int(l.qty), dest: str(l.dest, 10), cost: num(l.cost) })) } } });
    }
    // A zero cost means two different things on this row. On a row written before Issue.cost
    // existed it means "unknown", and the garment's catalogue price is the best guess we have.
    // On a pre-loved row it means free, deliberately, and guessing a price for it puts money on
    // the ward's cost centre for a garment nobody bought. `preloved` survives the round trip, so
    // the two are told apart here rather than being averaged into one wrong answer.
    for (const i of [...(b.issues || [])].sort((a, c) => String(a.createdAt).localeCompare(String(c.createdAt)))) if (itemMap[i.itemId] && staffMap[i.staffId]) issueMap[i.id] = (await tx.issue.create({ data: { facilityId: fid, date: isoDate(i.date), staffId: staffMap[i.staffId], itemId: itemMap[i.itemId], sizeIndex: int(i.sizeIndex), qty: int(i.qty), cond: str(i.cond, 40), preloved: !!i.preloved, handedIn: isoDate(i.handedIn) || null, returnPhotoId: pm(i.returnPhotoId), cost: i.preloved ? 0 : (num(i.cost) > 0 ? num(i.cost) : num((b.items || []).find((x: { id: string }) => x.id === i.itemId)?.cost)), orderCode: str(i.orderCode, 20), receipt: !!i.receipt, returnedDate: isoDate(i.returnedDate) || null, returnedCond: i.returnedCond ? str(i.returnedCond, 40) : null, override: !!i.override, overrideReason: (OVERRIDE_REASONS as readonly string[]).includes(str(i.overrideReason, 40)) ? str(i.overrideReason, 40) : "", offGroup: !!i.offGroup, offStyle: !!i.offStyle, direct: !!i.direct, createdAt: i.createdAt ? new Date(i.createdAt) : undefined } })).id;
    for (const pu of b.pickups || []) if (orderMap[pu.orderId] && staffMap[pu.staffId]) await tx.pickup.create({ data: { facilityId: fid, orderId: orderMap[pu.orderId], staffId: staffMap[pu.staffId], received: isoDate(pu.received), contacted: !!pu.contacted, pickedUp: isoDate(pu.pickedUp) || null, deliveredTo: str(pu.deliveredTo, 120), sigId: pm(pu.sigId), proofId: pm(pu.proofId), deliveredRound: !!pu.deliveredRound, lines: { create: (pu.lines || []).filter((l: { itemId: string }) => itemMap[l.itemId]).map((l: { itemId: string; size: string; qty: number }) => ({ itemId: itemMap[l.itemId], size: str(l.size, 20), qty: int(l.qty) })) } } });
    for (const t of b.stocktakes || []) await tx.stocktake.create({ data: { facilityId: fid, date: isoDate(t.date), byName: str(t.byName, 120), counted: int(t.counted), variances: int(t.variances), mode: t.mode === "preloved" ? "preloved" : "shelf", locationId: t.locationId ? locMapB[t.locationId] ?? null : null, createdAt: t.createdAt ? new Date(t.createdAt) : undefined, lines: { create: (t.lines || []).filter((l: { itemId: string }) => itemMap[l.itemId]).map((l: { itemId: string; sizeIndex: number; sys: number; counted: number; reason?: string }) => ({ itemId: itemMap[l.itemId], sizeIndex: int(l.sizeIndex), sys: int(l.sys), counted: int(l.counted), reason: str(l.reason, 40) })) } } });
    // The approver's link is remapped through the same staff map as the subject's, because the ids
    // in the file belong to the facility it was exported from. A manager who was not in that export,
    // or has since gone off the register, comes back as a signature with no link — which is exactly
    // what an approval typed before the register search existed already is.
    for (const a of b.approvals || []) if (staffMap[a.staffId]) await tx.approval.create({ data: { facilityId: fid, staffId: staffMap[a.staffId], date: isoDate(a.date), byName: str(a.byName, 120), byStaffId: (a.byStaffId && staffMap[a.byStaffId]) || null, sets: int(a.sets), fte: str(a.fte, 10), notes: str(a.notes, 400), used: int(a.used), photoId: pm(a.photoId), createdAt: a.createdAt ? new Date(a.createdAt) : undefined } });
    for (const h of b.handins || []) if (staffMap[h.staffId]) await tx.handIn.create({ data: { facilityId: fid, staffId: staffMap[h.staffId], date: isoDate(h.date), byName: str(h.byName, 120), credit: !!h.credit, createdAt: h.createdAt ? new Date(h.createdAt) : undefined, lines: { create: (h.lines || []).filter((l: { itemId: string }) => itemMap[l.itemId]).map((l: { itemId: string; sizeIndex: number; qty: number; cond: string; laundered: boolean; credited?: number }) => ({ itemId: itemMap[l.itemId], sizeIndex: int(l.sizeIndex), qty: int(l.qty), cond: l.cond === "Rag" ? "Rag" : "Good", laundered: l.laundered !== false, credited: Math.max(0, int(l.credited)) })) } } });
    for (const a of b.alterations || []) if (staffMap[a.staffId]) await tx.alteration.create({ data: { facilityId: fid, staffId: staffMap[a.staffId], date: isoDate(a.date), garment: str(a.garment, 120), desc: str(a.desc, 400), status: str(a.status, 40), createdAt: a.createdAt ? new Date(a.createdAt) : undefined } });

    /* ---------- the staff app's half
     *
     * Same id-remap as everything above: every row is created fresh and pointed at the new staff,
     * catalogue, issue and request ids. A backup written before these keys existed simply has none
     * of them, and `|| []` restores it exactly as it always did. */
    for (const rq of [...(b.requests || [])].sort((x: { createdAt?: string }, y: { createdAt?: string }) => String(x.createdAt).localeCompare(String(y.createdAt)))) {
      if (!staffMap[rq.subjectId]) continue; // the wearer didn't survive the restore
      /* The garments. A file written before requests carried lines has the single garment on the
       * request itself, so one line is built from those fields — otherwise restoring last week's
       * backup would bring back a queue of requests with nothing on them. Its line inherits the
       * request's own answer, which is the only one it can have had: a request that was accepted
       * had that garment approved, and one that was declined had it refused. */
      const legacy = rq.itemId ? [{ itemId: rq.itemId, sizeIndex: rq.sizeIndex, qty: rq.qty, status: rq.status === "awaiting" || rq.status === "declined" ? rq.status : "approved", declineReason: rq.declineReason, sort: 0 }] : [];
      const rawLines: { itemId?: unknown; sizeIndex?: unknown; qty?: unknown; status?: unknown; declineReason?: unknown; sort?: unknown }[] =
        (Array.isArray(rq.lines) && rq.lines.length ? rq.lines : legacy).slice(0, REQUEST_MAX_LINES);
      const lineRows = rawLines
        .filter((l) => itemMap[str(l.itemId)])
        .map((l, i) => ({
          itemId: itemMap[str(l.itemId)], sizeIndex: Math.max(0, int(l.sizeIndex)), qty: Math.max(1, int(l.qty, 1)),
          status: LINE_STATUSES.includes(str(l.status, 20) as never) ? str(l.status, 20) : "awaiting",
          declineReason: l.declineReason ? str(l.declineReason, 120) : null,
          sort: int(l.sort, i),
        }));
      if (!lineRows.length) continue; // none of its garments survived the restore
      const c = await tx.request.create({ data: {
        facilityId: fid, code: str(rq.code, 20),
        subjectId: staffMap[rq.subjectId],
        raisedByStaffId: rq.raisedByStaffId ? staffMap[rq.raisedByStaffId] ?? null : null,
        // Coordinator logins are not in the backup and are not touched by a restore, so the id is
        // kept only when it is still one of this facility's own users. The name on the request
        // survives either way, which is what the order actually shows.
        raisedByUserId: rq.raisedByUserId && ourUsers.has(String(rq.raisedByUserId)) ? String(rq.raisedByUserId) : null,
        raisedByName: str(rq.raisedByName, 120),
        lines: { create: lineRows },
        reason: str(rq.reason, 40), note: str(rq.note, 400),
        status: REQ_STATUSES.has(str(rq.status, 20)) ? str(rq.status, 20) : "awaiting",
        managerId: rq.managerId ? staffMap[rq.managerId] ?? null : null, managerName: str(rq.managerName, 120),
        decidedAt: stamp(rq.decidedAt), declineReason: rq.declineReason ? str(rq.declineReason, 60) : null,
        route: rq.route ? str(rq.route, 20) : null, collectCode: rq.collectCode ? str(rq.collectCode, 10) : null, holdUntil: str(rq.holdUntil, 40),
        signerName: rq.signerName ? str(rq.signerName, 120) : null, signerRole: rq.signerRole ? str(rq.signerRole, 120) : null,
        signedAt: stamp(rq.signedAt), claimedAt: stamp(rq.claimedAt),
        createdAt: stamp(rq.createdAt) ?? undefined,
        events: { create: (rq.events || []).map((e: { label?: unknown; meta?: unknown; actorName?: unknown; at?: unknown }) => ({ label: str(e.label, 120), meta: str(e.meta, 200), actorName: str(e.actorName, 120), at: stamp(e.at) ?? undefined })) },
        messages: { create: (rq.messages || []).map((m: { fromStaff?: unknown; authorName?: unknown; body?: unknown; readAt?: unknown; createdAt?: unknown }) => ({ fromStaff: !!m.fromStaff, authorName: str(m.authorName, 120), body: str(m.body, 2000), readAt: stamp(m.readAt), createdAt: stamp(m.createdAt) ?? undefined })) },
      } });
      requestMap[rq.id] = c.id;
    }
    for (const w of b.waitlist || []) if (staffMap[w.staffId] && itemMap[w.itemId]) await tx.waitlistEntry.create({ data: { facilityId: fid, staffId: staffMap[w.staffId], itemId: itemMap[w.itemId], sizeIndex: int(w.sizeIndex), offeredAt: stamp(w.offeredAt), acceptedAt: stamp(w.acceptedAt), leftAt: stamp(w.leftAt), createdAt: stamp(w.createdAt) ?? undefined } });
    for (const k of b.kitChecks || []) await tx.kitCheck.create({ data: {
      facilityId: fid, dueBy: isoDate(k.dueBy), openedAt: stamp(k.openedAt) ?? undefined, closedAt: stamp(k.closedAt), openedBy: str(k.openedBy, 120),
      answers: { create: (k.answers || []).filter((a: { staffId: string; itemId: string }) => staffMap[a.staffId] && itemMap[a.itemId]).map((a: { staffId: string; itemId: string; sizeIndex: number; onRecord: number; confirmed: number; answeredAt?: unknown }) => ({ staffId: staffMap[a.staffId], itemId: itemMap[a.itemId], sizeIndex: int(a.sizeIndex), onRecord: int(a.onRecord), confirmed: int(a.confirmed), answeredAt: stamp(a.answeredAt) ?? undefined })) },
    } });
    for (const d of b.damage || []) if (staffMap[d.staffId]) await tx.damageReport.create({ data: { facilityId: fid, staffId: staffMap[d.staffId], issueId: d.issueId ? issueMap[d.issueId] ?? null : null, kind: str(d.kind, 40), note: str(d.note, 400), photoId: pm(d.photoId), requestId: d.requestId ? requestMap[d.requestId] ?? null : null, handedInAt: stamp(d.handedInAt), createdAt: stamp(d.createdAt) ?? undefined } });
    for (const d of b.disputes || []) if (staffMap[d.staffId]) await tx.recordDispute.create({ data: { facilityId: fid, staffId: staffMap[d.staffId], itemId: d.itemId ? itemMap[d.itemId] ?? null : null, sizeIndex: d.sizeIndex === null || d.sizeIndex === undefined ? null : int(d.sizeIndex), body: str(d.body, 2000), resolvedAt: stamp(d.resolvedAt), resolvedBy: str(d.resolvedBy, 120), createdAt: stamp(d.createdAt) ?? undefined } });
    for (const n of b.notices || []) await tx.linenNotice.create({ data: { facilityId: fid, body: str(n.body, 400), startsAt: isoDate(n.startsAt), endsAt: isoDate(n.endsAt), createdAt: stamp(n.createdAt) ?? undefined } });
    // Signed slips, re-pointed at the restored staff, signature, request and garments; then the issue
    // rows they covered point at them again.
    const slipMap: Record<string, string> = {};
    for (const sl of b.slips || []) {
      if (!staffMap[sl.staffId]) continue;
      const slLines = (Array.isArray(sl.lines) ? sl.lines : []).slice(0, 200)
        .map((l: { itemId?: unknown; si?: unknown; qty?: unknown }) => ({ itemId: itemMap[str(l?.itemId)] || "", si: Math.max(0, int(l?.si)), qty: Math.max(1, int(l?.qty, 1)) }))
        .filter((l: { itemId: string }) => l.itemId);
      slipMap[sl.id] = (await tx.slip.create({ data: { facilityId: fid, staffId: staffMap[sl.staffId], kind: str(sl.kind, 20) === "request" ? "request" : "issue", date: isoDate(sl.date), sigId: pm(sl.sigId), toStaff: !!sl.toStaff, requestId: sl.requestId ? requestMap[sl.requestId] ?? null : null, lines: slLines, byName: str(sl.byName, 120), createdAt: stamp(sl.createdAt) ?? undefined } })).id;
    }
    for (const i of b.issues || []) if (i.slipId && slipMap[i.slipId] && issueMap[i.id]) await tx.issue.update({ where: { id: issueMap[i.id] }, data: { slipId: slipMap[i.slipId] } });
    return orphans;
  }, { timeout: 120000 }).catch(async (e) => {
    // The files are written outside the database, so a rollback cannot reach them. A big restore
    // that hits the 120-second transaction timeout leaves the facility untouched — and, without
    // this, several hundred signatures and photographs of damaged uniforms sitting in the photo
    // directory with no Photo row naming them: nothing in the product could ever find or delete
    // them, and every retry of the restore added another set.
    await unlinkAll(written);
    throw e;
  });
  // After the commit, never before: a rolled-back restore that had already unlinked the files
  // would leave every surviving row pointing at an image that is no longer there.
  await unlinkAll(orphanedFiles);
  return { ok: true, photosSkipped };
}
