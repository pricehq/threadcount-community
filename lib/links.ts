/* Where the product's own screens send people for the terms, the privacy notice and the rest.
 *
 * The defaults are the hosted service's pages and live in lib/hosted-defaults.ts, which the
 * Community edition replaces with blanks: a self-hosted instance is somebody else's service with
 * somebody else's privacy officer, so its operator sets NEXT_PUBLIC_TERMS_URL and
 * NEXT_PUBLIC_PRIVACY_URL to their own documents, and until they do the screens show no link
 * rather than the wrong one. Compiled in at build time. */
import { HOSTED_DELETE_ACCOUNT_URL, HOSTED_PRIVACY_EMAIL, HOSTED_PRIVACY_URL, HOSTED_SITE, HOSTED_TERMS_URL } from "./hosted-defaults";
export const TERMS_URL = process.env.NEXT_PUBLIC_TERMS_URL || HOSTED_TERMS_URL;
export const PRIVACY_URL = process.env.NEXT_PUBLIC_PRIVACY_URL || HOSTED_PRIVACY_URL;
export const DELETE_ACCOUNT_URL = HOSTED_DELETE_ACCOUNT_URL;
export const PRIVACY_EMAIL = HOSTED_PRIVACY_EMAIL;
/** True when a public website (support page, demo) sits in front of this build. */
export const HAS_SITE = HOSTED_SITE;
