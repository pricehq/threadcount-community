import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { sameOriginJson } from "@/lib/csrf";
import { allow, clientIp } from "@/lib/ratelimit";
import { normaliseCode, setStaffCookie } from "@/lib/staffsession";
import { verifyTurnstile } from "@/lib/turnstile";
import { recordAuthEvent } from "@/lib/audit";
import { bumpRev } from "@/lib/ops";
import { SLIP_DAYS, facilityToday, slipLive } from "@/lib/compute";
import { resolveTerms } from "@/lib/terms";

export const dynamic = "force-dynamic";

const MIN_PW = 8;

/* Claiming your own record with the code the linen room printed for you.
 *
 * The code alone identifies the person, because it is presented before we know anything about them
 * — there is no facility to scope it to and no email to look up yet. That is why it is globally
 * unique, why it is 58 bits wide, and why this route is throttled to the point where working
 * through the space is not a strategy.
 *
 * It is spent in the same update that finds it, so two people racing the same slip can't both
 * claim the record; the loser gets the ordinary "code isn't right" message.
 *
 * It also goes stale on its own after fourteen days, because the far more likely way a slip is
 * misused is not a guessed code but a printed one nobody ever collected.
 */
export async function POST(req: NextRequest) {
  const csrf = sameOriginJson(req);
  if (csrf) return NextResponse.json({ error: csrf }, { status: 403 });

  const ip = clientIp(req.headers);
  if (!allow("staff-activate:" + ip, 200, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts — try again in 15 minutes." }, { status: 429 });
  }

  let body: { code?: unknown; email?: unknown; password?: unknown; cfToken?: unknown; agreed?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const code = normaliseCode(String(body.code ?? ""));
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 160);
  const password = String(body.password ?? "").slice(0, 200);

  if (!code) return NextResponse.json({ error: "That code isn't right. It's twelve characters, in three groups." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Enter an email address you can get to." }, { status: 400 });
  if (password.length < MIN_PW) return NextResponse.json({ error: `Use at least ${MIN_PW} characters for your password.` }, { status: 400 });
  // The agreement is collected where the account is created. The screen's tick is what sets it,
  // and the door checks it too so a client that skips the box gets the same answer.
  if (body.agreed !== true) return NextResponse.json({ error: "Tick the box to agree to the terms of use and privacy policy." }, { status: 400 });

  // Checked before the code is looked up, so a bot working through the code space is stopped by
  // Cloudflare rather than by the per-IP throttle alone.
  const cfErr = await verifyTurnstile(body.cfToken, ip);
  if (cfErr) return NextResponse.json({ error: cfErr }, { status: 400 });

  const staff = await prisma.staff.findUnique({
    where: { activateCode: code },
    select: { id: true, facilityId: true, first: true, last: true, inactive: true, activateCodeAt: true, account: { select: { id: true } }, facility: { select: { timezone: true, terms: true } } },
  });
  // One message for every way this can fail, so the response can't be used to tell a real code from
  // a spent one — which is also why it can't use the facility's own words: a code that matches
  // nothing has no facility to take them from.
  const nope = () => NextResponse.json({ error: "That code isn't right, or it has already been used. Ask your uniform coordinator for a new one." }, { status: 400 });
  if (!staff || staff.inactive || staff.account) return nope();

  /* An old slip is refused whether or not anyone ever claimed it. It is a bearer token on paper:
   * whoever picks one out of a folder months later can bind their own email and password to this
   * person's record and from then on be them — their issues, their requests, their signature on the
   * ward round, and their approvals queue if they manage anyone. Fourteen days is long enough for
   * someone on leave to come back to it and short enough that a forgotten one is dead by the time
   * it turns up.
   *
   * An unstamped code counts as stale: its age is unknown, so it has to be assumed old. This leans
   * on staff.selfCode in lib/ops.ts stamping activateCodeAt as it prints — if that stamp ever stops
   * being written, every new slip is dead on arrival.
   *
   * This says plainly that the slip has expired rather than joining the deliberately vague message
   * above. Landing here means the code was right, and a code is 58 bits behind a throttle and a
   * Turnstile — so anyone who gets this far is holding a real slip and needs to be told that a
   * reprint, not a retype, is the fix.
   *
   * The age is asked of slipLive() in lib/compute, the same test the staff register and the requests
   * queue use to say whether a slip is still worth chasing, counted in whole days on the facility's
   * own calendar. The day a coordinator's screen calls a slip expired is therefore the day this
   * refuses it — never a few hours later, with a nurse who was told it was dead finding it still
   * works, or one who was told it was fine being turned away. */
  const tz = staff.facility.timezone;
  if (!slipLive(staff.activateCodeAt, facilityToday(tz), tz)) {
    return NextResponse.json(
      { error: `That code was printed ${SLIP_DAYS} or more days ago, so it has expired. Ask the ${resolveTerms(staff.facility.terms).store} to print you a new slip.` },
      { status: 400 },
    );
  }

  // The email has to be free across staff accounts. Coordinator accounts live in a different table
  // and a person may legitimately be both — a linen-room supervisor who also wears the uniform.
  const taken = await prisma.staffAccount.findUnique({ where: { email }, select: { id: true } });
  if (taken) return NextResponse.json({ error: "That email is already on an account here. Sign in instead." }, { status: 400 });

  const passwordHash = await bcrypt.hash(password, 12);

  // Spend the code first, conditionally. If it has gone in the meantime, nothing was created.
  // The stamp goes with the code, so a spent row can't be read as a slip still waiting out there.
  const spent = await prisma.staff.updateMany({ where: { id: staff.id, activateCode: code }, data: { activateCode: null, activateCodeAt: null } });
  if (spent.count !== 1) return nope();

  let account;
  try {
    account = await prisma.staffAccount.create({
      data: { facilityId: staff.facilityId, staffId: staff.id, email, passwordHash },
      select: { id: true, passwordHash: true },
    });
  } catch {
    // The code is gone but the account didn't happen — put the code back rather than stranding
    // someone with a dead slip. The original print date goes back with it: a failed attempt is not
    // a reprint and must not restart the fourteen days.
    await prisma.staff.update({ where: { id: staff.id }, data: { activateCode: code, activateCodeAt: staff.activateCodeAt } }).catch(() => {});
    return NextResponse.json({ error: "That didn't work — try again." }, { status: 500 });
  }

  await setStaffCookie(account.id, account.passwordHash);
  recordAuthEvent(
    { facilityId: staff.facilityId, userId: staff.id, userName: `${staff.first} ${staff.last}`.trim() || email },
    "staff:activate", ip,
  );
  // The fourth door that changes a facility's data, and the only one outside the three mutate
  // routes. Without this the coordinator standing over the nurse while she activates keeps seeing
  // "code outstanding" until some unrelated edit moves the revision, and reissues a code that
  // can't be reissued.
  await bumpRev(staff.facilityId);
  return NextResponse.json({ ok: true, name: `${staff.first} ${staff.last}` });
}
