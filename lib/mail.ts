import nodemailer from "nodemailer";

/** Is transactional mail (password resets, staff activation, approval links) possible? SMTP is
 *  optional: with nothing configured the app still records what it needs to — it just doesn't post
 *  a notification, and says so on the screen and in the logs rather than failing the request. */
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
    // `html` is optional: a caller may send both parts, and everything else stays plain text.
    await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER!, to, subject, text, ...(html ? { html } : {}), ...(replyTo ? { replyTo } : {}) });
    return true;
  } catch (e) {
    console.error("[mail] send failed:", (e as Error).message);
    return false;
  }
}
