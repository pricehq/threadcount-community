/* A notice about a facility goes to this server's own log and nowhere else — there is nobody
 * behind the software to email, and a self-hosted instance answers to its own operator. */
export function alertNewSignup(facility: { id: string; name: string }): void { console.log(`[notice] facility created: ${facility.name}`); }
