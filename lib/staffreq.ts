/* The request state machine, and the words a ward is allowed to see.
 *
 * Both live here rather than in the screens because both are stated once in the design and then
 * relied on in six places. A status label that drifts between the home card, the order list and
 * the notification email is the kind of bug nobody reports and everybody stops trusting.
 */

export type ReqStatus =
  | "awaiting" | "declined" | "accepted" | "picking" | "ready" | "round" | "collected" | "delivered";

export const DECLINE_REASONS = ["Over allowance", "Not needed right now", "Wrong item for the role"] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];

export const REQUEST_REASONS = ["Worn out", "Damaged", "Lost", "Extra for shifts"] as const;

/* `Contaminated` is deliberately absent from the damage list. Clinically it is a different
 * pathway — red bag, no return to the counter, often an incident report — and an app that told
 * someone to carry a contaminated garment to the linen room would be worse than one that says
 * nothing. Wards use the route they already have. */
export const DAMAGE_KINDS = ["Torn", "Stained", "Worn thin"] as const;

/* ---------- the lines ----------
 *
 * A request covers as many garments as the person needs, one line each. The manager reads the
 * whole ask on one screen and approves it in one action, but can knock back individual lines —
 * the tunic and the trousers yes, the fleece no, over allowance. So a line carries its own status
 * and its own decline reason, and the request's status is a rollup of them.
 */
export type LineStatus = "awaiting" | "approved" | "declined";
export const LINE_STATUSES: readonly LineStatus[] = ["awaiting", "approved", "declined"] as const;

/** The word against a single garment. Deliberately shorter than the request-level labels: it sits
 *  beside the garment on a list, where the request's own status is already stated above it. */
export function lineStatusLabel(status: string): string {
  return status === "approved" ? "Approved" : status === "declined" ? "Declined" : "Awaiting approval";
}

/** The lines that are actually picked, bagged and collected. Nothing is picked before the manager
 *  has decided, and a declined line never reaches the linen room, so this is the one definition of
 *  "what is in the bag" and every screen that counts garments should start here. */
export function approvedLines<T extends { status: string }>(lines: readonly T[]): T[] {
  return lines.filter((l) => l.status === "approved");
}

/** How many garments a set of lines comes to — three trousers on one line is three garments. */
export function garmentCount(lines: readonly { qty: number }[]): number {
  return lines.reduce((n, l) => n + l.qty, 0);
}

/** The request status the lines add up to.
 *
 *  A decision settles every line at once, so this is only ever asked of decided lines in practice;
 *  it still reports `awaiting` while any line is undecided rather than guessing, which is what
 *  keeps a half-written decision from moving an order to the linen room. Once decided: every line
 *  refused means the whole request was refused, and one surviving line means there is a pick to
 *  do, so the request is accepted and only the approved lines are fulfilled. A request with no
 *  lines has not been asked yet. */
export function rollUpRequestStatus(lines: readonly { status: string }[]): "awaiting" | "accepted" | "declined" {
  if (lines.length === 0 || lines.some((l) => l.status === "awaiting")) return "awaiting";
  return lines.some((l) => l.status === "approved") ? "accepted" : "declined";
}

/** What the manager decided, in one line: "2 of 3 approved". Null while it is still with them —
 *  there is nothing to summarise until someone has decided, and the request's own status already
 *  says so. A single-garment request just says Approved or Declined; "1 of 1 approved" is the
 *  sort of phrasing that makes a person read it twice. */
export function decisionSummary(lines: readonly { status: string }[]): string | null {
  if (lines.length === 0 || lines.some((l) => l.status === "awaiting")) return null;
  const yes = lines.filter((l) => l.status === "approved").length;
  if (lines.length === 1) return yes === 1 ? "Approved" : "Declined";
  if (yes === lines.length) return `All ${lines.length} approved`;
  if (yes === 0) return `All ${lines.length} declined`;
  return `${yes} of ${lines.length} approved`;
}

/** Which states the linen room still has work to do in. */
export const OPEN_REQUEST = new Set<ReqStatus>(["awaiting", "accepted", "picking", "ready", "round"]);

/** Every open status after a manager's decision and before the hand-over: the open statuses bar
 *  `awaiting`, which nobody has agreed to yet. Only a request in one of these has garments owed to
 *  somebody, so it is the one question the six-set ceiling asks of a request — on the server and in
 *  the snapshot alike, which is why it lives here rather than beside either of them. */
export const AWAITING_HANDOVER = [...OPEN_REQUEST].filter((st) => st !== "awaiting");
/** Which states need the *staff member* to do something — drives the accent left border. */
export const NEEDS_STAFF = new Set<ReqStatus>(["awaiting", "declined", "ready", "round"]);

/** Legal transitions. Anything not listed here is refused by the ops layer, so a stale phone
 *  screen can't drag an order backwards. */
