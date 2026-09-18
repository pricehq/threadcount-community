"use client";
/* Create account — onboarding screen 04. This creates a whole facility, which is why it asks for
   the hospital's name: the person signing up becomes its first administrator. */
import { PRIVACY_URL, TERMS_URL } from "@/lib/links";
import Link from "next/link";
import { useState } from "react";
import Turnstile, { awaitTurnstile, resetTurnstile, turnstileOn } from "@/components/Turnstile";
import { track } from "@/lib/analytics";
import { MAuthError, MAuthFooter, MAuthHeader, MField, MShowHide, authInput, authLink } from "@/components/MAuth";

export default function MSignup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [facility, setFacility] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  // Nothing to agree to on a Community instance whose operator has not set the document URLs.
  const legal = !!(TERMS_URL || PRIVACY_URL);
  const [agree, setAgree] = useState(!legal);
  const [cfToken, setCfToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [err, setErr] = useState("");
  /** Set once the facility exists, so the address it was created with can be shown back. */
  const [made, setMade] = useState<{ email: string; mailed: boolean; mail: boolean } | null>(null);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  // The API wants first and last separately; the design asks for one "Full name" field, which is
  // the kinder question. Split on the last space and keep whatever they typed.
  const parts = name.trim().split(/\s+/);
  const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const ready = !!(first && last && emailOk && facility.trim() && pw.length >= 8 && agree);

  async function submit() {
    if (!ready) {
      setErr(!name.trim() ? "Enter your name." : !emailOk ? "That email doesn’t look right."
        : !last ? "Enter your first and last name." : !facility.trim() ? "Which organisation is this for?"
        : pw.length < 8 ? "Password must be at least 8 characters." : "Tick the box to continue.");
      return;
    }
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
      track("security_check_shown", { screen: "signup" });
      setErr("Finish the security check below, then try again.");
      return;
    }
    const r = await fetch("/api/auth/signup", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ first, last, facility, email, password: pw, cfToken: token }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    /* The answer never came back, which is not the same as nothing having happened: the request may
       well have reached the server and made the facility before the connection went. Without this
       the promise rejected and the Create button stayed disabled on its spinner for ever. Trying
       again is safe — a second attempt on an address that did get through is refused as already
       having an account, which is itself the answer. */
    if (!r) {
      track("signup_failed", { reason: "network" });
      setErr("Couldn’t reach the server, so we can’t say whether the account was made. Try again — if it was, you’ll be told the email is already taken.");
      setCfToken(""); resetTurnstile();
      return;
    }
    if (!r.ok) {
      track("signup_failed", { reason: r.status === 429 ? "throttled" : r.status === 400 ? "rejected" : "other" });
      setErr(j.error || "Couldn’t create the account."); setCfToken(""); resetTurnstile(); return;
    }
    // A facility created itself from a phone — the whole point of building sign-up into the app.
    track("signup_completed");
    /* Show the address back before going anywhere.
     *
     * The account is made and signed in either way. But this is the address a password reset goes
     * to and the only route back into a facility whose one admin is locked out, and a typo in it is
     * invisible until the day it matters — so it is put in front of the person once, with what
     * actually happened to it. */
    setMade({ email: String(j.email || email), mailed: !!j.mailed, mail: j.mail !== false });
  }

  if (made) {
    return (
      <>
        <MAuthHeader kicker="Your facility is set up" title={<>Facility<br />created</>} back={false} />
        <div style={{ height: 4, flex: "0 0 4px", background: "var(--color-accent)" }} />
        <div style={{ flex: 1, overflowY: "auto", padding: "30px 24px", display: "grid", gap: 18, alignContent: "start" }}>
          <div style={{ fontSize: 15, lineHeight: 1.6, color: "var(--color-text)" }}>
            You&rsquo;re signed in as <b>{made.email}</b>.
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--color-neutral-700)" }}>
            {!made.mail
              ? "No mail is configured on this server, so that address hasn’t been checked. Make sure it is right — it is where a password reset would go."
              : made.mailed
                ? "We’ve sent a note there — that is the address a password reset goes to. If it doesn’t arrive, the address is wrong: add a second admin under Settings → Users while you’re still signed in."
                : "We couldn’t send a note to that address. Check it is right, and add a second admin under Settings → Users while you’re still signed in — otherwise a forgotten password locks the facility out."}
          </div>
        </div>
        <MAuthFooter
          secondary={<>A second admin under Settings is the way back in if this account is ever locked out.</>}
          label="Start" onSubmit={() => window.location.replace("/m/signed-in?new=1")} busy={false} />
      </>
    );
  }

  return (
    <>
      <MAuthHeader kicker="Free — no card, no seat limit" title={<>Create<br />account</>} />
      <div style={{ height: 4, flex: "0 0 4px", background: "var(--color-accent)" }} />
      <div style={{ flex: 1, overflowY: "auto", padding: "30px 24px", display: "grid", gap: 24, alignContent: "start" }}>
        <MAuthError msg={err} />
        <MField n="01" label="Full name">
          {(c) => (
            <input {...c} style={authInput} autoComplete="name" enterKeyHint="next" placeholder="Sam Whitfield"
              value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} />
          )}
        </MField>
        <MField n="02" label="Work email">
          {(c) => (
            <input {...c} style={authInput} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off"
              spellCheck={false} autoComplete="email" enterKeyHint="next" placeholder="you@yourfacility.org"
              value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} />
          )}
        </MField>
        <MField n="03" label="Organisation">
          {(c) => (
            <input {...c} style={authInput} autoComplete="organization" enterKeyHint="next" placeholder="Kestrel Bay Hotel"
              value={facility} onChange={(e) => { setFacility(e.target.value); setErr(""); }} />
          )}
        </MField>
        <MField n="04" label="Password" right={<MShowHide on={show} onToggle={() => setShow(!show)} />}>
          {(c) => (
            <input {...c} style={authInput} type={show ? "text" : "password"} autoComplete="new-password"
              enterKeyHint="go" placeholder="8 characters minimum" value={pw}
              onChange={(e) => { setPw(e.target.value); setErr(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
          )}
        </MField>

        {legal && <label style={{ display: "flex", gap: 12, alignItems: "flex-start", background: "#fff", borderLeft: "6px solid var(--color-text)", padding: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setErr(""); }}
            style={{ width: 20, height: 20, accentColor: "var(--color-accent)", flex: "0 0 20px", marginTop: 1 }} />
          <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--color-neutral-800)" }}>
            I agree to the {TERMS_URL ? <a href={TERMS_URL} target="_blank" rel="noopener" style={authLink}>terms of use</a> : "terms of use"}{TERMS_URL && PRIVACY_URL ? " and the " : ""}{PRIVACY_URL ? <a href={PRIVACY_URL} target="_blank" rel="noopener" style={authLink}>privacy notice</a> : null}.
          </span>
        </label>}
        {turnstileOn() && <Turnstile onToken={setCfToken} action="signup" quiet={!reveal} />}
      </div>
      <MAuthFooter
        secondary={<>Already have one? <Link href="/m/login" style={authLink}>Sign in</Link></>}
        label="Create account" onSubmit={submit} busy={busy} />
    </>
  );
}
