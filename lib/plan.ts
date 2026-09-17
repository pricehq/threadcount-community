/* What a facility may do.
 *
 * There are no plans. ThreadCount is software a facility installs and runs on its own server;
 * nobody sells it, nobody hosts it for anyone else, and there is no account with us to lapse. This
 * module survives because the question it answers — "may this room write, and is anything capped?"
 * — is still asked in a dozen places, and one answer in one file is better than the same constant
 * spelled out in each of them.
 *
 * The answer is always the same: everything, no ceiling, never read-only.
 *
 * The shape is kept as it was on purpose. lib/snapshot.ts hands these fields to every screen, so
 * the fields stay and the values become constants — a smaller change, and one that leaves the
 * screens reading a plan object that simply never says no.
 */

export type PlanCode = "threadcount";
export type PlanStatus = "free";
export type PlanState = "grandfathered";

export type Entitlements = {
  code: PlanCode;
  label: string;
  state: PlanState;
  readOnly: boolean;
  /** Staff records the register may hold. Never capped: null. */
  maxStaff: number | null;
  /** Kept for the screens that still print it; backups are the facility's own business now. */
  backupDays: number;
  endsAt: Date | null;
  graceEndsAt: Date | null;
  grandfathered: boolean;
};

/** The columns the callers still select. Nothing here decides anything any more; `isDemo` is the
 *  one that still matters, because the demo facility is rebuilt every twenty minutes. */
export const PLAN_COLS = { isDemo: true } as const;
export type PlanRow = { isDemo?: boolean | null };

const ANSWER: Entitlements = {
  code: "threadcount",
  label: "ThreadCount",
  state: "grandfathered",
  readOnly: false,
  maxStaff: null,
  backupDays: 0,
  endsAt: null,
  graceEndsAt: null,
  grandfathered: true,
};

/** Everything, for every facility. The argument is ignored and kept so the callers need no edit. */
export function entitlements(_f?: PlanRow): Entitlements {
  return ANSWER;
}

/** The whole days until `d`, never below zero. Still used for ordinary dates elsewhere. */
export function daysUntil(d: Date | null, now: Date = new Date()): number | null {
  return d ? Math.max(0, Math.ceil((d.getTime() - now.getTime()) / 86_400_000)) : null;
}
