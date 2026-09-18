/* Set allowances, and what a set is.
 *
 * One ceiling, and it is a ceiling on what somebody is HOLDING: six sets, at any time, for every
 * group in the building. Not six a year — nothing here resets in July, and there is no date in this
 * file at all. Six sets is what a person has on their back and in their locker, so the only way past
 * a full six is to hand something in — a swap, not an addition — or a coordinator's override,
 * recorded as the exception it is.
 *
 * Each facility names its own staff groups and puts each one on one of three routes. The routes
 * differ in how somebody gets up to that ceiling, never in whether they have one:
 *
 *   - The FTE table. The hours worked propose the number — a full-timer five sets, a half-timer
 *     three, a casual whatever the manager thinks right — and a manager may sign above the proposal,
 *     up to the ceiling. The proposal lives in lib/compute with the rest of the FTE table; what lives
 *     here is the ceiling it is signed up to.
 *   - The starting kit. A fixed number of sets on the first day, then more as they need them, up to
 *     the same ceiling. Nothing has to be handed back first: asked whether the first set had to come
 *     back before the next was issued, the owner said no.
 *   - Manager approval. No starting kit; their manager approves a set at a time.
 *
 * Which group is on which route is the facility's own answer, two lists of names on its settings
 * (Facility.nursingGroups for the FTE table, Facility.kitGroups for the starting kit). Nothing here
 * guesses it from the letters in a group's name: the same job is "Housekeeping" in one building and
 * "Support Services" in the next, and a guess that misses one takes a whole team's first kit away.
 * lib/compute reads the lists; this file is told the answer.
 *
 * A **set is one top and one pair of trousers**. That matters because ThreadCount's entitlement used
 * to count individual garments, and counting garments would let someone take three tops and no
 * trousers and be "fully issued". Sets held is therefore the smaller of the two counts, which is
 * also how anybody would describe it out loud.
 *
 * The smaller of the two counts is not a ceiling on its own, though: twenty tops and one pair of
 * trousers is "one set" by that measure. So the ceiling bites on each half — at most six tops AND at
 * most six pairs — which is what capState() below works out, and why it answers in halves rather
 * than with a single number.
 *
 * This file is the one place that answers "how many sets may this person hold". The starting figure
 * and the ceiling are facility settings (Facility.initialSets, Facility.capSets) and are passed in —
 * but the sums they go into, and the figures a facility that has never been asked falls back to,
 * live here and nowhere else. The counter screens ask through lib/compute, which defers to these;
 * that is why nothing here may import compute, or the two would be a cycle.
 */

/** The two fields any of these predicates read of a garment. Callers holding a narrow select (the
 *  staff app reads the catalogue without costs) don't have to fake a whole Item to ask. */
export type Garment = { type?: string; item?: string };

/** The garment types that make up the two halves of a set. lib/compute re-exports them and builds
 *  the catalogue's full type vocabulary around them. */
export const TOP_TYPES = ["Shirt", "Polo", "Tunic", "Scrub top", "Blouse"];
export const PANT_TYPES = ["Pants", "Trousers", "Cargo pants", "Shorts", "Skort", "Skirt"];

/** Case-insensitive match against one of those vocabularies. Exported only so lib/compute's own
 *  blocks — maternity, outerwear — can ask the same question the same way. */
export const isTypeIn = (types: readonly string[], type: string) =>
  types.some((t) => t.toLowerCase() === type.toLowerCase());

// An explicit type wins; items saved before the field existed keep the old name-based guess.
//
// The trap worth knowing: type is a free-text field with a datalist behind it, not a closed list,
// and both of these read it as an exact (case-insensitive) match against the vocabulary above. A
// hand-typed "scrubs" or "Scrub Tops" therefore answers false everywhere — worse than leaving type
// blank, which at least falls back to the garment name. Ask through these helpers rather than
// comparing `it.type` yourself, or one typo in the catalogue quietly stops a garment counting as a
// top, and a wearer's holdings stop pairing into sets.
export const isTopItem = (it: Garment | undefined) =>
  it?.type ? isTypeIn(TOP_TYPES, it.type) : /top|shirt|polo|tunic|blouse/i.test(it?.item || "");
