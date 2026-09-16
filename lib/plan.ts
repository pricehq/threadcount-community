/* What a facility's plan lets it do today.
 *
 * Six columns on Facility go in (plan, planStatus, trialEndsAt, paidUntil, grandfathered, and
 * isDemo for the one facility that has no plan at all) and one plain object comes out. Every
 * write door asks the object — never the plan's name — so a new plan is a row in PLANS here and
 * nothing anywhere else. There is no nightly job: the state is worked out from the dates each
 * time it is read, so a lapsed trial is read-only the moment the grace runs out and paid-again is
 * writable the moment a payment is recorded.
 *
 * The rules, which are also the pricing page's promises:
 *   - Nothing that exists today is fenced. Plans differ in the staff-record ceiling on the free
 *     hosted tier, how long backups are kept, and whether the room is read-only for non-payment.
 *   - Read-only never deletes and never hides. Reports, exports, printing, sign-in and the whole
 *     backup keep working; only writes are refused, with the reason and where to go.
 *   - Grandfathered means free with everything, for good — a change of plan cannot take it away.
 *     The one thing above it is an explicit read_only set by ThreadCount, kept for abuse.
 */

import { COMMUNITY } from "./edition";

export type PlanCode = "hosted_small" | "hosted_facility" | "health_service" | "private";

/** What was last recorded. What it means today is `Entitlements.state`. */
export type PlanStatus = "free" | "trial" | "active" | "read_only";

export type PlanState =
  | "grandfathered" // free with everything; the promise
  | "free"          // Hosted Small: free, capped
  | "trial"         // inside the trial
  | "active"        // paid, inside the year
  | "grace"         // trial or year has ended; a fortnight to sort the invoice, still writable
  | "read_only";    // grace ran out, or read-only was set by hand

export type Entitlements = {
  code: PlanCode;
  label: string;
  state: PlanState;
  readOnly: boolean;
  /** Staff records the register may hold, or null for no ceiling. */
  maxStaff: number | null;
  /** How long the hosted backups are kept, for the Plan screen. */
  backupDays: number;
  /** When the current period ends — the trial, or the paid year. */
  endsAt: Date | null;
  /** When grace ends and writes stop, when the facility is in grace. */
  graceEndsAt: Date | null;
  grandfathered: boolean;
};

export const GRACE_DAYS = 14;
export const TRIAL_DAYS = 30;

/** The prices, in Australian dollars before GST — one place, read by the pricing page, the
 *  structured data, the sign-up choice and the notice to existing rooms. */
export const PRICES = {
  hostedMonthly: 129,
  hostedAnnual: 1290,
  healthServiceAnnual: 4990,
  healthServiceFacilities: 5,
  healthServiceExtra: 890,
  /** Staff records a room may hold and stay on the free hosted plan. */
  freeStaff: 60,
} as const;
const DAY = 86_400_000;

export const PLANS: Record<PlanCode, { label: string; maxStaff: number | null; backupDays: number }> = {
  hosted_small:    { label: "Hosted Small",    maxStaff: 60,   backupDays: 14 },
  hosted_facility: { label: "Hosted Facility", maxStaff: null, backupDays: 35 },
  health_service:  { label: "Health Service",  maxStaff: null, backupDays: 35 },
  private:         { label: "Private",         maxStaff: null, backupDays: 35 },
};

export const PLAN_CODES = Object.keys(PLANS) as PlanCode[];
export const PLAN_STATUSES: PlanStatus[] = ["free", "trial", "active", "read_only"];

export function isPlanCode(x: unknown): x is PlanCode { return typeof x === "string" && x in PLANS; }
export function isPlanStatus(x: unknown): x is PlanStatus { return PLAN_STATUSES.includes(x as PlanStatus); }

/** The columns this reads — one select to share between every caller. A member of a health
 *  service carries its organisation's plan row too, and that row is the one that counts. */
