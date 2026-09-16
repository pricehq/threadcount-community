import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { allow } from "@/lib/ratelimit";
import { gtinInfo } from "@/lib/compute";

export const dynamic = "force-dynamic";

export type LookupResult = {
  code: string;
  gtin: ReturnType<typeof gtinInfo>;
  enabled: boolean;          // is public lookup turned on for this facility
  found: boolean;
  name?: string;
  brand?: string;
  category?: string;
  source?: string;
  note?: string;             // why there's no result, in plain words
};

const TIMEOUT_MS = 4500;
const cache = new Map<string, { at: number; v: Omit<LookupResult, "enabled" | "gtin" | "code"> }>();
const CACHE_MS = 12 * 60 * 60 * 1000;

async function getJson(url: string): Promise<unknown | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { accept: "application/json", "user-agent": "ThreadCount/1.0 (uniform stock management)" }, cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(t); }
}

/** UPCitemdb's keyless trial tier — small daily quota per server IP, so misses are expected. */
async function upcItemDb(gtin: string) {
  const j = await getJson(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(gtin)}`) as { items?: { title?: string; brand?: string; category?: string }[] } | null;
  const it = j?.items?.[0];
  if (!it?.title) return null;
  return { name: String(it.title).slice(0, 160), brand: String(it.brand || "").slice(0, 80), category: String(it.category || "").slice(0, 80), source: "UPCitemdb" };
}

/** Open Products Facts — the non-food sibling of Open Food Facts; open data, no key. */
async function openProductsFacts(gtin: string) {
  const j = await getJson(`https://world.openproductsfacts.org/api/v2/product/${encodeURIComponent(gtin)}.json?fields=product_name,brands,categories`) as { status?: number; product?: { product_name?: string; brands?: string; categories?: string } } | null;
  const pr = j?.product;
  if (j?.status !== 1 || !pr?.product_name) return null;
  return { name: String(pr.product_name).slice(0, 160), brand: String(pr.brands || "").slice(0, 80), category: String(pr.categories || "").slice(0, 80), source: "Open Products Facts" };
}

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const gtin = gtinInfo(req.nextUrl.searchParams.get("code") || "");
  const base = { code: gtin.code, gtin, found: false } as LookupResult;
  if (!gtin.code) return NextResponse.json({ ...base, enabled: false, note: "No barcode given." });

  const fac = await prisma.facility.findUnique({ where: { id: user.facilityId }, select: { barcodeLookup: true } });
  const enabled = !!fac?.barcodeLookup;
  if (!enabled) return NextResponse.json({ ...base, enabled: false, note: "Product lookup is off. Turn it on in Settings → Data if you want ThreadCount to ask a public barcode database for a name." });
  // Only real retail GTINs are worth sending anywhere; a mis-read or an in-house code never matches.
  if (!gtin.valid || !["EAN-13", "UPC-A", "EAN-8", "GTIN-14"].includes(gtin.kind)) {
    return NextResponse.json({ ...base, enabled, note: gtin.kind ? "The check digit doesn't match, so this wasn't looked up — scan it again." : "Not a standard retail barcode, so there's nothing to look up. Type the details in." });
  }
  if (!allow("lookup:" + user.facilityId, 120, 60 * 60 * 1000)) return NextResponse.json({ ...base, enabled, note: "Too many lookups this hour — type the details in for now." }, { status: 429 });

  const hit = cache.get(gtin.digits);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json({ ...base, enabled, ...hit.v });

  let found = await upcItemDb(gtin.digits);
  if (!found) found = await openProductsFacts(gtin.digits);
  const v = found
    ? { found: true, ...found }
    : { found: false, note: "No public listing for this barcode — normal for workwear and hospital uniforms. Type the details in once and the barcode stays bound." };
  cache.set(gtin.digits, { at: Date.now(), v });
  if (cache.size > 500) for (const k of [...cache.keys()].slice(0, 100)) cache.delete(k);
  return NextResponse.json({ ...base, enabled, ...v });
}
