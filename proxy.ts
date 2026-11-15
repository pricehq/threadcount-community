import { NextRequest, NextResponse } from "next/server";
import { buildCsp, cspHeaderName, isFramable, newNonce } from "@/lib/csp";

/* Community edition: the edge check for the product's three surfaces. The coordinator app and
 * the phone counter need a coordinator session; the staff app carries its own session and checks
 * it in each route. Nothing else is served by this instance. */

const COOKIE_NAME = "tc_session";

function base64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64url.length / 4) * 4, "=");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function verify(raw: string | undefined, secret: string): Promise<boolean> {
  try {
    if (!raw) return false;
    const [payload, sig] = raw.split(".");
    if (!payload || !sig) return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("HMAC", key, base64urlToBytes(sig).buffer as ArrayBuffer, new TextEncoder().encode(payload));
    if (!ok) return false;
    const data = JSON.parse(new TextDecoder().decode(base64urlToBytes(payload)));
    return !!data.uid && data.exp > Date.now();
  } catch {
    return false;
  }
}

/* Every request this proxy sees gets the content-security policy (lib/csp.ts) with a fresh nonce,
 * on the response and on the forwarded request, where Next reads it for its own scripts. */
export async function proxy(req: NextRequest) {
  const nonce = newNonce();
  const policy = buildCsp(nonce, { framable: isFramable(req.nextUrl.pathname) });
  const header = cspHeaderName();
  const pass = () => {
    const forwarded = new Headers(req.headers);
    forwarded.delete("content-security-policy");
    forwarded.delete("content-security-policy-report-only");
    forwarded.set(header, policy);
    forwarded.set("x-nonce", nonce); // for server components that render a <script> themselves (JsonLd)
    return NextResponse.next({ request: { headers: forwarded } });
  };
  const res = await gate(req, pass);
  res.headers.set(header, policy);
  return res;
}

/** True for `base` itself and anything below it — "/m" and "/m/count", never "/my". */
function under(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(base + "/");
}

async function gate(req: NextRequest, pass: () => NextResponse): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  // Everything under /api/staff belongs to the staff app, which has its own session in its own
  // cookie; each route there authorises itself. /api/health, /api/rev and /api/app-info answer
  // without an account by design, and /api/auth is how someone gets a session at all.
  const publicStaff = pathname.startsWith("/api/staff/");
  const publicApi = pathname.startsWith("/api/auth") || pathname === "/api/health" || pathname === "/api/rev" || pathname === "/api/app-info" || publicStaff;
  const publicM = pathname === "/m/login" || pathname === "/m/signup";
  const needsAuth = under(pathname, "/app") || (under(pathname, "/m") && !publicM) || under(pathname, "/print") || (under(pathname, "/api") && !publicApi);
  if (!needsAuth) return pass();

  const secret = process.env.SESSION_SECRET;
  const ok = secret ? await verify(req.cookies.get(COOKIE_NAME)?.value, secret) : false;
  if (ok) return pass();

  if (pathname.startsWith("/api")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = under(pathname, "/m") ? "/m/login" : "/auth";
  url.searchParams.set("next", pathname);
  const res = NextResponse.redirect(url);
  if (req.cookies.get(COOKIE_NAME)) res.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return res;
}

export const config = {
  /* Every page, so every page gets the policy; the gated areas whole. The gate decides by path
   * segment (under()): a prefix test would send "/my" (the staff app) to the coordinator sign-in. */
  matcher: [
    "/app/:path*", "/m", "/m/:path*", "/print/:path*", "/api/:path*",
    "/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|avif|ico|svg|woff2?|ttf|otf|mp4|webm)$).*)",
  ],
};