export const TRANSITIONS: Record<ReqStatus, ReqStatus[]> = {
  awaiting: ["accepted", "declined"],
  declined: [],
  accepted: ["picking"],
  // picking -> collected: the counter phone picks and hands over in one visit, signed at the window.
  picking: ["ready", "round", "collected"],
  ready: ["collected"],
  round: ["delivered"],
  collected: [],
  delivered: [],
};

export function canMove(from: string, to: string): boolean {
  return (TRANSITIONS[from as ReqStatus] || []).includes(to as ReqStatus);
}

/* ---------- which ward a bag on the round belongs to ----------
 *
 * Request has no column for it. The linen room routes a bag to the ward the wearer was on the
 * moment the trolley loaded, and nothing rewrites that when she transfers — so the timeline row
 * lib/ops.ts stamps on request.round is the only durable record of where the bag physically went.
 *
 * Every screen and every fence has to read the ward off that event rather than off subject.dept,
 * and they all have to read it the same way. Asking the wearer's current ward instead makes a
 * transferred nurse's bag follow her on screen: listed to the ward it never reached, refused by
 * the desk that is actually holding it — and `round → delivered` is the only way out of `round`,
 * so a bag fenced to the wrong desk is stuck there for good.
 */
export const ROUTED_TO_ROUND = "Out on the ward round";
const DUE_ON = "Due on ";
export const dueOnWard = (ward: string) => `${DUE_ON}${ward}`;

/** The ward a bag was sent out to, off its timeline. Empty when it never went on a round — a bag
 *  only ever routes once, since `round` has one way in and one way out, so there is no newest row
 *  to pick between. Callers treat "" as no match: a blank ward is not a ward. */
export function roundWard(events: readonly { label: string; meta: string }[]): string {
  const routed = events.find((e) => e.label === ROUTED_TO_ROUND && e.meta.startsWith(DUE_ON));
  return routed ? routed.meta.slice(DUE_ON.length) : "";
}

/** Status label and its supporting line, exactly as designed. `ink: "attention"` is the
 *  accent-700 text; everything else is neutral-700. Colour only ever reinforces the word. */
export function statusText(r: {
  status: string; managerName?: string | null; declineReason?: string | null;
  holdUntil?: string | null; signerName?: string | null; signerRole?: string | null;
  /** Where the bag was sent, per roundWard() — not where the wearer works today. This line is how
   *  a nurse finds her bag, so after a transfer the two are different wards and only one of them
   *  has the bag on the desk. */
  ward?: string | null;
}, view: {
  /** False when somebody other than the wearer is reading — their manager, the clerk who raised
   *  it, the desk. "Your manager" and "your ward" are then somebody else's, so the line names them
   *  instead. Defaults to the wearer's own reading, which is what every list of "my orders" is. */
  mine?: boolean;
  /** The wearer's first name, for the third-person reading. */
  first?: string;
} = {}): { label: string; note: string; ink: "attention" | "quiet" } {
  const mine = view.mine !== false;
  const whose = mine ? "your" : view.first ? `${view.first}’s` : "their";
  switch (r.status as ReqStatus) {
    case "awaiting":
      return { label: "Awaiting approval", note: r.managerName ? `With ${r.managerName}` : `With ${whose} manager`, ink: "attention" };
    case "declined":
      // A decline with a different reason on each line carries none on the request itself, and
      // "Declined" with a blank line under it reads as a decision nobody explained.
      return { label: "Declined", note: r.declineReason || "See each garment for the reason", ink: "attention" };
    case "accepted":
      return { label: "Approved — with linen room", note: "Waiting to be picked", ink: "quiet" };
    case "picking":
      return { label: "Being picked", note: "In the linen room", ink: "quiet" };
    case "ready":
      return { label: "Ready to collect", note: r.holdUntil ? `Linen room · until ${r.holdUntil}` : "Linen room", ink: "attention" };
    case "round":
      return { label: "On the ward round", note: r.ward ? `Arriving on ${r.ward}` : `Arriving on ${whose} ward`, ink: "attention" };
    case "collected":
      return { label: "Collected", note: "Signed off at the counter", ink: "quiet" };
    case "delivered":
      return {
        label: mine ? "Delivered to your ward" : r.ward ? `Delivered to ${r.ward}` : "Delivered to the ward",
        note: r.signerName ? `Signed by ${r.signerName}${r.signerRole ? `, ${r.signerRole}` : ""}` : "Signed for on the ward",
        ink: "quiet",
      };
    default:
      return { label: r.status, note: "", ink: "quiet" };
  }
}

/* ---------- what a ward is told about stock ----------
 *
 * Wards see words, never counts. That is a product rule, not a display choice: a number invites
 * an argument at the counter about whether the shelf really holds four, and the linen room's
 * count is the only one that has been audited. The mapping reuses the reorder point the linen
 * room already maintains per size, so "Low" means what it means to them.
 */
