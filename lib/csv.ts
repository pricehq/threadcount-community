// Small RFC-4180-ish CSV parser (handles quotes, CRLF, BOM). Returns rows as objects keyed by header.
// Throws rather than hand back a file it only half-understood. A register that half-imports is worse
// than one that is refused: rows after a bad quote fold into their neighbour and vanish, and the
// admin is told "379 created" with no errors, so nobody notices the twenty nurses who can no longer
// be issued a uniform at the counter or raise a request in the staff app.
/** Undo the apostrophe csvEsc adds when a cell would otherwise read as a spreadsheet formula.
 *
 *  Exports prefix a cell starting `= + - @` or a space with `'` so that opening the file does not
 *  execute it. That apostrophe is the spreadsheet's own convention for "treat this as text" and is
 *  not part of the value, so a file exported from here and imported straight back used to gain one:
 *  a phone number written `+61 7 ...` came home as `'+61 7 ...`. Only the exact shape the guard
 *  produces is removed, so a value that genuinely begins with an apostrophe is left alone. */
export function unguard(cell: string): string {
  return /^'[\s=+\-@]/.test(cell) ? cell.slice(1) : cell;
}

export function parseCsv(text: string): Record<string, string>[] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  // The line each row started on, so a refusal points at the row in the admin's spreadsheet rather
  // than at a number we invented after the blank lines were dropped.
  const rowLine: number[] = [];
  let row: string[] = [], cell = "", inQ = false;
  // A double-quote only opens a quoted field at the very start of a cell. Anywhere else it is just a
  // character — an inch mark in a size or notes cell, a nickname in quotes — and treating it as an
  // opening quote is what used to eat every comma and line break for the rest of the file.
  let fresh = true;
  // Line of the quote we are currently inside, so a refusal can point the admin at the bad row.
  let line = 1, quoteLine = 0, start = 1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else { if (c === "\n") line++; cell += c; }
    } else if (c === '"' && fresh) { inQ = true; fresh = false; quoteLine = line; }
    else if (c === ",") { row.push(cell); cell = ""; fresh = true; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && src[i + 1] === "\n") i++; row.push(cell); rows.push(row); rowLine.push(start); row = []; cell = ""; fresh = true; line++; start = line; }
    else { cell += c; fresh = false; }
  }
  if (inQ) throw new Error(`Line ${quoteLine}: a quote is opened and never closed, so every row after it would be read as part of this one. Nothing was imported — fix the quoting in the file and import again.`);
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); rowLine.push(start); }
  const kept = rows.map((r, i) => ({ cells: r, line: rowLine[i] })).filter((r) => r.cells.some((x) => x.trim() !== ""));
  if (!kept.length) return [];
  const headers = kept[0].cells.map((h) => h.trim());
  /* The unclosed-quote refusal above only fires when the quotes never rebalance before the end of
     the file. A stray quote at the start of a cell, in a file that has other properly quoted fields,
     rebalances at the next one and does its damage quietly: everything between the two — commas,
     line breaks, whole rows of staff — is swallowed into a single cell, and those people are simply
     not on the register afterwards. The row shapes are what give it away: a swallowed row leaves its
     neighbour the wrong width, so the whole file is turned away by line number rather than
     part-loaded. Not a proof of correctness — a stray quote that reopens in the same column it
     closed in lands on a row of the right width — but it catches the shapes a real file arrives in. */
  const ragged = kept.slice(1).filter((r) => r.cells.length !== headers.length);
  if (ragged.length) {
    const lines = ragged.map((r) => r.line);
    const shown = lines.slice(0, 5).join(", ") + (lines.length > 5 ? ` and ${lines.length - 5} more` : "");
    throw new Error(`Line${lines.length === 1 ? "" : "s"} ${shown}: the wrong number of columns — line ${ragged[0].line} has ${ragged[0].cells.length} where the header row has ${headers.length}. This is usually a stray " at the start of a cell, which swallows the commas and line breaks after it until the next quote, so the rows in between disappear into it. Nothing was imported — fix the file and import again.`);
  }
  // unguard() here rather than in each importer: the apostrophe is an artefact of how the file was
  // written, so it should be gone before anybody reads a value out of it.
  return kept.slice(1).map((r) => { const o: Record<string, string> = {}; headers.forEach((h, i) => { o[h] = unguard((r.cells[i] ?? "").trim()); }); return o; });
}

export const CSV_TEMPLATES: Record<string, { name: string; headers: string; example: string; note: string }> = {
  catalog: { name: "Catalogue", headers: "item,gender,sku,supplier,cost,group,sizes,notes", example: `"Everyday Work Polo",Unisex,NL-POLO-01,"Northline Workwear",30.75,"Team Member|Team Leader","2XS|XS|S|M|L|XL|2XL|3XL|4XL",`, note: "sizes separated by | (or , inside quotes). group may list several staff groups separated by |; All means every group. Gender: Men's / Women's / Unisex. Re-importing the same item+gender+SKU updates cost and adds new sizes." },
  // fte is listed because the importer has always read it and the template never offered it: a
  // coordinator loading a roster of a couple of hundred nurses filled in the columns the template
  // named, imported a register with no FTE on a single row, and then had to set every one of them
  // by hand on the profile before anybody could be issued their first kit.
  //
  // The note is read on the same Settings screen that sets the ceiling, and it used to tell a
  // coordinator nursing had no limit at all. So it says what ent still is — a yearly report figure —
  // and that it turns nobody away.
  staff: { name: "Staff register", headers: "num,first,last,phone,group,dept,cc,manager,fte,style,top,pants,ccoverride,ent,start,notes", example: `00100234,Mara,Whitfield,"0400 111 222","Team Member","Front of House",CC-3010,00100199,0.8,Women's,M,12,,,2024-03-11,`, note: "num is the staff/payroll number and must be unique. style is the cut of uniform this person is offered — Men's, Women's, or Either for both — and blank means every style, as every record reads today until somebody sets it. manager is the staff number (not the name) of the person who approves their requests — nobody can raise a request in the staff app until it is set, and managers can appear anywhere in the file. fte is the combined FTE — 1.0 down to 0.1, or Casual — and is what the starting kit is worked out from for groups on the FTE table: such a row without one proposes no kit. dept + cc creates the department if it doesn't exist. start is a date, written as YYYY-MM-DD. ent is this person's own figure for the yearly report — what their drawing since 1 July is measured against — and blank uses the facility default; groups on the FTE table aren't measured against one. It limits nothing at the counter: the ceiling on what anyone holds is set under Settings → Issuing rules, the same for every group." },
  depts: { name: "Departments & cost centres", headers: "dept,cc", example: `"Housekeeping",CC-4040`, note: "One row per department or team with its cost centre code." },
  barcodes: { name: "Supplier barcodes", headers: "sku,gender,item,size,barcode", example: `NL-POLO-01,Unisex,"Everyday Work Polo",M,9357732548036`, note: "Match the catalogue row by sku (+ gender/item if a SKU is shared), then size. EAN-13 or any scannable code." },
  reorder: { name: "Reorder levels", headers: "sku,gender,item,size,reorder", example: `NL-POLO-01,Unisex,"Everyday Work Polo",M,3`, note: "Sets the per-size reorder level (overwrites). Sizes without one use the facility default." },
  opening: { name: "Opening balances", headers: "sku,gender,item,size,opening,reorder", example: `NL-POLO-01,Unisex,"Everyday Work Polo",M,12,3`, note: "Sets the opening count per size (overwrites). reorder is optional and sets the per-line reorder level." },
};
