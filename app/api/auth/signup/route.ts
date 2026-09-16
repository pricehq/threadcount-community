import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { setSessionCookie } from "@/lib/session";
import { allow, clientIp } from "@/lib/ratelimit";
import { sameOriginJson } from "@/lib/csrf";
import { verifyTurnstile } from "@/lib/turnstile";
import { sendTo, transactionalConfigured } from "@/lib/mail";
import { switches } from "@/lib/switches";
import { alertNewSignup } from "@/lib/ops/alerts";
import { recordAuthEvent } from "@/lib/audit";
import { TRIAL_DAYS } from "@/lib/plan";
import { sendBillingMail, templates } from "@/lib/billing-mail";
import { welcomeEmail } from "@/lib/accountmail";

export const dynamic = "force-dynamic";

/* Starting staff groups by healthcare setting. Generic titles only — every room renames them. */
const GROUP_SEEDS: Record<string, { staffGroups: string[]; nursingGroups: string[]; kitGroups: string[] }> = {
  hospital: { staffGroups: ["Registered Nurse", "Enrolled Nurse", "Allied Health", "Support Services", "Security"], nursingGroups: ["Registered Nurse", "Enrolled Nurse"], kitGroups: ["Support Services"] },
  aged_care: { staffGroups: ["Registered Nurse", "Enrolled Nurse", "Personal Care Worker", "Hospitality", "Maintenance"], nursingGroups: ["Registered Nurse", "Enrolled Nurse"], kitGroups: ["Hospitality", "Maintenance"] },
  community: { staffGroups: ["Registered Nurse", "Enrolled Nurse", "Allied Health", "Administration"], nursingGroups: ["Registered Nurse", "Enrolled Nurse"], kitGroups: ["Administration"] },
};
const STATE_ZONES: Record<string, string> = {
  QLD: "Australia/Brisbane", NSW: "Australia/Sydney", ACT: "Australia/Sydney", VIC: "Australia/Melbourne", TAS: "Australia/Hobart",
  SA: "Australia/Adelaide", NT: "Australia/Darwin", WA: "Australia/Perth", NZ: "Pacific/Auckland",
};

/* Creating a facility.
 *
 * The address typed here is not verified, and deliberately isn't: a confirmation step in front of
 * a linen room's first ten minutes is a wall, and a facility half-created behind an unclicked link
 * is worse than one created. But it is the *only* way back in — /api/auth/forgot answers a
 * stranger and the owner identically, so a typo produces no signal at all until the day the
 * password is forgotten, and by then the facility is unreachable and undeletable.
 *
 * So the address is exercised immediately instead. A note goes to it saying, in as many words,
 * that this is the address that recovers the account, and the answer here says whether it was
 * sent — which is what lets the sign-up screen show the address back and tell someone who never
 * receives it what to do about it while they are still signed in and can still act.
 */

export async function POST(req: NextRequest) {
  const sw = await switches();
  if (!sw.signupsOpen) return NextResponse.json({ error: "New facility sign-ups are closed." }, { status: 403 });
  const csrf = sameOriginJson(req); if (csrf) return NextResponse.json({ error: csrf }, { status: 403 });
  if (!allow("signup:" + clientIp(req.headers), 5, 60 * 60 * 1000)) return NextResponse.json({ error: "Too many sign-ups from this connection — try again later." }, { status: 429 });
  let b: Record<string, string>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const first = String(b.first || "").trim().slice(0, 80), last = String(b.last || "").trim().slice(0, 80);
  const facility = String(b.facility || "").trim().slice(0, 120);
  const email = String(b.email || "").trim().toLowerCase().slice(0, 160);
  const password = String(b.password || "");
  if (!first || !last || !facility) return NextResponse.json({ error: "Name and facility are required." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid work email." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  const cfErr = await verifyTurnstile(b.cfToken, clientIp(req.headers)); if (cfErr) return NextResponse.json({ error: cfErr }, { status: 400 });
  if (await prisma.user.findUnique({ where: { email } })) return NextResponse.json({ error: "That email already has an account — log in instead." }, { status: 409 });

  const u = await prisma.$transaction(async (tx) => {
    // No staff groups: the facility names its own. Any list handed over here would be one employer's
    // organisation chart on another employer's register, and a group sitting on a route nobody
    // chose decides who is handed a starting kit. Both route lists start empty with it, so until the
    // coordinator puts a group on the FTE table or the starting kit, everybody is on manager approval
    // and nobody has been promised a kit the counter would not hand over.
    // Until plans are live the page still says free, so a facility created today is grandfathered:
    // free with everything, for good. Once they are live a new room starts on the plan it chose —
    // Hosted Small, free, or a Hosted Facility trial with its end date set now. Anything else
    // sent as `plan` is Hosted Small: the free room is the safe misreading.
    const trial = sw.plansLive && b.plan === "hosted_facility";
    const planData = !sw.plansLive
      ? { grandfathered: true, planStatus: "free" }
      : trial
        ? { plan: "hosted_facility", planStatus: "trial", trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000) }
        : { plan: "hosted_small", planStatus: "free" };
    // Two optional answers from the sign-up screen. The setting seeds the staff groups the room
    // starts with (renamed or removed freely under Settings); the state sets the time zone counts
    // and month-end are read in. Neither is required, and "other"/blank leaves the old defaults.
    const seed = GROUP_SEEDS[String(b.setting || "")] || {};
    const timezone = STATE_ZONES[String(b.state || "").toUpperCase()];
    const f = await tx.facility.create({ data: { name: facility, coordinator: `${first} ${last}`, ...planData, ...seed, ...(timezone ? { timezone } : {}) } });
    return tx.user.create({ data: { facilityId: f.id, email, passwordHash: await bcrypt.hash(password, 12), first, last, title: "Uniform Coordinator", role: "ADMIN" } });
  });
  await setSessionCookie(u.id, u.passwordHash);
  recordAuthEvent({ facilityId: u.facilityId, userId: u.id, userName: `${first} ${last}`.trim() || email }, "auth:signup", clientIp(req.headers));
  alertNewSignup({ id: u.facilityId, name: facility }); // the facility's name only — never the person

  const em = welcomeEmail(first, facility);
  const mailed = await sendTo(email, em.subject, em.text, em.html);
  // A room on a trial also gets the trial letter: what the 30 days include, when they end, and
  // that no card was taken. Not awaited — the welcome above is the one sign-up waits for.
  void (async () => {
    const f = await prisma.facility.findUnique({ where: { id: u.facilityId }, select: { planStatus: true, trialEndsAt: true } });
    if (f?.planStatus === "trial" && f.trialEndsAt) await sendBillingMail(u.facilityId, (ctx) => templates.trialStarted(ctx, { first, endsAt: f.trialEndsAt }));
  })();
  if (!mailed && transactionalConfigured()) console.error("[signup] welcome mail could not be sent for user", u.id);
  // `mailed` is false when no SMTP is configured at all, which is a different thing from a bad
  // address — the screen says so rather than pretending the address has been proven.
  return NextResponse.json({ ok: true, email, mailed, mail: transactionalConfigured() });
}
