import { prisma } from "./db";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { setStaffCookie, type StaffSession } from "./staffsession";
import {
  DAMAGE_KINDS, DECLINE_REASONS, REQUEST_REASONS, WAITLIST_HOLD_HOURS, canMove, decisionSummary,
  holdExpired, requestCode, rollUpRequestStatus, roundWard, type LineStatus,
} from "./staffreq";
import { approvalEmail, approvalUrl, decisionEmail, signApprovalToken } from "./approvallink";
import { sendTo, transactionalConfigured } from "./mail";
import { notifyDecided, notifyWaiting, pushConfigured } from "./push";
import { OpError, handOverRequestStock, offGroupGarments, offStyleGarments, readRequestLines } from "./ops";
import { facilityToday, genderLabel, groupsLabel } from "./compute";
import { PLAN_COLS, entitlements } from "./plan";

/* Everything a staff member, ward manager or ward clerk can change.
 *
 * Separate from lib/ops.ts on purpose. That file's ops all begin from a coordinator session and
 * may touch anything in the facility; these all begin from a *staff* session and must never be
 * able to. Keeping them in one switch statement with one authorisation model each would mean the
 * only thing standing between a wearer and the stock ledger was remembering which branch they
 * came in through.
 *
 * The rule every op here obeys: **the facility is not the unit of authority, the person is.**
 * A staff session may act on its own record; a manager may act on requests addressed to them and
 * raise for the people who report to them; a ward clerk may sign for a bag coming to their own
 * ward. Nothing here takes a facility id from the caller.
 */

export class StaffOpError extends Error {
  status: number;
  constructor(msg: string, status = 400) { super(msg); this.status = status; }
}

/** Same floor as activation, so a password change can't be a downgrade of the one they set. */
const MIN_PASSWORD = 8;

const str = (v: unknown, max = 500) => (v === undefined || v === null ? "" : String(v)).slice(0, max);
const int = (v: unknown, d = 0) => { const n = parseInt(String(v), 10); return Number.isFinite(n) ? n : d; };

/** Load a request the caller is allowed to see: their own, or one they approve, or one they
 *  raised for somebody else. Anything else is a 404 — not a 403, which would confirm it exists. */
async function visibleRequest(sess: StaffSession, id: string) {
  const [r, me] = await Promise.all([
    prisma.request.findFirst({
      where: { id, facilityId: sess.facilityId },
      include: {
        lines: { include: { item: { select: { item: true, gender: true, sizes: true } } }, orderBy: { sort: "asc" } },
        subject: { select: { first: true, last: true, dept: true } },
        events: { select: { label: true, meta: true } },
      },
    }),
    prisma.staff.findUnique({ where: { id: sess.staffId }, select: { dept: true, wardDesk: true } }),
  ]);
  /* The same three parties lib/staffdata.ts requestData admits, plus the desk holding the bag:
   * /my/round offers that desk a "Nudge" into this thread, and the message it sends has to be
   * accepted here or the button is a 404 with a different face. Ward from the timeline, and a
   * blank ward matches nobody — the fence round.sign and round.claim use. */
  const party = !!r && (r.subjectId === sess.staffId || r.managerId === sess.staffId || r.raisedByStaffId === sess.staffId);
  const onMyDesk = !!r && !!me?.wardDesk && !!me.dept.trim() && (r.status === "round" || r.status === "delivered") && roundWard(r.events) === me.dept;
  if (!r || (!party && !onMyDesk)) throw new StaffOpError("No such request", 404);
  return r;
}

/** The staff app speaks one error type — /api/staff/mutate turns anything else into a bare
 *  "something went wrong", which tells the person on the ward nothing. The shared helpers in
 *  lib/ops.ts speak the coordinator's, so a call into one is translated rather than let through. */
function asStaffError(e: unknown): never {
  if (e instanceof OpError) throw new StaffOpError(e.message, e.status);
  throw e;
}

/** What one op calling another inside this file may say that a payload never can. The API route
 *  calls runStaffOp with three arguments, so nothing a phone sends reaches this.
 *
 *  `replacing` is the garment a damage report is asking to replace (damage.report). It is the one
 *  garment outside somebody's staff group, or outside the cut they are offered, that a request may
 *  carry — see offGroupGarments() and offStyleGarments() in lib/ops.ts, which also check they are
 *  still holding it. */
type Internal = { replacing?: string };

/** The refusal: each garment with the groups it is for, then whose group it isn't. */
function offGroupMessage(off: readonly { item: string; groups: string[] }[], who: { first: string; group: string }, self: boolean): string {
  const each = off.map((i) => `${i.item} is for ${groupsLabel(i.groups)} only`).join("; ");
  const g = (who.group || "").trim();
  const tail = self
    ? g ? `You're in ${g} — ask the linen room if you need ${off.length === 1 ? "it" : "them"}.` : "You have no staff group recorded — ask the linen room."
    : g ? `${who.first} is in ${g}.` : `${who.first} has no staff group recorded — ask the linen room.`;
  return `${each}. ${tail}`;
}

/** The same refusal for the wrong cut: each garment with the cut it is, then the style they are set
 *  to. There is no blank case — a blank style, and Either, are offered every cut, so this is only
 *  ever built for somebody a coordinator has set to Men's or Women's. */
function offStyleMessage(off: readonly { item: string; gender: string }[], who: { first: string; uniformStyle: string }, self: boolean): string {
  const each = off.map((i) => `${i.item} is the ${genderLabel(i.gender)} cut`).join("; ");
  const tail = self
    ? `You're set to ${who.uniformStyle} — ask the linen room if you need ${off.length === 1 ? "it" : "them"}.`
    : `${who.first} is set to ${who.uniformStyle}.`;
  return `${each}. ${tail}`;
}

