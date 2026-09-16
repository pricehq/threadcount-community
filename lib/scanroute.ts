/* What a code scanned on the counter app's Scan tab is, and where it goes.
 *
 * One router for the one camera the tab bar puts in the middle: a shelf label opens that shelf's
 * count, a garment's barcode opens its stock line, a staff badge opens the person. Contextual scans
 * (issue, hand back, pick, count) keep their own rules and never come through here. */
import { bcParse, itemMap, staffName, variantName, type Snapshot } from "@/lib/compute";

export type ScanHit =
  | { kind: "shelf"; label: string; locationId: string; href: string }
  | { kind: "garment"; label: string; itemId: string; si: number; href: string }
  | { kind: "badge"; label: string; staffId: string; href: string }
  | { kind: "inactive"; label: string; staffId: string }
  | { kind: "unknown"; code: string };

/** Printed on every shelf label: Code 128 of `TCL-` and the location's id. */
export const SHELF_LABEL_PREFIX = "TCL-";
export const shelfLabelCode = (locationId: string) => SHELF_LABEL_PREFIX + locationId;
const SHELF_RE = /^TCL-([A-Za-z0-9]{8,40})$/;

/** The word the flash and the recent list show for each kind. */
export const SCAN_KIND_LABEL: Record<"shelf" | "garment" | "badge" | "inactive", string> = {
  shelf: "Shelf label",
  garment: "Garment",
  badge: "Staff badge",
  inactive: "Staff badge",
};

const digits = (x: string) => /^\d+$/.test(x);
const noZeros = (x: string) => x.replace(/^0+(?=\d)/, "");

/** Does this staff number match the scanned badge? Case-insensitive; all-digit numbers also match
 *  with their leading zeros stripped (a badge printing 004471 for staff number 4471). */
export function badgeMatches(num: string, code: string): boolean {
  const a = num.trim(), b = code.trim();
  if (!a || !b) return false;
  if (a.toLowerCase() === b.toLowerCase()) return true;
  return digits(a) && digits(b) && noZeros(a) === noZeros(b);
}

export function resolveScan(s: Snapshot, raw: string): ScanHit {
  const code = String(raw || "").trim();
  if (!code) return { kind: "unknown", code };

  // 1. A shelf label.
  const m = SHELF_RE.exec(code);
  if (m) {
    // Location ids are lowercase; a code typed or read in capitals is still that shelf.
    const loc = s.locations.find((l) => (l.id === m[1] || l.id === m[1].toLowerCase()) && !l.archived);
    if (!loc) return { kind: "unknown", code };
    return { kind: "shelf", label: loc.name, locationId: loc.id, href: `/m/count/${loc.id}` };
  }

  // 2. A garment: bound supplier codes and the generated 93XXXXXXX form, as everywhere else.
  const v = bcParse(s, code);
  if (v) {
    const it = itemMap(s)[v.itemId];
    const size = String(it?.sizes[v.si] ?? v.si);
    return { kind: "garment", label: variantName(it, size), itemId: v.itemId, si: v.si, href: `/m/line/${v.itemId}/${v.si}` };
  }

  // 3. A staff badge carrying the staff number.
  const active = s.staff.find((st) => !st.inactive && badgeMatches(st.num, code));
  if (active) return { kind: "badge", label: staffName(active), staffId: active.id, href: `/m/person/${active.id}` };
  const gone = s.staff.find((st) => st.inactive && badgeMatches(st.num, code));
  if (gone) return { kind: "inactive", label: staffName(gone), staffId: gone.id };

  return { kind: "unknown", code };
}
