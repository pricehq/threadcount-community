import type { NextRequest } from "next/server";

// State-changing routes only accept same-origin requests carrying JSON. Browsers send Sec-Fetch-Site on every
// request and Origin on cross-origin POSTs, so a cross-site <form> (even text/plain) can't reach them.
export function sameOriginJson(req: NextRequest, json = true): string | null {
  const sfs = req.headers.get("sec-fetch-site");
  if (sfs && sfs !== "same-origin" && sfs !== "none") return "Cross-site request refused";
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    try { if (new URL(origin).host !== host) return "Cross-site request refused"; } catch { return "Bad origin"; }
  }
  if (json && !(req.headers.get("content-type") || "").toLowerCase().includes("application/json")) return "Expected JSON";
  return null;
}
