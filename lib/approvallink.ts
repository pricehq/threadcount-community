import { createHash, createHmac, timingSafeEqual } from "crypto";
import { layout, siteUrl } from "@/lib/mail-html.cjs";

/* The link a ward manager taps in an email to approve or decline, without signing in.
 *
 * Three properties matter, and each is bought a specific way.
 *
 * **It cannot be forged.** HMAC over the payload, with a key derived separately from the session
 * and staff-session keys, so a valid approval link is not a valid anything else.
 *
 * **It cannot be used twice.** There is no table of spent tokens: the link is only honoured while
 * the request is still `awaiting`, and approving or declining moves it. Both links in the same
 * email therefore die together the moment either is used — which is exactly the behaviour you
 * want when a manager taps Approve and then wonders about Decline.
 *
 * **It cannot be spent by a machine.** The link is a GET that renders a page; the decision is a
 * POST from that page. This is not ceremony. Corporate mail scanners and link-preview crawlers
 * fetch every URL in every message, and a GET that approved a uniform request would be approved
 * by Outlook before the manager saw it.
 */

const TTL_MS = 14 * 24 * 60 * 60 * 1000; // a fortnight: leave covers most of it, and stale is safe here

function key() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET not set");
  return createHash("sha256").update("threadcount:approval:v1:" + s).digest();
}

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type ApprovalClaim = { rid: string; mid: string };

export function signApprovalToken(requestId: string, managerStaffId: string): string {
  const payload = b64url(Buffer.from(JSON.stringify({ rid: requestId, mid: managerStaffId, exp: Date.now() + TTL_MS })));
  const sig = b64url(createHmac("sha256", key()).update(payload).digest());
  return `${payload}.${sig}`;
}

export function readApprovalToken(raw: string | undefined): ApprovalClaim | null {
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expect = b64url(createHmac("sha256", key()).update(payload).digest());
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    if (!d.rid || !d.mid || !d.exp || d.exp < Date.now()) return null;
    return { rid: String(d.rid), mid: String(d.mid) };
  } catch {
    return null;
  }
}

export function approvalUrl(token: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://threadcount.tech";
  return `${base}/my/approve?t=${encodeURIComponent(token)}`;
}

/* ---------- the garments, as an email reads them ----------
 *
 * A request covers as many garments as the person needed, so every email about one has to list
 * them rather than name a single item. Both emails below print the same block, and so do the
 * "ready to collect" and "on the round" notes in lib/ops.ts, which is why it lives here and not
 * inside one of them: a manager approving three garments and the wearer collecting them should be
 * reading the same three lines.
 */
export type EmailLine = { qty: number; item: string; size: string; status?: string; declineReason?: string | null };

/** One garment to a line, indented so it sits in a plain-text email as its own block. A refused
 *  garment says so against itself — a bag that turns up two garments short with no explanation is
 *  exactly what this flow exists to prevent. */
export function garmentBlock(lines: readonly EmailLine[]): string {
  return lines
    .map((l) => {
      const g = `  ${l.qty} × ${l.item} — size ${l.size}`;
      return l.status === "declined" ? `${g} — declined: ${l.declineReason || "not approved"}` : g;
    })
    .join("\n");
}

/** The same lines for the HTML list slot: one garment per row, the refusal against itself. */
function garmentList(lines: readonly EmailLine[]): string[] {
  return lines.map((l) => {
    const g = `${l.qty} × ${l.item} — size ${l.size}`;
    return l.status === "declined" ? `${g} — declined: ${l.declineReason || "not approved"}` : g;
  });
}

function staffFooter(facility: string) {
  return { facility, links: [["Support", `${siteUrl()}/support`]] as [string, string][] };
}