async function ownStaffInFacility(sess: StaffSession, id: string) {
  const s = await prisma.staff.findFirst({ where: { id, facilityId: sess.facilityId } });
  if (!s) throw new StaffOpError("No such staff member", 404);
  return s;
}

/** Append a timeline row. Every status change goes through here, so the history can't be
 *  half-written by a branch that forgot. */
async function event(tx: Prisma.TransactionClient, requestId: string, label: string, meta: string, actorName: string) {
  await tx.requestEvent.create({ data: { requestId, label, meta: meta.slice(0, 200), actorName: actorName.slice(0, 120) } });
}

/** Fire-and-forget: a request must not fail because the mail server was slow. */
function mail(to: string | null | undefined, subject: string, text: string, html?: string) {
  if (!to || !transactionalConfigured()) return;
  void sendTo(to, subject, text, html).catch((e) => console.error("[staff mail]", (e as Error).message));
}

/* ---------------------------------------------------------------- the decision
 *
 * The manager settles the whole request in one action. They may approve all of it, decline all of
 * it, or approve some garments and knock others back — the tunic and the trousers yes, the fleece
 * no, over allowance. Every line ends up `approved` or `declined`, and the request's own status is
 * the rollup: something survived means `accepted` and there is a pick to do, nothing survived means
 * `declined`. One code, one pick, one collection either way.
 *
 * It lives in one exported function because two doors reach it — the manager tapping Approve in
 * the app, and the emailed link at /api/staff/decide, which has no session behind it. When the two
 * were written separately they drifted, and a decision made by email recorded a different timeline
 * row from the same decision made in the app.
 */
export type LineDecision = { id: string; decision: LineStatus; reason: string };

/** Read a per-line decision payload: `[{ id, decision: "approved" | "declined", reason? }]`.
 *  Null when the caller sent none, which means the whole-request shorthand applies. Every line of
 *  the request has to appear exactly once — a decision that leaves a garment undecided would move
 *  the request to the linen room with a line nobody has answered. */
function readLineDecisions(raw: unknown, lines: readonly { id: string }[]): LineDecision[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) throw new StaffOpError("Say what you decided about each garment");
  const seen = new Set<string>();
  const out: LineDecision[] = [];
  for (const row of raw) {
    const r = (row || {}) as { id?: unknown; decision?: unknown; reason?: unknown };
    const id = str(r.id);
    if (!lines.some((l) => l.id === id) || seen.has(id)) throw new StaffOpError("That decision doesn't match the request — reopen it and try again");
    seen.add(id);
    const decision = str(r.decision, 20);
    if (decision !== "approved" && decision !== "declined") throw new StaffOpError("Approve or decline each garment");
    let reason = "";
    if (decision === "declined") {
      reason = str(r.reason, 60);
      if (!DECLINE_REASONS.includes(reason as never)) throw new StaffOpError("Pick a reason for each garment you decline — the staff member is told what it was");
    }
    out.push({ id, decision, reason });
  }
  if (out.length !== lines.length) throw new StaffOpError("Decide every garment on the request before you send it");
  return out;
}

/** Settle a request. `approveAll` is the whole-request shorthand the emailed link uses, where
 *  there is no room for a per-line answer; `lines` overrides it when the manager has decided
 *  garment by garment.
 *
 *  The facility, the code and the manager's name come back with the decision so the emailed-link
 *  door can file its audit row without reading the request a second time. */
