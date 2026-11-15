/* The app website's tracker, with the facility-level identify worked out on the server.
 *
 * Server component: it reads the session (a coordinator on /app and /m, a staff member on /my) and
 * hands <Analytics> an identity that names the facility by an HMAC and the role by a word — never
 * the person. No session (the sign-in and sign-up screens) or no ANALYTICS_ID_KEY → anonymous. */
import Analytics from "@/components/Analytics";
import { analyticsIdentity, roleWord } from "@/lib/analyticsidentity";
import { currentUser } from "@/lib/session";
import { currentStaff } from "@/lib/staffsession";

export default async function AppAnalytics({ who }: { who: "coordinator" | "staff" }) {
  let identity = null;
  try {
    if (who === "staff") {
      const s = await currentStaff();
      identity = s ? await analyticsIdentity(s.facilityId, "staff") : null;
    } else {
      const u = await currentUser();
      identity = u ? await analyticsIdentity(u.facilityId, roleWord(u.role)) : null;
    }
  } catch {
    identity = null; // analytics must never break a page
  }
  return <Analytics site="app" identity={identity} />;
}
