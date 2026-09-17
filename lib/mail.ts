import nodemailer from "nodemailer";

/** SMTP is optional. With nothing configured the app still records what it needs to — it just
 *  doesn't post a notification, and says so in the logs rather than failing the caller's request. */
export function mailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.CONTACT_TO);
}

/** Is transactional mail (password resets, staff activation) possible?
 *  Deliberately separate from mailConfigured(): the contact form additionally needs CONTACT_TO,
 *  and a missing CONTACT_TO must not silently disable password resets. */
export function transactionalConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** Send to a specific person. Returns false rather than throwing: a caller deciding what to tell
 *  the user should never be handed an SMTP stack trace. */
export async function sendTo(to: string, subject: string, text: string, html?: string, replyTo?: string): Promise<boolean> {
  if (!transactionalConfigured()) {
    console.warn("[mail] no SMTP configured — not sending:", subject);
    return false;
  }
  try {
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    });
    // `html` is optional: the billing emails send both parts, everything else stays plain text.
    await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER!, to, subject, text, ...(html ? { html } : {}), ...(replyTo ? { replyTo } : {}) });
    return true;
  } catch (e) {
    console.error("[mail] send failed:", (e as Error).message);
    return false;
  }
}

export async function sendMail(subject: string, text: string, replyTo?: string): Promise<boolean> {
  if (!mailConfigured()) return false;
  try {
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    });
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER!,
      to: process.env.CONTACT_TO!,
      replyTo: replyTo || undefined,
      subject,
      text,
    });
    return true;
  } catch (e) {
    console.error("[mail] send failed:", (e as Error).message);
    return false;
  }
}
