"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { GROUND, INK } from "./m";

/* Four items, as designed. Not five.
 *
 * A manager is a staff member who also approves — they wear the uniform too — so the approvals
 * queue is a card on Home rather than a fifth tab. The prototype showed a manager with two nav
 * items because it switched roles with chips above the phone; that switcher is a prototyping
 * device, and building a separate manager shell around it would give a ward manager two apps to
 * remember instead of one.
 */
const NAV: [string, string, React.ReactNode][] = [
  ["/my", "Home", <path key="h" d="M4 11 12 4l8 7v9H4z" />],
  ["/my/kit", "Kit", <g key="k"><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></g>],
  ["/my/orders", "Orders", <g key="o"><path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" /><path d="M4 6h1" /><path d="M4 12h1" /><path d="M4 18h1" /></g>],
  ["/my/messages", "Messages", <path key="m" d="M4 5h16v11H9l-5 4z" />],
];

export default function StaffNav() {
  const path = usePathname();
  const router = useRouter();
  const on = (href: string) => (href === "/my" ? path === "/my" : path.startsWith(href));

  return (
    <nav style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", flex: "0 0 auto", borderTop: "2px solid " + INK, background: GROUND }}>
      {NAV.map(([href, label, icon]) => {
        const active = on(href);
        const style: React.CSSProperties = {
          minHeight: 52, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 5, padding: "10px 4px calc(12px + env(safe-area-inset-bottom, 0px))",
          fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
          textDecoration: "none", background: active ? INK : GROUND,
          color: active ? GROUND : "var(--color-neutral-600)", border: 0, font: "inherit", cursor: "pointer",
        };
        const inner = (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden>{icon}</svg>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em" }}>{label}</span>
          </>
        );
        // Messages has no general inbox to land in, so with nothing open it goes to Orders. The
        // alternative is a screen that exists only to say there is nothing here.
        if (href === "/my/messages") {
          return (
            <button key={href} onClick={() => router.push("/my/orders?tab=open")} style={{ ...style, fontSize: 10 }} aria-current={active ? "page" : undefined}>
              {inner}
            </button>
          );
        }
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} style={style}>
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}
