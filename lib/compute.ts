// Pure business logic shared by server and client. No DB imports here.

// The set rule lives in ./sets, which is where the whole of it is — six sets held at any one time,
// and what counts as a top and what counts as a pair of trousers, because that is what a set is made
// of. The import only goes this way: sets answers the allowance questions without knowing anything
// about a snapshot, so nothing there may reach back into this file. What this file adds is the
// snapshot — who is holding what — and it is where a screen or the server asks, through capCheck().
import { PANT_TYPES, SET_GARMENTS, TOP_TYPES, allowanceRoute, capState, garmentCounts, isPantItem, isTopItem, isTypeIn, setHalf, setsOnStart, type AllowanceRoute, type CapState, type Garment, type GarmentCounts } from "./sets";
export {
  PANT_TYPES, SETS_CAP, SETS_ON_START, SET_GARMENTS, TOP_TYPES, allowance, allowanceRoute, capState,
  garmentCounts, isPantItem, isTopItem, looseGarments, setHalf, setsCap, setsHeld,
  setsOnStart, type AllowanceRoute, type CapState, type Garment, type GarmentCounts,
} from "./sets";

export type Item = {
  id: string; sort: number; item: string; gender: string; type: string; sku: string; supplier: string;
  cost: number;
  /** The staff groups this garment is for. EMPTY MEANS EVERY GROUP. Ask garmentForGroup(). */
  groups: string[];
  /** groups for display only — "All" when empty, the name when one, the names joined with ", " when
   *  several (groupsLabel). The phone counter's catalogue screens read and send it back; never decide
   *  anything by comparing it. */
  group: string;
  notes: string; sizes: string[]; archived: boolean;
};
export type StockRec = { opening: number; adj: number; reorder: number | null; preloved: number; supplierCode: string };
export type CostRec = { id: string; itemId: string; cost: number; previous: number | null; at: string; byName: string };
export type MoveRec = { id: string; date: string; type: string; itemId: string; si: number; qty: number; reason: string; byName: string };
export type DeptRec = { id: string; name: string; cc: string };
export type SupplierRec = { id: string; name: string; contact: string; phone: string; account: string; email: string; lead: number | null };
export type StaffRec = {
  id: string; num: string; first: string; last: string; phone: string; group: string; dept: string;
  top: string; pants: string; ccOverride: string; inactive: boolean; ent: number | null; start: string; notes: string;
  /** Combined FTE as the order form writes it — "1.0" … "0.1", or "Casual" — and "" when nobody has
   *  recorded one. A string because Casual is not a number. Only the initial kit reads it. */
  fte: string;
  /** Which cut of uniform this person is offered — "Men's", "Women's", "Either", or "" when nobody
   *  has said yet. Blank offers every style, exactly as "Either" does; the two are kept apart only
   *  so the register can list who is still undecided. Ask through garmentForStyle(). */
  uniformStyle: string;
  /** An activation code is outstanding — never the code itself. See buildSnapshot. */
  selfCode: boolean;
  /** When that code was printed, ISO, or null if none is outstanding. The date isn't a secret and a
   *  screen needs it: slips expire, so without it a coordinator can't tell a slip the nurse will use
   *  tomorrow from one that will be turned away at the activation counter. */
  selfCodeAt: string | null;
  /** Email on their claimed self-service account, or "" if they haven't claimed one. */
  selfEmail: string;
  /** The one person who approves their staff-app requests. Without it they can't raise anything. */
  managerId: string | null;
  /** They are on the ward desk, so they sign for their own ward's bags on the round. */
  wardDesk: boolean;
};
/** `by` is the approver's name as it was signed; `byStaffId` is which person on the register that
 *  signature belongs to, or null for an approval whose approver was typed rather than picked, and
 *  for one whose manager has since been removed from the register. Screens print `by` and follow
 *  `byStaffId` — never the other way round, or a renamed manager rewrites a signed form. */
export type ApprovalRec = { id: string; staffId: string; date: string; by: string; byStaffId: string | null; sets: number; fte: string; notes: string; used: number; photoId: string | null };
export type AlterationRec = { id: string; staffId: string; date: string; garment: string; desc: string; status: string };
export type IssueRec = {
  id: string; date: string; staffId: string; itemId: string; si: number; qty: number; cond: string; cost: number; orderCode: string;
  /** The cost centre it was charged to, frozen at issue. "" on rows written before the column
   *  existed — read it through ccOfIssue(), never directly, so those fall back to the wearer's. */
  cc: string;
  receipt: boolean; returned: { date: string; cond: string; photoId: string | null } | null; override: boolean; direct: boolean; preloved: boolean; handedIn: string | null; createdAt: string;
  /** Issued outside the person's staff group on the coordinator's override — not the six-set one. */
  offGroup: boolean;
  /** Issued outside the person's uniform style on the coordinator's override — a men's cut to
   *  somebody set to Women's, or the other way about. Its own flag beside offGroup. */
  offStyle: boolean;
  /** Why a flagged line was issued anyway (OVERRIDE_REASONS), or "" for a line that needed none. */
  overrideReason: string;
  /** The signed slip it was handed over on, when the counter phone took a signature. */
  slipId: string | null;
};
export type HandInLineRec = { itemId: string; si: number; qty: number; cond: string; laundered: boolean; credited: number };
export type HandInRec = { id: string; date: string; staffId: string; by: string; credit: boolean; lines: HandInLineRec[] };
export type OrderLineRec = { id: string; itemId: string; size: string; qty: number };
export type ReceiptLineRec = { itemId: string; size: string; qty: number; dest: string; cost: number };
export type ReceiptRec = { id: string; date: string; invoice: string; note: string; photoId: string | null; lines: ReceiptLineRec[] };
export type OrderRec = {
  id: string; code: string; date: string; source: string; orderFor: string; staffId: string | null; supplier: string; status: string;
  ref: string; invoice: string; tracking: string; expected: string; received: string; cc: string; notes: string; replenish: boolean; parentId: string | null;
  createdAt: string; lines: OrderLineRec[]; receipts: ReceiptRec[];
};
export type PickupRec = {
  id: string; orderId: string; orderCode: string; staffId: string; received: string; contacted: boolean; pickedUp: string | null;
  deliveredTo: string; sigId: string | null; proofId: string | null; deliveredRound: boolean;
  lines: { itemId: string; size: string; qty: number }[];
};
export type StocktakeRec = {
  id: string; date: string; by: string; counted: number; variances: number; mode: string; locationId: string | null;
  lines: { itemId: string; si: number; sys: number; counted: number; reason: string }[];
};
export type LocationRec = { id: string; name: string; kind: string; parentId: string | null; sort: number; archived: boolean };
export type UserRec = { id: string; email: string; first: string; last: string; title: string; role: "ADMIN" | "ISSUER"; inactive: boolean; ssoBreakGlass: boolean };
export type Settings = {
  facility: string; location: string; coordinator: string; defaultReorder: number;
  /** Garments per financial year, per person — the figure the reports, the register and the CSV
   *  quote as "drawn this year". It is not what the counter measures anybody against: what may be
   *  held at once is six sets, capSets below, counted at the moment somebody is standing there and
   *  with no year in it at all. Kept because "how much has this ward drawn since July" is a real
   *  question that a linen room really asks; it simply stopped being the thing that refuses a
   *  garment. */
  defaultEntitlement: number;
  /** The linen room's own e-mail address and phone number, printed in the footer of the order form.
   *  They live in settings and nowhere else: a customer's contact details are the customer's, and
   *  putting one in source would ship it to every other facility. */
  coordinatorEmail: string; coordinatorPhone: string;
  checklistDismissed: boolean;
  /** The starting kit, in sets, for the groups on the starting-kit route (kitGroups). The FTE table
   *  proposes its own number instead, and manager approval starts on none. Not a yearly allowance —
   *  see initialSets().
   *
   *  This is the facility's answer to a question ./sets asks, not a second rule: read it through
   *  setsOnStart(), which is also what fills the gap when nobody has set one. */
  initialSets: number;
  /** The staff groups this facility puts on the FTE table. Empty means none of them are; there is no
   *  fallback. Ask through isNursing() or isNursingGroup(), never by comparing names yourself. */
  nursingGroups: string[];
  /** The staff groups this facility starts on a fixed kit (initialSets). Empty means none of them
   *  do. A group on neither this list nor nursingGroups is on manager approval. Ask through isKit()
   *  or isKitGroup(). */
  kitGroups: string[];
  /** The ceiling, in sets held at any one time, for everybody on the register, whichever route their
   *  group is on (Facility.capSets). Six sets: what a person has on their back and in their locker,
   *  not an allowance that starts again in July.
   *
   *  Like initialSets this is the facility's answer to a question ./sets asks, not a second rule:
   *  read it through setsCap(), which stands in when nobody has set one. It is declared here as
   *  well as emitted because a field the snapshot carried but the type never mentioned is exactly
   *  how a setting gets quietly dropped on the way to a screen. */
  capSets: number;
  exceptionHigh: number; varianceReason: number; glAccount: string; journalDesc: string; lastBackup: string; hasLogo: boolean;
  suppliers: string[]; staffGroups: string[]; slipCollectionFooter: string; slipDeliveryFooter: string; slipOrg: string;
  barcodeLookup: boolean;
  /** Single sign-on switches; the IdP itself is configured through /api/sso. */
  sso: { enabled: boolean; required: boolean; staff: boolean; domains: string[] };
  /** The facility's IANA zone (Facility.timezone). Every "today" on both the server and the client
   *  is measured in it — see facilityToday. */
  timezone: string;
};
export type Snapshot = {
  session: { userId: string; name: string; first: string; last: string; title: string; role: "Admin" | "Issuer"; email: string };
  demo: { resetAt: string | null } | null;
  /** The ward notice still up: no end date, or one of today or later. */
  notice: { body: string; endsAt: string } | null;
  settings: Settings;
  catalog: Item[];
  barcodes: Record<string, string>; // code -> "itemId:si"
  stock: Record<string, StockRec>; // "itemId:si" -> levels
  locations: LocationRec[];
  placed: Record<string, string>; // "itemId:si" -> locationId (a variant's home shelf)
  moves: MoveRec[];
  costs: CostRec[];
  depts: DeptRec[];
  supplierDir: SupplierRec[];
  staff: StaffRec[];
  approvals: ApprovalRec[];
  alterations: AlterationRec[];
  issues: IssueRec[];
  orders: OrderRec[];
  pickups: PickupRec[];
  stocktakes: StocktakeRec[];
  handins: HandInRec[];
  users: UserRec[];
  /** Garments a manager has approved on a staff-app request that nobody has collected yet, a row per
   *  request line. They count towards the six a person holds (see heldGarments). buildSnapshot loads
   *  them for everybody, so every screen counts what the counter counts; the server re-reads one
   *  person's under its lock when it decides. Optional only because a snapshot built anywhere else
   *  (the demo seed, a test) may not carry them, and then this kind of owed garment is left out. */
  owedRequestLines?: { staffId: string; itemId: string; qty: number }[];
  today: string;
  createdAt: string;
  /** The facility's zone, repeated out of settings so that client components rendering a date have
   *  it to hand without reaching into settings. `today` is this zone's today. */
  tz: string;
};

