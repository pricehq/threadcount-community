/* Analytics privacy self-check: `npx tsx scripts/check-analytics.ts`.
 *
 * The before-send (lib/analyticsscrub.ts) is the only thing standing between a page and the
 * analytics database, so its rules are checked here against the payloads the tracker really
 * builds: a record id in the address, a token in the query, an email in an event, an identify on
 * the public site, the recorder on a screen full of people. Exit code 1 on any failure. */
import { cleanData, ctaFor, recorderAllowed, scrubPath, scrubPayload, scrubReferrer, scrubUrl } from "../lib/analyticsscrub";
import { ageBucket, base32, facilityAnalyticsId, sizeBucket } from "../lib/analyticsid";

let fail = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (cond) console.log("  ok   " + name);
  else { console.log("  FAIL " + name + (got === undefined ? "" : "  got: " + JSON.stringify(got))); fail++; }
};

const SITE = "6dfdcd93-6931-4eda-bb0d-0a6278c27613";
const APP = "31c1f581-2bcc-48bb-a914-70da40c0359a";
const CUID = "cmtpldt9f00iab3xk2m7qz1rt";
const app = (href: string, manual = true) => ({ site: "app" as const, website: APP, href, manualPageview: manual });
const mkt = (href: string, manual = true) => ({ site: "marketing" as const, website: SITE, href, manualPageview: manual });

console.log("paths");
ok("person id → :id", scrubPath(`/m/person/${CUID}/return`) === "/m/person/:id/return", scrubPath(`/m/person/${CUID}/return`));
ok("uuid → :id", scrubPath("/app/orders/0ba1da31-632d-4942-9305-35e5616ab101") === "/app/orders/:id");
ok("query and hash dropped", scrubPath("/app/staff?next=/x#top") === "/app/staff");
ok("ward name → :ward", scrubPath("/m/round/Ward%203A") === "/m/round/:ward", scrubPath("/m/round/Ward%203A"));
ok("email segment → :id", scrubPath("/x/jane.smith@example.com") === "/x/:id");
ok("help slugs survive", scrubPath("/app/help/counter/counting-stock-with-the-phone") === "/app/help/counter/counting-stock-with-the-phone");
ok("route names survive", scrubPath("/what-it-does") === "/what-it-does");

console.log("urls");
ok("app keeps no query", scrubUrl(`https://threadcount.tech/m/person/${CUID}?next=/m&utm_source=x`, "app", "https://threadcount.tech/").url === "/m/person/:id");
const m1 = scrubUrl("https://threadcount.tech/pricing?utm_source=News&utm_medium=email&token=abc&gclid=XYZ", "marketing", "https://threadcount.tech/");
ok("marketing keeps sanitised utm only", m1.url === "/pricing?utm_source=news&utm_medium=email", m1.url);
ok("gclid → paid=google", m1.paid === "google", m1.paid);
ok("reset token never survives", scrubUrl("https://threadcount.tech/reset?t=abcdef123", "marketing", "https://threadcount.tech/").url === "/reset");

console.log("referrers");
ok("own referrer → template", scrubReferrer(`https://threadcount.tech/app/staff/${CUID}?q=1`) === "https://threadcount.tech/app/staff/:id");
ok("relative own referrer → template", scrubReferrer(`/m/person/${CUID}`) === "https://threadcount.tech/m/person/:id");
ok("external → origin only", scrubReferrer("https://www.google.com/search?q=jane+smith") === "https://www.google.com");
ok("android shell kept as origin", scrubReferrer("http://localhost/index.html") === "http://localhost");

console.log("event data");
const d = cleanData({ screen: "desktop", reason: "credentials", email: "a@b.co", name: "Jane", step: 2, placement: "jane@example.com", kind: CUID, surface: "android" });
ok("allow-listed words kept", d.screen === "desktop" && d.reason === "credentials" && d.step === 2 && d.surface === "android", d);
ok("unknown keys dropped", !("email" in d) && !("name" in d), d);
ok("an email value dropped", !("placement" in d), d);
ok("an id value dropped", !("kind" in d), d);

