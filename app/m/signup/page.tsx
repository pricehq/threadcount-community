import type { Metadata } from "next";
import CounterSignup from "@/components/m/auth/CounterSignup";
import { switches } from "@/lib/switches";

/* Creating a facility from the counter app. On a server whose sign-ups are open (the hosted
 * service, or a Community box whose operator left them open) this is the same three steps as the
 * website's sign-up, as a phone stepper; everywhere else it says the server isn't taking sign-ups
 * and offers sign-in instead. Apps from before 1.6 still have a Sign up button that opens this
 * address, and they get the same answer. */
export const metadata: Metadata = {
  title: "Create a free account",
  alternates: { canonical: "/m/signup" },
};

export const dynamic = "force-dynamic";

export default async function MSignupPage() {
  const sw = await switches();
  return <CounterSignup signupsOpen={sw.signupsOpen} demoOpen={sw.demoOpen} />;
}
