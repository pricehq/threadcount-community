import { prisma } from "./db";
import { COMMUNITY } from "./edition";

/* The two platform switches: are sign-ups open, is the demo in service.
 *
 * These used to be environment variables, and flipping one meant editing the secrets file and
 * restarting. Now they live in one database row ThreadCount's own administration can change, and
 * the environment is an override rather than the source: SIGNUPS_DISABLED=1 or DEMO_DISABLED=1
 * closes the door whatever the row says, so a box can still be locked down by hand — and nothing
 * can reopen it until the variable goes, which is the point of an override.
 *
 * A missing row means open. A database error also means open here rather than closed: the only
 * callers are the sign-up route, the sign-in page, the demo page and the demo entry, all of which
 * fail on their own if the database is really down, and a transient error must not turn the
 * public site into "sign-ups are closed" for the length of a blip. */
export type Switches = {
  signupsOpen: boolean;
  demoOpen: boolean;
  /** Plans are live: sign-ups land on Hosted Small and Settings shows the Plan tab. Until then
   *  every new facility is grandfathered, because the page still says free. PLANS_LIVE=1 turns it
   *  on from the box whatever the row says — the one switch whose override opens rather than closes,
   *  because "on" is the state that costs a customer something and must be deliberate either way. */
  plansLive: boolean;
  /** True when the environment forced the switch. */
  signupsByEnv: boolean;
  demoByEnv: boolean;
  plansByEnv: boolean;
  /** What the row says, before the environment has its say. */
  row: { signupsDisabled: boolean; demoDisabled: boolean; plansLive: boolean; updatedAt: Date | null };
};

export const SWITCH_ROW = "platform";

export async function switches(): Promise<Switches> {
  const signupsByEnv = process.env.SIGNUPS_DISABLED === "1";
  // A Community instance has no demo facility and no plans, whatever its row says.
  const demoByEnv = process.env.DEMO_DISABLED === "1" || COMMUNITY;
  const plansByEnv = process.env.PLANS_LIVE === "1" && !COMMUNITY;
  let row: { signupsDisabled: boolean; demoDisabled: boolean; plansLive: boolean; updatedAt: Date } | null = null;
  try {
    row = await prisma.platformSwitch.findUnique({ where: { id: SWITCH_ROW } });
  } catch (e) {
    console.error("[switches] read failed — treating as open:", (e as Error).message);
  }
  return {
    signupsOpen: !signupsByEnv && !row?.signupsDisabled,
    demoOpen: !demoByEnv && !row?.demoDisabled,
    // A read failure means "not live": the failure mode is a facility grandfathered by mistake,
    // which is a gift, never a room capped or a tab shown by mistake.
    plansLive: !COMMUNITY && (plansByEnv || !!row?.plansLive),
    signupsByEnv,
    demoByEnv,
    plansByEnv,
    row: { signupsDisabled: !!row?.signupsDisabled, demoDisabled: !!row?.demoDisabled, plansLive: !!row?.plansLive, updatedAt: row?.updatedAt ?? null },
  };
}
