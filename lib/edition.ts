/* Which edition this process is.
 *
 * Hosted is threadcount.tech: plans, the demo, the public site, and its own error reports and
 * usage statistics. Community is the product run by a
 * facility on its own server, from the Dockerfile, with EDITION=community in the environment:
 * every feature a room uses, no plans, no ceiling, nothing reported anywhere.
 *
 * Server-side only — the browser bundle never sees EDITION. Client code that must behave
 * differently off threadcount.tech decides by hostname instead (components/Analytics.tsx,
 * lib/glitchtip.ts), which has the same effect and needs no build-time flag. */
export const COMMUNITY = process.env.EDITION === "community";

/* ⛔ Import no node built-in here. This module reaches the browser through whatever imports it, and
 * a `fs` import in this file builds fine under `tsc --noEmit` and then fails `next build` with
 * "can't resolve fs" — it is what rolled back a deploy on 17 September 2026. The chain that did it
 * has since been deleted, which does not make the rule any less true for the next one. Anything
 * needing the filesystem belongs in lib/source.ts. */