export const PLAN_COLS = {
  plan: true, planStatus: true, trialEndsAt: true, paidUntil: true, grandfathered: true, isDemo: true, stripeSubscriptionId: true,
  org: { select: { id: true, name: true, plan: true, planStatus: true, trialEndsAt: true, paidUntil: true } },
} as const;
export type OrgPlanRow = { id: string; name: string; plan: string; planStatus: string; trialEndsAt: Date | null; paidUntil: Date | null };
export type PlanRow = {
  plan: string; planStatus: string; trialEndsAt: Date | null; paidUntil: Date | null; grandfathered: boolean; isDemo?: boolean;
  stripeSubscriptionId?: string; org?: OrgPlanRow | null;
};

export function entitlements(f: PlanRow, now: Date = new Date()): Entitlements {
  /* A facility inside a health service is on the health service's plan: its own columns are
     ignored while it is a member. Grandfathering stays the facility's own — a room that was free
     before plans keeps that if it ever leaves — and an explicit read-only on the facility still
     wins, because that is the tool for one room, not the whole service. */
  if (f.org && f.planStatus !== "read_only" && !f.grandfathered) {
    return entitlements({ plan: f.org.plan, planStatus: f.org.planStatus, trialEndsAt: f.org.trialEndsAt, paidUntil: f.org.paidUntil, grandfathered: false, isDemo: f.isDemo }, now);
  }
  const code: PlanCode = isPlanCode(f.plan) ? f.plan : "hosted_small";
  const def = PLANS[code];
  const base = { code, label: def.label, backupDays: def.backupDays, grandfathered: f.grandfathered, endsAt: null as Date | null, graceEndsAt: null as Date | null };

  // A Community instance has no plans at all: everything, no ceiling, never read-only, whatever
  // its columns say. Then an explicit read-only beats everything, the demo has no plan, and the
  // promise beats the rest.
  if (COMMUNITY) return { ...base, label: "Community", state: "grandfathered", readOnly: false, maxStaff: null, grandfathered: true };
  if (f.planStatus === "read_only") return { ...base, state: "read_only", readOnly: true, maxStaff: null };
  if (f.isDemo) return { ...base, label: "Demo", state: "grandfathered", readOnly: false, maxStaff: null };
  // A grandfathered room with no plan recorded is simply "Free"; one that has been put on a
  // named plan (a pilot, a health service that later bought) keeps that plan's name.
  if (f.grandfathered) return { ...base, label: isPlanCode(f.plan) ? def.label : "Free", state: "grandfathered", readOnly: false, maxStaff: null };

  if (f.planStatus === "trial" || f.planStatus === "active") {
    const endsAt = f.planStatus === "trial" ? f.trialEndsAt : f.paidUntil;
    // No date recorded means a period was started without an end: writable, and shown as
    // such, rather than read-only because somebody forgot a field.
    if (!endsAt) return { ...base, state: f.planStatus, readOnly: false, maxStaff: null };
    const graceEndsAt = new Date(endsAt.getTime() + GRACE_DAYS * DAY);
    if (now < endsAt) return { ...base, state: f.planStatus, readOnly: false, maxStaff: null, endsAt };
    if (now < graceEndsAt) return { ...base, state: "grace", readOnly: false, maxStaff: null, endsAt, graceEndsAt };
    return { ...base, state: "read_only", readOnly: true, maxStaff: null, endsAt, graceEndsAt };
  }

  // "free": Hosted Small, capped — or a bigger plan set free on purpose (a pilot, an
  // internal room), which keeps that plan's ceiling.
  return { ...base, state: "free", readOnly: false, maxStaff: def.maxStaff };
}

/** The whole days until `d`, never below zero. */
export function daysUntil(d: Date | null, now: Date = new Date()): number | null {
  return d ? Math.max(0, Math.ceil((d.getTime() - now.getTime()) / DAY)) : null;
}

/** What a refused write says. Where to go, never a price. */
export const READ_ONLY_REFUSAL = "Read-only: this facility's plan has lapsed. Reports, exports and the backup still work — see Settings › Plan.";

/** Ops that stay open in a read-only room: sorting the plan out, and leaving. */
export const READ_ONLY_ALLOWED = new Set(["plan.billing", "plan.invoice", "me.password", "me.profile", "me.deleteAccount"]);

export function staffRefusal(max: number): string {
  return `The register is full for this plan — ${max} staff records. Settings › Plan has the next step.`;
}
