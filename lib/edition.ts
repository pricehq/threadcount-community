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
