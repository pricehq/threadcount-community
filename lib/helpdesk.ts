/* Helpdesk (Chatwoot, self-hosted).
 *
 * Two halves. The browser half is the chat widget (components/Helpdesk.tsx); the server half,
 * here, files a contact-form message as a helpdesk conversation so it lands in the same queue as
 * chats and emails instead of a table nobody opens. Fire-and-forget: the form's own record and
 * email are the system of record; a helpdesk outage must never fail a contact submission.
 *
 * Configuration (environment): CHATWOOT_URL, CHATWOOT_API_TOKEN (an agent access token),
 * CHATWOOT_ACCOUNT_ID, CHATWOOT_INBOX_ID (the ThreadCount website inbox). Absent = off. */

const URL_ = process.env.CHATWOOT_URL || "";
const TOKEN = process.env.CHATWOOT_API_TOKEN || "";
const ACCOUNT = process.env.CHATWOOT_ACCOUNT_ID || "";
const INBOX = process.env.CHATWOOT_INBOX_ID || "";

export const helpdeskOn = () => !!(URL_ && TOKEN && ACCOUNT && INBOX);

async function api(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${URL_}/api/v1/accounts/${ACCOUNT}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", api_access_token: TOKEN },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`helpdesk ${path} ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export type HelpdeskMessage = { name: string; email: string; message: string; subject?: string; facility?: string };

/** Files one conversation. Resolves true when the helpdesk accepted it; never throws. */
export async function fileHelpdeskMessage(m: HelpdeskMessage): Promise<boolean> {
  if (!helpdeskOn()) return false;
  try {
    const created = await api("/contacts", { inbox_id: Number(INBOX), name: m.name, email: m.email });
    const payload = (created.payload as Record<string, unknown>) || created;
    const contact = (payload.contact as Record<string, unknown>) || payload;
    const inboxes = (contact.contact_inboxes as Array<Record<string, unknown>>) || [];
    const sourceId = inboxes.find((ci) => (ci.inbox as Record<string, unknown>)?.id === Number(INBOX))?.source_id || inboxes[0]?.source_id;
    const content = [m.subject ? `**${m.subject}**` : "", m.facility ? `Facility: ${m.facility}` : "", m.message].filter(Boolean).join("\n\n");
    await api("/conversations", { source_id: sourceId, inbox_id: Number(INBOX), contact_id: contact.id, message: { content } });
    return true;
  } catch (e) {
    console.error("[helpdesk] file failed:", e instanceof Error ? e.message : e);
    return false;
  }
}
