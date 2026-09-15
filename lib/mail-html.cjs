/* The one HTML layout every ThreadCount email is built from.
 *
 * Lifted out of lib/billing-mail.cjs so the coordinator and staff emails read the same way as the
 * billing ones: the same colours, the same text wordmark, one button, a footer. CommonJS with no
 * dependencies so the app, the timers and the previews all render the same file.
 *
 * Colour is hard-coded from app/globals.css (`--color-*`): email clients do not read CSS
 * variables. Tables, inline styles, a single 600px column, no images — the wordmark is text, so the
 * mail looks the same with images blocked.
 *
 * Slots: `eyebrow` (the small label above the headline), `title`, `preheader`, `intro` (paragraphs),
 * `rows` (a details table of [label, value]), `list` (garment lines or bullets), `code` (a big
 * collection code), `cta` ({label, href}), `closing` (paragraphs in the quieter colour), `footer`
 * ({facility, contact, links: [[label, href]], entity, textLinks}). `text` is built from the same
 * parts for callers that have no hand-written plain-text body. */

const C = {
  bg: "#f3f2f2", surface: "#eae9e9", text: "#201e1d", accent: "#ec3013", accent700: "#b8240e", accent300: "#ffc4b8",
  divider: "#cfcccb", n600: "#6c6764", n700: "#57534f", n800: "#3a3735", white: "#ffffff",
};
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function money(cents, currency) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: (currency || "AUD").toUpperCase() }).format((cents || 0) / 100);
}

function longDate(d) {
  const x = d instanceof Date ? d : new Date(d);
  return x.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Brisbane" });
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://threadcount.tech").replace(/\/+$/, "");
}

/**
 * @param {{ eyebrow?: string, title: string, preheader?: string, intro?: string | string[],
 *   rows?: [string, string][], list?: string[], code?: { label?: string, value: string },
 *   cta?: { label: string, href: string }, closing?: string | string[],
 *   footer?: { facility?: string, contact?: string, links?: [string, string][], entity?: string, textLinks?: [string, string][] } }} o
 * @returns {{ html: string, text: string }}
 */
function layout(o) {
  const { eyebrow, title, preheader, intro, rows, list, code, cta, closing, footer } = o;
  const base = siteUrl();
  const f = footer || {};
  const entity = f.entity === undefined ? (process.env.INVOICE_ENTITY || "ThreadCount") : f.entity;
  const abn = f.entity === undefined && process.env.INVOICE_ABN ? ` · ABN ${process.env.INVOICE_ABN}` : "";
  const links = f.links || [["Support", `${base}/support`]];
  const paras = (Array.isArray(intro) ? intro : [intro]).filter(Boolean);
  const closingParas = (Array.isArray(closing) ? closing : [closing]).filter(Boolean);
  const rowsHtml = rows && rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:22px 0 4px;border-top:2px solid ${C.text}">
        ${rows.map(([k, v]) => `<tr>
          <td style="padding:10px 12px;font:700 11px/1.4 ${FONT};letter-spacing:.06em;text-transform:uppercase;color:${C.n600};background:${C.surface};border-bottom:1px solid ${C.divider};width:38%;vertical-align:top">${esc(k)}</td>
          <td style="padding:10px 12px;font:15px/1.4 ${FONT};color:${C.text};border-bottom:1px solid ${C.divider};font-variant-numeric:tabular-nums">${esc(v)}</td>
        </tr>`).join("")}
      </table>`
    : "";
  const listHtml = list && list.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0 4px;border-top:2px solid ${C.text};border-bottom:1px solid ${C.divider}">
        ${list.map((l) => `<tr><td style="padding:10px 12px;font:15px/1.45 ${FONT};color:${C.text};border-bottom:1px solid ${C.divider};font-variant-numeric:tabular-nums">${esc(l)}</td></tr>`).join("")}
      </table>`
    : "";
  const codeHtml = code
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px"><tr>
        <td style="padding:14px 22px;background:${C.surface};border:2px solid ${C.text}">
          <div style="font:700 11px/1.4 ${FONT};letter-spacing:.14em;text-transform:uppercase;color:${C.n600}">${esc(code.label || "Collection code")}</div>
          <div style="font:800 34px/1.1 ${MONO};letter-spacing:.08em;color:${C.text};margin-top:4px">${esc(code.value)}</div>
        </td></tr></table>`
    : "";
  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px"><tr><td style="background:${C.accent};border-radius:0">
        <a href="${esc(cta.href)}" style="display:inline-block;padding:13px 22px;font:700 15px/1 ${FONT};color:${C.white};text-decoration:none;letter-spacing:.01em">${esc(cta.label)}</a>
      </td></tr></table>`
    : "";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader || title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="padding:0 0 14px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="width:14px;height:14px;background:${C.accent};font-size:0;line-height:0">&nbsp;</td>
      <td style="padding-left:10px;font:800 17px/1 ${FONT};letter-spacing:-.02em;color:${C.text}">ThreadCount</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:${C.white};border:2px solid ${C.text}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="background:${C.text};padding:26px 32px 22px">
        <div style="font:700 11px/1.4 ${FONT};letter-spacing:.14em;text-transform:uppercase;color:${C.accent300}">${esc(eyebrow || "ThreadCount")}</div>
        <div style="font:800 30px/1.1 ${FONT};letter-spacing:-.03em;color:${C.white};margin-top:8px">${esc(title)}</div>
      </td></tr>
      <tr><td style="padding:26px 32px 30px">
        ${paras.map((p) => `<p style="margin:0 0 14px;font:16px/1.55 ${FONT};color:${C.text}">${esc(p)}</p>`).join("")}
        ${listHtml}
        ${rowsHtml}
        ${codeHtml}
        ${ctaHtml}
        ${closingParas.map((p) => `<p style="margin:18px 0 0;font:15px/1.55 ${FONT};color:${C.n700}">${esc(p)}</p>`).join("")}
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:18px 8px 0;font:12.5px/1.6 ${FONT};color:${C.n600}">
    ${f.facility ? `${esc(f.facility)}${f.contact ? ` · ${esc(f.contact)}` : ""}<br>` : ""}
    ${links.map(([label, href]) => `<a href="${esc(href)}" style="color:${C.accent700};text-decoration:underline">${esc(label)}</a>`).join(" · ")}${links.length ? "<br>" : ""}
    ${esc(entity)}${esc(abn)}
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const textLinks = f.textLinks || links;
  const text = [
    title.toUpperCase(),
    "",
    ...paras,
    "",
    ...(list && list.length ? [...list, ""] : []),
    ...(rows && rows.length ? rows.map(([k, v]) => `${k}: ${v}`) : []),
    ...(rows && rows.length ? [""] : []),
    ...(code ? [`${code.label || "Collection code"}: ${code.value}`, ""] : []),
    ...(cta ? [`${cta.label}: ${cta.href}`, ""] : []),
    ...closingParas,
    ...(closingParas.length ? [""] : []),
    f.facility ? `${f.facility}${f.contact ? ` · ${f.contact}` : ""}` : "",
    ...textLinks.map(([label, href]) => `${label}: ${href}`),
    `${entity}${abn}`,
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
  return { html, text };
}

module.exports = { layout, esc, money, longDate, siteUrl, C, FONT };
