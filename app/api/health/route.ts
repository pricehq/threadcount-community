import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/* Is this server actually able to do its job?
 *
 * The deploy probes /app, which proves the process is serving HTML — but /app renders a redirect to
 * the sign-in page whether or not Prisma can reach the database, so the one failure that takes the
 * whole product down is exactly the one that probe cannot see. This asks the database a question
 * instead, and answers 503 when it cannot.
 *
 * No auth and no cache on purpose: it is watched continuously by an uptime monitor with no account,
 * and it must never answer from a cached success. It is listed in proxy.ts's `publicApi` for the
 * same reason. Nothing about the facility, the schema or the error is returned — a monitor needs a
 * status code, and an unauthenticated caller is owed nothing more.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[health] database unreachable:", (e as Error).message);
    return NextResponse.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
