import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { fail, over } from "./ratelimit";
import { setStaffCookie } from "./staffsession";
import { recordAuthEvent } from "./audit";

/* Signing a wearer in, from either door.
 *
 * There are two ways into the staff app now: /my/signin, which is where the printed slip and the
 * Play app send people, and the ordinary Log in box on the website, which a wearer reaches by
 * clicking Log in on the home page like anybody else. Both end in the same session, so both go
 * through here rather than through two copies of the same twenty lines — the refusal wording, the
 * failure buckets and the audit events have to say the same thing whichever door was used, and the
 * way that stops being true is by living in two places.
 */

// A constant to compare against when there is no account, so a missing email and a wrong password
// take the same time.
const DUMMY = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO5x3FvDS3kqB6r0Jt3g7Lz0vX4o0JZ1u";

/** The trail names the person on the register, not the account — see lib/audit.ts. */
type Acc = { facilityId: string; staff: { id: string; first: string; last: string } };
const actorFor = (a: Acc, email: string) =>
  ({ facilityId: a.facilityId, userId: a.staff.id, userName: `${a.staff.first} ${a.staff.last}`.trim() || email });

/* Failures only, not attempts: every wearer in the hospital arrives from one NAT address at shift
 * change, so a ceiling on attempts would lock out the ward it is meant to protect.
 *
 * Its own function because the staff door asks it *before* verifying Turnstile, and a token is good
 * for one use — asking afterwards would spend somebody's check to tell them they are throttled.
 * `over` only reads the bucket, so asking twice on one request costs nothing. */
export function staffThrottled(email: string, ip: string): boolean {
  return over("staff-login-ip:" + ip, 40, 15 * 60 * 1000) || (!!email && over("staff-login-email:" + email, 25, 15 * 60 * 1000));
}

export type StaffSignIn =
  /** No staff account with this address. The caller decides what that means. */
  | { kind: "none" }
  | { kind: "error"; error: string; status: number }
  | { kind: "ok"; name: string };

/**
 * Check an address and password against the staff register and, if they match, set the session.
 *
 * `ownDoor` says whether this is /api/staff/login itself. It decides one thing only: what happens
 * when the address has no staff account at all. At the staff door that is a plain wrong answer, so
 * it costs a dummy compare and a counted failure like any other. At the shared Log in box it is
 * ordinary — most people typing there are coordinators — so it returns `none` having touched
 * nothing, and the coordinator path does its own compare and counts its own failure. Counting in
 * both places would spend two of somebody's eight attempts on one wrong password.
 */
export async function signInStaff(email: string, password: string, ip: string, ownDoor: boolean): Promise<StaffSignIn> {
  const acc = await prisma.staffAccount.findUnique({
    where: { email },
    select: { id: true, facilityId: true, passwordHash: true, staff: { select: { id: true, first: true, last: true, inactive: true } } },
  });
  if (!acc && !ownDoor) return { kind: "none" };

  if (staffThrottled(email, ip)) {
    return { kind: "error", error: "Too many attempts — try again in 15 minutes.", status: 429 };
  }

  const ok = await bcrypt.compare(password, acc?.passwordHash ?? DUMMY);
  if (!acc || !ok) {
    fail("staff-login-ip:" + ip, 15 * 60 * 1000);
    if (email) fail("staff-login-email:" + email, 15 * 60 * 1000);
    // An address with no account here goes unrecorded: nothing names a facility to file it under.
    if (acc) recordAuthEvent(actorFor(acc, email), "staff:signin.failed", ip);
    return { kind: "error", error: "Email or password doesn’t match.", status: 401 };
  }
  if (acc.staff.inactive) {
    recordAuthEvent(actorFor(acc, email), "staff:signin.refused", ip, "inactive");
    return { kind: "error", error: "You're no longer on the register at this facility. Ask the linen room.", status: 403 };
  }

  await prisma.staffAccount.update({ where: { id: acc.id }, data: { lastSeenAt: new Date() } });
  await setStaffCookie(acc.id, acc.passwordHash);
  recordAuthEvent(actorFor(acc, email), "staff:signin", ip, "password");
  return { kind: "ok", name: `${acc.staff.first} ${acc.staff.last}` };
}
