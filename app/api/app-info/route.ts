import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import { COMMUNITY } from "@/lib/edition";

export const dynamic = "force-dynamic";

/* What the Android apps ask a server before they will point at it.
 *
 * The apps open threadcount.tech unless told otherwise; a room running the Community edition types
 * its own address into the app's first screen, and the app calls this first. It proves the address
 * is a ThreadCount server (not a look-alike, not a typo), says which edition and build, and carries
 * the oldest app version this build still works with, so an app can say "update me" instead of
 * breaking quietly. Public and unauthenticated on purpose: nothing here is about a facility. */
function version(): string {
  try { return readFileSync(path.join(process.cwd(), "COMMUNITY_VERSION"), "utf8").trim(); } catch { /* hosted: no file */ }
  return process.env.NEXT_PUBLIC_RELEASE || "hosted";
}

export async function GET() {
  return NextResponse.json({
    product: "threadcount",
    edition: COMMUNITY ? "community" : "hosted",
    version: version(),
    paths: { counter: "/m", staff: "/my" },
    // The oldest Play versionCode of each app this server still serves correctly.
    minApp: { counter: 9, staff: 7 },
  }, { headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } });
}
