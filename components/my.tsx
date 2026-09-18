"use client";
/* The sign-in chrome for the staff app.
 *
 * Deliberately not the app shell. Everything past /my/signin is a fixed-height phone column with
 * an ink app bar and a bottom nav; this one screen is a centred page, because it is also what a
 * person meets when they open a link from a printed slip on a desktop browser.
 *
 * The screens themselves live in components/screens/ and share components/staffui.tsx.
 */

export const INK = "#201e1d";
export const ACCENT = "#ec3013";

/* Under /my this sits inside `.tcx-app` — a fixed, overflow-hidden column — so it has to be the
   thing that scrolls. It wasn't: a centred flex child with no overflow of its own, which clipped a
   four-line approval (and its decline reasons) at both ends on a phone with nothing to scroll and
   the Approve/Decline bar out of reach. `margin: auto` on the inner block centres a short page the
   way `alignItems: center` did, without pinning the middle of a tall one. */
export function MyShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "var(--font-body)", color: INK, background: "var(--color-bg)", minHeight: "100dvh", display: "flex", flexDirection: "column", width: "100%", flex: 1, minWidth: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ maxWidth: 460, margin: "auto", padding: "clamp(24px,6vw,56px) 20px", width: "100%" }}>{children}</div>
    </div>
  );
}

export const kicker: React.CSSProperties = { fontSize: 11.5, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 800, color: ACCENT };
export const h1: React.CSSProperties = { fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(26px,6vw,40px)", lineHeight: 1.05, letterSpacing: "-0.03em", margin: "12px 0 0", textWrap: "balance" };
export const lead: React.CSSProperties = { fontSize: 15, lineHeight: 1.6, color: "var(--color-neutral-800)", margin: "12px 0 0", maxWidth: "46ch" };
export const label: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-neutral-600)", marginBottom: 6 };
export const input: React.CSSProperties = { width: "100%", minHeight: 50, padding: "10px 12px", border: "2px solid " + INK, background: "#fff", fontSize: 16, fontWeight: 600, borderRadius: 0, fontFamily: "inherit", color: INK };
export const primary = (busy: boolean): React.CSSProperties => ({
  minHeight: 56, background: ACCENT, color: "#fff", border: 0, font: "inherit", fontFamily: "var(--font-heading)",
  fontWeight: 800, fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase",
  cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1, textAlign: "left", padding: "0 20px",
});

export function Err({ children }: { children: React.ReactNode }) {
  return <div role="alert" style={{ background: ACCENT, color: "#fff", padding: "10px 12px", fontSize: 13.5, fontWeight: 600, lineHeight: 1.5 }}>{children}</div>;
}