export const isPantItem = (it: Garment | undefined) =>
  it?.type ? isTypeIn(PANT_TYPES, it.type) : /pant|bottom|trouser|skort|short|cargo/i.test(it?.item || "");

/** A set is a top and a bottom. Two garments, for every stream, everywhere the word "set" is used —
 *  named rather than written as a bare 2, because a bare 2 in a sum is indistinguishable from a
 *  rounding fudge six months later. */
export const SET_GARMENTS = 2;

/** The starting allocation for a facility that has never been asked. A facility sets its own figure
 *  (Settings.initialSets, seeded with this one); this is the fallback, not a second rule. */
export const SETS_ON_START = 3;
/** The ceiling, for a facility that has never been asked (Facility.capSets). Six sets is twelve
 *  garments, and it is everybody's: every group ends at the same place, whichever of the three
 *  routes it took to get there. */
export const SETS_CAP = 6;

/** The starting sets this facility issues *to the groups on the starting-kit route*. Takes the
 *  configured figure and stands in for it when there isn't one: a blank or a nonsense number must not
 *  become an offer of zero sets to somebody starting on Monday, so the standing figure holds until a
 *  coordinator says otherwise.
 *
 *  Whose number it is matters as much as what it is. Nobody on the other two routes starts on it —
 *  the FTE table proposes its own number, and manager approval starts on nothing at all — so asking
 *  this about somebody on manager approval answers a question that was never put, and quoting the
 *  answer to them promises a kit the counter would turn them away for.
 *
 *  Fractions are floored — the counter can only hand over whole tops and whole trousers, so half a
 *  set is a loose garment, not an entitlement. */
export function setsOnStart(configured?: number | null): number {
  const n = Number(configured);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : SETS_ON_START;
}

/** This facility's ceiling, in sets held at any one time, for anybody at all. Same treatment as the
 *  starting figure: a blank or a nonsense number must not turn into a ceiling of zero that declines
 *  the whole hospital, so the standing figure holds until a coordinator says otherwise, and
 *  fractions are floored because half a set is a loose garment. */
export function setsCap(configured?: number | null): number {
  const n = Number(configured);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : SETS_CAP;
}

/** The three routes to the ceiling: the FTE table, the starting kit, and manager approval. */
export type AllowanceRoute = "fte" | "kit" | "approval";

/** Which route somebody is on, given the facility's two answers about their group — is it on the FTE
 *  table list, is it on the starting-kit list. On neither is manager approval.
 *
 *  The server refuses a group on both lists, but a backup restored from a file somebody edited could
 *  still carry one, and every screen has to give the same answer when it does. The FTE table wins.
 *  The order form always asked it first, so a group caught on both goes on getting what it got
 *  before; and it is the route where a manager's signature stands behind anything past the table's
 *  proposal, which is the safer of the two to land on than a fixed kit handed over the counter with
 *  nobody signing. Decided here, once, so the order form, the counter, the wearer's app and the
 *  manager's review cannot each settle it differently. */
export function allowanceRoute(on: { nursing?: boolean; kit?: boolean }): AllowanceRoute {
  if (on.nursing) return "fte";
  if (on.kit) return "kit";
  return "approval";
}

/** Which half of a set a garment is, or null when it is no part of one — outerwear, maternity wear,
 *  a hat. One question asked in one place, so that the counter, the wearer's app and the manager's
 *  review screen never disagree about whether a fleece paired with a pair of trousers.
 *
 *  A maternity garment entered with its proper type answers null here, because a maternity tunic is
 *  never swapped for a standard one and the two of them are not the two-piece uniform. One saved
 *  with no type at all is read by its name, exactly as every other untyped garment is. */
export function setHalf(it: Garment | undefined): "top" | "pants" | null {
  if (isTopItem(it)) return "top";
  if (isPantItem(it)) return "pants";
  return null;
}

/** A pile of garments counted the way the ceiling reads it: tops, trousers, whatever is in no set at
 *  all, and the complete sets the first two make between them. */