export const ORDER_STATUSES = ["Draft", "Ordered", "Shipped", "Back Order", "Received", "Cancelled"];
export const OPEN_STATUSES = ["Draft", "Ordered", "Shipped", "Back Order"];
/** Shortcuts for inserting a whole run of sizes at once. Named after the run itself, never after a
 *  garment: the same top can be stocked in XS–5XL or in 6–24, so a run says nothing about what the
 *  garment is — that's what the product type field is for. */
export const SIZE_SETS: Record<string, string[]> = {
  "XS – 5XL": ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
  "6 – 24": ["6", "8", "10", "12", "14", "16", "18", "20", "22", "24"],
  "72 – 117": ["72", "77", "82", "87", "92", "97", "102", "107", "112", "117"],
};
/** The first entry of every staff-group filter: the whole catalogue, whatever group it is marked for.
 *  The rest of the list is the facility's own staff groups. */
export const ALL_GROUPS = "All groups";
export const ALT_FLOW = ["Requested", "At tailor", "Returned to staff"];

export const key = (itemId: string, si: number) => `${itemId}:${si}`;
export const splitKey = (k: string) => { const i = k.lastIndexOf(":"); return { itemId: k.slice(0, i), si: +k.slice(i + 1) }; };

/** The zone every date falls back to when a facility has not been given one, and the zone the
 *  product was first written for. Only ever a fallback — see facilityToday. */
const FALLBACK_ZONE = "Australia/Brisbane";

/** Building an Intl.DateTimeFormat costs roughly what formatting a hundred dates costs, and these
 *  helpers get called once per row on lists that run to thousands of issues, so the formatters are
 *  cached per zone (and per option set, for display). A facility has one timezone that almost never
 *  changes, so the cache stays tiny. */
const zoneFmts = new Map<string, Intl.DateTimeFormat>();
function zoneFmt(tz: string, locale: string, opts: Intl.DateTimeFormatOptions, cacheKey: string): Intl.DateTimeFormat {
  let f = zoneFmts.get(cacheKey);
  if (!f) {
    // A bad zone string reaching here would otherwise throw on every render for the whole facility,
    // so an unrecognised zone quietly falls back rather than taking the screen down. Settings is
    // where a typo gets rejected; this is the last line of defence, not the validation.
    try { f = new Intl.DateTimeFormat(locale, { ...opts, timeZone: tz }); }
    catch { f = new Intl.DateTimeFormat(locale, { ...opts, timeZone: FALLBACK_ZONE }); }
    zoneFmts.set(cacheKey, f);
  }
  return f;
}

const ISO_PARTS: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" };
/** Assembled from parts rather than trusting a locale to print YYYY-MM-DD, because every date-only
 *  column in the database is compared and sorted as a plain string. */