export async function decideRequest(d: {
  requestId: string; managerId: string; facilityId?: string;
  approveAll: boolean; reason?: unknown; lines?: unknown; actorName?: string;
}): Promise<{ ok: true; status: "accepted" | "declined"; summary: string; code: string; facilityId: string; managerName: string; selfApproved: boolean; notified: boolean }> {
  const r = await prisma.request.findFirst({
    where: { id: d.requestId, managerId: d.managerId, ...(d.facilityId ? { facilityId: d.facilityId } : {}) },
    include: {
      lines: { include: { item: { select: { item: true, gender: true, sizes: true } } }, orderBy: { sort: "asc" } },
      subject: { select: { id: true, first: true, inactive: true } },
      facility: { select: { name: true } },
    },
  });
  if (!r) throw new StaffOpError("No such request", 404);

  /* Whoever is asking names a manager; that does not make them one. The session re-reads the
   * register on every call, but an emailed link lives for a fortnight in a mailbox that may since
   * have been closed or handed on, so the register is read here too — and the wearer with it,
   * because approving garments for somebody who has left the register is the same mistake pointed
   * the other way. Request.managerId carries no foreign key, so a deleted manager leaves an id
   * that still satisfies the query above; this lookup is what turns that back into a refusal. */
  const mgr = await prisma.staff.findFirst({ where: { id: d.managerId, facilityId: r.facilityId, inactive: false }, select: { id: true } });
  if (!mgr) throw new StaffOpError("You're no longer recorded as a manager here — ask the linen room.", 403);
  /* Anybody may approve their own request — the owner's decision, and it replaced a test that
   * allowed it only to somebody with a report on the register. A self-approval is never mistaken
   * later for an ordinary one: the timeline row written below says "Self-approved" in words, and
   * the result carries selfApproved so both doors can say it too.
   *
   * What does stand is the raise rule: nobody approves a request they raised for somebody else.
   * request.create and request.reassign both refuse to address one that way; this is the same
   * rule at the moment it would matter, so a request addressed some other way — a restored backup
   * — cannot slip past it. */
  const selfApproval = r.subject.id === d.managerId;
  if (r.raisedByStaffId && r.raisedByStaffId === d.managerId && !selfApproval) {
    throw new StaffOpError("You raised this request, so somebody else has to approve it — ask the linen room to re-address it.", 403);
  }
  if (r.subject.inactive) throw new StaffOpError("That person is no longer on the register, so nothing can be approved for them.", 403);
  if (!r.lines.length) throw new StaffOpError("That request has no garments on it — ask the linen room to raise it again.");

  const perLine = readLineDecisions(d.lines, r.lines);
  // The shorthand: the op name, or the emailed link, answers for every garment at once.
  let wholeReason = "";
  if (!perLine && !d.approveAll) {
    wholeReason = str(d.reason, 60);
    if (!DECLINE_REASONS.includes(wholeReason as never)) throw new StaffOpError("Pick a reason — the staff member is told what it was");
  }
  const decisions: LineDecision[] = perLine ?? r.lines.map((l) => ({
    id: l.id, decision: d.approveAll ? "approved" : "declined", reason: d.approveAll ? "" : wholeReason,
  }));

  const to = rollUpRequestStatus(decisions.map((x) => ({ status: x.decision })));
  // Every line has just been decided, so the rollup is never "awaiting" here; the check is the
  // state machine's, and it is what makes the emailed link single-use — both links in the same
  // message stop working the moment either one is spent.
  if (to === "awaiting" || !canMove(r.status, to)) throw new StaffOpError("That request has already been decided", 409);

  const refusals = decisions.filter((x) => x.decision === "declined");
  // The request-level reason is the whole request's reason, so it is set only when one reason
  // covers the whole refusal. Where the refusals differ, each line carries its own and the
  // request has none — inventing one for it would put a reason on the record nobody gave.
  const shared = refusals.length === decisions.length && refusals.every((x) => x.reason === refusals[0].reason) ? refusals[0].reason : "";

  const actorName = d.actorName || r.managerName || "Your manager";
  const sizeOf = (l: (typeof r.lines)[number]) => String(l.item.sizes[l.sizeIndex] ?? l.sizeIndex);
  // A request can carry the same garment in two sizes, so the size is named only when the garment
  // alone would be ambiguous: "Fleece declined" beats "Fleece M declined" when there is one fleece.
  const nameOf = (l: (typeof r.lines)[number]) => (r.lines.filter((x) => x.itemId === l.itemId).length > 1 ? `${l.item.item} ${sizeOf(l)}` : l.item.item);
  const lineById = new Map(r.lines.map((l) => [l.id, l]));
  const refusalList = refusals.map((x) => `${nameOf(lineById.get(x.id)!)} declined: ${x.reason}`).join("; ");

  // One timeline row for the decision as a whole. A row per line would bury the request's own
  // history under its garments, and the manager did one thing, once.
  const yes = decisions.length - refusals.length;
  // A manager deciding her own request is marked in the label, not tucked into the meta: the label
  // is the line a timeline shows at a glance and the first thing anyone auditing the request
  // reads, and it is the one thing about the decision nobody could otherwise tell from it. The
  // meta then says it again in full, because the label is also quoted on screens that show no
  // meta at all.
  const own = selfApproval ? " — their own request" : "";
  const label = yes === decisions.length ? `Approved by ${actorName}${own}`
    : yes === 0 ? `Declined by ${actorName}${own}`
    : `${yes} of ${decisions.length} approved by ${actorName}${own}`;
  const plain = yes === decisions.length ? "Ward manager" : shared || refusalList;
  // Worded for what actually happened: nothing was approved, so nothing was self-approved, but the
  // decision was still the wearer's own and that is what the row has to show.
  const selfNote = yes
    ? `Self-approved — ${actorName} is the manager on this request and the person it is for`
    : `Decided by ${actorName}, who is the manager on this request and the person it is for`;
  const meta = selfApproval
    ? [selfNote, yes === decisions.length ? "" : plain].filter(Boolean).join(" · ")
    : plain;

  await prisma.$transaction(async (tx) => {
    // Conditional on the status we read, so two taps — or a tap and an email link — can't both win.
    const moved = await tx.request.updateMany({
      where: { id: r.id, status: "awaiting" },
      data: { status: to, decidedAt: new Date(), declineReason: to === "declined" && shared ? shared : null },
    });
    if (moved.count !== 1) throw new StaffOpError("That request has already been decided", 409);
    for (const x of decisions) {
      await tx.requestLine.updateMany({
        where: { id: x.id, requestId: r.id },
        data: { status: x.decision, declineReason: x.decision === "declined" ? x.reason : null },
      });
    }
    await event(tx, r.id, label, meta, actorName);
  });

  const subjAccount = await prisma.staffAccount.findUnique({ where: { staffId: r.subject.id }, select: { email: true } });
  const decided = new Map(decisions.map((x) => [x.id, x]));
  const em = decisionEmail({
    staffFirst: r.subject.first, managerName: actorName, approved: to === "accepted",
    reason: to === "declined" ? shared : "",
    lines: r.lines.map((l) => ({
      qty: l.qty, item: l.item.item, size: sizeOf(l),
      status: decided.get(l.id)?.decision, declineReason: decided.get(l.id)?.reason || null,
    })),
    facility: r.facility.name,
  });
  mail(subjAccount?.email, em.subject, em.text, em.html);
  // Beside the email, never inside its condition: a room with no SMTP configured is exactly the
  // room this exists for. The sender reads the decision itself and honours the person's switches.
  notifyDecided(r.id);

  return {
    ok: true, status: to, summary: decisionSummary(decisions.map((x) => ({ status: x.decision }))) || label,
    code: r.code, facilityId: r.facilityId, managerName: actorName,
    // Whether the wearer was actually emailed — same meaning as request.create's flag. The
    // emailed-link page said "has been told" regardless, which is how a wearer with no account
    // waited on an approval nobody mentioned to them.
    notified: !!subjAccount?.email && transactionalConfigured(),
    // Handed back so the two doors can say it as well: the app's confirmation, and the audit row
    // the emailed link files, which would otherwise read as an ordinary approval by a manager who
    // happens to have the same name as the wearer.
    selfApproved: selfApproval,
  };
}

