"use client";
/* Inside the counter app, or a browser?
 *
 * The counter app's shell (1.9 onwards) appends ThreadCountCounterShell/1 to its user agent. Only
 * the shell has a Connect screen to send someone to when they want another server: it is bundled in
 * the app at https://localhost/, not served by any server, so a browser following the same link
 * would land nowhere. Anything that offers "Change server" asks here first. */
export const CONNECT_URL = "https://localhost/#connect";

export function inCounterShell(): boolean {
  if (typeof navigator === "undefined") return false;
  return /ThreadCountCounterShell\/\d+/.test(navigator.userAgent);
}
