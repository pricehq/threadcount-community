import { prisma } from "./db";
import { recordAudit } from "./audit";
import type { SessionUser } from "./session";

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

/** The two things every successful coordinator mutation does once it has committed: write the
 *  audit trail and bump the facility's change number. Handed back: the new number, for the
 *  screen that made the change. */
export async function afterMutation(user: SessionUser, op: string, payload: unknown, ip: string, result: unknown): Promise<number | null> {
  // me.deleteAccount by the last admin deletes the facility itself. Its audit trail went with it in
  // the cascade, and there is no screen left to tell about a new change number, so both writes
  // would only fail against the missing row (a P2025 and a foreign-key error, every deletion).
  if (facilityDeleted(result)) return null;
  recordAudit(user, op, payload, ip);
  return bumpRev(user.facilityId);
}

function facilityDeleted(result: unknown): boolean {
  return typeof result === "object" && result !== null && (result as { deleted?: unknown }).deleted === "facility";
}
