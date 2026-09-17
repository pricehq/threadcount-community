"use client";
/* The Team shell: one app bar, one tab row, one nav, four screens inside it.
 *
 * Approvals, Round, Ward and Raise are four views of the same job, and before this they were four
 * separate screens with a back chevron and a two-item nav of their own — a manager with an empty
 * queue could not reach any of them without typing the address. The tabs are real links to the
 * routes that already existed, so the back button, a screen reader and the emailed approval link
 * all keep working.
 *
 * Which tabs a reader gets comes from teamTabs() in lib/staffreq.ts, off the same two counts the
 * tab badge is built from. That is the point of it living there: a tab drawn from one fact and a
 * route fenced on another is a tab that 404s, which is exactly what this shell is here to stop.
 *
 * Review is deliberately NOT in here. It is a detail screen — it gets a back chevron, like the
 * order, the thread and the request — because a decision screen with a tab row invites somebody to
 * wander off it mid-decision.
 */
import Link from "next/link";
import { MBody, MONO, MRule, MTop } from "@/components/m";
import { INK, Kicker, SegmentLinks } from "@/components/staffui";
import StaffNav from "@/components/staffnav";
import { useStaff } from "@/lib/staffclient";
import { teamTabs, teamTitle } from "@/lib/staffreq";

/** A section band: the heading a list hangs off, with an optional mono note at the right.
 *
 *  The four screens in this shell each had their own copy of this div. One of them is enough, and
 *  it is exported because the bands are the shell's own furniture as much as the tab row is. */
export function Band({ label, right, tone = "quiet" }: {
  label: string; right?: React.ReactNode; tone?: "quiet" | "attention";
}) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 10,
      padding: "18px 16px 8px", borderBottom: "2px solid " + INK, background: "var(--color-bg)",
    }}>
      <span style={{ flex: 1, minWidth: 0 }}><Kicker tone={tone}>{label}</Kicker></span>
      {right !== undefined && right !== null && (
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 500, color: "var(--color-neutral-600)", whiteSpace: "nowrap" }}>
          {right}
        </span>
      )}
    </div>
  );
}

/** The decision buttons that sit inside a row — Approve 3 / Open, Nudge / Collected, Sign.
 *
 *  Not CompactAction: these share the width of the row between them (the mockup's `.decide .chip`,
 *  flex:1), where CompactAction is a fixed-width control sitting beside a block of text. Same 2px
 *  ink border, same uppercase label, 46px rather than the 44px floor. The small variant is the
 *  decline reasons — three across a phone, directly under the garment line they decline — and it
 *  sat at 42 until somebody measured it. Nothing anyone taps in this app goes under 44. */
export function ChipAction({ label, onClick, href, disabled, small }: {
  label: string; onClick?: () => void; href?: string; disabled?: boolean;
  /** Three across rather than two — the decline reasons, which are phrases rather than words. */
  small?: boolean;
}) {
  const st: React.CSSProperties = {
    flex: 1, minWidth: 0, minHeight: small ? 44 : 46, padding: "0 10px", border: `2px solid ${INK}`, borderRadius: 0,
    background: "#fff", color: INK, font: "inherit", fontSize: small ? 13 : 15, fontWeight: 800,
    lineHeight: 1.25,
    display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
    textDecoration: "none", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1,
  };
  // A Link, not an anchor: a full page load on "Open" or "Nudge" throws away the list the reader
  // is standing in and re-fetches the whole screen on ward wifi.
  if (href && !disabled) return <Link href={href} style={st}>{label}</Link>;
  return <button type="button" onClick={onClick} disabled={disabled} style={st}>{label}</button>;
}

/** The row of decision buttons. */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 8, marginTop: 10 }}>{children}</div>;
}

export default function Team({ active, children, foot }: {
  /** The href of the tab being shown, so the segment row can mark it. */
  active: string;
  children: React.ReactNode;
  /** Anything that belongs below the scrolling body and above the nav — Round's "sign for all",
   *  Raise's send bar. Bars cannot live inside MBody or they scroll away with the list. */
  foot?: React.ReactNode;
}) {
  const { me, counts } = useStaff();
  const tabs = teamTabs(me, counts);
  const single = tabs.length === 1 ? tabs[0] : null;

  return (
    <>
      <MTop title={teamTitle(me, counts)} />
      <MRule />
      <MBody>
        {/* One tab is not a choice, and a single inverted button that does nothing when pressed is
            a control that lies. A clerk who only signs for the trolley gets the band instead — and
            no tabs at all draws nothing, rather than an empty <nav>: an approver who has just
            cleared the last request in their queue still stands on this screen. */}
        {tabs.length === 0
          ? null
          : single
            ? <Band label={single.label} right={single.count ? String(single.count) : undefined} />
            : <SegmentLinks label="Team" options={tabs} active={active} />}
        {children}
      </MBody>
      {foot}
      <StaffNav />
    </>
  );
}
