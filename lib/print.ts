"use client";
// Client-side print helpers: open a window with a self-contained A4/A5 document and print it.
// Matches the prototype's document.write approach; escapes all data so nothing user-entered becomes markup.

export const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const BASE_CSS = "body{font-family:Archivo,system-ui,sans-serif;color:#201e1d;margin:0;font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}h1{font-size:19px;border-bottom:2px solid #201e1d;padding-bottom:6px;margin:0}.sq{width:11px;height:11px;background:#ec3013;display:inline-block;margin-right:6px}.meta{font-size:11px;color:#555;margin:4px 0 8px}h2{font-size:13px;letter-spacing:.06em;text-transform:uppercase;margin:16px 0 4px}table{width:100%;border-collapse:collapse}th{border-bottom:2px solid #201e1d;text-align:left;font-size:10px;letter-spacing:.06em;text-transform:uppercase;padding:4px 6px}td{border-bottom:1px solid #999;padding:4px 6px}.r{text-align:right}.ih td{background:#eee;font-weight:700;border-bottom:2px solid #201e1d}.box{width:70px;border:1.5px solid #201e1d}";

/* The print window's typeface, taken from this page rather than from Google.
 *
 * The popup is about:blank, so it inherits the app's CSP — style-src 'self' 'unsafe-inline' and
 * font-src 'self' data:. The Google Fonts stylesheet this used to inject was therefore refused on
 * every single print: the slip came out in system-ui, the console filled with violations, and each
 * print made a pointless outbound request to Google from a hospital network. Archivo is already
 * self-hosted through next/font, and its @font-face rules are sitting in this document's own
 * stylesheets, so they are copied across instead. A sheet we can't read (there shouldn't be one)
 * is skipped and the document falls back to the system stack BASE_CSS already names. */
function selfHostedFonts(): string {
  let css = "";
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRule[] = [];
    try { rules = Array.from(sheet.cssRules); } catch { continue; }
    for (const rule of rules) if (rule instanceof CSSFontFaceRule) css += rule.cssText;
  }
  if (!css) return "";
  // next/font hashes the family name (__Archivo_1a2b3c), so the literal "Archivo" in BASE_CSS
  // would never match the faces just copied across. The page's own computed stack is the name.
  let stack = "";
  try { stack = getComputedStyle(document.body).fontFamily; } catch { /* no body to read yet */ }
  return css + (stack ? `body{font-family:${stack}}` : "");
}

export function openPrintWindow(title: string, bodyHtml: string, opts: { page?: string; css?: string; width?: number; height?: number } = {}) {
  const w = window.open("", "_blank", `width=${opts.width || 820},height=${opts.height || 980}`);
  if (!w) { alert("Pop-up blocked — allow pop-ups for ThreadCount to print."); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{${opts.page || "size:A4;margin:14mm"}}${BASE_CSS}${selfHostedFonts()}${opts.css || ""}</style></head><body>${bodyHtml}</body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => { try { w.print(); } catch { /* user can print manually */ } }, 450);
}

export type Col = { t: string; r?: boolean };
/** HTML table from columns + rows (cells are escaped). */
export function tbl(cols: Col[], rows: (string | number)[][]): string {
  return "<table><tr>" + cols.map((c) => `<th${c.r ? ' class="r"' : ""}>${esc(c.t)}</th>`).join("") + "</tr>" +
    rows.map((r) => "<tr>" + r.map((c, i) => `<td${cols[i]?.r ? ' class="r"' : ""}>${esc(c)}</td>`).join("") + "</tr>").join("") + "</table>";
}

/** Ruled A4 document with facility header and "prepared by" line, then titled sections. */
export function printDoc(title: string, meta: string, sections: { h: string; html: string }[]) {
  openPrintWindow(title, `<h1><span class="sq"></span>${esc(title)}</h1><div class="meta">${esc(meta)}</div>` + sections.map((s) => `<h2>${esc(s.h)}</h2>${s.html}`).join(""));
}

export function downloadCsv(name: string, csv: string) {
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8,﻿" + encodeURIComponent(csv);
  a.download = name; a.click();
}
