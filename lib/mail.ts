import { HOSTED_REPLY_TO } from "./hosted-defaults";
import { queueMail, smtpConfigured, type MailOutcome } from "./mailqueue";

export type { MailOutcome } from "./mailqueue";

/** Reply-To for mail whose caller names none: SMTP_REPLY_TO when set (an empty value means none),
 *  otherwise the hosted service's helpdesk inbox. Mail goes out From a no-reply address, so without
 *  this every answer to a welcome, a reset or a staff notice would land where nobody reads it.
 *  scripts/check-mail.ts proves it. */
function defaultReplyTo(): string {
  return process.env.SMTP_REPLY_TO !== undefined ? process.env.SMTP_REPLY_TO.trim() : HOSTED_REPLY_TO;
}

/** Is transactional mail (password resets, staff activation, approval links) possible? SMTP is
 *  optional: with nothing configured the app still records what it needs to — it just doesn't post
 *  a notification, and says so on the screen and in the logs rather than failing the request. */
export function transactionalConfigured() {
  return smtpConfigured();
}

/** The envelope a message goes out with: the caller's Reply-To, else the default one. */
export function envelope(to: string, subject: string, text: string, html?: string, replyTo?: string) {
  const reply = replyTo || defaultReplyTo();
  return { to, subject, text, ...(html ? { html } : {}), ...(reply ? { replyTo: reply } : {}) };
}

export type SendOptions = {
  /** What kind of mail this is ("reset", "welcome"...). Recorded and shown in alerts; never content. */
  kind: string;
  html?: string;
  replyTo?: string;
  /** Time-sensitive (a reset link): tried now, retried for a few minutes only. */
  urgent?: boolean;
  /** Try it now even though it isn't urgent, so the screen can say whether it went. */
  inline?: boolean;
  /** Urgent mail: minutes before a late retry is pointless (default 15). */
  expiresInMin?: number;
  dedupeKey?: string;
};

/** Send to a specific person, through the queue (lib/mailqueue.ts). Never throws for a mail
 *  problem: a caller deciding what to tell the user should never be handed an SMTP stack trace.
 *  `sent` means the mail server took it; `queued` means it is waiting and will be retried, and an
 *  alert is raised if it never goes. */
export async function sendMail(to: string, subject: string, text: string, o: SendOptions): Promise<MailOutcome> {
  try {
    return await queueMail(envelope(to, subject, text, o.html, o.replyTo), {
      kind: o.kind,
      lane: o.urgent ? "urgent" : "normal",
      inline: o.inline,
      expiresInMin: o.expiresInMin,
      dedupeKey: o.dedupeKey,
    });
  } catch (e) {
    // The queue is the database; if that is down the request has bigger problems, but a mail
    // should still not be what turns a working action into a 500.
    console.error("[mail] could not queue", o.kind, "mail:", (e as Error).message?.split("\n")[0]);
    return { sent: false, queued: false, failed: "not-recorded" };
  }
}

/** Accepted: sent now, or safely queued. */
export const accepted = (r: MailOutcome) => r.sent || r.queued;
