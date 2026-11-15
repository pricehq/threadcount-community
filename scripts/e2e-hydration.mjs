#!/usr/bin/env node
/* Hydration: the counter screens have to hydrate cleanly both in a browser and inside the Android
   shell, and in a browser whose clock is in another time zone from the server's.

   A page that renders one thing on the server and another on the phone's first client render throws
   React's #418 ("the server rendered HTML didn't match the client"), React throws the server HTML
   away and re-renders from scratch, and the error tracker files it. The Scan tab did exactly that
   under the Android shell: the server can't see window.Capacitor, so it drew the browser <video>,
   and the shell's first render left it out.

   The shell is stood in for by defining window.Capacitor before any script runs, which is all
   lib/nativescan's isNative() looks at.

   Needs a headless Chromium through playwright-core, which is not a dependency of this repo:
     PLAYWRIGHT_DIR=/path/with/node_modules BASE=http://127.0.0.1:3111 node scripts/e2e-hydration.mjs
*/
import { createRequire } from "node:module";
import path from "node:path";

const BASE = process.env.BASE || "http://127.0.0.1:3111";
const req = createRequire(path.resolve(process.env.PLAYWRIGHT_DIR || process.cwd(), "noop.js"));
let chromium;
try { ({ chromium } = req("playwright-core")); }
catch { console.error("FATAL: playwright-core not found. Set PLAYWRIGHT_DIR to a folder whose node_modules has it."); process.exit(2); }

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  ✓ ${m}`); };
const bad = (m, why) => { fail++; console.log(`  ✗ ${m} :: ${why}`); };

// A facility of its own, signed up through the same door a person uses.
const ts = Date.now();
const r = await fetch(`${BASE}/api/auth/signup`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": `10.8.${ts % 250}.${(ts >> 8) % 250}` },
  body: JSON.stringify({ first: "Hyd", last: "Ration", facility: `Hydration Works ${ts}`, email: `hydration${ts}@example.com`, password: "password123" }),
});
const setCookie = r.headers.getSetCookie?.() || [];
if (!r.ok || !setCookie.length) { console.error(`FATAL: signup failed (${r.status}) ${await r.text()}`); process.exit(1); }
const host = new URL(BASE).hostname;
const cookies = setCookie.map((c) => { const [nv] = c.split(";"); const i = nv.indexOf("="); return { name: nv.slice(0, i), value: nv.slice(i + 1), domain: host, path: "/" }; });

const PAGES = ["/m", "/m/scan", "/m/work", "/m/stock", "/m/people", "/m/count", "/m/more", "/m/settings", "/m/catalogue", "/m/reorder"];
const MODES = [
  { name: "Android shell", native: true, tz: undefined },
  { name: "browser", native: false, tz: undefined },
  { name: "browser in Honolulu", native: false, tz: "Pacific/Honolulu" },
  { name: "browser in Kiritimati", native: false, tz: "Pacific/Kiritimati" },
];
const HYDRATION = /Minified React error #(418|419|421|422|423|425)|Hydration failed|hydrat(ed|ion) .*(mismatch|didn't match)|didn't match the client/i;

const browser = await chromium.launch();
try {
  for (const mode of MODES) {
    console.log(`== ${mode.name}`);
    const ctx = await browser.newContext({ timezoneId: mode.tz, viewport: { width: 412, height: 915 }, permissions: [] });
    await ctx.addCookies(cookies);
    if (mode.native) {
      // Enough of Capacitor for isNative() to answer true, and no plugins: the scanner then answers
      // "native-unavailable", which is the shell-without-MLKit path, after hydration.
      await ctx.addInitScript(() => {
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "android", isPluginAvailable: () => false, Plugins: {}, registerPlugin: () => new Proxy({}, { get: () => () => Promise.reject(new Error("not available")) }) };
      });
    }
    for (const p of PAGES) {
      const page = await ctx.newPage();
      const errs = [];
      page.on("console", (m) => { if (m.type() === "error" && HYDRATION.test(m.text())) errs.push(m.text()); });
      page.on("pageerror", (e) => { if (HYDRATION.test(String(e?.message || e))) errs.push(String(e.message || e)); });
      const res = await page.goto(BASE + p, { waitUntil: "networkidle" }).catch((e) => ({ status: () => 0, e }));
      await page.waitForTimeout(600);
      const status = res?.status?.() ?? 0;
      if (status !== 200) bad(`${p} loads`, `HTTP ${status}${res?.e ? " " + String(res.e.message).split("\n")[0] : ""}`);
      else if (errs.length) bad(`${p} hydrates`, errs[0].slice(0, 200));
      else ok(`${p} hydrates`);
      // The fix must not cost the browser its camera: once hydrated, the web scanner's <video> is drawn.
      if (p === "/m/scan" && !mode.native) {
        const n = await page.locator("video").count();
        if (n === 1) ok("/m/scan draws the browser camera after hydrating"); else bad("/m/scan draws the browser camera after hydrating", `${n} video elements`);
      }
      await page.close();
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`\nhydration: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
