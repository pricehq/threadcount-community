"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GROUND, INK } from "@/components/m";
import { useStaff } from "@/lib/staffclient";

/* The two-item nav from the design, shown only inside the manager area.
 *
 * A ward manager is a staff member who also approves — they wear the uniform too — so this does
 * not replace the app's own four-item nav. It appears while they are in Approvals or Ward, and
 * the app bar's back chevron takes them home. The prototype's role-switching chips were a
 * prototyping device; building a separate manager shell around them would give one person two
 * apps to remember.
 */
const ITEMS: [string, string, React.ReactNode][] = [
  ["/my/approvals", "Approvals", <path key="a" d="m4 12 5 5L20 6" />],
  ["/my/ward", "Ward", <g key="w"><path d="M5 20V10" /><path d="M12 20V4" /><path d="M19 20v-7" /></g>],
];

export default function ManagerNav() {
  const path = usePathname();
  const { me } = useStaff();
  // Approvals admits somebody with no reports (a request re-addressed to them); /my/ward does
  // not, so offering it to them was a tab that 404'd. One item, full width, for that reader.
  const items = ITEMS.filter(([href]) => href !== "/my/ward" || me.isManager);
  return (
    <nav style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, flex: "0 0 auto", borderTop: "2px solid " + INK, background: GROUND }}>
      {items.map(([href, label, icon]) => {
        const active = path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} style={{
            minHeight: 52, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 5, padding: "10px 4px calc(12px + env(safe-area-inset-bottom, 0px))",
            fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", textDecoration: "none",
            background: active ? INK : GROUND, color: active ? GROUND : "var(--color-neutral-600)",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden>{icon}</svg>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