console.log("before-send");
const pv = scrubPayload("event", { website: SITE, url: `https://threadcount.tech/m/person/${CUID}?next=/m`, title: "Jane Smith — ThreadCount", hostname: "www.threadcount.tech", referrer: "", screen: "412x915", language: "en-AU", tag: "android" }, app(`https://threadcount.tech/m/person/${CUID}`));
ok("pageview re-addressed to the app website", pv?.website === APP, pv);
ok("pageview url templated", pv?.url === "/m/person/:id", pv);
ok("title is the template, not the page title", pv?.title === "/m/person/:id", pv);
ok("hostname canonical", pv?.hostname === "threadcount.tech", pv);
ok("an automatic pageview dies", scrubPayload("event", { website: SITE, url: "/pricing" }, mkt("https://threadcount.tech/pricing", false)) === null);
ok("an event survives without the manual flag", scrubPayload("event", { website: SITE, name: "cta_click", url: "/", data: { cta: "signup" } }, mkt("https://threadcount.tech/", false))?.name === "cta_click");
ok("a malformed event name dies", scrubPayload("event", { website: SITE, name: "Jane Smith signed up", url: "/" }, mkt("https://threadcount.tech/")) === null);
const idm = scrubPayload("identify", { website: SITE, id: "fa_abcdefghijklmnop", data: { role: "admin" } }, mkt("https://threadcount.tech/auth"));
ok("identify is refused on the public site", idm === null, idm);
const ida = scrubPayload("identify", { website: APP, id: "fa_abcdefghijklmnop", url: "/app", data: { role: "admin", demo: "no", email: "a@b.co", facility: "St Mary's" } }, app("https://threadcount.tech/app"));
ok("identify on the app keeps the facility id", ida?.id === "fa_abcdefghijklmnop", ida);
ok("identify keeps fixed dims only", JSON.stringify(ida?.data) === JSON.stringify({ role: "admin", demo: "no" }), ida?.data);
const bad = scrubPayload("event", { website: APP, id: "jane@example.com", name: "signin", url: "/m" }, app("https://threadcount.tech/m"));
ok("a non-facility id is stripped", bad !== null && !("id" in bad), bad);
const mid = scrubPayload("event", { website: SITE, id: "fa_abcdefghijklmnop", name: "signin", url: "/auth" }, mkt("https://threadcount.tech/auth"));
ok("the facility id never rides on a public page", mid !== null && !("id" in mid), mid);
const perf = scrubPayload("performance", { website: APP, url: `https://threadcount.tech/app/staff/${CUID}`, lcp: 1200, data: { x: 1 } }, app(`https://threadcount.tech/app/staff/${CUID}`));
ok("web vitals kept, templated, no data", perf?.lcp === 1200 && perf?.url === "/app/staff/:id" && !("data" in perf), perf);
ok("an unknown payload type dies", scrubPayload("session", { website: APP }, app("https://threadcount.tech/app")) === null);

console.log("recorder gate");
ok("home page records", recorderAllowed("https://threadcount.tech/", "marketing"));
ok("sign-up records", recorderAllowed("https://threadcount.tech/auth?mode=signup", "marketing"));
ok("utm query records", recorderAllowed("https://threadcount.tech/pricing?utm_source=news", "marketing"));
ok("sign-in with ?next= does not", !recorderAllowed("https://threadcount.tech/auth?next=/app/staff", "marketing"));
ok("reset never records", !recorderAllowed("https://threadcount.tech/reset?t=x", "marketing"));
ok("another host never records", !recorderAllowed("https://evil.example/", "marketing"));
ok("http never records", !recorderAllowed("http://threadcount.tech/", "marketing"));
ok("app sign-in records", recorderAllowed("https://threadcount.tech/m/login", "app"));
ok("app manual records", recorderAllowed("https://threadcount.tech/app/help/counter/counting-stock", "app"));
ok("the staff list never records", !recorderAllowed("https://threadcount.tech/app/staff", "app"));
ok("a person never records", !recorderAllowed(`https://threadcount.tech/m/person/${CUID}`, "app"));
ok("the stock screen never records", !recorderAllowed("https://threadcount.tech/m/stock", "app"));
ok("an app screen with a query never records", !recorderAllowed("https://threadcount.tech/m/login?next=/m", "app"));

console.log("calls to action");
ok("sign-up link", ctaFor("/auth?mode=signup") === "signup");
ok("log-in link", ctaFor("/auth") === "login");
ok("demo", ctaFor("/api/auth/demo?as=admin") === "demo");
ok("github", ctaFor("https://github.com/pricehq/threadcount-community") === "github");
ok("a docs page is not a CTA", ctaFor("/docs/start") === null);

console.log("facility id");
ok("base32 of 'foobar' (RFC 4648)", base32(new TextEncoder().encode("foobar")) === "mzxw6ytboi", base32(new TextEncoder().encode("foobar")));
const fa = facilityAnalyticsId("cmtpldt9f00iab", "test-key");
ok("fa_ + 16 base32", !!fa && /^fa_[a-z2-7]{16}$/.test(fa), fa);
ok("stable for the same key", fa === facilityAnalyticsId("cmtpldt9f00iab", "test-key"));
ok("different under another key", fa !== facilityAnalyticsId("cmtpldt9f00iab", "other-key"));
ok("no key → no id", facilityAnalyticsId("cmtpldt9f00iab", "") === null);
ok("size buckets", sizeBucket(1) === "1-10" && sizeBucket(51) === "51-200" && sizeBucket(5000) === "1000+" && sizeBucket(0) === undefined);
const now = new Date("2026-09-29T00:00:00Z");
ok("age buckets", ageBucket(new Date("2026-09-25T00:00:00Z"), now) === "<7d" && ageBucket(new Date("2025-01-01T00:00:00Z"), now) === "12m+");

console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
