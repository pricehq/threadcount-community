import { DoorsProvider } from "@/components/MDoors";
import { switches } from "@/lib/switches";

/* The sign-in screen is a client component; this reads the platform switches for it. The one it
   uses is demoOpen: the shared demo has no staff sign-ins, so a phone pointed at it needs to be told
   where the demo actually is rather than left at a password box nobody has a password for. */
export const dynamic = "force-dynamic";

export default async function MySignInLayout({ children }: { children: React.ReactNode }) {
  const sw = await switches();
  return <DoorsProvider value={{ demoOpen: sw.demoOpen, signupsOpen: sw.signupsOpen }}>{children}</DoorsProvider>;
}
