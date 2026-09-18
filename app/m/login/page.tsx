"use client";
/* Sign in — onboarding screen 03. Public: this is the one /m route someone reaches without a
   session, because it is how they get one. */
import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Turnstile, { awaitTurnstile, resetTurnstile, turnstileOn } from "@/components/Turnstile";
import { track } from "@/lib/analytics";
import { MAuthError, MAuthFooter, MAuthHeader, MField, MShowHide, authInput, authLink } from "@/components/MAuth";

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [cfToken, setCfToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [reveal, setReveal] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [sentReset, setSentReset] = useState(false);
  const [ticket, setTicket] = useState("");
  const [code, setCode] = useState("");

  const next = (() => {
    const n = sp.get("next") || "";
    return n.startsWith("/m") && !n.startsWith("//") ? n : "/m";
  })();

  async function sendReset() {
    setErr("");
    if (!email.trim()) { setErr("Put your work email in the box above first."); return; }
    setBusy(true);
    const token = cfToken || (turnstileOn() ? await awaitTurnstile() : "");
    await fetch("/api/auth/forgot", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, cfToken: token }),
    }).catch(() => {});
    setBusy(false);
    setCfToken(""); resetTurnstile();
    // Shown whatever the server said: the answer must not reveal whether the address has an account.
    setSentReset(true);
  }

  async function submitCode() {
    setErr("");
    if (!code.trim()) { setErr("Enter the six-digit code from your authenticator app."); return; }
    setBusy(true);
    const r = await fetch("/api/auth/2fa", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket, code }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    // A dropped connection is not a wrong code, and it used to leave the button spinning for ever
    // with nothing said. Nothing is signed in either way, so the advice is simply to try again.
    if (!r) {
      track("signin_failed", { reason: "network" });
      setErr("Couldn’t reach the server. Check the connection and try again.");
      return;
    }
    if (!r.ok) {
      track("signin_failed", { reason: "second_factor" });
      setErr(j.error || "That code isn’t right.");
      if (r.status === 400) setTicket(""); // the ticket expired — start again
      return;
    }
    track("signin");
    window.location.replace(next);
  }

  async function submit() {
    if (!email.trim() || !pw) { setErr("Enter your email and password."); return; }
    setBusy(true);
    // The widget draws nothing in quiet mode, so nobody can see that it hasn't finished. Wait for
    // the token rather than posting an empty one and blaming the person for it.
    const token = cfToken || (turnstileOn() ? await awaitTurnstile() : "");
    if (turnstileOn() && !token) {
      // Eight seconds and no token. Either the check needs an interaction we've asked Turnstile
      // not to draw, or it couldn't reach Cloudflare at all. Show the widget rather than send an
      // empty token and let the server answer with a check the person was never shown.
      setBusy(false);
      setReveal(true);
      // How often the invisible check has to show itself. If this climbs, the quiet widget is
      // costing people sign-ins and should come back out.
      track("security_check_shown", { screen: "signin" });
      setErr("Finish the security check below, then try again.");
      return;
    }
    const r = await fetch("/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: pw, cfToken: token }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    /* The request never arrived. Ward wifi drops, and without this the promise rejected, `busy`
       never cleared and the sign-in button sat disabled on its spinner until the app was killed —
       which reads as ThreadCount refusing to let you in. Nothing was signed in, so the token is
       spent and the widget reset like any other failed attempt. */
    if (!r) {
      track("signin_failed", { reason: "network" });
      setErr("Couldn’t reach the server. Check the connection and try again.");
      setCfToken(""); resetTurnstile();
      return;
    }
    if (!r.ok) {
      // Whether it was the password or the security check — no email, no message.
      track("signin_failed", { reason: r.status === 429 ? "throttled" : r.status === 400 ? "security_check" : "credentials" });
      setErr(j.error || "That email and password don’t match.");
      setCfToken(""); resetTurnstile();
      return;
    }
    // The password was right but the account has a second factor; nothing is signed in yet.
    if (j.need2fa) { setTicket(j.ticket); track("signin_2fa_required"); return; }
    track("signin");
    // A full navigation, not a router push: the session cookie has just changed and every /m page
    // is server-rendered from it. replace(), not assign(), so the hardware back button doesn't
    // land a signed-in person back on the sign-in screen.
    window.location.replace(next);
  }

  return (
    <>
      <MAuthHeader kicker="Uniform store access" title="Sign in" />
      <div style={{ height: 4, flex: "0 0 4px", background: "var(--color-accent)" }} />
      <div style={{ flex: 1, overflowY: "auto", padding: "26px 24px 30px", display: "grid", gap: 26, alignContent: "start" }}>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--color-neutral-800)", maxWidth: 290 }}>
          {ticket ? "Your password was right. Now the code from your authenticator app." : "Use the account your uniform coordinator set up."}
        </p>
        <MAuthError msg={err} />
        {ticket ? (
          <>
            <MField n="01" label="Six-digit code">
              {(c) => (
                <input {...c} style={authInput} inputMode="numeric" autoComplete="one-time-code" autoFocus
                  autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="go"
                  placeholder="000000" value={code}
                  onChange={(e) => { setCode(e.target.value); setErr(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") submitCode(); }} />
              )}
            </MField>
            <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--color-neutral-700)" }}>
              Lost your phone? A recovery code works here instead.
            </p>
          </>
        ) : (
          <>
            <MField n="01" label="Work email">
              {(c) => (
                <input {...c} style={authInput} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off"
                  spellCheck={false} autoComplete="email" enterKeyHint="next" placeholder="you@yourfacility.org"
                  value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} />
              )}
            </MField>
            <MField n="02" label="Password" right={<MShowHide on={show} onToggle={() => setShow(!show)} />}>
              {(c) => (
                <input {...c} style={authInput} type={show ? "text" : "password"} autoComplete="current-password"
                  enterKeyHint="go" value={pw}
                  onChange={(e) => { setPw(e.target.value); setErr(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
              )}
            </MField>
          </>
        )}

        {/* This used to explain that there was no reset and to go and find an admin — which was a
            dead end for the admin themselves, and deleting the last admin deletes the facility.
            Hidden during the code step, where it would be answering a question nobody asked. */}
        {ticket ? null : sentReset ? (
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--color-neutral-800)", background: "#fff", borderLeft: "6px solid var(--color-accent)", padding: 14 }}>
            If that address has an account, a reset link is on its way. It works once and expires in
            an hour.
          </p>
        ) : forgot ? (
          <div style={{ background: "#fff", borderLeft: "6px solid var(--color-text)", padding: 14 }}>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--color-neutral-800)", margin: 0 }}>
              Put your work email in the box above and we&rsquo;ll send a link to set a new password.
            </p>
            <button onClick={sendReset} disabled={busy}
              style={{ marginTop: 12, background: "none", border: 0, padding: 0, fontSize: 13.5, fontWeight: 800, color: "var(--color-accent-700)", cursor: busy ? "wait" : "pointer" }}>
              {busy ? "Sending…" : "Send me a reset link"}
            </button>
          </div>
        ) : (
          <button onClick={() => setForgot(true)}
            style={{ justifySelf: "start", background: "none", border: 0, padding: 0, fontSize: 13, fontWeight: 600, color: "var(--color-accent-700)", cursor: "pointer" }}>
            Forgot password
          </button>
        )}
        {turnstileOn() && <Turnstile onToken={setCfToken} action="login" quiet={!reveal} />}
      </div>
      <MAuthFooter
        secondary={ticket
          ? <button onClick={() => { setTicket(""); setCode(""); setErr(""); }} style={{ background: "none", border: 0, padding: 0, font: "inherit", fontSize: 13, fontWeight: 700, color: "var(--color-accent-700)", cursor: "pointer" }}>Start again</button>
          : <>No account yet? <Link href="/m/signup" style={authLink}>Sign up</Link></>}
        label={ticket ? "Verify" : "Sign in"} onSubmit={ticket ? submitCode : submit} busy={busy} />
    </>
  );
}

export default function MLogin() {
  return <Suspense fallback={null}><LoginInner /></Suspense>;
}
