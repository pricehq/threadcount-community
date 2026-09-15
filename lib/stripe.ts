/* Community edition: no card payments. The Plan screen reads this and never offers a card, and a
 * facility deleted here never has a subscription to end. */
export function stripeConfigured(): boolean { return false; }
export async function cancelSubscriptionNow(subscriptionId: string): Promise<void> { void subscriptionId; }
