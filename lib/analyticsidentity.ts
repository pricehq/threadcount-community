/* Facility-level identify for the app's analytics — server only.
 *
 * Signed-in sessions on the app website are tagged with the FACILITY, never the person: an HMAC of
 * the facility id under ANALYTICS_ID_KEY ("fa_" + 16 base32 characters), plus a few fixed words
 * (role, how old and how big the facility is, whether it is the demo). That is enough to segment
 * usage by customer and by role without the analytics database ever holding a name, an email, a
 * facility name or a real id. The key never leaves the server, so the analytics id cannot be
 * turned back into a facility by anyone who only sees the dashboard; losing the key only means
 * new sessions get new ids.
 *
 * No key set (every self-hosted instance by default) → no identify at all. */
import { cache } from "react";
import { prisma } from "@/lib/db";
import { ageBucket, facilityAnalyticsId, sizeBucket } from "@/lib/analyticsid";

export { roleWord } from "@/lib/analyticsid";

export type AnalyticsIdentity = { id: string; role: string; fac_age?: string; fac_size?: string; demo: "yes" | "no" };

/** The identity for a signed-in render, or null (no key, no facility, any failure). */
export const analyticsIdentity = cache(async (facilityId: string | null | undefined, role: "admin" | "issuer" | "staff"): Promise<AnalyticsIdentity | null> => {
  if (!process.env.ANALYTICS_ID_KEY || !facilityId) return null;
  try {
    const id = facilityAnalyticsId(facilityId);
    if (!id) return null;
    const [facility, staff, users] = await Promise.all([
      prisma.facility.findUnique({ where: { id: facilityId }, select: { createdAt: true, isDemo: true } }),
      prisma.staff.count({ where: { facilityId, inactive: false } }),
      prisma.user.count({ where: { facilityId, inactive: false } }),
    ]);
    if (!facility) return null;
    return { id, role, fac_age: ageBucket(facility.createdAt), fac_size: sizeBucket(staff + users), demo: facility.isDemo ? "yes" : "no" };
  } catch {
    return null;
  }
});

