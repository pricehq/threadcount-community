import { readFileSync } from "fs";
import path from "path";

/* Which build this server is, and where its source can be had. Server-side only.
 *
 * Kept apart from lib/edition.ts on purpose. That module is pulled into client bundles by whatever
 * imports it, so a node built-in added there passes the typecheck and then fails `next build` with
 * "can't resolve fs". Everything that touches the filesystem lives here instead, and only server
 * code imports it: the source notice is a server component and /api/app-info runs on the server. */

/** The Community release cut by the publisher, or the hosted release sha. */
export function editionVersion(): string {
  try {
    // Written into the published tree by the release; absent on the hosted service.
    return readFileSync(path.join(process.cwd(), "COMMUNITY_VERSION"), "utf8").trim();
  } catch { /* hosted: no file */ }
  return process.env.NEXT_PUBLIC_RELEASE || "hosted";
}

/* The AGPL asks that anyone offering a MODIFIED version over a network lets its users get that
 * modified source, so a facility running its own build sets SOURCE_URL to wherever it keeps that.
 * Unset, it names the release this build came from. */
export const SOURCE_URL = process.env.SOURCE_URL || "https://github.com/pricehq/threadcount-community";
