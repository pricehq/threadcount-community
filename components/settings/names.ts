/* Audit targets to names.
 *
 * The trail stores record ids only (lib/audit.ts). Names are looked up here against the snapshot at
 * read time, so the log never keeps a copy of the register. A target is the JSON the trail wrote
 * ({"id":…,"staffId":…,"si":…}); anything else is treated as a bare id. */
import { fmtDate, locMap, locPath, type Snapshot } from "@/lib/compute";

export type RecordPart = { text: string; missing?: boolean };

export type NameIndex = ReturnType<typeof buildNameIndex>;

export function buildNameIndex(s: Snapshot) {
  const by = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
  return {
    staff: by(s.staff), items: by(s.catalog), orders: by(s.orders), depts: by(s.depts), suppliers: by(s.supplierDir),
    locations: locMap(s), users: by(s.users), issues: by(s.issues), approvals: by(s.approvals),
    pickups: by(s.pickups), handins: by(s.handins), alterations: by(s.alterations), stocktakes: by(s.stocktakes),
  };
}

function staffName(ix: NameIndex, id: string) {
  const st = ix.staff.get(id);
  return st ? `${st.first} ${st.last}${st.num ? ` (${st.num})` : ""}` : null;
}
function itemName(ix: NameIndex, id: string, si?: number) {
  const it = ix.items.get(id);
  if (!it) return null;
  const size = si !== undefined ? it.sizes[si] : undefined;
  return size ? `${it.item} · ${size}` : it.item;
}

/* Every kind a bare `id` might be, in the order the spec reads them. Kinds the snapshot holds in
   full can say "removed" when an id is not there; windowed ones (uncollected pickups, recent hand-ins,
   alterations and stock takes) cannot, so only the keyed ids for those kinds stay plain. */
function byAnyId(ix: NameIndex, id: string, si?: number): string | null {
  return staffName(ix, id)
    ?? itemName(ix, id, si)
    ?? ix.orders.get(id)?.code
    ?? ix.depts.get(id)?.name
    ?? ix.suppliers.get(id)?.name
    ?? (ix.locations[id] ? locPath(ix.locations, id).map((l) => l.name).join(" · ") : null)
    ?? (ix.users.get(id) ? `${ix.users.get(id)!.first} ${ix.users.get(id)!.last}` : null)
    ?? issueName(ix, id)
    ?? (ix.approvals.get(id) ? `Approval · ${staffName(ix, ix.approvals.get(id)!.staffId) ?? "removed person"}` : null)
    ?? (ix.pickups.get(id) ? `${ix.pickups.get(id)!.orderCode} · ${staffName(ix, ix.pickups.get(id)!.staffId) ?? ""}`.replace(/ · $/, "") : null)
    ?? (ix.handins.get(id) ? `Hand-in · ${staffName(ix, ix.handins.get(id)!.staffId) ?? "removed person"}` : null)
    ?? (ix.alterations.get(id) ? `Alteration · ${staffName(ix, ix.alterations.get(id)!.staffId) ?? "removed person"}` : null)
    ?? (ix.stocktakes.get(id) ? `Stock take ${fmtDate(ix.stocktakes.get(id)!.date)}` : null);
}
function issueName(ix: NameIndex, id: string) {
  const is = ix.issues.get(id);
  if (!is) return null;
  return [staffName(ix, is.staffId), itemName(ix, is.itemId, is.si)].filter(Boolean).join(" · ") || "Issue";
}

/** The parts of the Record cell for one audit target. Empty when the event names no record. */
export function recordParts(ix: NameIndex, target: string): RecordPart[] {
  const t = (target || "").trim();
  if (!t) return [];
  let o: Record<string, unknown>;
  try {
    const parsed = JSON.parse(t);
    o = parsed && typeof parsed === "object" ? parsed : { id: String(parsed) };
  } catch { o = { id: t }; }
  const si = typeof o.si === "number" ? o.si : undefined;
  const str = (k: string) => (typeof o[k] === "string" && o[k] ? (o[k] as string) : null);
  const parts: RecordPart[] = [];
  const push = (name: string | null | undefined, id: string, canBeMissing = true) => {
    if (name) { if (!parts.some((p) => p.text === name)) parts.push({ text: name }); return; }
    parts.push({ text: canBeMissing ? `removed · ${id}` : id, missing: true });
  };
  let v: string | null;
  if ((v = str("staffId"))) push(staffName(ix, v), v);
  if ((v = str("subjectId"))) push(staffName(ix, v) ?? byAnyId(ix, v), v, false);
  if ((v = str("itemId"))) push(itemName(ix, v, si), v);
  if ((v = str("orderId"))) push(ix.orders.get(v)?.code, v);
  if ((v = str("deptId"))) push(ix.depts.get(v)?.name, v);
  if ((v = str("supplierId"))) push(ix.suppliers.get(v)?.name, v);
  if ((v = str("locationId"))) push(ix.locations[v] ? locPath(ix.locations, v).map((l) => l.name).join(" · ") : null, v);
  if ((v = str("userId"))) { const u = ix.users.get(v); push(u ? `${u.first} ${u.last}` : null, v); }
  if ((v = str("issueId"))) push(issueName(ix, v), v);
  if ((v = str("pickupId"))) { const p = ix.pickups.get(v); push(p ? p.orderCode : null, v, false); }
  if ((v = str("stocktakeId"))) { const st = ix.stocktakes.get(v); push(st ? `Stock take ${fmtDate(st.date)}` : null, v, false); }
  if ((v = str("id"))) {
    const name = byAnyId(ix, v, str("itemId") ? undefined : si);
    push(name, v, true);
  }
  return parts;
}

export function recordText(parts: RecordPart[]) {
  return parts.map((p) => p.text).join(" · ");
}
