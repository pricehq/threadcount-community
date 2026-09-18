"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ACCENT, GROUND, INK, MONO, MUTED } from "./m";
import { useStaff } from "@/lib/staffclient";
import { teamTabs } from "@/lib/staffreq";
import { cap } from "@/lib/terms";

/* The tab bar: four items for a wearer, five for anybody with a team screen to open.
 *
 * The fifth is drawn when teamTabs() — the one function that decides what is behind /my/team —
 * has something to show. Asking it, rather than re-stating the test here, is the point: a manager,
 * a ward desk WITH a ward recorded, and anybody a request is addressed to. That last case is not a
 * nicety: the linen room can re-address a request to somebody who manages nobody, and a manager's
 * last report can move away while their request is still waiting. Gating on "is a manager" would
 * take the tab, the badge and the Home banner away at once, and leave a colleague blocked behind a
 * screen nobody could reach. The ward matters for the opposite reason: a clerk with the desk flag
 * and no ward has no round, /my/round refuses them, and a tab drawn from one fact in front of a
 * route fenced on another is a tab that 404s on every screen in the app.
 *
 * Every item is a link, Messages included. It used to be a button that pushed /my/orders — a
 * control among links, missing from anything that lists a page's navigation, and a tab that lied
 * about where it went.
 */

const ic = (d: React.ReactNode) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true">{d}</svg>
);

const ICONS = {
  home: ic(<path d="M4 11 12 4l8 7v9H4z" />),
  kit: ic(<path d="M8 4 5 6v5h3v9h8v-9h3V6l-3-2-2 2h-4z" />),
  orders: ic(<><path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" /><path d="M4 6h1" /><path d="M4 12h1" /><path d="M4 18h1" /></>),
  messages: ic(<path d="M4 5h16v11H9l-5 4z" />),
  team: ic(<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M16 5.2A3.2 3.2 0 0 1 16 11" /><path d="M17 14.8c2.4.5 4 2.5 4 5.2" /></>),
};

/** Which item owns a path. The team item owns every screen inside the Team shell, so an approval
 *  opened from an email keeps the bar where opening it from the tab would. */
function activeItem(path: string): string {
  if (path === "/my") return "/my";
  if (/^\/my\/(team|approvals|ward|raise|round)(\/|$)/.test(path)) return "/my/team";
  if (path.startsWith("/my/kit")) return "/my/kit";
  if (path.startsWith("/my/orders")) return "/my/orders";
  if (path.startsWith("/my/messages")) return "/my/messages";
  return "";
}

function Badge({ n }: { n: number }) {
  return (
    <span aria-hidden="true" style={{
      position: "absolute", top: 6, left: "calc(50% + 7px)", minWidth: 18, height: 18, padding: "0 5px",
      background: ACCENT, color: "#fff", fontFamily: MONO, fontSize: 11, fontWeight: 800,
      display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
    }}>{n > 99 ? "99+" : n}</span>
  );
}

export default function StaffNav() {
  const path = usePathname();
  const { me, counts } = useStaff();
  const active = activeItem(path);

  const items: { href: string; label: string; icon: React.ReactNode; count?: number }[] = [
    { href: "/my", label: "Home", icon: ICONS.home },
    { href: "/my/kit", label: "My kit", icon: ICONS.kit },
    { href: "/my/orders", label: "Orders", icon: ICONS.orders, count: counts.orders },
    { href: "/my/messages", label: "Messages", icon: ICONS.messages },
  ];
  if (teamTabs(me, counts).length > 0) {
    // "Ward" for somebody who is only on the desk: what they open is the round, not a team.
    const label = me.isManager || counts.approvals > 0 ? "Team" : cap(me.terms.team);
    items.push({ href: "/my/team", label, icon: ICONS.team, count: counts.team });
  }

  return (
    <nav aria-label="Main" style={{
      display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, flex: "0 0 auto",
      height: 66, paddingBottom: "env(safe-area-inset-bottom, 0px)",
      borderTop: "2px solid " + INK, background: "#fff",
    }}>
      {items.map((it) => {
        const on = active === it.href;
        const n = it.count || 0;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={on ? "page" : undefined}
            // A number in a square announces as a number; the label is what says what it means.
            aria-label={n > 0 ? `${it.label}, ${n} need you` : undefined}
            style={{
              position: "relative", display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 3, textDecoration: "none", font: "inherit",
              color: on ? INK : MUTED, background: on ? GROUND : "#fff",
              fontSize: 12, fontWeight: 700,
            }}
          >
            {on && <span aria-hidden="true" style={{ position: "absolute", top: -2, left: "20%", right: "20%", height: 4, background: ACCENT }} />}
            {it.icon}
            <span style={{ fontSize: 12, fontWeight: on ? 800 : 700 }}>{it.label}</span>
            {n > 0 && <Badge n={n} />}
          </Link>
        );
      })}
    </nav>
  );
}
