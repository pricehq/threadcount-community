/* The synthetic-monitoring ("canary") pass past the human check, proved both ways.
 *
 * A nightly job signs up, resets a password and sends the contact form as one fixed address, to
 * prove those journeys still work end to end. Turnstile exists to stop exactly that kind of
 * automation, so the job carries a long secret in a header instead. This checks that the pass is
 * as narrow as it claims: off unless configured, the exact secret AND the exact address together,
 * compared in constant time, and rate-limited.
 *
 *   npx tsx scripts/check-canary.ts
 */
import { spawnSync } from "child_process";
import { canaryPass, isCanaryEmail, CANARY_HEADER } from "../lib/canary";

let pass = 0, fail = 0;
const ok = (n: string) => { pass++; console.log("  ✓ " + n); };
const bad = (n: string, got: unknown, want: unknown) => { fail++; console.log(`  ✗ ${n} :: got ${got}, want ${want}`); };
const eq = (n: string, got: unknown, want: unknown) => (String(got) === String(want) ? ok(n) : bad(n, got, want));

const TOKEN = "c".repeat(20) + "0123456789abcdefghijklmnopqrstuvwxyz"; // 56 chars
const EMAIL = "canary@example.org";
const h = (v?: string) => new Headers(v === undefined ? {} : { [CANARY_HEADER]: v });
let ipN = 0;
const freshIp = () => `198.51.100.${++ipN}`; // a new address per case, so the limiter never interferes

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  try { fn(); } finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}

if (process.argv[2] !== "passes") {
console.log("off unless configured");
withEnv({ CANARY_TOKEN: undefined, CANARY_EMAIL: undefined }, () => {
  eq("no variables: the right header and address are refused", canaryPass(h(TOKEN), EMAIL, freshIp()), false);
  eq("no variables: nothing is a canary address", isCanaryEmail(EMAIL), false);
});
withEnv({ CANARY_TOKEN: TOKEN, CANARY_EMAIL: undefined }, () => {
  eq("token without an address: refused", canaryPass(h(TOKEN), EMAIL, freshIp()), false);
});
withEnv({ CANARY_TOKEN: undefined, CANARY_EMAIL: EMAIL }, () => {
  eq("address without a token: refused", canaryPass(h(TOKEN), EMAIL, freshIp()), false);
});
withEnv({ CANARY_TOKEN: "short-token", CANARY_EMAIL: EMAIL }, () => {
  eq("a token shorter than 32 characters disables the pass", canaryPass(h("short-token"), EMAIL, freshIp()), false);
});

withEnv({ CANARY_TOKEN: TOKEN, CANARY_EMAIL: EMAIL }, () => {
  console.log("configured");
  eq("right token + right address: passes", canaryPass(h(TOKEN), EMAIL, freshIp()), true);
  eq("address compared case- and space-insensitively", canaryPass(h(TOKEN), "  Canary@Example.ORG ", freshIp()), true);
  eq("missing header: refused", canaryPass(h(), EMAIL, freshIp()), false);
  eq("empty header: refused", canaryPass(h(""), EMAIL, freshIp()), false);
  eq("wrong token: refused", canaryPass(h(TOKEN.slice(0, -1) + "X"), EMAIL, freshIp()), false);
  eq("token prefix: refused", canaryPass(h(TOKEN.slice(0, 40)), EMAIL, freshIp()), false);
  eq("token with extra characters: refused", canaryPass(h(TOKEN + "x"), EMAIL, freshIp()), false);
  eq("right token + another address: refused", canaryPass(h(TOKEN), "someone@example.org", freshIp()), false);
  eq("right token + look-alike address: refused", canaryPass(h(TOKEN), "canary@example.org.evil.test", freshIp()), false);
  eq("right token + address as a non-string: refused", canaryPass(h(TOKEN), { email: EMAIL }, freshIp()), false);
  eq("right token + missing address: refused", canaryPass(h(TOKEN), undefined, freshIp()), false);
  eq("isCanaryEmail: the configured address", isCanaryEmail(" CANARY@example.org"), true);
  eq("isCanaryEmail: anyone else", isCanaryEmail("canary@example.com"), false);

  console.log("rate limits");
  const ip = freshIp();
  for (let i = 0; i < 5; i++) canaryPass(h("wrong-" + i), EMAIL, ip);
  eq("after 5 bad tokens from one address, even the right token is refused there", canaryPass(h(TOKEN), EMAIL, ip), false);
  eq("…while another address still passes", canaryPass(h(TOKEN), EMAIL, freshIp()), true);
  // Bad attempts so far: 3 wrong tokens + 4 wrong addresses + the 5 above = 12. Eight more, each
  // from a new address, reach the ceiling of 20 — with 27 passes still unused, so a refusal now can
  // only come from that ceiling.
  for (let i = 0; i < 8; i++) canaryPass(h("wrong-spread-" + i), EMAIL, freshIp());
  eq("after 20 bad attempts from anywhere, the pass is shut for everyone", canaryPass(h(TOKEN), EMAIL, freshIp()), false);
});
}

// The hourly ceiling on passes needs a limiter nobody has tripped, so it runs in a fresh process.
if (process.argv[2] === "passes") {
  process.env.CANARY_TOKEN = TOKEN; process.env.CANARY_EMAIL = EMAIL;
  let passed = 0;
  for (let i = 0; i < 60; i++) if (canaryPass(h(TOKEN), EMAIL, freshIp())) passed++;
  process.stdout.write(`PASSES=${passed}\n`);
  process.exit(0);
}
{
  const r = spawnSync(process.execPath, [...process.execArgv, process.argv[1], "passes"], { encoding: "utf8" });
  eq("at most 30 passes an hour in total", /PASSES=(\d+)/.exec(r.stdout)?.[1], 30);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 && pass > 0 ? 0 : 1);
