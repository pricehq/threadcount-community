/* The manual's fixed shape, and which page is about which app screen. Client-safe: no file system
 * here, so the help mark on every screen can import it. The pages themselves are Markdown under
 * docs/manual/<section>/<slug>.md and are read by lib/manual.ts on the server. */

export const SECTIONS = [
  { id: "start", title: "Start here", blurb: "The whole product in one page, setting a room up, the two roles and a first order." },
  { id: "counter", title: "The counter", blurb: "Issuing, returns, requests, approvals, the pickup call list, rounds and slips." },
  { id: "stock", title: "Stock", blurb: "The catalogue, barcodes, reorder levels, stocktakes, ordering and receiving." },
  { id: "people", title: "People", blurb: "The staff register, groups and routes, the entitlement rule and managers." },
  { id: "reports", title: "Reports and finance", blurb: "Every report, cost centres, the journal and the month-end pack." },
  { id: "apps", title: "Apps", blurb: "The counter app, the staff app, and scanning in each browser." },
  { id: "account", title: "Account and plan", blurb: "Users, two-factor, single sign-on, billing, backups and deleting." },
  { id: "selfhost", title: "Self-hosting", blurb: "Installing the Community edition, updating, backups, email and configuration." },
  { id: "reference", title: "Reference", blurb: "CSV templates, the glossary, and the keyboard and scanner." },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];
export const sectionTitle = (id: string) => SECTIONS.find((s) => s.id === id)?.title ?? id;

/** The public site, for links out of the in-app manual to pages only the website has. */
export const SITE_ORIGIN = "https://threadcount.tech";

/** Old Settings tab ids, and the section each now lives in. */
export const LEGACY_SETTINGS_TAB: Record<string, string> = {
  general: "facility",
  groups: "issuing",
  suppliers: "catalogue",
  locations: "places",
  departments: "places",
  account: "people",
  "sign-in": "people",
  sso: "people",
  security: "people",
  activity: "audit",
};

const SETTINGS_PAGE: Record<string, string> = {
  facility: "reports/journal-export",
  issuing: "people/groups-and-routes",
  catalogue: "stock/suppliers",
  places: "reports/cost-centres",
  people: "account/users",
  data: "account/export-and-backup",
  audit: "account/export-and-backup",
  plan: "account/plan-and-billing",
};

/** The manual page about the screen at `path` (and its `?tab=`). First match wins; falls back to
 *  the manual's first page. */
export function helpFor(path: string, tab?: string | null): string {
  const p = path.replace(/\/+$/, "") || "/app";
  const t = tab || "";
  if (p === "/app/settings") {
    const section = LEGACY_SETTINGS_TAB[t] || t || "facility";
    return SETTINGS_PAGE[section] || SETTINGS_PAGE.facility;
  }
  const rules: [RegExp, string, string?][] = [
    [/^\/app$/, "counter/pickup-call-list"],
    [/^\/app\/rounds(\/|$)/, "counter/delivery-rounds"],
    [/^\/app\/(counter|issue)(\/|$)/, "counter/issue-a-garment"],
    [/^\/app\/stocktake(\/|$)/, "stock/stocktakes"],
    [/^\/app\/stock$/, "stock/stocktakes", "count"],
    [/^\/app\/stock$/, "stock/catalogue-sizes-and-cuts", "locations"],
    [/^\/app\/stock\/[^/]+/, "stock/reorder-levels"],
    [/^\/app\/stock$/, "stock/catalogue-sizes-and-cuts"],
    [/^\/app\/orders\/all$/, "stock/order-list"],
    [/^\/app\/orders\/[^/]+/, "stock/receiving-and-back-orders"],
    [/^\/app\/orders$/, "stock/order-list"],
    [/^\/app\/staff\/[^/]+/, "counter/requests-from-staff", "requests"],
    [/^\/app\/staff\/[^/]+/, "people/managers", "details"],
    [/^\/app\/staff\/[^/]+/, "people/entitlement-rule"],
    [/^\/app\/staff$/, "people/staff-register"],
    [/^\/app\/requests(\/|$)/, "counter/requests-from-staff"],
    [/^\/app\/report$/, "reports/the-nine-reports"],
    [/^\/app\/checkout(\/|$)/, "account/plan-and-billing"],
    [/^\/app\/activity(\/|$)/, "account/export-and-backup"],
  ];
  return rules.find(([re, , onTab]) => re.test(p) && (onTab === undefined || onTab === t))?.[1] ?? "start/threadcount-in-one-page";
}
