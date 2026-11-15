/* The pure half of the facility-level identify (lib/analyticsidentity.ts): the HMAC id and the
 * buckets. Node only (it uses node:crypto) and free of the database, so scripts/check-analytics.ts
 * can test it. */
import { createHmac } from "node:crypto";

const B32 = "abcdefghijklmnopqrstuvwxyz234567";

/** RFC 4648 base32, lower-case, no padding. */
export function base32(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const b of bytes) {
    value = ((value << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** The facility's analytics id, or null without a key. */
export function facilityAnalyticsId(facilityId: string, key: string | undefined = process.env.ANALYTICS_ID_KEY): string | null {
  if (!key || !facilityId) return null;
  return `fa_${base32(createHmac("sha256", key).update(facilityId).digest()).slice(0, 16)}`;
}

/** People on the register + coordinators → 1-10 | 11-50 | 51-200 | 201-1000 | 1000+. */
export function sizeBucket(n: number): string | undefined {
  if (!Number.isFinite(n) || n < 1) return undefined;
  if (n <= 10) return "1-10";
  if (n <= 50) return "11-50";
  if (n <= 200) return "51-200";
  if (n <= 1000) return "201-1000";
  return "1000+";
}

/** Facility age → <7d | 7-30d | 1-3m | 3-12m | 12m+. */
export function ageBucket(createdAt: Date, now: Date = new Date()): string | undefined {
  const days = (now.getTime() - createdAt.getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days < 0) return undefined;
  if (days < 7) return "<7d";
  if (days < 30) return "7-30d";
  if (days < 91) return "1-3m";
  if (days < 365) return "3-12m";
  return "12m+";
}

/** SessionUser.role → the word recorded. */
export function roleWord(role: string | null | undefined): "admin" | "issuer" {
  return role === "ADMIN" ? "admin" : "issuer";
}
