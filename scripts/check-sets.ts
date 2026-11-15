// Self-check for the set-half classifier (lib/sets.ts). Run: npx tsx scripts/check-sets.ts
// Exits 1 on any mismatch. Added 2026-10-23 when free-text garment types stopped being an
// exact-match-only lookup ("Top" and "Scrubs" used to count as neither half of a set).
import { setHalf } from "../lib/sets";

type Case = [type: string | undefined, item: string, want: "top" | "pants" | null];
const cases: Case[] = [
  // the vocabulary itself, any case
  ["Shirt", "Ward shirt", "top"],
  ["scrub TOP", "x", "top"],
  ["Trousers", "x", "pants"],
  // variants people actually type
  ["Top", "Navy", "top"],
  ["Scrub Tops", "Ceil blue", "top"],
  ["T-shirt", "x", "top"],
  ["Slacks", "x", "pants"],
  ["Bottoms", "x", "pants"],
  // unknown type → read the garment's name, like a blank type
  ["Scrubs", "Scrub top - navy", "top"],
  ["Scrubs", "Scrub pants - navy", "pants"],
  ["Uniform", "Polo", "top"],
  [undefined, "Cargo pants", "pants"],
  // known non-set types never become a half, whatever the name says
  ["Maternity top", "Maternity top", null],
  ["Maternity Tops", "Top", null],
  ["Jacket", "Top jacket", null],
  ["Dress", "Shirt dress", null],
  // a type naming both halves is ambiguous → name decides
  ["Top and pants", "Scrub set", null],
  ["Top and pants", "Scrub top", "top"],
];

let bad = 0;
for (const [type, item, want] of cases) {
  const got = setHalf({ type, item });
  if (got !== want) {
    bad++;
    console.log(`FAIL type=${JSON.stringify(type)} item=${JSON.stringify(item)}: got ${got}, want ${want}`);
  }
}
console.log(bad ? `${bad} of ${cases.length} failed` : `check-sets: all ${cases.length} cases pass`);
process.exit(bad ? 1 : 0);
