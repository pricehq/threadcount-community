"use client";
/* Signing in, in the app's own chrome.
 *
 * This screen used to be a centred web page dropped between two app screens: light ground where
 * the welcome and the app are ink, no app bar, a different type scale, and — worst — it asked the
 * same question the bundled welcome had just asked. Tapping "Sign in" there appeared to do
 * nothing, because you arrived at two buttons saying "Sign in" and "I have a code" again.
 *
 * So: one decision, made once. The welcome sends you here already in a mode, and the other way in
 * is a quiet line of text rather than a second pair of buttons. Everything else is the app's own
 * vocabulary — ink bar, accent rule, 64px flush-left action — so the seam disappears.
 */
import { PRIVACY_URL, TERMS_URL } from "@/lib/links";
import { Suspense, useId, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MBar, MBody, MError, MExternalLink, MRule, MTop, inputStyle } from "@/components/m";
import { ACCENT_700, INK, N600, N700 } from "@/components/staffui";
import Turnstile, { awaitTurnstile, resetTurnstile, turnstileOn } from "@/components/Turnstile";
import { track } from "@/lib/analytics";

type Mode = "signin" | "activate";

const label: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em",
  textTransform: "uppercase", color: N600, marginBottom: 8,
};

function SignInForm() {
  // ?code=1 arrives from the app's "I have a code" button, and from the printed slip's link.
  const sp = useSearchParams();
  /* Real htmlFor/id pairs, the way components/MAuth.tsx does it for the counter app.
   *
   * These three boxes were wrapped in their <label>, which associates — but the password one wraps
   * the Show/Hide button too, and a label may only name one control: the toggle's words were being
   * read out as part of the password field's name, and a tap anywhere in the label pulled focus off
   * the button. Naming each control explicitly puts the toggle outside the label where it belongs.
   * This is the sign-in screen of a Play-shipped app, so it is the first thing a screen reader
   * meets. */
  const codeId = useId();
  const emailId = useId();
  const pwId = useId();
  const [mode, setMode] = useState<Mode>(sp.get("code") === "1" ? "activate" : "signin");
  const [code, setCode] = useState("");
  // A Community instance whose operator has not set NEXT_PUBLIC_TERMS_URL / PRIVACY_URL has
  // nothing to agree to, so the line is not shown and consent is not asked for.
  const legal = !!(TERMS_URL || PRIVACY_URL);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  /* The terms tick. Kyle's ask (2026-09-12): sign-in carries an explicit agreement to the terms and
   * the privacy policy, the way the coordinator's sign-up does. It gates both doors — setting up is
   * where the account is created, and signing in is what the app does every other day — and the
   * activation route refuses without it, so the box can't be talked past by a client that skips it. */
  const [agree, setAgree] = useState(!legal);
  const agreeId = useId();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /* Both staff doors sit behind Turnstile on the server, and in production the check is required
   * rather than advisory — so a screen that never obtains a token gets a flat 400 "Please complete
   * the security check" and no way past it. The widget runs the way the counter app's sign-in runs
   * it, quiet: nothing is drawn unless Cloudflare actually wants an interaction, which matters here
   * because this screen is inside a WebView with no browser chrome to explain a card that appeared
   * from nowhere. */
  const [cfToken, setCfToken] = useState("");

  const activating = mode === "activate";

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setErr("");
    setBusy(true);
    const url = activating ? "/api/staff/activate" : "/api/staff/login";
    // Waited for rather than read: the token usually lands long before anyone has finished typing a
    // password, but occasionally a second or two later, and posting the empty string blames the
    // person for a check they were never shown.
    const token = cfToken || (turnstileOn() ? await awaitTurnstile() : "");
    const body = activating
      ? { code, email, password: pw, cfToken: token, agreed: agree }
      : { email, password: pw, cfToken: token, agreed: agree };
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r || !r.ok) {
      // Which door and which kind of refusal — never the server's words. Together with
      // staff_code_issued on the counter side this says how many printed codes become accounts.
      track(activating ? "staff_activation_failed" : "staff_signin_failed", {
        reason: !r ? "network" : r.status === 429 ? "throttled" : r.status === 400 && /security check/i.test(String(j?.error || "")) ? "security_check" : activating ? "code_or_details" : "credentials",
      });
      setErr(j?.error || "That didn’t work. Try again.");
      setCfToken(""); resetTurnstile();
      return;
    }
    track(activating ? "staff_activated" : "staff_signin");
    // A full navigation: the cookie was just set and /my is server-rendered.
    window.location.replace("/my");
  }

  const ready = (activating ? !!code.trim() && !!email.trim() && !!pw : !!email.trim() && !!pw) && agree;

  return (
    <>
      <MBody>
        <div style={{ padding: "24px 16px 20px", borderBottom: "2px solid " + INK, background: "var(--color-bg)" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 28, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            {activating ? "Set up your sign-in." : "Your uniform record."}
          </div>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: N700, margin: "12px 0 0", maxWidth: "42ch" }}>
            {activating
              ? "The uniform store gives you a twelve-character code. Use it once, and pick how you’ll sign in from now on."
              : "What you have out, what you’re still owed and what’s on order — the same record the uniform store sees."}
          </p>
        </div>

        <form onSubmit={submit} style={{ padding: 16, display: "grid", gap: 18 }}>
          {activating && (
            <div>
              <label htmlFor={codeId} style={label}>Your code</label>
              <input
                id={codeId}
                value={code} autoFocus autoCapitalize="characters" autoComplete="off" spellCheck={false}
                placeholder="XXXX-XXXX-XXXX"
                onChange={(e) => { setCode(e.target.value); setErr(""); }}
                style={{ ...inputStyle, fontFamily: "ui-monospace, Menlo, Consolas, monospace", letterSpacing: "0.08em" }}
              />
            </div>
          )}
          <div>
            <label htmlFor={emailId} style={label}>Email</label>
            <input
              id={emailId}
              type="email" value={email} autoComplete="email" inputMode="email" autoFocus={!activating}
              onChange={(e) => { setEmail(e.target.value); setErr(""); }} style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor={pwId} style={label}>{activating ? "Choose a password" : "Password"}</label>
            <input
              id={pwId}
              type={show ? "text" : "password"} value={pw}
              autoComplete={activating ? "new-password" : "current-password"}
              onChange={(e) => { setPw(e.target.value); setErr(""); }} style={inputStyle}
            />
            {/* aria-pressed rather than a changing label alone: read on its own, "Show" says
                nothing about what it shows. */}
            <button type="button" onClick={() => setShow(!show)} aria-pressed={show} style={{
              marginTop: 10, background: "none", border: 0, padding: 0, font: "inherit",
              fontSize: 13, fontWeight: 800, color: ACCENT_700, cursor: "pointer",
            }}>{show ? "Hide" : "Show"} password</button>
          </div>
          {/* The links open in the phone's browser inside the shell, and in a new tab on the web,
              so ticking never means leaving a half-typed password behind. */}
          {legal && <label htmlFor={agreeId} style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 13.5, lineHeight: 1.55, color: N700, cursor: "pointer" }}>
            <input
              id={agreeId} type="checkbox" checked={agree}
              onChange={(e) => { setAgree(e.target.checked); setErr(""); }}
              style={{ width: 22, height: 22, flex: "0 0 22px", marginTop: 1, accentColor: ACCENT_700 }}
            />
            <span>
              I agree to the {TERMS_URL ? <MExternalLink href={TERMS_URL}>Terms of use</MExternalLink> : "Terms of use"}{TERMS_URL && PRIVACY_URL ? " and the " : ""}{PRIVACY_URL ? <MExternalLink href={PRIVACY_URL}>Privacy policy</MExternalLink> : null}{!PRIVACY_URL ? "" : ""}.
            </span>
          </label>}
          {turnstileOn() && <Turnstile onToken={setCfToken} action={activating ? "staff-activate" : "staff-login"} quiet />}
          {/* Submitting with the keyboard’s Go key, without a visible second button. */}
          <button type="submit" disabled={!ready || busy} style={{ display: "none" }} aria-hidden />
        </form>

        <MError msg={err} onDismiss={() => setErr("")} />

        {/* The other way in — a line of text, not a second pair of buttons. The welcome screen
            has already asked once, and asking again is what made the old screen feel broken. */}
        <div style={{ padding: "4px 16px 0" }}>
          <button
            onClick={() => { setMode(activating ? "signin" : "activate"); setErr(""); }}
            style={{ background: "none", border: 0, padding: 0, font: "inherit", fontSize: 14, fontWeight: 800, color: ACCENT_700, cursor: "pointer", textAlign: "left" }}
          >
            {activating ? "Already set up? Sign in instead" : "First time? I have a code"}
          </button>
        </div>

        <p style={{ fontSize: 13, lineHeight: 1.6, color: N600, padding: "20px 16px 0", margin: 0 }}>
          {activating
            ? "Your code works once. If it has already been used, ask the uniform store for a new one."
            : "Forgotten your password? The uniform store can clear your access and hand you a fresh code."}
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: N600, padding: "12px 16px 0", margin: 0 }}>
          This is for people who wear the uniform.
        </p>

        {/* The policy line, and it is on the activation branch for a reason: that branch is where an
            email address and a password are collected, so it is the point of collection, and Play's
            review looks for a policy reachable from inside the app rather than only from the store
            listing. */}
        {activating && (
          <p style={{ fontSize: 12.5, lineHeight: 1.6, color: N600, padding: "12px 16px 0", margin: 0 }}>
            Setting this up stores your email address and a password so you can sign in. Your name,
            team and uniform record belong to your organisation.
          </p>
        )}

        {/* There used to be an "On the website" list here — the coordinator's sign-in, the privacy
            policy, the terms, account deletion. Removed at Kyle's ask (2026-09-12): none of it is
            something a wearer can act on from this screen, and the coordinator's door is a desktop
            screen this app cannot open. The terms and the policy are now the two links in the
            agreement tick above, and all three site pages remain on Account once signed in — which
            is where Play's review looks for a policy reachable from inside the app. */}
        <div style={{ height: 20 }} />
      </MBody>

      <MBar
        label={busy ? "One moment…" : activating ? "Set up my sign-in" : "Sign in"}
        disabled={!ready || busy}
        onClick={() => submit()}
      />
    </>
  );
}

export default function StaffSignIn() {
  // The bar and rule sit outside the Suspense boundary: useSearchParams suspends, and an app that
  // opens on a bare white rectangle before hydrating looks broken on a ward phone.
  return (
    <>
      <MTop title="ThreadCount" />
      <MRule />
      <Suspense fallback={<MBody><div style={{ padding: 24, fontSize: 14, color: N600 }}>One moment…</div></MBody>}>
        <SignInForm />
      </Suspense>
    </>
  );
}
