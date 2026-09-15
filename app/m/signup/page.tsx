import { switches } from "@/lib/switches";
import MSignup from "@/components/MSignup";

/* Create account — onboarding screen 04. The screen itself is components/MSignup.tsx; this wrapper
   exists to tell it whether plans are live, which only the server knows. */
export const dynamic = "force-dynamic";

export default async function MSignupPage() {
  const sw = await switches();
  return <MSignup plansLive={sw.plansLive} />;
}
