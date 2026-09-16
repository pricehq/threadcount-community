"use client";
/* The onboarding auth chrome: an ink header, the accent rule, a scrolling form and a docked
   primary bar. Shared by sign in and create account so the two can't drift apart.
   Fields are numbered — 01, 02, 03 — a counted form on an app about counting. */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

export const INK = "var(--color-text)";
export const PAPER = "var(--color-bg)";

export function MAuthHeader({ kicker, title, back = true }: { kicker: string; title: React.ReactNode; back?: boolean }) {
  const router = useRouter();
  const path = usePathname();
  /* The chevron used to be a plain router.back(), which on a fresh install did nothing at all.
   * The Android shell leaves its welcome screen with location.replace(), so these two screens are
   * the first entry in the WebView's history: someone who taps "Sign up", changes their mind and
   * taps back was stuck, with only the footer link out — the hardware back button quits the app
   * from here, because MainActivity hands the gesture to the system once canGoBack() is false.
   *
   * So: pop the history when there really is something behind, and otherwise fall back to sign in,
   * which is where every other auth screen is reached from. Sign in itself has nothing behind it,
   * so it draws no chevron at all rather than a dead one. history.length can only be read after
   * mount, hence the state — the server render assumes the worst case of no history. */
  const [canPop, setCanPop] = useState(false);
  useEffect(() => { setCanPop(window.history.length > 1); }, []);
  const fallback = path === "/m/login" ? null : "/m/login";
  const showBack = back && (canPop || fallback !== null);
  return (
    <header style={{ flex: "0 0 auto", background: INK, color: PAPER, padding: "calc(20px + env(safe-area-inset-top, 0px)) 24px 28px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {showBack && (
          <button onClick={() => { if (canPop) router.back(); else if (fallback) router.push(fallback); }} aria-label="Back"
            style={{ width: 44, height: 44, marginLeft: -12, border: 0, background: "none", color: "inherit", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="square" aria-hidden="true"><path d="M15 18 9 12l6-6" /></svg>
          </button>
        )}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 9 }}>
          <span aria-hidden="true" style={{ width: 15, height: 15, background: "#fff" }} />
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 17, letterSpacing: "-0.01em" }}>ThreadCount</span>
        </span>
      </div>
      <div style={{ marginTop: 34, fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent-300)" }}>{kicker}</div>
      <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 46, lineHeight: 0.94, letterSpacing: "-0.03em", marginTop: 12 }}>{title}</h1>
    </header>
  );
}

/** A numbered field. The index is the device that makes this form ThreadCount’s.
 *
 *  The label is a real <label> tied to the control by id, and the control comes in as a function so
 *  the id can be handed to it: these two screens are the whole of both Play listings' sign-in, and
 *  drawing the label as a <span> meant a screen reader announced "edit box" with no name at all —
 *  on a password box, which has no placeholder to fall back on either. The 01/02/03 index is
 *  hidden from the accessibility tree; it is a counted-form flourish, not part of the field's name. */
export function MField({ n, label, right, children }: {
  n: string; label: string; right?: React.ReactNode; children: (control: { id: string }) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span aria-hidden="true" style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, color: "var(--color-accent)" }}>{n}</span>
        <label htmlFor={id} style={{ fontWeight: 600, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-neutral-800)" }}>{label}</label>
        {right && <span style={{ marginLeft: "auto" }}>{right}</span>}
      </div>
      {children({ id })}
    </div>
  );
}

export const authInput: React.CSSProperties = {
  width: "100%", border: 0, borderBottom: "2px solid var(--color-text)", background: "transparent",
  // 16px keeps Android from zooming the page when the field takes focus.
  fontSize: 17, fontWeight: 500, padding: "10px 0", marginTop: 8, borderRadius: 0, color: "var(--color-text)",
};

export function MShowHide({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    // "Show" on its own says nothing about what it shows once the label is read out separately.
    <button type="button" onClick={onToggle} aria-pressed={on} aria-label={on ? "Hide password" : "Show password"}
      style={{ background: "none", border: 0, padding: 0, fontWeight: 600, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-accent-700)", cursor: "pointer" }}>
      {on ? "Hide" : "Show"}
    </button>
  );
}

export function MAuthError({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div role="alert" style={{ border: "2px solid var(--color-accent)", padding: "10px 12px", fontSize: 13.5, fontWeight: 600, color: "var(--color-accent-700)", background: "#fff" }}>
      {msg}
    </div>
  );
}

/** Footer: a secondary line above the docked primary bar. */
export function MAuthFooter({ secondary, label, onSubmit, busy, disabled }: {
  secondary: React.ReactNode; label: string; onSubmit: () => void; busy?: boolean; disabled?: boolean;
}) {
  return (
    <div style={{ flex: "0 0 auto", borderTop: "2px solid var(--color-divider)", background: PAPER }}>
      <div style={{ padding: "14px 24px", fontSize: 13, color: "var(--color-neutral-800)" }}>{secondary}</div>
      <button onClick={onSubmit} disabled={busy || disabled}
        style={{ width: "100%", height: 66, border: 0, background: "var(--color-accent)", color: "#fff", display: "flex", alignItems: "center", gap: 12, padding: "0 24px calc(0px + env(safe-area-inset-bottom, 0px))", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase", cursor: busy || disabled ? "not-allowed" : "pointer", opacity: busy || disabled ? 0.55 : 1 }}>
        <span style={{ flex: 1, textAlign: "left" }}>{busy ? "One moment…" : label}</span>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="square" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
      </button>
    </div>
  );
}

export const authLink: React.CSSProperties = { color: "var(--color-accent-700)", fontWeight: 600, textDecoration: "none" };

export function useAuthShell() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return { busy, setBusy, err, setErr };
}

export { Link };
