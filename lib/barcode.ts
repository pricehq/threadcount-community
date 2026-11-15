// Barcode symbologies, rendered as SVG so a label prints crisply at any size and needs no font.
//
// A garment nobody can scan silently vanishes from every count, so a reprint has to reproduce the
// SAME symbol the supplier printed: a valid 13-digit code goes out as EAN-13 (what the supplier's
// own label was), anything else as Code 128 set B.

const EAN_A = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_B = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const EAN_C = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
// Which of the first six digits use the B table, chosen by the leading digit.
const EAN_PARITY = ["AAAAAA", "AABABB", "AABBAB", "AABBBA", "ABAABB", "ABBAAB", "ABBBAA", "ABABAB", "ABABBA", "ABBABA"];

export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += +first12[i] * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}
export function isEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === +code[12];
}

/* A barcode for a garment that arrived without one.
 *
 * Plenty of stock reaches a linen room unlabelled — the cafe shirts came with nothing at all — and
 * a garment nobody can scan drops out of every count. So the room prints its own, and the number it
 * prints has to be one that can never turn out to belong to somebody else's product.
 *
 * GS1 reserves the prefixes 20-29 for restricted circulation: codes used inside one business, on
 * its own shelves, which GS1 undertakes never to issue to a manufacturer. That is exactly this
 * case, so a generated code starts 29 and carries a real check digit. Two things follow from it
 * being a genuine EAN-13 rather than an invented string: any scanner in the building reads it
 * without being taught anything, and it is the width the label sheet was laid out around.
 *
 * The number says nothing about the garment, on purpose. Encoding the item and size would make the
 * printed label wrong the moment a size is removed or a product renamed, and the binding in the
 * database already knows what it points at. */
export function inHouseEan13(seq: number): string {
  const body = "29" + String(Math.max(1, Math.floor(seq))).padStart(10, "0");
  return body + ean13CheckDigit(body);
}

/** True for a code this facility printed itself, rather than one that came in on a garment. */
export const isInHouse = (code: string) => /^29\d{11}$/.test(code) && isEan13(code);

/** EAN-13 as a run of 1/0 modules, 95 wide. */
function ean13Bits(code: string): string {
  const parity = EAN_PARITY[+code[0]];
  let out = "101";
  for (let i = 1; i <= 6; i++) out += (parity[i - 1] === "A" ? EAN_A : EAN_B)[+code[i]];
  out += "01010";
  for (let i = 7; i <= 12; i++) out += EAN_C[+code[i]];
  return out + "101";
}

// Code 128: 107 symbols of 11 modules each, given as bar/space run lengths.
const C128 = ["212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214", "211232", "233111"];
const C128_STOP = "2331112";

/** Symbol values for a Code 128 set B string, START B first, check symbol last. */
export function code128Values(text: string): number[] {
  const vals = [104]; // START B
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    vals.push(c >= 32 && c <= 127 ? c - 32 : 0);
  }
  let sum = vals[0];
  for (let i = 1; i < vals.length; i++) sum += vals[i] * i;
  vals.push(sum % 103); // check symbol
  return vals;
}

/** Code 128 set B as a run of 1/0 modules. Set B covers ASCII 32–127, which is every code we bind. */
function code128Bits(text: string): string {
  const vals = code128Values(text);
  let bits = "";
  for (const v of vals) {
    let bar = true;
    for (const run of C128[v]) { bits += (bar ? "1" : "0").repeat(+run); bar = !bar; }
  }
  let bar = true;
  for (const run of C128_STOP) { bits += (bar ? "1" : "0").repeat(+run); bar = !bar; }
  return bits;
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/** Bars plus the human-readable code beneath, as a self-contained SVG string. */
export function barcodeSvg(code: string, opts: { height?: number; module?: number; quiet?: number; text?: boolean } = {}): string {
  const clean = String(code || "").trim();
  if (!clean) return "";
  const ean = isEan13(clean);
  const bits = ean ? ean13Bits(clean) : code128Bits(clean);
  const m = opts.module ?? 2;
  const h = opts.height ?? 54;
  const quiet = opts.quiet ?? 10;
  const showText = opts.text !== false;
  const w = bits.length * m + quiet * 2 * m;
  const textH = showText ? 16 : 0;
  const rects: string[] = [];
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === "0") { i++; continue; }
    let run = 0;
    while (i + run < bits.length && bits[i + run] === "1") run++;
    rects.push(`<rect x="${(quiet + i) * m}" y="0" width="${run * m}" height="${h}" fill="#201e1d"/>`);
    i += run;
  }
  const label = showText
    ? `<text x="${w / 2}" y="${h + 13}" text-anchor="middle" font-family="Archivo, system-ui, sans-serif" font-size="12" font-weight="600" letter-spacing="1.5" fill="#201e1d">${esc(clean)}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h + textH}" viewBox="0 0 ${w} ${h + textH}" role="img" aria-label="Barcode ${esc(clean)}"><rect width="${w}" height="${h + textH}" fill="#ffffff"/>${rects.join("")}${label}</svg>`;
}

export const barcodeKind = (code: string) => (isEan13(code) ? "EAN-13" : "Code 128");