/** The email a manager gets when one of their staff asks for uniform. */
export function approvalEmail(opts: {
  managerFirst: string; subjectName: string; raisedByName?: string;
  lines: readonly EmailLine[]; reason: string; note: string; url: string; facility: string;
}) {
  /* Who actually asked. A manager, or the counter, raising on somebody's behalf used to be
   * invisible here, so the approver read "Ali has asked for uniform" about a request Ali had never
   * seen. The wearer is still named, because it is her allowance being spent; the raiser is named
   * as well, because they are the one who can answer a question about it. */
  const raisedBy = (opts.raisedByName || "").trim();
  const subject = raisedBy ? `Uniform request for ${opts.subjectName}` : `Uniform request from ${opts.subjectName}`;
  const asked = raisedBy
    ? `${raisedBy} has raised a uniform request for ${opts.subjectName}, and it needs your approval before the linen room can act on it.`
    : `${opts.subjectName} has asked for uniform and needs your approval before the linen room can act on it.`;
  /* Paragraphs, joined by blank lines — not a list of lines with blanks written in among them.
   * These are plain-text emails with no HTML alternative, so the blank lines are the only
   * formatting there is, and a filter that drops empty strings drops the spacing along with the
   * optional lines it was aimed at. Written this way the optional slots are `null`, which cannot
   * be confused with a separator. */
  const detail = [
    garmentBlock(opts.lines),
    opts.reason ? `  Reason: ${opts.reason}` : null,
    opts.note ? `  Note: ${opts.note}` : null,
  ].filter((l): l is string => l !== null).join("\n");
  const text = [
    `Hi ${opts.managerFirst || "there"},`,
    asked,
    detail,
    `Approve or decline here:\n${opts.url}`,
    "The link opens a page showing the request — nothing is decided until you choose. It works once.",
    `${opts.facility} · ThreadCount`,
  ].join("\n\n");
  const rows: [string, string][] = [];
  if (raisedBy) rows.push(["Raised by", raisedBy]);
  if (opts.reason) rows.push(["Reason", opts.reason]);
  if (opts.note) rows.push(["Note", opts.note]);
  const { html } = layout({
    eyebrow: "Uniform request", title: subject, preheader: asked,
    intro: [`Hi ${opts.managerFirst || "there"},`, asked],
    list: garmentList(opts.lines), rows,
    cta: { label: "Review the request", href: opts.url },
    closing: ["The link opens a page showing the request — nothing is decided until you choose. It works once."],
    footer: staffFooter(opts.facility),
  });
  return { subject, text, html };
}

/** Told to the staff member once their manager has decided.
 *
 *  `approved` is the whole request's answer rather than one garment's: true when at least one line
 *  survived, which is the moment the linen room has a pick to do. `reason` is set only when a
 *  single reason covers the whole refusal — a partly approved request, or one refused for two
 *  different reasons, carries the reason against the garment it belongs to instead. */
export function decisionEmail(opts: {
  staffFirst: string; managerName: string; approved: boolean; reason?: string;
  lines: readonly EmailLine[]; facility: string;
}) {
  const partly = opts.approved && opts.lines.some((l) => l.status === "declined");
  const subject = partly
    ? "Part of your uniform request was approved"
    : opts.approved ? "Your uniform request was approved" : "Your uniform request was declined";
  const opening = partly
    ? `${opts.managerName} approved part of your request. The approved garments are with the linen room now; the rest are below, with the reason.`
    : opts.approved
      ? `${opts.managerName} approved your request. It's with the linen room now.`
      : opts.reason
        ? `${opts.managerName} declined your request — ${opts.reason.toLowerCase()}.`
        : `${opts.managerName} declined your request. The reason against each garment is below.`;
  // A single reason is stated once, in the sentence above, and not repeated against every garment:
  // that reads like a form letter. Where the reasons differ, the block carries them.
  const detail = opts.reason
    ? garmentBlock(opts.lines.map((l) => ({ qty: l.qty, item: l.item, size: l.size })))
    : garmentBlock(opts.lines);
  const text = [
    `Hi ${opts.staffFirst || "there"},`,
    opening,
    detail,
    opts.approved ? "You'll hear again when it's ready to collect or on its way to your ward." : null,
    `${opts.facility} · ThreadCount`,
  ].filter((l): l is string => l !== null).join("\n\n");
  const { html } = layout({
    eyebrow: "Uniform request", title: subject, preheader: opening,
    intro: [`Hi ${opts.staffFirst || "there"},`, opening],
    list: opts.reason ? garmentList(opts.lines.map((l) => ({ qty: l.qty, item: l.item, size: l.size }))) : garmentList(opts.lines),
    closing: opts.approved ? ["You'll hear again when it's ready to collect or on its way to your ward."] : [],
    footer: staffFooter(opts.facility),
  });
  return { subject, text, html };
}

