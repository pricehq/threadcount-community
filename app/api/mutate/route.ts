import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { OpError, bumpRev, demoGuard, restoreBackup, runOp } from "@/lib/ops";
import { sameOriginJson } from "@/lib/csrf";
import { allow, clientIp } from "@/lib/ratelimit";
import { recordAudit } from "@/lib/audit";
import { report } from "@/lib/glitchtip";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const csrf = sameOriginJson(req); if (csrf) return NextResponse.json({ error: csrf }, { status: 403 });
  if (parseInt(req.headers.get("content-length") || "0", 10) > 60 * 1024 * 1024) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let body: { op?: string; payload?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const op = String(body.op || "");
  if (!allow("mutate:" + user.id, 600, 60 * 1000)) return NextResponse.json({ error: "Slow down — too many changes in a minute." }, { status: 429 });
  if (op === "photo.put" && !allow("photo:" + user.facilityId, 120, 60 * 60 * 1000)) return NextResponse.json({ error: "Photo limit reached for this hour." }, { status: 429 });
  if ((op === "backup.restore" || op === "import.rows") && !allow("bulk:" + user.id, 20, 10 * 60 * 1000)) return NextResponse.json({ error: "Too many imports — wait a few minutes." }, { status: 429 });
  try {
    if (op === "backup.restore") demoGuard(user, op);
    const result = op === "backup.restore" ? await restoreBackup(user, body.payload) : await runOp(user, op, body.payload);
    // Only after it actually succeeded, and only from here: every one of the 57 ops passes through
    // this one function, so the trail can't be forgotten in a new case branch later.
    recordAudit(user, op, body.payload, clientIp(req.headers));
    // Handed back so the screen that made this change does not bounce again when it next polls.
    const rev = await bumpRev(user.facilityId);
    return NextResponse.json({ ok: true, result, rev });
  } catch (e) {
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    // Reported from here, not from instrumentation.ts: onRequestError only sees what Next itself
    // catches, and an exception caught in this handler never reaches it. Every write in the product
    // comes through this line, so without it the whole write path fails invisibly.
    report({ error: e, where: "server", url: "/api/mutate", tags: { op } });
    console.error(`[mutate ${op}]`, e);
    return NextResponse.json({ error: "Something went wrong — nothing was saved." }, { status: 500 });
  }
}
