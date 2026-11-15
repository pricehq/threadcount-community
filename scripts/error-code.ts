/* From an error code to the event behind it, for whoever answers a support message.
 *
 *   npx tsx scripts/error-code.ts TC-1K3F-9ZQA
 *   npx tsx scripts/error-code.ts --event 3f2a9c1b7d4e...      (the other way: an event id's code)
 *   npx tsx scripts/error-code.ts --check                      (self-test: exits 1 on any mismatch)
 *
 * Prints the canonical code, the first 10 hex digits of its event id, and the GlitchTip search
 * that finds it (error_code tag). GLITCHTIP_URL and GLITCHTIP_ORG, when set, turn the search into
 * a link. The mapping itself is documented once, in lib/errorcode.ts. */
import { codeFromEventId, eventPrefixFromCode, newEventId, normaliseCode } from "../lib/errorcode";

const [arg, val] = process.argv.slice(2);

if (arg === "--check") {
  let bad = 0;
  const fixed: [string, string][] = [
    ["0000000000" + "0".repeat(22), "TC-0000-0000"],
    ["ffffffffff" + "0".repeat(22), "TC-ZZZZ-ZZZZ"],
    ["0123456789abcdef0123456789abcdef", "TC-04HM-ASW9"],
  ];
  for (const [id, want] of fixed) {
    const got = codeFromEventId(id);
    if (got !== want) { bad++; console.error(`✗ ${id} → ${got}, expected ${want}`); }
  }
  for (let i = 0; i < 2000; i++) {
    const id = newEventId();
    const code = codeFromEventId(id);
    if (eventPrefixFromCode(code) !== id.slice(0, 10)) { bad++; console.error(`✗ round trip ${id} → ${code}`); break; }
  }
  if (normaliseCode("tc 04hm asw9") !== "TC-04HM-ASW9") { bad++; console.error("✗ normalise lower case, spaces"); }
  if (normaliseCode("TC-O4HM-ASW9") !== "TC-04HM-ASW9") { bad++; console.error("✗ normalise O as 0"); }
  if (normaliseCode("TC-04HM-ASW") !== null) { bad++; console.error("✗ a short code must be refused"); }
  console.log(bad ? `FAIL ${bad}` : "error codes: all checks passed");
  process.exit(bad ? 1 : 0);
}

if (arg === "--event") {
  console.log(codeFromEventId(val || ""));
  process.exit(0);
}

const code = normaliseCode(arg || "");
if (!code) { console.error("Not an error code. Expected TC-XXXX-XXXX."); process.exit(2); }
const prefix = eventPrefixFromCode(code)!;
const q = `error_code:${code}`;
console.log(`code          ${code}`);
console.log(`event id      ${prefix}…  (first 10 hex digits)`);
console.log(`search        ${q}`);
const base = process.env.GLITCHTIP_URL, org = process.env.GLITCHTIP_ORG;
if (base && org) console.log(`link          ${base.replace(/\/$/, "")}/${org}/issues?query=${encodeURIComponent(q)}`);
