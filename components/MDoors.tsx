"use client";
/* The platform switches, for the phones' sign-in and sign-up screens.
 *
 * Those screens are client components, so their server layouts read lib/switches.ts and hand the
 * answer down through this. Two doors hang on it:
 *
 *   demoOpen    — "Just looking? Open the demo". Without it a phone pointed at the demo had no
 *                 way in: a password box nobody has a password for.
 *   signupsOpen — "New here? Create a free account" on the counter app's sign-in, and whether
 *                 /m/signup takes a new facility or says this server isn't taking sign-ups.
 *
 * Staff never sign themselves up, whatever signupsOpen says: a wearer's account starts from the
 * code their uniform store prints for them. */
import { createContext, useContext } from "react";

export type Doors = { demoOpen: boolean; signupsOpen: boolean };

const Ctx = createContext<Doors>({ demoOpen: false, signupsOpen: false });

export function DoorsProvider({ value, children }: { value: Doors; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDoors(): Doors {
  return useContext(Ctx);
}

/** The counter app's way into the shared demo, as the Issuer: the counter view. */
export const DEMO_COUNTER_HREF = "/api/auth/demo?as=issuer&to=m";
