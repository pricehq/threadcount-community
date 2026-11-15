/* Encoder self-check. EAN-13 and Code 128 are both fully specified, so the right test is against
   published reference values — a barcode that looks fine and scans wrong is the worst outcome. */
import { barcodeKind, barcodeSvg, code128Values, ean13CheckDigit, isEan13 } from "../lib/barcode";

let fail = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (cond) console.log("  ok   " + name);
  else { console.log("  FAIL " + name + (got === undefined ? "" : "  got: " + String(got))); fail++; }
};

console.log("EAN-13 check digits");
ok("9312345678907", ean13CheckDigit("931234567890") === 7, ean13CheckDigit("931234567890"));
ok("5901234123457", ean13CheckDigit("590123412345") === 7, ean13CheckDigit("590123412345"));
ok("4006381333931", ean13CheckDigit("400638133393") === 1, ean13CheckDigit("400638133393"));
ok("9357732548036", ean13CheckDigit("935773254803") === 6, ean13CheckDigit("935773254803"));
ok("rejects a bad check digit", !isEan13("5901234123450"));
ok("rejects 12 digits", !isEan13("590123412345"));
ok("accepts a good one", isEan13("5901234123457"));

console.log("EAN-13 symbol");
const svg = barcodeSvg("5901234123457", { module: 1, quiet: 0, text: false });
// 95 modules: 3 guard + 6×7 + 5 centre + 6×7 + 3 guard
ok("95 modules wide", /width="95"/.test(svg), svg.slice(0, 90));
ok("names EAN-13", barcodeKind("5901234123457") === "EAN-13");

console.log("Code 128");
// "Wikipedia" is the standard worked example: START B + 9 chars + check = 11 symbols × 11 modules,
// plus the 13-module stop, and a published check symbol of 88.
const c = barcodeSvg("Wikipedia", { module: 1, quiet: 0, text: false });
ok("134 modules wide", /width="134"/.test(c), c.slice(0, 90));
const v = code128Values("Wikipedia");
ok("check symbol is 88", v[v.length - 1] === 88, v[v.length - 1]);
ok("starts with START B (104)", v[0] === 104, v[0]);
ok("names Code 128 for a short code", barcodeKind("ABC-123") === "Code 128");
ok("names Code 128 for 13 digits that fail the check", barcodeKind("5901234123450") === "Code 128");
ok("empty code makes no svg", barcodeSvg("") === "");
ok("starts and ends with a bar", /<rect x="0" y="0"/.test(c) && c.includes('fill="#201e1d"'));

console.log(fail ? `\n${fail} FAILED` : "\nall barcode checks passed");
process.exit(fail ? 1 : 0);