export async function runStaffOp(sess: StaffSession, op: string, p: Record<string, unknown>, internal: Internal = {}): Promise<unknown> {
  p = p || {};

  /* ---------------------------------------------------------------- notifications
   *
   * Three ops answered before anything else below, INCLUDING the read-only refusal: a wearer in a
   * facility whose plan has gone read-only must still be able to turn notifications off and to
   * sign out cleanly. None of them touches the linen room's record — they are about this person's
   * own phone — so the refusal that protects the register has nothing to protect here.
   *
   * ⛔ A device token is never returned to a client, never logged and never written to the audit
   * trail. That last one is already true and stays true by construction: safeTarget() in
   * lib/audit.ts is an allow-list of id keys, and `token` is not one of them. Do not add it, and
   * do not turn that allow-list into a deny-list — the allow-list is the stronger shape.
   */
  switch (op) {
    case "push.register": {
      const raw = String(p.token ?? "");
      const token = raw.trim();
      // Long enough for any FCM registration token with room to spare; anything longer is not one.
      if (!token || raw.length > 4096) throw new StaffOpError("No device token");
      const platform = str(p.platform, 20) === "web" ? "web" : "android";
      // A phone handed on to somebody else re-points rather than doubling, so the person who left
      // stops being told about the person who arrived. Delete and create rather than update: it
      // also refreshes when the row was last seen, which is the only thing that row is for.
      await prisma.$transaction(async (tx) => {
        await tx.staffDevice.deleteMany({ where: { token } });
        await tx.staffDevice.create({
          data: { facilityId: sess.facilityId, staffId: sess.staffId, accountId: sess.accountId, token, platform },
        });
      });
      // Never the row, and never the token: the switch only needs to know whether this server can
      // send anything at all, so that it can say so plainly when it cannot.
      return { ok: true, configured: pushConfigured() };
    }
    case "push.forget": {
      const token = str(p.token, 4096).trim();
      // Only their own: the token is the only thing named, so it is fenced on the staff member too.
      if (token) await prisma.staffDevice.deleteMany({ where: { token, staffId: sess.staffId } });
      return { ok: true };
    }
    case "notify.prefs": {
      // No staffId in the payload, deliberately: this writes the session's own row and nothing
      // else, so no payload can reach another person's switches. Unknown keys are ignored.
      const data: Record<string, boolean> = {};
      for (const k of ["approved", "ready", "round", "kitcheck", "waiting"] as const) {
        if (p[k] !== undefined) data[k] = !!p[k];
      }
      const row = await prisma.staffNotifyPref.upsert({
        where: { staffId: sess.staffId },
        create: { staffId: sess.staffId, ...data },
        update: data,
      });
      return { approved: row.approved, ready: row.ready, round: row.round, kitcheck: row.kitcheck, waiting: row.waiting };
    }
  }

  const me = await prisma.staff.findUniqueOrThrow({
    where: { id: sess.staffId },
    select: {
      id: true, first: true, last: true, dept: true, wardDesk: true, managerId: true, group: true, uniformStyle: true,
      facility: { select: { id: true, name: true, timezone: true, ...PLAN_COLS } },
    },
  });
  // A read-only room refuses a wearer's writes too — in the room's words, since the plan is the
  // linen room's business and not the wearer's. Reading (my kit, the shelf) is untouched.
  if (entitlements(me.facility).readOnly) throw new StaffOpError("The linen room's ThreadCount is read-only at the moment. Ask the linen room.", 403);
  const myName = `${me.first} ${me.last}`.trim();
  const fid = sess.facilityId;

  switch (op) {
    /* ---------------------------------------------------------------- requests */
    case "request.create": {
      /* Who it is for. One person other than the wearer may raise: a manager, for the people who
       * report to them. That fence is the reporting line, which is the same relationship that
       * makes them the approver — and the reason a raise of theirs goes up a level below.
       *
       * A ward clerk on the desk used to be able to raise for anyone on their own ward, on the
       * grounds that half a ward will never install anything. That is gone: everyone in the
       * building carries a phone, and the manager route covers the person who genuinely cannot.
       * The desk flag itself stays — it is what signs for a bag on the ward round. */
      const subjectId = str(p.subjectId) || me.id;
      const other = me.id === subjectId ? null : await ownStaffInFacility(sess, subjectId);
      if (other && other.managerId !== me.id) {
        throw new StaffOpError("Only somebody's own manager can raise a request for them", 403);
      }
      const subject = other ?? (await ownStaffInFacility(sess, me.id));
      if (subject.inactive) throw new StaffOpError("That person is no longer on the register");

      // The approver is the subject's own manager, never the clerk's.
      if (!subject.managerId) {
        throw new StaffOpError(
          subject.id === me.id
            ? "Your manager isn't set yet — the linen room has to record who approves your requests."
            : `${subject.first} has no manager recorded, so there is nobody to approve this. Ask the linen room to set one.`,
        );
      }
      // Off the register means off the register. A deactivated manager cannot sign in to approve
      // anything, so addressing a request to one parks it where nobody can reach it — and it would
      // mint an approval link that outlives their access by a fortnight.
      let manager = await prisma.staff.findFirst({ where: { id: subject.managerId, facilityId: fid, inactive: false } });
      if (!manager) throw new StaffOpError("The recorded manager is no longer on the register. Ask the linen room.");

      /* Nobody approves a raise they made for somebody else. A manager raising for one of their
       * own reports is the ordinary case, and the subject's approver is that same manager — so the
       * request goes up a level instead: to the raiser's own manager, if they have one. If they do
       * not, it is created with no approver at all and surfaces on the linen room's queue (Needs
       * an approver), which already has request.reassign to give it one. Either way it never comes
       * back to the person who raised it, and the timeline says where it went and why.
       *
       * Only a raise for somebody else. A person who is their own manager raising for themselves
       * lands on their own desk, which is allowed and is marked Self-approved when they decide. */
      let escalation = "";
      if (other && manager.id === me.id) {
        const found = me.managerId ? await prisma.staff.findFirst({ where: { id: me.managerId, facilityId: fid, inactive: false } }) : null;
        /* A level up can be the raiser again: somebody who is their own manager has nobody above
         * them but themselves. That is "nobody above" — Needs an approver — exactly as if no
         * manager were recorded, because landing it back on them is the one thing this branch is
         * here to prevent.
         *
         * A level up can also be the wearer. Two ward managers at the top of the tree are often
         * recorded as each other's approver, and escalating a raise for one of them lands the
         * request back on the person the garments are for. It goes to them: that is a person
         * approving their own kit, which anybody may do, and the note below says so on the
         * request's own timeline, so it is read as a self-approval rather than as a routine
         * approval by somebody who happens to share the name. */
        const above = found && found.id !== me.id ? found : null;
        const aboveName = above ? `${above.first} ${above.last}`.trim() : "";
        escalation = above
          ? above.id === subject.id
            ? `Raised by ${myName}, who approves ${subject.first}'s requests — sent up to ${aboveName}, the person it is for, to approve themselves`
            : `Raised by ${myName}, who approves ${subject.first}'s requests — sent to ${aboveName} instead`
          : `Raised by ${myName}, who approves ${subject.first}'s requests — the linen room will address it`;
        manager = above;
      }

      const reason = str(p.reason, 40);
      if (reason && !REQUEST_REASONS.includes(reason as never)) throw new StaffOpError("Unknown reason");
      const lines = await readRequestLines(fid, p.lines).catch(asStaffError);
      // Only the SUBJECT's own staff group's garments, plus those for every group — whoever raises it.
      // A waitlist offer comes through here and is measured the same. So does a swap from the app's
      // Swap a size screen, which sends nothing to tell it from a fresh request: holding another
      // group's garment is no reason to be handed another, so a size swap of one is the counter's
      // (issue.exchange). The one exception is a damage replacement for a garment they hold, which
      // only damage.report can ask for.
      const offGroup = await offGroupGarments(fid, subject.group, lines.map((l) => l.itemId),
        internal.replacing ? { staffId: subject.id, itemId: internal.replacing } : undefined);
      if (offGroup.length) throw new StaffOpError(offGroupMessage(offGroup, subject, subject.id === me.id));
      // And only the cut the SUBJECT is offered, measured the same way and exempting the same one
      // damage replacement. Blank — nobody has said which cut they wear — and Either take every
      // garment, so nothing changes for a record no coordinator has set.
      const offStyle = await offStyleGarments(fid, subject.uniformStyle, lines.map((l) => l.itemId),
        internal.replacing ? { staffId: subject.id, itemId: internal.replacing } : undefined);
      if (offStyle.length) throw new StaffOpError(offStyleMessage(offStyle, subject, subject.id === me.id));
      const note = str(p.note, 400);
      const managerName = manager ? `${manager.first} ${manager.last}`.trim() : "";

      const created = await prisma.$transaction(async (tx) => {
        const f = await tx.facility.update({ where: { id: fid }, data: { requestSeq: { increment: 1 } }, select: { requestSeq: true } });
        const r = await tx.request.create({
          data: {
            facilityId: fid, code: requestCode(f.requestSeq),
            subjectId: subject.id,
            raisedByStaffId: subject.id === me.id ? null : me.id,
            raisedByName: subject.id === me.id ? "" : myName,
            reason, note,
            status: "awaiting",
            managerId: manager?.id ?? null, managerName,
            lines: { create: lines.map((l, i) => ({ itemId: l.itemId, sizeIndex: l.sizeIndex, qty: l.qty, sort: i })) },
          },
        });
        // The escalation note already names the raiser, so it stands in for the plain one.
        const raised = subject.id === me.id ? "" : `Raised by ${myName}`;
        await event(tx, r.id, "Requested", escalation || raised, subject.id === me.id ? "You" : myName);
        return r;
      });

      // Nothing to send while the request has no approver — the linen room addresses it first.
      const mgrAccount = manager ? await prisma.staffAccount.findUnique({ where: { staffId: manager.id }, select: { email: true } }) : null;
      if (manager) {
        const em = approvalEmail({
          managerFirst: manager.first,
          subjectName: `${subject.first} ${subject.last}`.trim(),
          raisedByName: subject.id === me.id ? "" : myName,
          lines, reason, note,
          url: approvalUrl(signApprovalToken(created.id, manager.id)),
          facility: me.facility.name,
        });
        mail(mgrAccount?.email, em.subject, em.text, em.html);
      }
      /* Outside the `if (manager)` above only in the sense that it asks the question itself: the
       * sender refuses a request with no approver, which is the same fence. Damage reports and
       * waitlist acceptances raise through this same op, so they are covered here too. */
      notifyWaiting(created.id);

      // `notified` says an email actually went out, not that the manager happens to have an
      // account: mail() is a no-op with no transactional mail configured, and a screen that says
      // "we've told them" when nothing was sent is the reason a request sits for three weeks.
      const notified = !!mgrAccount?.email && transactionalConfigured();
      // `selfApproves` is for the screen the raiser is standing at: their request has gone up to
      // the person it is for, which is allowed and is the only way the top of the tree gets
      // dressed, but they should be told that is where it went rather than find out later.
      return { id: created.id, code: created.code, manager: managerName, escalated: !!escalation, notified, selfApproves: !!manager && manager.id === subject.id };
    }

    case "request.approve":
    case "request.decline": {
      // The manager's own door into the shared decision. `lines` decides garment by garment when
      // the screen sends it; without it the op name settles the whole request, which is what the
      // emailed link does through the same function.
      return decideRequest({
        requestId: str(p.id), managerId: me.id, facilityId: fid,
        approveAll: op === "request.approve", reason: p.reason, lines: p.lines, actorName: myName,
      });
    }

    case "request.message": {
      const r = await visibleRequest(sess, str(p.id));
      const body = str(p.body, 2000).trim();
      if (!body) throw new StaffOpError("Write something first");
      const m = await prisma.requestMessage.create({
        data: { requestId: r.id, fromStaff: true, authorName: myName, body },
      });
      return { id: m.id, at: m.createdAt.toISOString() };
    }

    case "request.read": {
      /* The thread was opened by somebody it was addressed to, so the linen room's messages on it
       * are no longer new. Fenced by visibleRequest() like every other request op, and deliberately
       * narrower than that: the ward desk can open an order on its round, and a clerk glancing at a
       * bag must not put out the wearer's own unread mark. */
      const r = await visibleRequest(sess, str(p.id));
      if (r.subjectId !== sess.staffId && r.raisedByStaffId !== sess.staffId) return { ok: true, read: 0 };
      const done = await prisma.requestMessage.updateMany({
        where: { requestId: r.id, fromStaff: false, readAt: null },
        data: { readAt: new Date() },
      });
      return { ok: true, read: done.count };
    }

    /* ---------------------------------------------------------------- ward round */
    case "round.sign": {
      // Anyone on the ward may sign, and whoever does is named on the requester's order — so a
      // bag that never arrived has a name against it.
      const r = await prisma.request.findFirst({ where: { id: str(p.id), facilityId: fid, status: "round" }, include: { lines: true, events: { select: { label: true, meta: true } } } });
      if (!r) throw new StaffOpError("No such bag waiting on the round", 404);
      // The ward the trolley left the bag on, off the timeline — not the ward the wearer is on
      // today. Fencing on the wearer's ward made a bag follow a nurse who transferred: /my/round
      // still lists it to the desk that is physically holding it (lib/deskdata.ts reads the same
      // event), and this refused that desk. Since round.sign is the only way out of `round`, the
      // bag was then stuck for good, and the ward it had moved to on screen could have signed for
      // a handover that never happened.
      //
      // A blank ward is not a ward, so it matches nothing. Comparing the two sides as empty
      // strings put everybody whose ward was never filled in on one ward together — a clerk with
      // no ward could sign for any other ward-less person's bag in the facility. Both sides have
      // to be a real ward name, and lib/ops.ts refuses to route a ward-less bag onto a round at all.
      const bagWard = roundWard(r.events);
      if (!me.dept || !bagWard || bagWard !== me.dept) throw new StaffOpError("That bag is for another ward", 403);

      // Signing for the bag is the moment the garment leaves the linen room's shelf, and the ward
      // round has to record that exactly as the counter does — an Issue against the wearer and a
      // replenishment line — or the shelf count quietly loses a garment on every round while the
      // counter's figures stay honest. Shared with request.collected so the two cannot drift.
      try {
        await handOverRequestStock(fid, facilityToday(me.facility.timezone), { subjectId: r.subjectId, lines: r.lines }, async (tx) => {
          const moved = await tx.request.updateMany({
            where: { id: r.id, status: "round" },
            data: { status: "delivered", signerName: myName, signerRole: me.wardDesk ? "ward clerk" : (me.dept || "ward"), signedAt: new Date() },
          });
          if (moved.count !== 1) throw new StaffOpError("Someone has already signed for that bag");
          await event(tx, r.id, `Delivered to ${me.dept || "the ward"}`, `Signed by ${myName}`, myName);
        }, "ward"); // the bag has already left the shelf: record the hand-over, never refuse it here
      } catch (e) {
        // The shared helper speaks the coordinator's error type — an empty shelf has to reach the
        // person on the ward as those words, not as a bare "something went wrong".
        asStaffError(e);
      }
      return { ok: true };
    }
    case "round.claim": {
      // The bag has left the desk. Either the requester says so — "I've got it" on their own
      // order — or the clerk who is looking at the pile marks it collected, because the person who
      // knows a bag is gone is usually the one standing next to where it was. A desk clerk may
      // only do that for their own ward, the same fence round.sign works behind.
      const r = await prisma.request.findFirst({
        where: { id: str(p.id), facilityId: fid, status: "delivered" },
        include: { subject: { select: { id: true } }, events: { select: { label: true, meta: true } } },
      });
      if (!r) throw new StaffOpError("No such delivery", 404);
      if (r.subject.id !== me.id) {
        if (!me.wardDesk) throw new StaffOpError("That delivery is somebody else's", 403);
        // The ward the bag was delivered to, off the timeline, exactly as round.sign and
        // /my/round read it: the clerk looking at the pile is the one who may clear it, and a
        // wearer transferring afterwards does not move the bag off their desk.
        //
        // The same blank-ward rule as round.sign: no ward recorded on either side is no match, or
        // a clerk whose ward was never filled in could claim for every other ward-less person.
        const bagWard = roundWard(r.events);
        if (!me.dept || !bagWard || bagWard !== me.dept) throw new StaffOpError("That bag is for another ward", 403);
      }
      // Conditional on it still being unclaimed, so the requester and the desk both tapping it
      // leaves one claim with the first person's name on the timeline rather than two.
      const claimed = await prisma.request.updateMany({ where: { id: r.id, claimedAt: null }, data: { claimedAt: new Date() } });
      if (claimed.count === 1) {
        await event(prisma, r.id, "Collected from the ward", r.subject.id === me.id ? "" : `Marked by ${myName}`, r.subject.id === me.id ? "You" : myName);
      }
      return { ok: true };
    }

    /* ---------------------------------------------------------------- damage */
    case "damage.report": {
      const kind = str(p.kind, 40);
      if (!DAMAGE_KINDS.includes(kind as never)) throw new StaffOpError("Pick what happened");
      // handedIn as well as returnedDate: a garment handed back at the counter is off the person
      // even though nothing marks it returned, and the line below this one promises the damaged
      // garment stays on the record only *until* it is handed in.
      const issue = await prisma.issue.findFirst({ where: { id: str(p.issueId), facilityId: fid, staffId: me.id, returnedDate: null, handedIn: null } });
      if (!issue) throw new StaffOpError("Pick something you're holding", 404);
      // A replacement is a separate act with its own approval — reporting damage does not quietly
      // issue anything, and the damaged garment stays on the record until it is handed in.
      //
      // It is also the half that can fail: somebody with no manager recorded cannot raise anything.
      // So it goes first. Written the other way round, a nurse with no approver got an error over
      // a report that had already been saved, and one more orphan for every time she tried again.
      //
      // A discontinued garment is still on somebody's back. A request may not carry an archived
      // catalogue entry — nobody should be able to order from a withdrawn range — but that refusal
      // used to take the damage report down with it: a nurse holding a torn tunic from last year's
      // range was told "That garment isn't available" about the garment in her hand, and nothing at
      // all was recorded. The report is the half that matters, so it is saved either way and what
      // she gets instead becomes the linen room's to settle.
      const cat = await prisma.catalogItem.findFirst({ where: { id: issue.itemId, facilityId: fid }, select: { archived: true } });
      let replacement: { id: string } | null = null;
      let replacementNote = "";
      if (p.replace && cat?.archived) {
        replacementNote = "That garment has been discontinued, so a replacement can't be asked for here. Your report has gone to the linen room, who will sort out what you get instead.";
      } else if (p.replace) {
        // Like for like, so a garment outside their staff group that they were issued (on the
        // counter's override, or before the rule) can still be replaced — and nothing else can.
        replacement = await runStaffOp(sess, "request.create", {
          lines: [{ itemId: issue.itemId, si: issue.sizeIndex, qty: 1 }], reason: "Damaged",
          note: `Replacement for a ${kind.toLowerCase()} garment`,
        }, { replacing: issue.itemId }) as { id: string };
      }
      const rep = await prisma.damageReport.create({
        data: {
          facilityId: fid, staffId: me.id, issueId: issue.id, kind, note: str(p.note, 400),
          photoId: str(p.photoId) || null, requestId: replacement?.id ?? null,
        },
      });
      return { id: rep.id, replacement, replacementNote };
    }

    /* ---------------------------------------------------------------- the record is wrong */
    case "dispute.raise": {
      const body = str(p.body, 1000).trim();
      if (!body) throw new StaffOpError("Say what doesn't look right");
      const d = await prisma.recordDispute.create({
        data: {
          facilityId: fid, staffId: me.id, body,
          itemId: str(p.itemId) || null,
          sizeIndex: p.si === undefined || p.si === null || p.si === "" ? null : int(p.si),
        },
      });
      return { id: d.id };
    }

    /* ---------------------------------------------------------------- waitlist */
    case "waitlist.join": {
      const item = await prisma.catalogItem.findFirst({ where: { id: str(p.itemId), facilityId: fid } });
      const si = int(p.si, -1);
      if (!item || si < 0 || si >= item.sizes.length) throw new StaffOpError("Pick a size", 404);
      // A place in the queue ends in a request, which would be refused for a garment outside their
      // staff group — so it is refused here, before they wait for an offer they cannot accept.
      const offGroup = await offGroupGarments(fid, me.group, [item.id]);
      if (offGroup.length) throw new StaffOpError(offGroupMessage(offGroup, me, true));
      // The same for the cut, before they wait for an offer their own request would refuse.
      const offStyle = await offStyleGarments(fid, me.uniformStyle, [item.id]);
      if (offStyle.length) throw new StaffOpError(offStyleMessage(offStyle, me, true));

      // Leaving is a soft delete — the row stays, with leftAt set — but one place in a queue per
      // garment and size is a hard constraint, so a second create could never succeed and told
      // whoever tried "you're already on the list", which was the opposite of true. Coming back
      // revives the row she already has, at the back of the queue: leaving forfeits her place,
      // which is the honest reading of having left.
      const existing = await prisma.waitlistEntry.findUnique({
        where: { staffId_itemId_sizeIndex: { staffId: me.id, itemId: item.id, sizeIndex: si } },
      });
      if (existing && !existing.leftAt && !existing.acceptedAt) throw new StaffOpError("You're already on the list for that size");
      if (existing) {
        const w = await prisma.waitlistEntry.update({
          where: { id: existing.id },
          data: { leftAt: null, offeredAt: null, acceptedAt: null, createdAt: new Date() },
        });
        return { id: w.id };
      }
      try {
        // Joining needs no approval — a queue is not a request. Approval happens if and when the
        // item lands and they accept it.
        const w = await prisma.waitlistEntry.create({ data: { facilityId: fid, staffId: me.id, itemId: item.id, sizeIndex: si } });
        return { id: w.id };
      } catch (e) {
        // Two taps racing each other past the read above — by then it is true.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new StaffOpError("You're already on the list for that size");
        throw e;
      }
    }
    case "waitlist.leave": {
      const w = await prisma.waitlistEntry.findFirst({ where: { id: str(p.id), staffId: me.id, leftAt: null } });
      if (!w) throw new StaffOpError("Not on that list", 404);
      await prisma.waitlistEntry.update({ where: { id: w.id }, data: { leftAt: new Date() } });
      return { ok: true };
    }
    case "waitlist.accept": {
      const w = await prisma.waitlistEntry.findFirst({ where: { id: str(p.id), staffId: me.id, leftAt: null, acceptedAt: null, offeredAt: { not: null } } });
      if (!w) throw new StaffOpError("Nothing to accept", 404);
      // The hold the screen and the offer email both promise. Enforced rather than described: the
      // garment goes back on the shelf for whoever is next, and she keeps her place in the queue.
      if (holdExpired(w.offeredAt)) {
        throw new StaffOpError(`That was held for ${WAITLIST_HOLD_HOURS} hours and the hold has run out. You're still on the list — ask the linen room if it's still there.`);
      }
      // A withdrawn range can still have garments on the shelf, so an offer can outlive the
      // catalogue entry — and a request may not carry an archived one. Refuse before the offer is
      // claimed rather than after: rolling the acceptance back and saying "That garment isn't
      // available" about a garment the linen room has physically held for her is a dead end she
      // cannot tap her way out of. Her place on the list is untouched, and the counter can still
      // hand it over by hand.
      const offered = await prisma.catalogItem.findFirst({ where: { id: w.itemId, facilityId: fid }, select: { archived: true } });
      if (offered?.archived) {
        throw new StaffOpError("That garment has been discontinued since you joined the list, so it can't be requested here. Ask the linen room — they're holding it for you at the counter.");
      }
      // Claim the offer before raising the request, so two taps can't turn one held garment into
      // two requests — and hand it straight back if the request can't be raised. An entry stamped
      // accepted with no request behind it is a queue place that can never be used again: accept
      // refuses it forever, and the linen room's waiting list has already dropped her.
      const claimed = await prisma.waitlistEntry.updateMany({ where: { id: w.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
      if (claimed.count !== 1) throw new StaffOpError("Nothing to accept", 404);
      try {
        const req = await runStaffOp(sess, "request.create", { lines: [{ itemId: w.itemId, si: w.sizeIndex, qty: 1 }], reason: "Extra for shifts", note: "Accepted from the waitlist" });
        return { ok: true, request: req };
      } catch (e) {
        await prisma.waitlistEntry.updateMany({ where: { id: w.id }, data: { acceptedAt: null } });
        throw e;
      }
    }

    /* ---------------------------------------------------------------- kit check */
    case "kit.answer": {
      const cycle = await prisma.kitCheck.findFirst({ where: { facilityId: fid, closedAt: null }, orderBy: { openedAt: "desc" } });
      if (!cycle) throw new StaffOpError("No kit check is open", 404);
      const item = await prisma.catalogItem.findFirst({ where: { id: str(p.itemId), facilityId: fid } });
      const si = int(p.si, -1);
      if (!item || si < 0 || si >= item.sizes.length) throw new StaffOpError("Unknown garment", 404);
      // "On record" is the linen room's figure, so it is read from the record and not from the
      // phone that is being asked about it. The screen is sent the same number and posts it back,
      // which is convenient and worthless as evidence — these answers are what a coordinator
      // adjusts the register against, and a shortfall the client chose is not a shortfall.
      const held = await prisma.issue.aggregate({
        where: { facilityId: fid, staffId: me.id, itemId: item.id, sizeIndex: si, returnedDate: null, handedIn: null },
        _sum: { qty: true },
      });
      const onRecord = held._sum.qty || 0;
      if (onRecord <= 0) throw new StaffOpError("You're not holding that garment", 404);
      const confirmed = Math.max(0, Math.min(onRecord, int(p.confirmed, 0)));
      const a = await prisma.kitCheckAnswer.upsert({
        where: { kitCheckId_staffId_itemId_sizeIndex: { kitCheckId: cycle.id, staffId: me.id, itemId: item.id, sizeIndex: si } },
        create: { kitCheckId: cycle.id, staffId: me.id, itemId: item.id, sizeIndex: si, onRecord, confirmed },
        update: { onRecord, confirmed, answeredAt: new Date() },
      });
      // Nothing is written off here. The answers are the linen room's evidence; they adjust the
      // record. A screen that silently removed garments from someone's name would be a screen
      // people learn to lie to.
      return { id: a.id, short: onRecord - confirmed };
    }

    /* ---------------------------------------------------------------- their own sign-in */
    case "account.password": {
      /* The one thing a staff member can change about their account, and the only revocation they
       * have. A staff token carries a fingerprint of the password hash, so a new password ends
       * every session signed against the old one — a phone left on a ward, a cookie copied off it
       * — without a session table to keep. Signing out clears one cookie; this clears the lot.
       *
       * Deleting the account is deliberately not here. Access is the linen room's to grant and
       * theirs to remove: a wearer who could delete their own account would take the record of
       * what they were issued with it. */
      const current = str(p.current, 200);
      const next = str(p.next, 200);
      if (next.length < MIN_PASSWORD) throw new StaffOpError(`Use at least ${MIN_PASSWORD} characters for your new password.`);
      if (next === current) throw new StaffOpError("That's the password you already have.");
      const acc = await prisma.staffAccount.findUnique({ where: { id: sess.accountId }, select: { id: true, passwordHash: true } });
      if (!acc) throw new StaffOpError("No such account", 404);
      if (!(await bcrypt.compare(current, acc.passwordHash))) throw new StaffOpError("That isn't your current password.", 403);
      const passwordHash = await bcrypt.hash(next, 12);
      await prisma.staffAccount.update({ where: { id: acc.id }, data: { passwordHash } });
      /* And their phones stop being told. A new password is this person's only revocation, and the
       * manual promises it signs them out on every other phone or browser; leaving the devices
       * registered would leave a phone on a ward still showing "Ready to collect · R-0042 · Navy
       * tunic" on its lock screen after access was taken away, which is precisely what the promise
       * was about. The phone they still hold re-registers the next time they turn a switch on. */
      await prisma.staffDevice.deleteMany({ where: { staffId: sess.staffId } });
      // Re-issued in the same breath, so the person who just changed it is the one session that
      // survives rather than the one that gets thrown out.
      await setStaffCookie(acc.id, passwordHash);
      return { ok: true };
    }

    default:
      throw new StaffOpError("Unknown action", 400);
  }
}
