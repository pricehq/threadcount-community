/* Community edition: there is no billing, so there is no billing mail. The sign-up route still
 * calls this when a facility starts a trial, which never happens off the hosted service; every
 * function here answers as if nothing was sent. */
import { PRICES } from "@/lib/plan";

export type Rendered = { subject: string; text: string; html: string };
export type FacilityCtx = { facility: string; contact: string };
export type Card = { brand: string; last4: string } | null;
export const PRICE_CENTS = { monthly: PRICES.hostedMonthly * 100, annual: PRICES.hostedAnnual * 100 } as const;

export async function billingRecipients(_facilityId: string): Promise<{ to: string[]; ctx: FacilityCtx }> {
  return { to: [], ctx: { facility: "", contact: "" } };
}
export async function sendBillingMail(_facilityId: string, _render: (ctx: FacilityCtx) => Rendered): Promise<number> {
  return 0;
}
const empty = (): Rendered => ({ subject: "", text: "", html: "" });
/** Every template name resolves to a renderer that produces an empty message. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const templates: Record<string, (...args: any[]) => Rendered> = new Proxy({}, { get: () => empty });