export type GarmentCounts = { tops: number; pants: number; other: number; sets: number };
export function garmentCounts(holdings: { item: Garment; qty: number }[]): GarmentCounts {
  let tops = 0, pants = 0, other = 0;
  for (const h of holdings) {
    const half = setHalf(h.item);
    if (half === "top") tops += h.qty;
    else if (half === "pants") pants += h.qty;
    else other += h.qty;
  }
  return { tops, pants, other, sets: Math.min(tops, pants) };
}

/** How many complete sets a person is holding, from their current holdings. */
export function setsHeld(holdings: { item: Garment; qty: number }[]): number {
  return garmentCounts(holdings).sets;
}

/** Loose garments that don't yet pair into a set — useful for saying "3 sets and a spare top". */
export function looseGarments(holdings: { item: Garment; qty: number }[]): { tops: number; pants: number } {
  const c = garmentCounts(holdings);
  return { tops: c.tops - c.sets, pants: c.pants - c.sets };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The ceiling, worked out for one person and whatever is about to be handed over, in the parts a
 *  screen or a coordinator needs to see the reason.
 *
 *  `cap` is sets. The two halves are counted separately against it — at most six tops and at most
 *  six pairs — because the smaller of the two counts is not a ceiling: twenty tops and one pair is
 *  "one set" by that measure, and a locker with twenty tops in it is exactly what the ceiling is
 *  there to prevent.
 *
 *  `other` is everything that is no part of a set — a fleece, a jacket, maternity wear. The six-set
 *  ceiling says nothing about those, so they carry the same number as a ceiling of their own,
 *  counted in garments: nobody needs seven jackets at once either, and with no ceiling at all they
 *  would be the one thing in the building nothing ever asked about. The same figure as the sets
 *  ceiling deliberately, so a coordinator has one number to remember and nobody has to keep two
 *  settings in step.
 *
 *  `over` is the counter's question — after this hand-over, is this person still inside what one
 *  person holds. `breach` says which of the three ceilings it is and `overBy` how many garments past
 *  it, because a coordinator asked to tick an override is owed something they can check against the
 *  person in front of them: "holds six tops and six pairs already" is checkable, a bare refusal is
 *  not. Past it, the way on is a hand-in — a swap rather than an addition — or that override. */
export type CapState = {
  cap: number;
  otherCap: number;
  tops: number; pants: number; other: number; sets: number;
  addTops: number; addPants: number; addOther: number;
  afterTops: number; afterPants: number; afterOther: number; afterSets: number;
  overTops: number; overPants: number; overOther: number;
  over: boolean;
  overBy: number;
  breach: "tops" | "pants" | "both" | "other" | null;
  note: string;
};
export function capState(opts: {
  held: { tops: number; pants: number; other?: number };
  adding?: { tops?: number; pants?: number; other?: number };
  capSets?: number | null;
}): CapState {
  const cap = setsCap(opts.capSets);
  const tops = Math.max(0, opts.held.tops), pants = Math.max(0, opts.held.pants), other = Math.max(0, opts.held.other || 0);
  const addTops = Math.max(0, opts.adding?.tops || 0), addPants = Math.max(0, opts.adding?.pants || 0), addOther = Math.max(0, opts.adding?.other || 0);
  const afterTops = tops + addTops, afterPants = pants + addPants, afterOther = other + addOther;
  const overTops = Math.max(0, afterTops - cap), overPants = Math.max(0, afterPants - cap), overOther = Math.max(0, afterOther - cap);
  const breach = overTops && overPants ? "both" : overTops ? "tops" : overPants ? "pants" : overOther ? "other" : null;
  const over = breach !== null;
  const overBy = Math.max(overTops, overPants, overOther);
  const sets = Math.min(tops, pants), afterSets = Math.min(afterTops, afterPants);
  // Said in garments as well as in sets, because a hand-over is garments: "6 sets" on its own tells
  // somebody holding six tops and two pairs nothing about why they are being turned away.
  const holds = `${plural(afterTops, "top", "tops")} and ${plural(afterPants, "pair", "pairs")}`;
  const note = !over
    ? `${afterSets} of ${cap} sets — ${holds}.${afterOther ? ` Plus ${plural(afterOther, "garment", "garments")} outside a set.` : ""}`
    : breach === "other"
      ? `That would be ${plural(afterOther, "garment", "garments")} outside a set, and ${cap} outside a set is the most anyone holds. Hand one in to make room, or a coordinator can record an override.`
      : `That would be ${holds}, and the most anyone holds is ${cap} sets — ${cap} tops and ${cap} pairs. Hand ${breach === "both" ? "a top and a pair" : breach === "tops" ? "a top" : "a pair"} in to make room, or a coordinator can record an override.`;
  return {
    cap, otherCap: cap,
    tops, pants, other, sets,
    addTops, addPants, addOther,
    afterTops, afterPants, afterOther, afterSets,
    overTops, overPants, overOther,
    over, overBy, breach, note,
  };
}

/** What this person may hold, and how they get there.
 *
 * `cap` and `max` are both the facility's ceiling, for every route. The starting-kit route used to be
 * the exception — its second allocation waited on a hand-in — until the owner said nothing has to
 * come back before the next set is issued. So there is one figure, and it is the one the counter
 * refuses on; `cap` is kept beside `max` only so nothing calling this had to change the same day.
 *
 * `start` is the starting-kit route's figure — what they are handed on the first day — and null on
 * the other two routes, whose starting number comes from the FTE table or a signature.
 *
 * The note is written about nobody in particular, because it lands in three places — the wearer's own
 * app, the manager's review, and the counter — and "your manager" means a different person in each.
 *
 * `nursing` and `kit` are the facility's own answers about this person's group — is it on the FTE
 * table list, is it on the starting-kit list — from lib/compute's isNursingGroup() and isKitGroup(),
 * which read the facility's lists of names. They have to be passed in because this file has no
 * facility to ask, and allowanceRoute() above turns the pair into one route. Neither decides
 * whether there is a ceiling, only which sentence describes the way to it and whether there is a
 * starting figure. Deciding either here from the group name would mean a second test for who is on
 * which route, and two tests drift: the last one cost a whole group their allowance when somebody
 * renamed a label. Leave `kit` off and the person is read as being on manager approval — told they
 * start on nothing — so every caller that can reach the facility's lists has to pass both.
 *
 * `group` is no longer read: the route comes from the two answers above. It stays in the signature
 * so that nothing calling this had to change the day the letters in a name stopped deciding it.
 *
 * `capped` is always true now and `cap` is never null. Both are kept so that nothing calling this
 * had to change on the same day the rule did, and both can go once the screens have.
 *
 * `startingSets` and `capSets` are the facility's configured figures. Both are optional because the
 * staff app holds no facility register, and a wearer's screen quoting the standing figure beats it
 * quoting nothing — but any caller that can reach settings should pass them, or a site that issues
 * four will go on telling its wearers three. */
export function allowance(opts: {
  group?: string | null;
  held: number;
  startingSets?: number | null;
  nursing?: boolean;
  kit?: boolean;
  capSets?: number | null;
}): { capped: boolean; cap: number | null; max: number; start: number | null; used: number; note: string } {
  const max = setsCap(opts.capSets);
  const garments = max * SET_GARMENTS;
  const route = allowanceRoute(opts);
  if (route !== "kit") {
    // The FTE table and manager approval both end at the ceiling; what differs is what proposes the
    // number on the way up. On the table somebody's hours propose theirs and a manager may sign
    // above it; on approval nothing is proposed at all and each set comes with a signature.
    const note = route === "fte"
      ? `Up to ${max} sets — ${garments} garments — at any time. The hours worked propose the starting number, and a manager can sign for more, up to that.`
      : `Up to ${max} sets — ${garments} garments — at any time, each one approved by a manager.`;
    return { capped: true, cap: max, max, start: null, used: opts.held, note };
  }
  // Never above the ceiling: a site that set its starting figure to seven would otherwise print an
  // offer the counter then declines.
  const start = Math.min(max, setsOnStart(opts.startingSets));
  return {
    capped: true, cap: max, max, start, used: opts.held,
    note: `${start} sets on starting, then more as needed, up to ${max} sets — ${garments} garments — at any time. Nothing has to be handed back first.`,
  };
}