/* ---------- the linen room's own notes to the wearer ----------
 *
 * Built here rather than inline in lib/ops.ts so the preview renders the real thing. `foot` is the
 * linen room's sign-off (its name · ThreadCount), passed in because the room's name is what the
 * caller has; the plain text below is word for word what these emails have always said. */
export type NoteLine = { qty: number; item: string; size: string };

/** The bag is at the counter. */
export function readyEmail(o: { first: string; code: string; lines: readonly NoteLine[]; collectCode?: string | null; holdUntil?: string | null; foot: string }) {
  const subject = "Ready to collect";
  const held = [
    o.collectCode ? `Collection code: ${o.collectCode}` : null,
    o.holdUntil ? `Held until ${o.holdUntil}.` : null,
  ].filter((l): l is string => l !== null).join("\n");
  const text = [`Hi ${o.first},`, `Request ${o.code} is ready at the linen room.`, garmentBlock(o.lines), held || null, o.foot]
    .filter((l): l is string => l !== null).join("\n\n");
  const { html } = layout({
    eyebrow: "Your uniform", title: subject, preheader: `Request ${o.code} is ready at the linen room.`,
    intro: [`Hi ${o.first},`, `Request ${o.code} is ready at the linen room.`],
    list: garmentList(o.lines),
    rows: o.holdUntil ? [["Held until", o.holdUntil]] : [],
    code: o.collectCode ? { label: "Collection code", value: o.collectCode } : undefined,
    footer: { facility: o.foot.replace(/ · ThreadCount$/, ""), links: [["Support", `${siteUrl()}/support`]] },
  });
  return { subject, text, html };
}

/** The bag is on today's round. */
export function roundEmail(o: { first: string; code: string; lines: readonly NoteLine[]; dept?: string | null; foot: string }) {
  const subject = "On the ward round";
  const where = `Request ${o.code} is on today's round to ${o.dept || "your ward"}.`;
  const text = [`Hi ${o.first},`, where, garmentBlock(o.lines), "Whoever signs for it at the desk will be named on your order.", o.foot].join("\n\n");
  const { html } = layout({
    eyebrow: "Your uniform", title: subject, preheader: where,
    intro: [`Hi ${o.first},`, where],
    list: garmentList(o.lines),
    closing: ["Whoever signs for it at the desk will be named on your order."],
    footer: { facility: o.foot.replace(/ · ThreadCount$/, ""), links: [["Support", `${siteUrl()}/support`]] },
  });
  return { subject, text, html };
}

/** A size somebody waited for has come in and is held for them. */
export function waitlistEmail(o: { item: string; size: string; until: string; foot: string }) {
  const subject = "The size you were waiting for is in";
  const line = `${o.item} — size ${o.size} has come in and is held for you until ${o.until}.`;
  const text = `${line}\n\nOpen ThreadCount to accept it. After that it goes to the next person waiting.\n\n${o.foot}`;
  const { html } = layout({
    eyebrow: "Your uniform", title: subject, preheader: line,
    intro: [line],
    rows: [["Garment", `${o.item} — size ${o.size}`], ["Held until", o.until]],
    cta: { label: "Open ThreadCount", href: `${siteUrl()}/my` },
    closing: ["After that it goes to the next person waiting."],
    footer: { facility: o.foot.replace(/ · ThreadCount$/, ""), links: [["Support", `${siteUrl()}/support`]] },
  });
  return { subject, text, html };
}