export type StockWord = "in_stock" | "low" | "none";

export function stockWord(onHand: number, reorderAt: number | null): StockWord {
  if (onHand <= 0) return "none";
  if (reorderAt !== null && reorderAt > 0 && onHand <= reorderAt) return "low";
  return "in_stock";
}

export function stockLabel(w: StockWord): string {
  return w === "in_stock" ? "In stock" : w === "low" ? "Low" : "None on shelf";
}

/* ---------- the waitlist hold ----------
 *
 * When a size finally lands, the linen room offers it to whoever is first in the queue, and both
 * the waitlist screen and the offer email promise it is held for them for 48 hours. A promise
 * nothing computes is just wording, so the number lives here and everything that depends on it —
 * the deadline shown to the person, the refusal to accept an offer that has run out — is derived
 * from this one constant rather than restated in each place.
 */
export const WAITLIST_HOLD_HOURS = 48;

/** When an offer made at `offeredAt` stops being held. Null when nothing has been offered. */
export function holdEndsAt(offeredAt: Date | string | null | undefined): Date | null {
  if (!offeredAt) return null;
  const at = offeredAt instanceof Date ? offeredAt : new Date(offeredAt);
  return Number.isNaN(at.getTime()) ? null : new Date(at.getTime() + WAITLIST_HOLD_HOURS * 60 * 60 * 1000);
}

/** Has the hold run out? False when there is no offer at all — nothing has expired if nothing
 *  was ever held. */
export function holdExpired(offeredAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  const ends = holdEndsAt(offeredAt);
  return !!ends && ends.getTime() <= now.getTime();
}

/** Four digits, shown at the counter. Not a secret — it is read aloud across a desk — so this is
 *  a convenience for matching a person to a bag, and the record is the audit.
 *
 *  `taken` is the codes already on the bags this one will stand beside. Four random digits with
 *  nothing checked collide about one time in fifty once twenty bags are waiting, and two bags on
 *  the same counter both reading 4417 is somebody carrying home a stranger's uniform. The code
 *  stays four digits because it is read across a desk, so the fix is to draw again rather than to
 *  lengthen it — forty draws, which cannot plausibly all land on a code in use unless thousands of
 *  bags are open at once. Null when they do, and the caller has to fail on it: quietly handing back
 *  a number already on the counter is the whole bug this exists to stop. */
export function collectionCode(taken: ReadonlySet<string>): string | null {
  for (let i = 0; i < 40; i++) {
    const code = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    if (!taken.has(code)) return code;
  }
  return null;
}

export function requestCode(seq: number): string {
  return `R-${String(seq).padStart(4, "0")}`;
}

/* ---------- the Team shell's tabs ----------
 *
 * Which tabs a reader gets, decided from the same two counts the tab badge is built from
 * (StaffCounts in lib/staffclient.tsx). One source, because a Team tab that leads to a route its
 * own page then refuses is the failure mode this exists to prevent.
 *
 * It lives here rather than beside the screens because both ends need it: /my/team is a server
 * component that redirects to the first tab, and the shell is a client component that draws them
 * all. Nothing in this file touches the database, so both can import it.
 */
export type TeamTab = { href: string; label: string; count?: number };

export function teamTabs(
  me: { isManager: boolean; wardDesk: boolean; ward: string },
  counts: { approvals: number; round: number },
): TeamTab[] {
  const tabs: TeamTab[] = [];
  // An approver with no reports still has a queue — that is the whole point of counting requests
  // addressed to somebody rather than asking what role they hold.
  if (me.isManager || counts.approvals > 0) tabs.push({ href: "/my/approvals", label: "Approvals", count: counts.approvals });
  /* The desk flag is not enough: a round is one ward's bags, and roundData() answers nothing for a
   * clerk whose ward was never filled in — so /my/round refuses them, /my/team redirected them
   * straight into that refusal, and the tab bar wore a Ward item that 404'd on every screen. Home
   * already tells this person "No ward on your record"; the tab now agrees with it. */
  if (me.wardDesk && me.ward.trim()) tabs.push({ href: "/my/round", label: "Round", count: counts.round });
  // Both of these are built on the reporting line, so somebody without one gets neither.
  if (me.isManager) {
    tabs.push({ href: "/my/ward", label: "Ward" });
    tabs.push({ href: "/my/raise", label: "Raise" });
  }
  return tabs;
}

/** What the Team shell's app bar says. A clerk who only signs for the trolley has no team — but
 *  "Ward desk" is only right for somebody who is actually on one: an approver who has just cleared
 *  the last request in their queue is neither a manager nor a clerk, and the bar must not tell them
 *  they are on a desk. */
export function teamTitle(me: { isManager: boolean; wardDesk: boolean }, counts: { approvals: number }): string {
  if (me.isManager || counts.approvals > 0) return "Your team";
  return me.wardDesk ? "Ward desk" : "Your team";
}
