import { prisma } from "./db";
import { COMMUNITY } from "./edition";

/* The two platform switches: are sign-ups open, is the demo in service.
 *
 * These used to be environment variables, and flipping one meant editing the secrets file and
 * restarting. Now they live in one database row, and the environment is an override rather than
 * the source: SIGNUPS_DISABLED=1 or DEMO_DISABLED=1 closes the door whatever the row says, so a
 * box can still be locked down by hand — and nothing can reopen it until the variable goes, which
 * is the point of an override.
 *
 * A missing row means open. A database error also means open here rather than closed: the only
 * callers are the sign-up route, the sign-in page, the demo page and the demo entry, all of which
 * fail on their own if the database is really down, and a transient error must not turn the
 * public site into "sign-ups are closed" for the length of a blip. */
export type Switches = {
  signupsOpen: boolean;
  demoOpen: boolean;
  /** True when the environment forced the switch. */
  signupsByEnv: boolean;
  demoByEnv: boolean;
  /** What the row says, before the environment has its say. */
  row: { signupsDisabled: boolean; demoDisabled: boolean; updatedAt: Date | null };
};

export const SWITCH_ROW = "platform";

export async function switches(): Promise<Switches> {
  const signupsByEnv = process.env.SIGNUPS_DISABLED === "1";
  // A Community instance has no demo facility, whatever its row says.
  const demoByEnv = process.env.DEMO_DISABLED === "1" || COMMUNITY;
  let row: { signupsDisabled: boolean; demoDisabled: boolean; updatedAt: Date } | null = null;
  try {
    row = await prisma.platformSwitch.findUnique({ where: { id: SWITCH_ROW } });
  } catch (e) {
    console.error("[switches] read failed — treating as open:", (e as Error).message);
  }
  return {
    signupsOpen: !signupsByEnv && !row?.signupsDisabled,
    demoOpen: !demoByEnv && !row?.demoDisabled,
    signupsByEnv,
    demoByEnv,
    row: { signupsDisabled: !!row?.signupsDisabled, demoDisabled: !!row?.demoDisabled, updatedAt: row?.updatedAt ?? null },
  };
}
