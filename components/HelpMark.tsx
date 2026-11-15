"use client";
import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { helpFor } from "@/lib/manual-links";

/* The help mark beside every app screen's title: one square that opens the manual page about the
 * screen you are on. Only on the coordinator app (/app); the phone apps have their own furniture
 * and Help itself needs no mark. Screens with tabs (Settings, Stock, Reports, a staff record) pick
 * the page by ?tab=, which switches through router.replace, so the tab is read with
 * useSearchParams. That reader sits in its own Suspense boundary, so no screen that renders a page
 * head needs one; until it resolves the mark points at the screen's untabbed page. */
export default function HelpMark() {
  const path = usePathname() || "";
  if (!path.startsWith("/app") || path.startsWith("/app/help")) return null;
  return (
    <Suspense fallback={<Mark path={path} tab={null} />}>
      <TabbedMark path={path} />
    </Suspense>
  );
}

function TabbedMark({ path }: { path: string }) {
  const sp = useSearchParams();
  return <Mark path={path} tab={sp?.get("tab") ?? null} />;
}

function Mark({ path, tab }: { path: string; tab: string | null }) {
  return (
    <Link href={`/app/help/${helpFor(path, tab)}`} className="tc-helpmark no-print" aria-label="Help for this screen" title="Help for this screen">?</Link>
  );
}
