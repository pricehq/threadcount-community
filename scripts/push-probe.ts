/* What a notification would actually say, and who it would actually reach.
 *
 *   npx tsx scripts/push-probe.ts send  <kind> <requestId|facilityId> [dueBy]
 *   npx tsx scripts/push-probe.ts audience <staffId> <switch>
 *
 * The e2e suite drives the product through HTTP, which is the right way round for everything
 * else — but a notification leaves the server for Google and never comes back, so the one thing a
 * curl cannot see is the very thing the rules are about: the words in the body, and whose phone
 * they were addressed to. This runs the REAL sender (lib/staffpushserver.ts, through the same
 * lib/push.ts the ops import), with a service-account key generated here for the occasion and
 * `fetch` replaced by a recorder, and prints what would have gone out.
 *
 * ⛔ Never prints a device token, and never sends anything anywhere: the recorder answers both the
 * token exchange and the send, so nothing leaves this machine. Refuses to run in production.
 *
 * Output is one JSON object: { count, messages: [{ staffId, title, body, url }] }.
 */
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "dotenv/config";

if (process.env.NODE_ENV === "production") {
  console.error("refusing to run in production");
  process.exit(2);
}

const [mode, a, b] = process.argv.slice(2);
if (!mode || !a) {
  console.error("usage: push-probe.ts send <kind> <id> [dueBy] | push-probe.ts audience <staffId> <switch>");
  process.exit(2);
}

/* A key of our own, made now and thrown away with the process. Nothing on this machine and nothing
 * in the repository is read: the sender only needs a well-formed key to sign an assertion with, and
 * the assertion is answered by the recorder below rather than by Google. */
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const keyFile = join(mkdtempSync(join(tmpdir(), "tc-push-probe-")), "key.json");
writeFileSync(keyFile, JSON.stringify({
  client_email: "probe@example.invalid",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  project_id: "probe",
  token_uri: "https://oauth2.example.invalid/token",
}), { mode: 0o600 });
process.env.TC_FCM_KEY_FILE = keyFile;

type Sent = { token: string; title: string; body: string; url: string };
const sent: Sent[] = [];

const real = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.includes("oauth2")) {
    return new Response(JSON.stringify({ access_token: "probe", expires_in: 3600 }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }
  if (url.includes("fcm.googleapis.com")) {
    const msg = JSON.parse(String(init?.body ?? "{}")).message || {};
    sent.push({
      token: String(msg.token || ""),
      title: String(msg.notification?.title || ""),
      body: String(msg.notification?.body || ""),
      url: String(msg.data?.url || ""),
    });
    return new Response(JSON.stringify({ name: "probe" }), { status: 200, headers: { "content-type": "application/json" } });
  }
  // Anything else is not this script's business, and letting it through keeps a surprise visible.
  return real(input as RequestInfo, init);
}) as typeof fetch;

async function main() {
  const { prisma } = await import("../lib/db");
  const { pushSenders } = await import("../lib/push");

  if (mode === "audience") {
    // Who a send of this kind would reach, counted off the same two tables the sender reads.
    const which = String(b || "approved");
    const pref = await prisma.staffNotifyPref.findUnique({ where: { staffId: a } });
    const off = pref ? (pref as unknown as Record<string, boolean>)[which] === false : false;
    const devices = off ? 0 : await prisma.staffDevice.count({
      where: { staffId: a, staff: { inactive: false, account: { isNot: null } } },
    });
    console.log(JSON.stringify({ count: devices, messages: [] }));
    return;
  }

  if (mode !== "send") { console.error("unknown mode"); process.exit(2); }

  switch (a) {
    case "decided": await pushSenders.decided(String(b)); break;
    case "waiting": await pushSenders.waiting(String(b)); break;
    case "ready": await pushSenders.ready(String(b)); break;
    case "round": await pushSenders.onRound(String(b)); break;
    case "kitcheck": await pushSenders.kitCheck(String(b), String(process.argv[5] || "2026-12-01")); break;
    default: console.error("unknown kind"); process.exit(2);
  }

  /* Whose phone each one was addressed to, resolved here so that the token itself never reaches
   * the terminal, a log file, or the suite that calls this. */
  const tokens = [...new Set(sent.map((s) => s.token))];
  const rows = tokens.length
    ? await prisma.staffDevice.findMany({ where: { token: { in: tokens } }, select: { token: true, staffId: true } })
    : [];
  const owner = new Map(rows.map((r) => [r.token, r.staffId]));
  console.log(JSON.stringify({
    count: sent.length,
    messages: sent.map((s) => ({ staffId: owner.get(s.token) || "", title: s.title, body: s.body, url: s.url })),
  }));
}

main().then(() => process.exit(0)).catch((e) => { console.error(String((e as Error).message)); process.exit(1); });
