import { NextResponse } from "next/server";
import { COMMUNITY } from "@/lib/edition";
import { SOURCE_URL, editionVersion } from "@/lib/source";

export const dynamic = "force-dynamic";

/* What the Android apps ask a server before they will point at it.
 *
 * The apps open threadcount.tech unless told otherwise; a room running the Community edition types
 * its own address into the app's first screen, and the app calls this first. It proves the address
 * is a ThreadCount server (not a look-alike, not a typo), says which edition and build, and carries
 * the oldest app version this build still works with, so an app can say "update me" instead of
 * breaking quietly. Public and unauthenticated on purpose: nothing here is about a facility. */
export async function GET() {
  return NextResponse.json({
    product: "threadcount",
    edition: COMMUNITY ? "community" : "hosted",
    version: editionVersion(),
    // The AGPL's offer of source, for an app that wants to show it. Null on the hosted service,
    // which is not licensed under the AGPL.
    source: COMMUNITY ? SOURCE_URL : null,
    paths: { counter: "/m", staff: "/my" },
    // The oldest Play versionCode of each app this server still serves correctly.
    minApp: { counter: 9, staff: 7 },
  }, { headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } });
}