function ymdIn(tz: string, at: Date): string {
  const parts = zoneFmt(tz, "en-CA", ISO_PARTS, "iso|" + tz).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in the facility's own zone, as YYYY-MM-DD.
 *
 *  Pass the facility's `timezone` column — never a literal. "Today" decides which month an issue
 *  lands in on the cost-centre journal and what date is printed on a credit slip, so a Perth linen
 *  room counting at 22:30 must not be filing tomorrow's paperwork, and a Sydney one counting at
 *  00:30 on daylight saving must not be filing yesterday's. */
export function facilityToday(tz: string): string {
  return ymdIn(tz || FALLBACK_ZONE, new Date());
}

/** The date an instant fell on in the facility's zone, as YYYY-MM-DD.
 *
 *  This replaces `toISOString().slice(0, 10)`, which answers with the UTC date and so is wrong for
 *  the ten hours a day that Australia is already into tomorrow. A value that is already date-only
 *  is handed straight back: a bare date carries no instant, so re-zoning it could only invent an
 *  error. Returns "" for anything unparseable, so the `|| today` fallbacks read naturally. */
export function facilityDate(iso: string | Date, tz: string): string {
  if (typeof iso === "string") {
    if (!iso) return "";
    if (DATE_ONLY.test(iso)) return iso;
  }
  const at = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return ymdIn(tz || FALLBACK_ZONE, at);
}

/** An instant formatted for display in the facility's zone. Defaults to the same short Australian
 *  date fmtDate() prints; pass opts to add a time. The zone always wins over anything in opts. */
export function formatInZone(iso: string | Date, tz: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  if (!iso) return "—";
  // A date-only string is a calendar date, not an instant. Its digits are printed as they stand,
  // pinned to UTC so nothing is converted: shifting it into a zone could only move it a day, and
  // there is no true instant to move it towards.
  if (typeof iso === "string" && DATE_ONLY.test(iso)) {
    const day = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
    return zoneFmt("UTC", "en-AU", opts, "disp|UTC|" + JSON.stringify(opts)).format(day);
  }
  const at = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  const zone = tz || FALLBACK_ZONE;
  return zoneFmt(zone, "en-AU", opts, "disp|" + zone + "|" + JSON.stringify(opts)).format(at);
}

/** Date-only arithmetic, deliberately done in UTC on the Y/M/D digits alone: it never reads a
 *  clock, so a day that is 23 or 25 hours long where the facility sits cannot shift the answer. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.max(0, Math.floor((b - a) / 86400000));
}

/** How long a printed staff-app slip is good for, in days. One number for the activation route that
 *  refuses an old slip and for every screen that tells a coordinator whether a slip is still worth
 *  chasing: when those were separate copies, the register could call a slip live that the counter
 *  would then turn away, and the nurse found out by being refused. */
export const SLIP_DAYS = 14;
/** Would a slip printed at `printedAt` still be accepted today?
 *
 *  A slip is a bearer token on paper — whoever finds one in a folder months later could claim this
 *  person's record — so it dies at a fortnight. A slip with no print date is dead as well: an age
 *  nobody knows has to be read as an old one.
 *
 *  Counted in whole days on the facility's own calendar rather than to the millisecond, so the route
 *  and the screens give the same answer on the same day. A slip printed at four in the afternoon
 *  is turned away from the first minute of the fourteenth day after rather than from four that
 *  afternoon; that is the harmless way to be wrong, because the fix is another slip, not a nurse standing at the counter being refused. */
export function slipLive(printedAt: string | Date | null | undefined, today: string, tz: string): boolean {
  if (!printedAt) return false;
  const printed = facilityDate(printedAt, tz);
  return !!printed && daysBetween(printed, today) < SLIP_DAYS;
}
export function fyStart(today: string): string {
  const y = +today.slice(0, 4), m = +today.slice(5, 7);
  return (m >= 7 ? y : y - 1) + "-07-01";
}
export function money(n: number): string {
  const v = Math.round((n || 0) * 100) / 100;
  return "$" + v.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** Signed money with a leading +/− (empty sign for zero). */
export function signedMoney(n: number): string {
  return (n < 0 ? "−" : n > 0 ? "+" : "") + money(Math.abs(n));
}
export function signedInt(n: number): string { return (n > 0 ? "+" : "") + n; }
export function fmtDate(iso: string): string {
  if (!iso || iso.length < 10) return iso || "—";
  const d = new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  // Ten characters of anything is not ten characters of a date. Nothing writes "11/03/2024" into a
  // date column any more, but rows stored before that was tightened still hold values whose digits
  // come out NaN here, and the browser prints those as the literal words "Invalid Date" — on a slip,
  // in a report, next to a real one. The em dash formatInZone already uses is the honest answer.
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
export function monthLabel(ym: string, opts: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" }): string {
  const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 15);
  return d.toLocaleDateString("en-AU", opts);
}
export function prevMonth(ym: string): string { return shiftMonth(ym, -1); }
export function shiftMonth(ym: string, n: number): string {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  const d = new Date(y, m - 1 + n, 15);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function label(it: Item | undefined): string {
  if (!it) return "(removed item)";
  const g = it.gender === "Male" ? "M" : it.gender === "Female" ? "W" : it.gender === "Men's" ? "M" : it.gender === "Women's" ? "W" : "";
  return it.item + (g ? ` (${g})` : "");
}
/** "Fleece — Navy, L" — the garment and its size, spelled the same everywhere. */
export function variantName(it: Item | undefined, size: string | number): string {
  return `${label(it)}, ${size}`;
}
export function genderLabel(g: string): string {
  if (g === "Male" || g === "Men's" || g === "Men") return "Men's";
  if (g === "Female" || g === "Women's" || g === "Women") return "Women's";
  return "Unisex";
}
/** Item name with a long gender suffix, e.g. "Cargo Pant — Men's". */
export function longLabel(it: Item | undefined): string {
  if (!it) return "(removed item)";
  return it.item + (it.gender !== "Unisex" ? " — " + genderLabel(it.gender) : "");
}
/** The garments somebody is normally handed are their own staff group's, plus anything marked for all
 *  groups. The group is the facility's own name for it and nothing is read into its spelling: sorting
 *  names into buckets by their letters handed every customer one hospital's categories, and filed a
 *  kitchen hand's aprons under a security officer's suggestions because both were "Operational". */
export function groupBucket(g: string): string {
  return (g || "").trim();
}
/** A garment's staff groups as they are stored: trimmed, blanks dropped, one entry per group as
 *  groupKey() compares them, keeping the first spelling. "All" anywhere in it means every group,
 *  which is the empty list, so there is only one way to say it. */
export function garmentGroups(list: readonly unknown[] | null | undefined): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for (const x of list || []) {
    const g = String(x ?? "").trim().slice(0, 80), k = groupKey(g);
    if (!k) continue;
    if (k === "all" || k === groupKey(ALL_GROUPS)) return [];
    if (!seen.has(k)) { seen.add(k); out.push(g); }
  }
  return out;
}
/** A garment's groups as one label: "All", the one name, or the names joined with ", ". */
export function groupsLabel(groups: readonly string[] | null | undefined): string {
  const g = garmentGroups(groups);
  return g.length ? g.join(", ") : "All";
}
/** Is this garment for this staff group? A garment for every group (no groups) is for everybody;
 *  otherwise the group has to be one of its groups, compared through groupKey(). The one question
 *  the counter's suggestions, the staff app and the server's refusals all ask. */
export function garmentForGroup(it: { groups?: readonly string[] | null }, group: string | null | undefined): boolean {
  const list = garmentGroups(it.groups);
  return !list.length || onGroupList(list, group);
}
/** Does a catalogue item belong in this group's view? Items marked for all groups always do. */
export function inBucket(it: Item, bucket: string): boolean {
  return bucket === ALL_GROUPS || garmentForGroup(it, bucket);
}
// ---------- uniform style
/** The uniform styles a staff record can be set to, in the order a picker offers them.
 *
 *  Blank is the fourth state and is deliberately not on this list: it is what every record starts
 *  as, it means nobody has said yet, and it offers every style exactly as "Either" does. A picker
 *  offers these three beside its own word for blank. */
export const UNIFORM_STYLES = ["Men's", "Women's", "Either"];
/** The style that sees both cuts, spelled once so no screen retypes it. */
export const UNIFORM_STYLE_EITHER = "Either";

/** A uniform style off a picker, a CSV cell or an old gender label: "" when blank, one of
 *  UNIFORM_STYLES when the word is recognised, and null when it is not — so a caller can refuse it
 *  rather than store a value nothing reads.
 *
 *  m / male / man / men / mens / men's are the men's cut; f / w / female / woman / women / womens /
 *  women's / ladies the women's; either / both / any / unisex the one that sees both. A register
 *  imported from somewhere else writes this column as a gender, which is why those spellings land
 *  on a style rather than being turned away. */
export function normalUniformStyle(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase().replace(/['’]/g, "");
  if (!s) return "";
  if (["m", "male", "males", "man", "men", "mens", "gents"].includes(s)) return "Men's";
  if (["f", "w", "female", "females", "woman", "women", "womens", "ladies"].includes(s)) return "Women's";
  if (["either", "both", "any", "all", "unisex"].includes(s)) return UNIFORM_STYLE_EITHER;
  return null;
}

/** Is this garment the cut this person is offered? The one question the counter's suggestions, the
 *  staff app and the server's refusals ask about style — the same shape as garmentForGroup(), and
 *  asked the same way.
 *
 *  True when nobody has said (blank) or they are set to Either; true for a unisex garment, and for
 *  one whose gender is blank or a word we don't recognise, because a garment nobody has classified
 *  is not evidence that somebody may not wear it. Otherwise the garment's own label has to be their
 *  style. A style stored as something this build doesn't know reads as blank, so the worst a bad
 *  value can do is offer somebody the whole catalogue, which is what they are offered today. */
export function garmentForStyle(it: { gender?: string | null }, style: string | null | undefined): boolean {
  const s = normalUniformStyle(style) ?? "";
  if (!s || s === UNIFORM_STYLE_EITHER) return true;
  // genderLabel() answers "Unisex" for blank and for anything it doesn't recognise, which is the
  // reading we want here as well — one function deciding what a garment's gender word means.
  const g = genderLabel(String(it.gender ?? "").trim());
  return g === "Unisex" || g === s;
}
// ---------- locations
/** The kinds a location can be. Laundry and External hold garments that have left the shelf but
 *  not the building, so a variant parked there still counts as somewhere rather than nowhere. */
export const LOCATION_KINDS = ["Room", "Shelf", "Bay", "Laundry", "External"];
export const UNPLACED = "unplaced";

export function locMap(s: Snapshot): Record<string, LocationRec> {
  const m: Record<string, LocationRec> = {};
  for (const l of s.locations) m[l.id] = l;
  return m;
}
/** A location's ancestors, outermost first — ["Linen Room", "Shelf B"] for bay B3. */
export function locPath(byId: Record<string, LocationRec>, id: string | null | undefined): LocationRec[] {
  const out: LocationRec[] = [];
  let cur = id ? byId[id] : undefined;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); out.unshift(cur); cur = cur.parentId ? byId[cur.parentId] : undefined; }
  return out;
}
/** "Shelf B · Bay B3" — the trail below the top-level room, for a line row. */
export function locTrail(byId: Record<string, LocationRec>, id: string | null | undefined, from = 1): string {
  return locPath(byId, id).slice(from).map((l) => l.name).join(" · ");
}
/** The trail below `rootId` — counting Shelf B, a line in its bay reads just "Bay B3". */
export function locUnder(byId: Record<string, LocationRec>, id: string | null | undefined, rootId: string): string {
  const path = locPath(byId, id);
  const at = path.findIndex((l) => l.id === rootId);
  return (at < 0 ? path.slice(1) : path.slice(at + 1)).map((l) => l.name).join(" · ");
}
/** Every location id at or under `id`, so counting a shelf counts its bays too. */
export function locSubtree(s: Snapshot, id: string): Set<string> {
  const kids: Record<string, string[]> = {};
  for (const l of s.locations) if (l.parentId) (kids[l.parentId] ||= []).push(l.id);
  const out = new Set<string>([id]);
  const walk = (n: string) => { for (const c of kids[n] || []) if (!out.has(c)) { out.add(c); walk(c); } };
  walk(id);
  return out;
}
/** Locations in tree order with their depth, for indented pickers and the settings list. */
export function locTree(s: Snapshot, includeArchived = false): { loc: LocationRec; depth: number }[] {
  const list = s.locations.filter((l) => includeArchived || !l.archived);
  const kids: Record<string, LocationRec[]> = {};
  const roots: LocationRec[] = [];
  const ids = new Set(list.map((l) => l.id));
  for (const l of list) (l.parentId && ids.has(l.parentId) ? (kids[l.parentId] ||= []) : roots).push(l);
  const cmp = (a: LocationRec, b: LocationRec) => a.sort - b.sort || a.name.localeCompare(b.name);
  const out: { loc: LocationRec; depth: number }[] = [];
  const walk = (l: LocationRec, depth: number) => {
    out.push({ loc: l, depth });
    for (const c of (kids[l.id] || []).sort(cmp)) walk(c, depth + 1);
  };
  for (const r of roots.sort(cmp)) walk(r, 0);
  return out;
}
/** Would making `id` a child of `parentId` create a cycle? */
export function locWouldLoop(s: Snapshot, id: string, parentId: string | null): boolean {
  if (!parentId) return false;
  if (parentId === id) return true;
  return locSubtree(s, id).has(parentId);
}

/** A staff group's name the way two of them are compared: ignoring case and stray spaces at either
 *  end. The register is typed by hand and imported from roster spreadsheets, and "kitchen " off an
 *  export is the same group as "Kitchen" in settings. Every question below about which route a group
 *  is on compares through this, and so does lib/ops when it renames a group or refuses one on two
 *  routes at once — two ways of comparing names is how a group once fell off its route. */
export function groupKey(name: string | null | undefined): string {
  return (name || "").trim().toLowerCase();
}
function onGroupList(groups: string[] | null | undefined, group: string | null | undefined): boolean {
  const g = groupKey(group);
  if (!g) return false;
  return (groups || []).some((x) => groupKey(x) === g);
}

/** A facility's FTE-table groups as they should be read, given whatever is stored on the row. An
 *  empty or missing list means exactly that: none of this facility's groups are on the FTE table.
 *  There is no fallback to a list of our own. Any list we could ship would be one employer's job
 *  titles, and a hotel that has never named a nursing group has no nurses to put on the table. */
export function nursingGroupsFrom(groups: string[] | null | undefined): string[] {
  return groups ?? [];
}

/** The groups this facility puts on the FTE table, off a snapshot. */
export function nursingGroupsOf(s: Snapshot): string[] {
  return nursingGroupsFrom(s.settings.nursingGroups);
}
/** The groups this facility starts on a fixed kit, off a snapshot. Empty means none of them. */
export function kitGroupsOf(s: Snapshot): string[] {
  return s.settings.kitGroups ?? [];
}

/** Is this group on the FTE table, asked of the facility's own list of group names?
 *
 *  This is the one test for it, and it takes the list rather than a snapshot so that the server-side
 *  screens which hold no snapshot — the manager's review and team screens, the wearer's own app — can
 *  select Facility.nursingGroups themselves and ask exactly this question. It no longer decides
 *  whether somebody has a ceiling — six sets held is everybody's — only which words describe the way
 *  up to it, and which figure the order form proposes.
 *
 *  Called "nursing" because nurses are who the FTE table on the signed form was drawn up for, but the
 *  list is whatever groups the facility puts on it, and a group with no "nurs" in its name can be
 *  there. Compared through groupKey(). Renaming a group renames it in this list too (settings.renameGroup
 *  in lib/ops), which is the point — nobody's allowance may change because a label was tidied up. */
export function isNursingGroup(groups: string[] | null | undefined, group: string | null | undefined): boolean {
  return onGroupList(nursingGroupsFrom(groups), group);
}

/** Is this group on the starting-kit list, asked of the facility's own list of names? The same
 *  question as isNursingGroup(), asked of Facility.kitGroups and compared the same way, for the same
 *  reason.
 *
 *  Membership only. A group somehow on both lists is on the FTE table — allowanceRoute() in ./sets
 *  decides that — so a caller holding the raw columns passes both answers to allowance() and lets it
 *  choose, rather than choosing itself. */
export function isKitGroup(groups: string[] | null | undefined, group: string | null | undefined): boolean {
  return onGroupList(groups, group);
}

/** The FTE-table route: a starting kit proposed by the hours somebody works rather than the
 *  facility's flat number, and no yearly figure in the reports — their replacements are governed by
 *  the manager's signed form. Their ceiling is the same six sets held as everybody else's; the route
 *  buys no exemption from it, and the one place that is asked is capCheck().
 *
 *  The snapshot's way of asking isNursingGroup(), and nothing more than that. Two ways of deciding
 *  who is on the table is how a group fell off it the first time, so this one hands the question
 *  straight on rather than repeating the comparison beside it. */
export function isNursing(s: Snapshot, st: { group: string } | undefined): boolean {
  return isNursingGroup(s.settings.nursingGroups, st?.group);
}

/** The starting-kit route: a fixed number of sets on the first day (Settings.initialSets), then more
 *  as needed up to the ceiling, with nothing to hand back first.
 *
 *  True only when the kit is the route this person is actually on. A group caught on both lists
 *  answers false here and true from isNursing(), so no screen can show somebody on two routes at
 *  once. */
export function isKit(s: Snapshot, st: { group: string } | undefined): boolean {
  return allowanceRouteOf(s, st) === "kit";
}

/** Which of the three routes this person's group is on, off a snapshot: "fte", "kit" or
 *  "approval". The same answer allowance() in ./sets reaches for the screens that hold no snapshot. */
export function allowanceRouteOf(s: Snapshot, st: { group: string } | undefined): AllowanceRoute {
  return allowanceRoute({ nursing: isNursing(s, st), kit: isKitGroup(s.settings.kitGroups, st?.group) });
}
/** Maternity wear, kept as its own block rather than folded into tops and pants. It is what a
 *  pregnant wearer is hunting for and what everybody else wants out of the way, and a maternity
 *  tunic is never swapped for a standard one, so the two are not interchangeable in any list.
 *  Like a dress it counts as neither half of a set: a set is the two-piece uniform, and maternity
 *  wear is issued as whatever fits rather than as a top-and-pants pair. */
export const MATERNITY_TYPES = ["Maternity top", "Maternity tunic", "Maternity dress", "Maternity pants"];
export const OTHER_TYPES = ["Dress", "Jacket", "Vest", "Fleece", "Apron", "Hat", "Footwear", "Other"];
/** Every garment type the item form offers, in the order it offers them. Tops and pants come from
 *  ./sets because they are the two halves of a set and the allowance rule has to agree with the
 *  picker about which is which; the blocks after them count as neither half, which is how a jacket
 *  or a vest has always behaved. */
export const PRODUCT_TYPES = [...TOP_TYPES, ...PANT_TYPES, ...MATERNITY_TYPES, ...OTHER_TYPES];
/** The warm layers already inside OTHER_TYPES, named so a picker can put them under one heading.
 *  Not a fourth block of PRODUCT_TYPES — each of these is offered there once already. */
export const OUTERWEAR_TYPES = ["Jacket", "Vest", "Fleece"];

// An explicit type wins; items saved before the field existed keep the old name-based guess. Takes
// only the two fields it reads, so callers holding a narrow select (the staff app reads the
// catalogue without costs) don't have to fake a whole Item to ask the question — the same shape the
// set rule reads, which is why it is that type.
//
// The trap worth knowing: type is a free-text field with a datalist behind it, not a closed list,
// and every one of these reads it as an exact (case-insensitive) match against the vocabulary
// above. A hand-typed "scrubs" or "Scrub Tops" therefore answers false everywhere — worse than
// leaving type blank, which at least falls back to the garment name. Ask through these helpers
// rather than comparing `it.type` yourself, or one typo in the catalogue quietly stops a garment
// counting as a top.
/** The name fallback is the whole word "maternity" and nothing shorter: "mat" on its own would
 *  claim a floor mat, and no catalogue writes a maternity garment down without the word in it. */
export const isMaternityItem = (it: Garment | undefined) =>
  it?.type ? isTypeIn(MATERNITY_TYPES, it.type) : /maternity/i.test(it?.item || "");

export type GarmentCategory = "tops" | "bottoms" | "maternity" | "outerwear" | "other";
/** The headings a catalogue is broken into when somebody is choosing a garment, in the order they
 *  are shown. Only the vocabulary lives here; anything showing these leaves out the ones nothing
 *  falls in, so a facility that stocks no maternity wear never sees the word. */
export const GARMENT_CATEGORIES: { key: GarmentCategory; label: string }[] = [
  { key: "tops", label: "Tops" },
  { key: "bottoms", label: "Bottoms" },
  { key: "maternity", label: "Maternity" },
  { key: "outerwear", label: "Outerwear" },
  { key: "other", label: "Everything else" },
];
/** The one heading a garment belongs under. First match wins, so nothing is offered twice in the
 *  same picker.
 *
 *  The order the questions are asked in is the point. Maternity comes first because a maternity
 *  tunic is a maternity garment before it is a top, and sitting it under Tops next to the standard
 *  tunics puts it back in the pile it was pulled out of. Outerwear comes before tops for the same
 *  reason one step down: an untyped "Fleece top" belongs with the fleeces, not with the polos. */
export function garmentCategory(it: Garment | undefined): GarmentCategory {
  if (isMaternityItem(it)) return "maternity";
  if (it?.type ? isTypeIn(OUTERWEAR_TYPES, it.type) : /jacket|vest|fleece|jumper|cardigan|coat|softshell/i.test(it?.item || "")) return "outerwear";
  if (isTopItem(it)) return "tops";
  if (isPantItem(it)) return "bottoms";
  return "other";
}

export function sizeIndexOf(it: Item | undefined, size: string): number {
  if (!it) return -1;
  return it.sizes.map(String).indexOf(String(size));
}

export type Ledger = Record<string, { recv: number; issued: number; ret: number }>;

export function ledger(s: Snapshot): Ledger {
  const L: Ledger = {};
  const get = (k: string) => L[k] || (L[k] = { recv: 0, issued: 0, ret: 0 });
  const byId = itemMap(s);
  for (const o of s.orders) {
    for (const rc of o.receipts) for (const l of rc.lines) {
      if (l.dest !== "shelf") continue;
      const si = sizeIndexOf(byId[l.itemId], l.size);
      if (si >= 0) get(key(l.itemId, si)).recv += l.qty;
    }
  }
  for (const i of s.issues) {
    if (i.preloved) continue; // pool issues never touch the shelf ledger
    if (!i.direct) get(key(i.itemId, i.si)).issued += i.qty;
    if (i.returned && i.returned.cond === "Returned - Good") get(key(i.itemId, i.si)).ret += i.qty;
  }
  for (const m of s.moves) get(key(m.itemId, m.si)).recv += m.qty;
  return L;
}

export function itemMap(s: Snapshot): Record<string, Item> {
  const m: Record<string, Item> = {};
  for (const it of s.catalog) m[it.id] = it;
  return m;
}
export function staffMap(s: Snapshot): Record<string, StaffRec> {
  const m: Record<string, StaffRec> = {};
  for (const st of s.staff) m[st.id] = st;
  return m;
}

export function onhand(s: Snapshot, L: Ledger, k: string): number {
  const st = s.stock[k];
  const o = (st ? st.opening + st.adj : 0);
  const l = L[k];
  return o + (l ? l.recv - l.issued + l.ret : 0);
}
/** Pre-loved pool on hand for a variant (handed-in / seconds, reissued free). */
export function plOf(s: Snapshot, k: string): number { return s.stock[k]?.preloved || 0; }
export function reorderAt(s: Snapshot, k: string): number {
  const st = s.stock[k];
  return st && st.reorder !== null && st.reorder !== undefined ? st.reorder : s.settings.defaultReorder;
}
export function touched(s: Snapshot, L: Ledger, k: string): boolean {
  const st = s.stock[k];
  return !!((st && (st.opening || st.adj || st.reorder !== null)) || L[k]);
}
/** Units on open orders per variant key (ordered minus already receipted), plus the total. */
export function onOrderMap(s: Snapshot, byId: Record<string, Item>): { byKey: Record<string, number>; total: number } {
  const byKey: Record<string, number> = {}; let total = 0;
  for (const o of s.orders) {
    if (o.status === "Received" || o.status === "Cancelled") continue;
    const recvd: Record<string, number> = {};
    for (const rc of o.receipts) for (const l of rc.lines) recvd[l.itemId + "|" + l.size] = (recvd[l.itemId + "|" + l.size] || 0) + l.qty;
    for (const l of o.lines) {
      const si = sizeIndexOf(byId[l.itemId], l.size); if (si < 0) continue;
      const rem = Math.max(0, l.qty - (recvd[l.itemId + "|" + l.size] || 0));
      if (rem > 0) { const k = key(l.itemId, si); byKey[k] = (byKey[k] || 0) + rem; total += rem; }
    }
  }
  return { byKey, total };
}
/** Most recent stocktake date per variant key (stocktakes are newest-first in the snapshot). */
export function lastCountMap(s: Snapshot): Record<string, string> {
  const m: Record<string, string> = {};
  for (const t of s.stocktakes) for (const l of t.lines) { const k = key(l.itemId, l.si); if (!m[k]) m[k] = t.date; }
  return m;
}
/** How many garments a year this person's record is measured against in the reports: Infinity for
 *  the nursing stream, else their own figure or the facility default.
 *
 *  A reporting figure, and only that. It is not what the counter refuses on — what may be held at
 *  once is six sets, and capCheck() above is where that is asked — so nothing that decides whether a
 *  garment is handed over should be reading this or entUsed(). The exceptions list, the register,
 *  the monthly report and the CSV all still want it: "drawn since July" is a question a linen room
 *  genuinely asks, and answering it was never the same thing as refusing somebody at the counter. */
export function entOf(s: Snapshot, st: StaffRec): number {
  if (isNursing(s, st)) return Infinity;
  return st.ent ?? s.settings.defaultEntitlement;
}
export function entOfLabel(of: number): string { return Number.isFinite(of) ? String(of) : "no limit"; }
/** An issue still counts (entitlement, cost-centre charge) unless the garment came back in good condition. Lost / damaged / written off stay charged. */
export function countsAsIssued(i: IssueRec): boolean { return !i.returned || i.returned.cond !== "Returned - Good"; }
/** Unit cost for an issue: the cost recorded at issue time, falling back to the catalogue for legacy rows. */
export function issueCost(i: IssueRec, byId: Record<string, Item>): number { return i.cost > 0 ? i.cost : byId[i.itemId]?.cost || 0; }
/** Garments drawn since 1 July, hand-ins credited back — the year's tally the reports print beside
 *  entOf(). The pair of them answer "what has this person drawn this year" and nothing else: what
 *  somebody may hold is capCheck(), which has no date in it. */
export function entUsed(s: Snapshot, staffId: string): number {
  const fy = fyStart(s.today);
  let n = 0;
  for (const i of s.issues) if (i.staffId === staffId && i.date >= fy && !i.preloved && countsAsIssued(i)) n += i.qty;
  // A credited hand-in gives the good garments back to the allowance.
  for (const h of s.handins) if (h.staffId === staffId && h.credit && h.date >= fy) for (const l of h.lines) n -= l.credited;
  return Math.max(0, n);
}
export function entState(used: number, of: number): "OVER" | "AT LIMIT" | "NEAR" | "OK" {
  if (!Number.isFinite(of)) return "OK";
  return used > of ? "OVER" : used >= of ? "AT LIMIT" : of - used <= 2 ? "NEAR" : "OK";
}
export function entTag(st: string): string {
  return st === "OVER" ? "tag tag-accent" : st === "OK" ? "tag tag-neutral" : "tag tag-outline";
}
export function ccFor(s: Snapshot, dept: string): string {
  const e = s.depts.find((x) => x.name === dept);
  return e ? e.cc : "";
}
/** Cost centre code for a staff member: explicit override, else derived from their department. */
export function ccOf(s: Snapshot, st: StaffRec | undefined): string {
  if (!st) return "";
  return st.ccOverride || ccFor(s, st.dept);
}
/** Cost centre an issue is charged to: the one frozen when it was issued, else — for rows written
 *  before that was recorded — the wearer's department as it stands now. Every report reads
 *  attribution through this, so moving somebody between wards cannot restate what a ward was
 *  already charged, and history written before the column still answers the way it always has. */
export function ccOfIssue(s: Snapshot, i: IssueRec, st: StaffRec | undefined): string {
  return i.cc || ccOf(s, st);
}
/** Cost centre code for an order: its cc field is a department name (or raw code), else the staff member's. */
export function ccOfOrder(s: Snapshot, o: OrderRec, staffById: Record<string, StaffRec>): string {
  if (o.cc) return ccFor(s, o.cc) || o.cc;
  return o.staffId ? ccOf(s, staffById[o.staffId]) : "";
}
export function staffName(st: StaffRec | undefined, fallback = ""): string {
  return st ? `${st.first} ${st.last}` : fallback;
}
export function supplierInfo(s: Snapshot, name: string): SupplierRec | undefined {
  return s.supplierDir.find((x) => x.name === name);
}
export function leadDaysOf(s: Snapshot, name: string): number {
  return supplierInfo(s, name)?.lead || 0;
}
/** Manager approvals with sets remaining for a staff member, oldest first (snapshot order is createdAt asc, so same-day ties keep entry order). */
export function openApprovals(s: Snapshot, staffId: string): ApprovalRec[] {
  return s.approvals.filter((a) => a.staffId === staffId && a.sets - a.used > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
/** Oldest manager approval with sets remaining for a staff member. */
export function openApproval(s: Snapshot, staffId: string): ApprovalRec | undefined { return openApprovals(s, staffId)[0]; }
/** Total sets remaining across all of a staff member's open approvals. */
export function approvalRemaining(s: Snapshot, staffId: string): number { return openApprovals(s, staffId).reduce((t, a) => t + a.sets - a.used, 0); }

/** "Casual" exactly as the FTE field spells it. It is not a number, which is why Staff.fte and
 *  Approval.fte are strings. */
export const FTE_CASUAL = "Casual";
/** What an FTE picker offers, in the order the form lists it. */
export const FTE_OPTIONS = ["1.0", "0.9", "0.8", "0.7", "0.6", "0.5", "0.4", "0.3", "0.2", "0.1", FTE_CASUAL];
/** The set counts the form names for a casual. It leaves the choice to the manager, so these are
 *  offered, never assumed. */
export const CASUAL_SETS = [1, 2, 3];

/** The FTE table off the signed order form: combined FTE → uniform sets.
 *
 *  Casual is null because the form hands the manager discretion there and the app must not invent a
 *  number on their behalf. Everything here is a proposal: a manager may write a larger number, and when
 *  they do the deviation is recorded rather than refused. What it is not is a second ceiling — a
 *  part-timer simply starts on less than a full-timer, and both end at the six sets anybody may hold,
 *  which is why a 0.5 FTE signed for four sets is a decision and not an error. */
export const FTE_SETS: Record<string, number | null> = {
  "1.0": 5, "0.9": 5,
  "0.8": 4, "0.7": 4,
  "0.6": 3, "0.5": 3,
  "0.4": 2, "0.3": 2,
  "0.2": 1, "0.1": 1,
  [FTE_CASUAL]: null,
};

/** What the table proposes for an FTE, or null where it proposes nothing — a casual, or somebody
 *  with no FTE recorded at all.
 *
 *  A figure the table has no row for is read as the band it falls in rather than thrown away: the
 *  number is copied off a paper form, and somebody who writes "1" or "0.75" has told us plainly
 *  enough what they meant. Only a blank or something that isn't a fraction at all gives up. */
export function setsForFte(fte: string): number | null {
  const raw = (fte || "").trim();
  if (!raw) return null;
  if (raw.toLowerCase() === FTE_CASUAL.toLowerCase()) return null;
  const listed = FTE_SETS[raw];
  if (listed !== undefined) return listed;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n >= 0.9 ? 5 : n >= 0.7 ? 4 : n >= 0.5 ? 3 : n >= 0.3 ? 2 : 1;
}

/** The set counts the form names for a casual, written out the way a note has to say them — "1, 2
 *  or 3". Exported so that a screen quoting the form uses the same words as the note it previews. */
export const CASUAL_ALLOWED = CASUAL_SETS.length > 1
  ? `${CASUAL_SETS.slice(0, -1).join(", ")} or ${CASUAL_SETS[CASUAL_SETS.length - 1]}`
  : String(CASUAL_SETS[0]);
const CASUAL_MAX = Math.max(...CASUAL_SETS);

/** Where a manager's signature goes past the paper it was signed against, as the sentence recorded
 *  on the approval — or null when it doesn't.
 *
 *  Two papers to depart from: the FTE table for anybody with a fraction against them, and the form's
 *  own one-to-three for a casual, whose number the form hands to the manager outright. Neither is a
 *  refusal. The signature stands; the sentence is there so that an extra set reads, months later, as
 *  a decision with a name on it rather than as a typo nobody can account for.
 *
 *  One function because the same sentence is read twice in a row: previewed on the staff record
 *  while the approval is typed in, then written onto the row by lib/ops when it is saved. As two
 *  copies they had already drifted into saying the same thing two ways on the same row, and a
 *  preview that differs from what gets recorded is a promise the save then breaks. */
export function approvalDeparture(a: { sets: number; fte: string; by: string }): string | null {
  const proposed = setsForFte(a.fte);
  if (proposed !== null) {
    return a.sets > proposed ? `Above the FTE table: ${a.sets} sets at ${a.fte} FTE, where the table proposes ${proposed}. Approved by ${a.by}.` : null;
  }
  return a.fte.trim().toLowerCase() === FTE_CASUAL.toLowerCase() && a.sets > CASUAL_MAX
    ? `Above what the form names for a casual: ${a.sets} sets, where the form names ${CASUAL_ALLOWED}. Approved by ${a.by}.`
    : null;
}

/** The initial kit, in sets — what this person is handed on starting, and nothing beyond it.
 *
 *  Three routes, three answers. The FTE table's groups take its proposal. The starting-kit groups
 *  take the facility's configured starting allocation, asked of ./sets — which owns that rule — so
 *  the coordinator's setting is read the same way on the order form as on the wearer's own screen.
 *  Every group on manager approval starts with no kit at all: their sets come one at a time on their
 *  manager's approval, up to the facility's ceiling, so there is no number anybody can name before
 *  that first signature.
 *
 *  A group on both lists — the server refuses one, but a restored file could still carry it — is on
 *  the FTE table, for the reason allowanceRoute() gives. This asks allowanceRouteOf() rather than
 *  putting the two tests in an order of its own, so the order form and the wearer's app cannot
 *  settle it differently.
 *
 *  Only the *starting* allocation. What comes after it is issued as it is needed, up to the ceiling,
 *  and never counts as more kit: a kit that grew would have the counter chasing people for a first
 *  issue they already had.
 *
 *  null means nobody can say yet — a casual, somebody on the FTE table whose FTE has never been
 *  recorded, or somebody on manager approval — and it is not the same as zero, which reads as a
 *  refusal somebody made. Anything showing this has to say so in words. Handing the starting kit's 3
 *  to somebody on manager approval was the worse failure of the two: their record totted up "6 still
 *  to come" and invited them to a counter where the printed form, their own app and the settings
 *  note all agree they are owed nothing until their manager signs for it. */
export function initialSets(s: Snapshot, st: StaffRec | undefined): number | null {
  if (!st) return null;
  switch (allowanceRouteOf(s, st)) {
    case "fte": return setsForFte(st.fte);
    case "kit": return setsOnStart(s.settings.initialSets);
    default: return null;
  }
}
/** The same kit counted in garments, which is the unit issues are counted in. */
export function initialGarments(s: Snapshot, st: StaffRec | undefined): number | null {
  const sets = initialSets(s, st);
  return sets === null ? null : sets * SET_GARMENTS;
}

/** How many garments of the initial kit this person has ever had. A lifetime count, and deliberately
 *  not entUsed().
 *
 *  entUsed() counts one financial year and credits hand-ins back against it. That is the right
 *  answer to "what have they drawn this year" and it is the number every report quotes, so it stays
 *  exactly as it is. The initial kit asks a different question — has this person been kitted out yet
 *  — and there is no year in that one: somebody issued five sets in 2019 has had their kit whether
 *  or not they have drawn a thing since.
 *
 *  A hand-in doesn't give the kit back for the same reason. Handing in a worn-out tunic doesn't
 *  un-issue it, and what comes the other way is a replacement — approved by the manager, or overridden
 *  by the coordinator — not a fresh first issue. What is left out is the pre-loved pool, which is
 *  free and never draws an approval down, and a garment returned in good condition, which was a swap
 *  rather than an issue. */
export function initialUsed(s: Snapshot, staffId: string): number {
  let n = 0;
  for (const i of s.issues) if (i.staffId === staffId && !i.preloved && countsAsIssued(i)) n += i.qty;
  return n;
}
/** Garments of the initial kit still owing, or null when there is no agreed number to count against.
 *  Never negative: past the kit the control is an approval or a coordinator override, not a running
 *  deficit.
 *
 *  What is owed on starting, and nothing to do with what the counter refuses. It was once added to
 *  the year's figure to make head-room, because a 3-set kit is 6 garments and a 5-garment year
 *  figure turned a new starter's own record into an override; under a ceiling on what is held that
 *  problem is gone — a new starter holds nothing, takes three sets, and three is inside six. So this
 *  belongs to the order form and the staff record, which say what somebody is owed, and never to
 *  capCheck(), which says what they may hold. */
export function initialRemaining(s: Snapshot, st: StaffRec | undefined): number | null {
  const of = initialGarments(s, st);
  if (of === null || !st) return null;
  return Math.max(0, of - initialUsed(s, st.id));
}

/** Everything this person has, or has coming to them, a line at a time: `owed` is false for what is
 *  on their back and in their locker, true for what the linen room has committed to hand them and has
 *  not handed over yet.
 *
 *  Out means issued and not since handed in or returned. A hand-in takes a garment off somebody
 *  without ever marking it returned, so leaving either test out has a nurse who did exactly what she
 *  was asked to still holding what she gave back. A partial hand-in splits the issue row rather than
 *  stamping the whole of it — lib/ops's doing — so somebody who brought back one of two sets holds
 *  one, and the two halves are told apart by that same stamp.
 *
 *  Owed is three things, each counted from the moment it is agreed until the moment it is handed over:
 *
 *   - An order placed for them — a draft included, because a draft becomes an order without anybody
 *     asking the ceiling again, and it was drafted for them. Whatever of it has already arrived is
 *     left out: it went to the shelf, where it belongs to nobody, or to a pickup, counted next.
 *   - A pickup waiting for them: the order came in and is sitting at the counter with their name on it.
 *   - Lines a manager has approved on a request nobody has collected yet, when the snapshot carries
 *     them (Snapshot.owedRequestLines).
 *
 *  None of those is measured against the ceiling a second time when it is handed over, and none of
 *  them needs to be: collecting it moves the garment from owed to out and the total stays where it
 *  was. Counted only on the day it arrived, somebody holding nothing could order six sets in today
 *  and six more tomorrow, and both would pass. */
function eachHolding(s: Snapshot, staffId: string | null, visit: (staffId: string, itemId: string, qty: number, owed: boolean) => void): void {
  const mine = (id: string) => staffId === null || id === staffId;
  for (const i of s.issues) if (mine(i.staffId) && !i.returned && !i.handedIn) visit(i.staffId, i.itemId, i.qty, false);
  for (const o of s.orders) {
    const sid = o.staffId;
    if (!sid || !mine(sid) || !isOpen(o)) continue;
    // Drawn down line by line, as orderTotal() does, so two lines for one size can't both claim a
    // single delivery.
    const got: Record<string, number> = {};
    for (const rc of o.receipts) for (const l of rc.lines) got[l.itemId + "|" + l.size] = (got[l.itemId + "|" + l.size] || 0) + l.qty;
    for (const l of o.lines) {
      const k = l.itemId + "|" + l.size, done = Math.min(l.qty, got[k] || 0);
      got[k] = (got[k] || 0) - done;
      if (l.qty > done) visit(sid, l.itemId, l.qty - done, true);
    }
  }
  for (const pu of s.pickups) if (mine(pu.staffId) && !pu.pickedUp) for (const l of pu.lines) visit(pu.staffId, l.itemId, l.qty, true);
  for (const r of s.owedRequestLines || []) if (mine(r.staffId)) visit(r.staffId, r.itemId, r.qty, true);
}

/** What this person holds as far as the ceiling is concerned: tops, trousers, whatever belongs to no
 *  set, and the complete sets the first two make between them — what is out with them and what is
 *  owed to them alike (eachHolding above says what each of those is).
 *
 *  Deliberately more than the counter's own list of garments in components/MPerson's useHeld(),
 *  which lists what is physically out. That list says what somebody can hand back; this says how
 *  near they are to six, and a garment on order is not something anybody can hand back. Where a
 *  screen needs to tell the two apart, owedGarments() is the difference.
 *
 *  Pre-loved garments are counted like any other. They are free and they draw no approval, but the
 *  ceiling is not about money: it is about how much uniform one person is walking around with, and
 *  six pre-loved tops fill a locker exactly as six new ones do. */
export function heldGarments(s: Snapshot, staffId: string, byId = itemMap(s)): GarmentCounts {
  const holdings: { item: Garment; qty: number }[] = [];
  eachHolding(s, staffId, (_, itemId, qty) => { holdings.push({ item: byId[itemId] || {}, qty }); });
  return garmentCounts(holdings);
}

/** The part of heldGarments() that has not reached them yet — on order, waiting at the counter, or
 *  approved in a bag nobody has collected. A screen telling somebody they hold four tops when two
 *  of those are on order owes them the other half of the sentence, and this is it. */
export function owedGarments(s: Snapshot, staffId: string, byId = itemMap(s)): GarmentCounts {
  const holdings: { item: Garment; qty: number }[] = [];
  eachHolding(s, staffId, (_, itemId, qty, owed) => { if (owed) holdings.push({ item: byId[itemId] || {}, qty }); });
  return garmentCounts(holdings);
}

/** The same count for everybody at once, keyed by staff id — owed garments included, so a register
 *  that flags somebody as over agrees with the counter that would refuse them. One walk instead of
 *  one per person: a register of six hundred staff asking heldGarments() a row at a time walks every
 *  issue in the facility six hundred times, which is what makes a list screen crawl on a big site.
 *  Somebody with nothing out and nothing owed is absent from the map, so read it with a zeroed
 *  fallback. */
export function heldByStaff(s: Snapshot): Record<string, GarmentCounts> {
  const byId = itemMap(s);
  const m: Record<string, GarmentCounts> = {};
  eachHolding(s, null, (staffId, itemId, qty) => {
    const c = (m[staffId] ||= { tops: 0, pants: 0, other: 0, sets: 0 });
    const half = setHalf(byId[itemId] || {});
    if (half === "top") c.tops += qty;
    else if (half === "pants") c.pants += qty;
    else c.other += qty;
  });
  for (const id in m) m[id].sets = Math.min(m[id].tops, m[id].pants);
  return m;
}

/** The one question the counter asks: after this hand-over, is this person still inside the six sets
 *  one person holds?
 *
 *  Six sets at any time, for every group — nursing included. Not six a year: there is no financial
 *  year in this, nothing resets in July, and the only way past a full six is to hand something in or
 *  to have a coordinator record an override. What the three streams differ in is how somebody gets
 *  up to six — the FTE table proposes it, a starting kit opens it, a manager signs for it — and none
 *  of that is a second refusal for the counter to make on top of this one.
 *
 *  `cart` is what is about to be handed over, as garments rather than sets: the ceiling bites on each
 *  half, so a bag of six tops has to be measurable against six tops held. Pre-loved lines belong in
 *  it like any other — they are free, not invisible — which is why this takes the cart whole rather
 *  than the filtered quantity the costing uses. Lines whose garment is no longer in the catalogue
 *  count as belonging to no set, which is where anything unrecognised lands elsewhere too.
 *
 *  The answer comes back in parts rather than as a verdict. A coordinator asked to tick an override
 *  is owed a reason they can check against the person in front of them — "holds six tops and six
 *  pairs, and six sets is the most anyone holds" — and the screens need the same parts to say why
 *  before anybody clicks anything.
 *
 *  What they hold is heldGarments(): what is out with them and what is owed to them, together. The
 *  answer also carries `owed`, the part of that still to come, because "holding six tops" said to
 *  somebody who can count four in their locker needs the rest of the sentence before anyone will
 *  believe it. */
export type CapCheck = CapState & { owed: GarmentCounts };
export function capCheck(s: Snapshot, st: StaffRec, cart: { itemId: string; qty: number }[] = []): CapCheck {
  const byId = itemMap(s);
  const adding = garmentCounts(cart.map((c) => ({ item: byId[c.itemId] || {}, qty: c.qty })));
  return { ...capState({ held: heldGarments(s, st.id, byId), adding, capSets: s.settings.capSets }), owed: owedGarments(s, st.id, byId) };
}

/* ---------- per-line flags on the counter phone
 *
 * The phone shows WHY a line needs the coordinator's override on the line itself, and asks for one
 * reason from a fixed list per flagged line. issue.create asks the same function inside its lock
 * (with the owed garments loaded), so the flags the phone shows and the ones the server refuses on
 * are the same flags. */
export const OVERRIDE_REASONS = ["Soiled on shift", "Replacing damaged", "Manager asked", "Other"] as const;
export type OverrideReason = (typeof OVERRIDE_REASONS)[number];
export type LineFlag = { rule: "group" | "style" | "cap"; label: string } | null;

/** One flag (or null) per line, in the order given. Group first, then cut, then the ceiling: a line
 *  is flagged for the ceiling when the cart up to and including it is over, and its garment is on
 *  the side that is over (tops, pants, or outside a set). If the cart is over only because of what
 *  they already hold, the first line carries the flag, so an over-cap issue can never go unflagged. */
export function issueLineFlags(s: Snapshot, st: StaffRec, lines: { itemId: string; qty: number }[]): LineFlag[] {
  const byId = itemMap(s);
  const out: LineFlag[] = lines.map((l, i) => {
    const it = byId[l.itemId];
    if (it && !garmentForGroup(it, st.group)) return { rule: "group", label: `Not for ${(st.group || "").trim() || "their group"}` };
    if (it && !garmentForStyle(it, st.uniformStyle)) return { rule: "style", label: `Not for ${st.uniformStyle}` };
    const cap = capCheck(s, st, lines.slice(0, i + 1));
    if (!cap.over) return null;
    const half = setHalf(it || {});
    const onSide = half === "top" ? cap.overTops > 0 : half === "pants" ? cap.overPants > 0 : cap.overOther > 0;
    if (!onSide) return null;
    return { rule: "cap", label: half === null ? `Over ${cap.cap} outside a set` : `Over ${cap.cap} sets` };
  });
  if (lines.length && !out.some((f) => f?.rule === "cap")) {
    const cap = capCheck(s, st, lines);
    if (cap.over) {
      const i = out.findIndex((f) => f === null);
      if (i >= 0) out[i] = { rule: "cap", label: cap.breach === "other" ? `Over ${cap.cap} outside a set` : `Over ${cap.cap} sets` };
    }
  }
  return out;
}

/** What is coming for one size: "24 due Thu" (within a week), "24 due 3 Oct", "24 on order" when
 *  the order has no expected date, or "" when nothing is on an open, placed order. The earliest
 *  expected order with outstanding quantity wins; its outstanding quantity is the figure. */
export function onOrderText(s: Snapshot, itemId: string, si: number): string {
  const it = s.catalog.find((x) => x.id === itemId);
  if (!it) return "";
  const size = String(it.sizes[si] ?? "");
  let best: { qty: number; expected: string } | null = null;
  for (const o of s.orders) {
    if (!isOpen(o) || o.status === "Draft") continue;
    const got: Record<string, number> = {};
    for (const rc of o.receipts) for (const l of rc.lines) got[l.itemId + "|" + l.size] = (got[l.itemId + "|" + l.size] || 0) + l.qty;
    let qty = 0;
    for (const l of o.lines) {
      const k = l.itemId + "|" + l.size, done = Math.min(l.qty, got[k] || 0);
      got[k] = (got[k] || 0) - done;
      if (l.itemId === itemId && l.size === size && l.qty > done) qty += l.qty - done;
    }
    if (qty <= 0) continue;
    const exp = o.expected || "";
    if (!best || (exp && (!best.expected || exp < best.expected))) best = { qty, expected: exp };
  }
  if (!best) return "";
  if (!best.expected) return `${best.qty} on order`;
  const ahead = best.expected >= s.today ? daysBetween(s.today, best.expected) : -1;
  return ahead >= 0 && ahead <= 6
    ? `${best.qty} due ${formatInZone(best.expected, s.tz, { weekday: "short" })}`
    : `${best.qty} due ${formatInZone(best.expected, s.tz, { day: "numeric", month: "short" })}`;
}

export type Variant = { itemId: string; si: number; size: string; key: string; item: Item };
export function variantList(s: Snapshot): Variant[] {
  const out: Variant[] = [];
  for (const it of s.catalog) if (!it.archived) it.sizes.forEach((size, si) => out.push({ itemId: it.id, si, size: String(size), key: key(it.id, si), item: it }));
  return out;
}

// Barcodes: supplier/bound codes from the map, else generated 93XXXXXXX from the item's sort number.
export function bcFor(s: Snapshot, it: Item, si: number): string {
  return bcBound(s, it, si) || String(930000000 + it.sort * 100 + si);
}
/** The supplier barcode actually bound to this size, or "" when none has been scanned in yet.
 *  Prefer this anywhere a code is SHOWN or PRINTED: the generated 93XXXXXXX fallback from bcFor()
 *  is a ThreadCount-internal id that appears nowhere on the garment, so printing it invites someone
 *  to try to scan a number that doesn't exist. bcFor() stays for resolution — bcParse still accepts
 *  the generated form, so anything already relying on it keeps working. */
export function bcBound(s: Snapshot, it: Item, si: number): string {
  const k = key(it.id, si);
  for (const code in s.barcodes) if (s.barcodes[code] === k) return code;
  return "";
}
export function bcParse(s: Snapshot, raw: string): { itemId: string; si: number } | null {
  const code = String(raw).trim();
  if (!code) return null;
  const bound = s.barcodes[code];
  const byId = itemMap(s);
  if (bound) {
    const { itemId, si } = splitKey(bound);
    const it = byId[itemId];
    if (it && !it.archived && si < it.sizes.length) return { itemId, si };
  }
  if (!/^93\d{7}$/.test(code)) return null;
  const v = +code - 930000000, sort = Math.floor(v / 100), si = v % 100;
  const it = s.catalog.find((x) => x.sort === sort);
  if (!it || it.archived || si >= it.sizes.length) return null;
  return { itemId: it.id, si };
}

/** What an order is worth: delivered units priced at the cost the delivery was invoiced at, anything
 *  still outstanding at today's catalogue price.
 *
 *  The catalogue cost is a live figure, so pricing the whole order from it meant an admin editing a
 *  price silently restated every month-end pack already printed — two prints of the same closed
 *  month disagreed, and neither matched the invoice. ReceiptLine.cost is the figure the coordinator
 *  is prompted for on every delivery (and it holds the catalogue price when they keep it), so once a
 *  line has arrived that is the money that actually left the facility. A legacy receipt line stored
 *  as $0 has no figure to trust and falls back to the catalogue, the same way issueCost() does. */
export function orderTotal(o: OrderRec, byId: Record<string, Item>): number {
  // Delivered units per item+size and what they cost. Averaged, because one size can arrive across
  // several deliveries at different prices.
  const recv: Record<string, { qty: number; amt: number; left: number }> = {};
  for (const rc of o.receipts) for (const l of rc.lines) {
    const k = l.itemId + "|" + l.size;
    const a = recv[k] || (recv[k] = { qty: 0, amt: 0, left: 0 });
    a.qty += l.qty; a.left += l.qty;
    a.amt += l.qty * (l.cost > 0 ? l.cost : byId[l.itemId]?.cost || 0);
  }
  return o.lines.reduce((t, l) => {
    const cat = byId[l.itemId] ? byId[l.itemId].cost : 0;
    const a = recv[l.itemId + "|" + l.size];
    if (!a || a.left <= 0) return t + l.qty * cat;
    // Drawn down as it's used, so two order lines for the same size can't both claim one delivery.
    const done = Math.min(l.qty, a.left);
    a.left -= done;
    return t + done * (a.amt / a.qty) + (l.qty - done) * cat;
  }, 0);
}
export function isOpen(o: OrderRec) { return OPEN_STATUSES.includes(o.status); }
/** Open = placed with the supplier and not yet closed (excludes drafts). */
export function isPlacedOpen(o: OrderRec) { return !["Received", "Cancelled", "Draft"].includes(o.status); }
/** Overdue only applies to orders actually placed with the supplier — drafts can't be late. */
export function isOverdue(o: OrderRec, today: string) { return isPlacedOpen(o) && !!o.expected && o.expected < today; }
export function statusTag(st: string): string {
  return st === "Received" ? "tag tag-neutral" : st === "Cancelled" ? "tag tag-outline" : "tag tag-accent";
}

/** "Cost centre X — $ issued this month · $ on open orders" budget note for a cost-centre code. */
export function ccBudgetNote(s: Snapshot, byId: Record<string, Item>, staffById: Record<string, StaffRec>, code: string, suffix = ""): string {
  if (!code) return "";
  const mon = s.today.slice(0, 7);
  let iss = 0;
  // Pre-loved issues are free and are excluded here for the same reason the Reports tabs exclude
  // them: they are stored with cost 0, so issueCost() would fall back to the catalogue and charge a
  // ward full price for garments it was given from the pool. A coordinator deciding whether a cost
  // centre can afford another order would be reading an invented figure the month-end pack denies.
  for (const i of s.issues) { if (!countsAsIssued(i) || i.preloved || i.date.slice(0, 7) !== mon) continue; const st = staffById[i.staffId]; if (st && ccOfIssue(s, i, st) === code) iss += i.qty * issueCost(i, byId); }
  let onOrd = 0;
  for (const o of s.orders) { if (!isOpen(o)) continue; if (ccOfOrder(s, o, staffById) === code) onOrd += orderTotal(o, byId); }
  return `Cost centre ${code} — ${money(iss)} issued this month · ${money(onOrd)} on open orders${suffix}`;
}

/** Lines needed to bring every flagged variant back to 2× reorder, netting off what's already on order. */
export type NeedLine = { itemId: string; si: number; size: string; qty: number; supplier: string; code: string; oh: number; ro: number; onOrder: number };
export function flaggedNeeds(s: Snapshot, L: Ledger, byId: Record<string, Item>): NeedLine[] {
  // Net off stock on placed orders and non-replenish drafts; the replenish draft itself is what we are topping up (max-merge), so exclude it.
  const oo = onOrderMap({ ...s, orders: s.orders.filter((o) => !(o.replenish && o.status === "Draft")) }, byId).byKey;
  const out: NeedLine[] = [];
  for (const v of variantList(s)) {
    if (!touched(s, L, v.key)) continue;
    const oh = onhand(s, L, v.key), ro = reorderAt(s, v.key);
    if (oh > ro) continue;
    const onOrder = oo[v.key] || 0;
    const need = Math.max(ro * 2 - oh - onOrder, 0);
    if (need > 0) out.push({ itemId: v.itemId, si: v.si, size: v.size, qty: need, supplier: v.item.supplier || s.settings.suppliers[0] || "Supplier", code: supplierCodeOf(s, v.key), oh, ro, onOrder });
  }
  return out;
}

/** The supplier's product code for one size, or "" when none has been entered. */
export function supplierCodeOf(s: Snapshot, k: string): string {
  return s.stock[k]?.supplierCode || "";
}


/* ---------- Forecasting and product history (pure; every screen reads the same arithmetic) ----------
 *
 * The snapshot carries every issue the facility has ever recorded, so the usage window is the
 * whole history, not a sample: `weeklyUsage` looks back 13 weeks and, for a size that has not
 * moved in that time, 26. Nothing here writes; the "Use" button on the garment page is what
 * turns a suggestion into a reorder level. */
export type Forecast = {
  /** Garments issued (net of nothing — returns are not un-issues for demand) in the last 13 / 26 weeks. */
  issued13: number; issued26: number;
  /** Average per week over the window that had movement; null when nothing moved in 26 weeks. */
  avgWeekly: number | null;
  /** How many weeks the shelf lasts at that rate; null with no usage. */
  weeksOfCover: number | null;
  /** The supplier's lead time in weeks (Supplier.lead days / 7, default 2). */
  leadWeeks: number;
  /** ceil(avgWeekly × (leadWeeks + 2)); null with no usage. */
  suggestedReorder: number | null;
  /** The shelf runs out before a delivery placed today would land. */
  runsOutBeforeDelivery: boolean;
  /** Which window the average came from. */
  window: 13 | 26 | null;
};

export function forecastFor(s: Snapshot, L: Ledger, byId: Record<string, Item>, k: string): Forecast {
  const [itemId, siStr] = k.split(":"); const si = Number(siStr);
  const today = new Date(s.today + "T00:00:00");
  const cutoff = (weeks: number) => { const d = new Date(today); d.setDate(d.getDate() - weeks * 7); return d.toISOString().slice(0, 10); };
  const c13 = cutoff(13), c26 = cutoff(26);
  let issued13 = 0, issued26 = 0;
  for (const i of s.issues) {
    if (i.itemId !== itemId || i.si !== si || i.preloved) continue;
    if (i.date >= c26) issued26 += i.qty;
    if (i.date >= c13) issued13 += i.qty;
  }
  const window: 13 | 26 | null = issued13 > 0 ? 13 : issued26 > 0 ? 26 : null;
  const avgWeekly = window === 13 ? issued13 / 13 : window === 26 ? issued26 / 26 : null;
  const it = byId[itemId];
  const sup = it ? supplierInfo(s, it.supplier) : undefined;
  const leadWeeks = sup?.lead && sup.lead > 0 ? sup.lead / 7 : 2;
  const oh = onhand(s, L, k);
  const weeksOfCover = avgWeekly && avgWeekly > 0 ? oh / avgWeekly : null;
  const suggestedReorder = avgWeekly && avgWeekly > 0 ? Math.ceil(avgWeekly * (leadWeeks + 2)) : null;
  return { issued13, issued26, avgWeekly, weeksOfCover, leadWeeks, suggestedReorder, runsOutBeforeDelivery: weeksOfCover !== null && weeksOfCover < leadWeeks, window };
}

/** "3.1 wk cover · ~4/wk" — the short form the garment page and the order list print. */
export function forecastLabel(f: Forecast): string {
  if (f.avgWeekly === null || f.weeksOfCover === null) return "no usage yet";
  const perWk = f.avgWeekly >= 10 ? Math.round(f.avgWeekly) : Math.round(f.avgWeekly * 10) / 10;
  return `${f.weeksOfCover >= 100 ? "99+" : f.weeksOfCover.toFixed(1)} wk cover · ~${perWk}/wk`;
}

export type ItemOrderHistoryRow = { date: string; orderId: string; code: string; supplier: string; size: string; qty: number; unit: number; ref: string; invoice: string; status: string };
/** Every order line for one garment, newest first, priced at the receipt's unit cost where it was
 *  received, else the cost history at the order date, else today's cost. */
export function itemOrderHistory(s: Snapshot, itemId: string): ItemOrderHistoryRow[] {
  const it = itemMap(s)[itemId];
  const costs = s.costs.filter((c) => c.itemId === itemId).sort((a, b) => a.at.localeCompare(b.at));
  const costAt = (date: string) => { let v = it?.cost || 0; for (const c of costs) if (c.at.slice(0, 10) <= date) v = c.cost; return costs.length && costs[0].at.slice(0, 10) > date && costs[0].previous !== null ? costs[0].previous : v; };
  const out: ItemOrderHistoryRow[] = [];
  for (const o of s.orders) {
    for (const l of o.lines) {
      if (l.itemId !== itemId) continue;
      const rc = o.receipts.flatMap((r) => r.lines).find((x) => x.itemId === itemId && x.size === l.size && x.cost > 0);
      out.push({ date: o.date, orderId: o.id, code: o.code, supplier: o.supplier, size: l.size, qty: l.qty, unit: rc ? rc.cost : costAt(o.date), ref: o.ref, invoice: o.invoice, status: o.status });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code));
}

/** CSV cell: quoted, doubled quotes, and a leading apostrophe on =,+,-,@ so spreadsheets don't evaluate it. */
export const csvEsc = (v: unknown) => { const t = String(v ?? ""); return '"' + (/^[\s=+\-@]/.test(t) ? "'" + t : t).replace(/"/g, '""') + '"'; };
export function csvOf(cols: string[], rows: (string | number)[][]): string {
  return cols.map(csvEsc).join(",") + "\n" + rows.map((r) => r.map((c) => (typeof c === "number" ? c : csvEsc(c))).join(",")).join("\n") + "\n";
}
export const unMoney = (s: string) => String(s).replace(/[$,]/g, "").replace("−", "-");

/** tel: href for a phone number (digits and + only); empty when there is no usable number. */
export function telHref(phone: string | undefined | null): string { const d = String(phone || "").replace(/[^0-9+]/g, ""); return d ? "tel:" + d : ""; }

// ---------------------------------------------------------------- GTIN / barcode decoding
// Pure, offline. Used to sanity-check a scan before it becomes a catalogue item: a mis-read barcode
// almost always fails the check digit, so we can say "that didn't read cleanly, scan it again"
// instead of silently binding a wrong number to a garment.
const GS1_PREFIXES: [number, number, string][] = [
  [0, 19, "United States / Canada"], [20, 29, "In-store / restricted"], [30, 39, "United States"],
  [40, 49, "In-store / restricted"], [50, 59, "Coupon"], [60, 139, "United States / Canada"],
  [200, 299, "In-store / restricted"], [300, 379, "France"], [380, 380, "Bulgaria"], [383, 383, "Slovenia"],
  [385, 385, "Croatia"], [387, 387, "Bosnia & Herzegovina"], [389, 389, "Montenegro"], [390, 390, "Kosovo"],
  [400, 440, "Germany"], [450, 459, "Japan"], [460, 469, "Russia"], [470, 470, "Kyrgyzstan"], [471, 471, "Taiwan"],
  [474, 474, "Estonia"], [475, 475, "Latvia"], [476, 476, "Azerbaijan"], [477, 477, "Lithuania"], [478, 478, "Uzbekistan"],
  [479, 479, "Sri Lanka"], [480, 480, "Philippines"], [481, 481, "Belarus"], [482, 482, "Ukraine"], [483, 483, "Turkmenistan"],
  [484, 484, "Moldova"], [485, 485, "Armenia"], [486, 486, "Georgia"], [487, 487, "Kazakhstan"], [488, 488, "Tajikistan"],
  [489, 489, "Hong Kong"], [490, 499, "Japan"], [500, 509, "United Kingdom"], [520, 521, "Greece"], [528, 528, "Lebanon"],
  [529, 529, "Cyprus"], [530, 530, "Albania"], [531, 531, "North Macedonia"], [535, 535, "Malta"], [539, 539, "Ireland"],
  [540, 549, "Belgium / Luxembourg"], [560, 560, "Portugal"], [569, 569, "Iceland"], [570, 579, "Denmark"],
  [590, 590, "Poland"], [594, 594, "Romania"], [599, 599, "Hungary"], [600, 601, "South Africa"], [603, 603, "Ghana"],
  [608, 608, "Bahrain"], [609, 609, "Mauritius"], [611, 611, "Morocco"], [613, 613, "Algeria"], [615, 615, "Nigeria"],
  [616, 616, "Kenya"], [618, 618, "Ivory Coast"], [619, 619, "Tunisia"], [620, 620, "Tanzania"], [621, 621, "Syria"],
  [622, 622, "Egypt"], [623, 623, "Brunei"], [624, 624, "Libya"], [625, 625, "Jordan"], [626, 626, "Iran"],
  [627, 627, "Kuwait"], [628, 628, "Saudi Arabia"], [629, 629, "United Arab Emirates"], [630, 630, "Qatar"],
  [640, 649, "Finland"], [690, 699, "China"], [700, 709, "Norway"], [729, 729, "Israel"], [730, 739, "Sweden"],
  [740, 745, "Central America"], [746, 746, "Dominican Republic"], [750, 750, "Mexico"], [754, 755, "Canada"],
  [759, 759, "Venezuela"], [760, 769, "Switzerland"], [770, 771, "Colombia"], [773, 773, "Uruguay"], [775, 775, "Peru"],
  [777, 777, "Bolivia"], [778, 779, "Argentina"], [780, 780, "Chile"], [784, 784, "Paraguay"], [786, 786, "Ecuador"],
  [789, 790, "Brazil"], [800, 839, "Italy"], [840, 849, "Spain"], [850, 850, "Cuba"], [858, 858, "Slovakia"],
  [859, 859, "Czechia"], [860, 860, "Serbia"], [865, 865, "Mongolia"], [867, 867, "North Korea"], [868, 869, "Turkey"],
  [870, 879, "Netherlands"], [880, 880, "South Korea"], [883, 883, "Myanmar"], [884, 884, "Cambodia"],
  [885, 885, "Thailand"], [888, 888, "Singapore"], [890, 890, "India"], [893, 893, "Vietnam"], [896, 896, "Pakistan"],
  [899, 899, "Indonesia"], [900, 919, "Austria"], [930, 939, "Australia"], [940, 949, "New Zealand"],
  [950, 951, "GS1 Global Office"], [955, 955, "Malaysia"], [958, 958, "Macau"],
  [960, 969, "GS1 Global Office"], [977, 977, "Periodical (ISSN)"], [978, 979, "Book (ISBN)"], [980, 980, "Refund receipt"],
  [981, 984, "Coupon"], [990, 999, "Coupon"],
];

/** Digits only, capped so a rogue scan can't blow up a field. */
export function gtinDigits(raw: string): string { return String(raw || "").replace(/\D/g, "").slice(0, 18); }

/** Standard GS1 mod-10 check digit over the code's leading digits. */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = body.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += w * (body.charCodeAt(i) - 48);
  return (10 - (sum % 10)) % 10;
}

export type GtinInfo = { code: string; digits: string; kind: string; valid: boolean; origin: string; company: string };

/** What we can tell about a scanned number without asking anybody: format, check digit, GS1 prefix. */
export function gtinInfo(raw: string): GtinInfo {
  const digits = gtinDigits(raw);
  const kind = digits.length === 13 ? "EAN-13" : digits.length === 12 ? "UPC-A" : digits.length === 8 ? "EAN-8" : digits.length === 14 ? "GTIN-14" : "";
  const valid = !!kind && gtinCheckDigit(digits.slice(0, -1)) === digits.charCodeAt(digits.length - 1) - 48;
  // Prefix lookup runs on the 13-digit form (UPC-A is an EAN-13 with a leading zero).
  const ean = digits.length === 12 ? "0" + digits : digits.length === 14 ? digits.slice(1) : digits;
  let origin = "";
  if (ean.length === 13) { const p = parseInt(ean.slice(0, 3), 10); for (const [lo, hi, name] of GS1_PREFIXES) if (p >= lo && p <= hi) { origin = name; break; } }
  const company = ean.length === 13 ? ean.slice(0, 7) : "";
  return { code: String(raw || "").trim(), digits, kind, valid, origin, company };
}

/** One-line human summary of a scanned code for the quick-add screens. */
export function gtinNote(g: GtinInfo): string {
  if (!g.kind) return g.digits.length ? `${g.digits.length}-digit code — not a standard retail barcode. That's fine, it can still be bound.` : "";
  if (!g.valid) return `${g.kind} check digit doesn't match — the scan may have mis-read. Scan it again to be sure.`;
  return `Valid ${g.kind}${g.origin ? " · issued in " + g.origin : ""}`;
}
