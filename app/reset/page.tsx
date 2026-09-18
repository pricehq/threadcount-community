"use client";
/* Set a new password from an emailed link.
 *
 * Deliberately outside both shells: it is reached from an email, by someone who may be on a phone
 * or a desktop and is by definition not signed in, so it carries its own minimal chrome and works
 * the same either way. */
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

const INK = "#201e1d";
const ACCENT = "#ec3013";
const MIN = 8;

function ResetInner() {
  const sp = useSearchParams();
  const token = sp.get("token") || "";
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /* An account with a second factor is not signed in by setting a password.
   *
   * /api/auth/reset answers `{ need2fa, ticket }` in exactly the shape /api/auth/login does, and
   * for the same reason: the password is only the first of two things. Without this step the new
   * password was saved, no cookie was issued, and the redirect to /app bounced straight back to
   * /auth with nothing said — which reads as "the reset didn't work" and sends people round again.
   */
  const [ticket, setTicket] = useState("");
  const [code, setCode] = useState("");

  const input: React.CSSProperties = {
    width: "100%", minHeight: 50, padding: "10px 12px", border: "2px solid " + INK,
    background: "#fff", fontSize: 16, fontWeight: 600, borderRadius: 0,
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (pw.length < MIN) { setErr(`Use at least ${MIN} characters.`); return; }
    if (pw !== again) { setErr("The two passwords don't match."); return; }
    setBusy(true);
    /* try/finally, because without it a dropped connection left the button disabled reading
     * "Setting…" for good: the fetch rejects, the line that clears `busy` never runs, and the only
     * way on is to open the emailed link again — from a page that gives no hint that is what
     * happened. The reset may well have gone through, so the message says so rather than promising
     * nothing changed. */
    try {
      const r = await fetch("/api/auth/reset", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password: pw }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || "That didn't work. Ask for a new link."); return; }
      // Password saved, but the account carries a second factor — nothing is signed in yet.
      if (j.need2fa) { setTicket(j.ticket); return; }
      // A full navigation: the session cookie has just been set and every page is server-rendered.
      window.location.replace("/app");
    } catch {
      setErr("No connection — try again. If the new password works, it was already set.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!code.trim()) { setErr("Enter the code from your authenticator app."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/2fa", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticket, code }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error || "That code isn't right.");
        // 400 is an expired or spent ticket. The password is already changed, so the way back is a
        // fresh sign-in rather than another reset link.
        if (r.status === 400) { setTicket(""); setCode(""); }
        return;
      }
      window.location.replace("/app");
    } catch {
      setErr("No connection — check the network and try the code again.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <p style={p}>
        That link is incomplete — reset links only work in full. Copy the whole link out of the
        email, or <Link href="/auth" style={{ color: ACCENT, fontWeight: 700 }}>ask for a new one</Link>.
      </p>
    );
  }

  if (ticket) {
    return (
      <>
        <p style={p}>
          Your new password is set. This account has two-factor turned on, so one more step: the
          six-digit code from your authenticator app, or a recovery code if you no longer have the
          phone.
        </p>
        <form onSubmit={submitCode} style={{ marginTop: 26, display: "grid", gap: 14 }}>
          <label style={{ display: "block" }}>
            <span style={lab}>Code</span>
            <input inputMode="numeric" autoComplete="one-time-code" autoFocus value={code}
              onChange={(e) => { setCode(e.target.value); setErr(""); }} placeholder="000000" style={input} />
          </label>
          {err && <div role="alert" style={{ background: ACCENT, color: "#fff", padding: "10px 12px", fontSize: 13.5, fontWeight: 600 }}>{err}</div>}
          <button type="submit" disabled={busy}
            style={{ minHeight: 56, background: ACCENT, color: "#fff", border: 0, font: "inherit", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1, textAlign: "left", padding: "0 20px" }}>
            {busy ? "Checking…" : "Verify and sign in"}
          </button>
        </form>
      </>
    );
  }

  return (
    <>
      <p style={p}>
        At least {MIN} characters. Setting it signs out anywhere else your account was already open,
        and signs you in here — after your authenticator code, if you have two-factor turned on.
      </p>
      <form onSubmit={submit} style={{ marginTop: 26, display: "grid", gap: 14 }}>
        <label style={{ display: "block" }}>
          <span style={lab}>New password</span>
          <input type={show ? "text" : "password"} value={pw} autoComplete="new-password" autoFocus
            onChange={(e) => { setPw(e.target.value); setErr(""); }} style={input} />
        </label>
        <label style={{ display: "block" }}>
          <span style={lab}>Type it again</span>
          <input type={show ? "text" : "password"} value={again} autoComplete="new-password"
            onChange={(e) => { setAgain(e.target.value); setErr(""); }} style={input} />
        </label>
        <button type="button" onClick={() => setShow(!show)}
          style={{ justifySelf: "start", background: "none", border: 0, padding: 0, font: "inherit", fontSize: 13, fontWeight: 700, color: ACCENT, cursor: "pointer" }}>
          {show ? "Hide" : "Show"} password
        </button>
        {err && <div role="alert" style={{ background: ACCENT, color: "#fff", padding: "10px 12px", fontSize: 13.5, fontWeight: 600 }}>{err}</div>}
        <button type="submit" disabled={busy}
          style={{ minHeight: 56, background: ACCENT, color: "#fff", border: 0, font: "inherit", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1, textAlign: "left", padding: "0 20px" }}>
          {busy ? "Setting…" : "Set password and sign in"}
        </button>
      </form>
    </>
  );
}

const kicker: React.CSSProperties = { fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 800, color: ACCENT };
const h1: React.CSSProperties = { fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(28px,5vw,44px)", lineHeight: 1.05, letterSpacing: "-0.03em", margin: "14px 0 0" };
const p: React.CSSProperties = { fontSize: 15.5, lineHeight: 1.65, color: "var(--color-neutral-800)", margin: "16px 0 0", maxWidth: "46ch" };
const lab: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-neutral-600)", marginBottom: 6 };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "var(--font-body)", color: INK, background: "var(--color-bg)", minHeight: "100vh", display: "flex", alignItems: "center" }}>
      {/* The page is nothing but this form, so the card is the main landmark and there is no
          repeated block in front of it for a skip link to bypass. */}
      <main style={{ maxWidth: 460, margin: "0 auto", padding: "clamp(32px,6vw,64px) 24px", width: "100%" }}>
        {children}
      </main>
    </div>
  );
}

export default function ResetPage() {
  // The heading is outside the boundary on purpose: useSearchParams suspends, so anything inside
  // it is absent from the server HTML. This way the page says what it is immediately.
  return (
    <Shell>
      <div style={kicker}>ThreadCount</div>
      <h1 style={h1}>Reset your password.</h1>
      <Suspense fallback={<p style={p}>One moment…</p>}>
        <ResetInner />
      </Suspense>
    </Shell>
  );
}
