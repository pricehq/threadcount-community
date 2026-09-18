/* The coordinator's account emails: the welcome after sign-up, and the password reset link.
 * Plain text and HTML for each — the words of the text are the original ones; the HTML puts the
 * same words in the layout every ThreadCount email shares (lib/mail-html.cjs). */
import { layout, siteUrl } from "@/lib/mail-html.cjs";

export type AccountMail = { subject: string; text: string; html: string };

/** Sent to the address a coordinator signs up with: it is the address a reset goes to, so it is
 *  exercised immediately, and the mail says in as many words why it matters. */
export function welcomeEmail(first: string, facility: string): AccountMail {
  const base = siteUrl();
  const subject = "Your ThreadCount facility is set up";
  const text = [
    `Hi ${first || "there"},`,
    "",
    `${facility} is set up on ThreadCount, and this address is the coordinator account for it.`,
    "",
    "Keep this message. This is the address a password reset is sent to, and it is the only way",
    "back into the facility if the password is forgotten — so if it is wrong, sign in and add a",
    "second admin with an address that works, under Settings → Users.",
    "",
    `${base}/app`,
    "",
    "— ThreadCount",
  ].join("\n");
  const { html } = layout({
    eyebrow: "Welcome",
    title: `${facility} is set up`,
    preheader: `${facility} is set up on ThreadCount. This address is its coordinator account.`,
    intro: [`Hi ${first || "there"},`, `${facility} is set up on ThreadCount, and this address is the coordinator account for it.`],
    rows: [["This address", "Where a password reset is sent — the only way back in if the password is forgotten"], ["If it is wrong", "Sign in and add a second admin with an address that works, under Settings → Users"]],
    cta: { label: "Open ThreadCount", href: `${base}/app` },
    closing: ["Keep this message."],
    footer: { facility },
  });
  return { subject, text, html };
}
