/* Community edition: notices about a facility go to the server log. The hosted edition emails
 * them to the people who run the service. */
export async function ownerAddresses(): Promise<string[]> { return []; }
export function notifyOwners(subject: string, text: string): void { console.log(`[notice] ${subject}\n${text}`); }
export function alertNewSignup(facility: { id: string; name: string }): void { console.log(`[notice] facility created: ${facility.name}`); }
export function alertInvoiceRequested(f: { id: string; name: string; plan: string; wants: string }): void { console.log(`[notice] invoice requested by ${f.name} (${f.plan} → ${f.wants})`); }
export function alertFacilityDeleted(args: { name: string; by: string; ip: string; counts: string }): void { console.log(`[notice] facility deleted: ${args.name} (${args.counts})`); }
