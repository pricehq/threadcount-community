"use client";
/* The staff app's way in, in the wearer's voice: "Your uniform record." Two doors — Sign in, and
 * First time? I have a code — and the one you came through is already open (?code=1 arrives from
 * the app's "I have a code" button and from the printed slip's link).
 *
 * The first time is the moment that matters: the code from the uniform store is typed into a swing
 * tag drawn like the slip it came on, then an email and a password of your own. When it works,
 * YOURS is stamped on the tag and the record opens.
 *
 * Every behaviour and API contract is the same as before: /api/staff/activate and
 * /api/staff/login, the terms tick sent as `agreed`, Turnstile quiet, and a full navigation to /my
 * with replace() once the cookie is set. */
import { PRIVACY_URL, TERMS_URL } from "@/lib/links";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MExternalLink } from "@/components/m";
import Turnstile, { awaitTurnstile, resetTurnstile, turnstileOn } from "@/components/Turnstile";
import { track } from "@/lib/analytics";
import { doneBuzz } from "@/lib/feedback";
import { useDoors } from "@/components/MDoors";
import { ErrorLine, Press, ShowHide, SlipField, Stage, s, stillNow } from "@/components/m/auth/kit";
import { CODE_LEN, TagCode, formatCode } from "@/components/m/auth/TagCode";

type Mode = "signin" | "activate";

/** The beat once the door opens: the tag drops, YOURS lands on it, the record opens. */
function Yours({ code, email }: { code: string; email: string }) {
  useEffect(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const still = stillNow();
    const buzz = setTimeout(() => doneBuzz(), still ? 0 : 480);
    // A full navigation: the cookie was just set and /my is server-rendered.
    const go = setTimeout(() => window.location.replace("/my"), still ? 250 : 1300);
    return () => { clearTimeout(buzz); clearTimeout(go); };
  }, []);
  return (
    <div className={s.beat} role="status" aria-live="polite">
      <div className={s.beatInner}>
        {code ? <TagCode value={code} onChange={() => {}} stamp="Yours" /> : (
          <div className={s.swing}>
            <div className={s.tagShadow}>
              <div className={s.tagEdge}><div className={s.tag}>
                <div className={s.tagHead}><span className={s.tagLbl}>Uniform record</span></div>
                <div className={s.tagHost}>{email}</div>
                <div className={s.tagFoot}><span>Staff</span><span>Signed in</span></div>
                <span className={s.shock} aria-hidden="true" />
                <span className={s.stamp} aria-hidden="true" style={{ fontSize: 28 }}>Yours</span>
              </div></div>
            </div>
          </div>
        )}
        <div className={s.beatKick}>{code ? "Set up" : "Signed in"}</div>
        <div className={s.beatTitle}>Opening your <em>record.</em></div>
        <div className={s.beatRun} aria-hidden="true" />
      </div>
    </div>
  );
}

function SignInForm() {
  const sp = useSearchParams();
  const doors = useDoors();
  const [mode, setMode] = useState<Mode>(sp.get("code") === "1" ? "activate" : "signin");
  const [code, setCode] = useState("");
  // A Community instance whose operator has not set NEXT_PUBLIC_TERMS_URL / PRIVACY_URL has
  // nothing to agree to, so the line is not shown and consent is not asked for.
  const legal = !!(TERMS_URL || PRIVACY_URL);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  /* The terms tick. Sign-in carries an explicit agreement to the terms and the privacy policy, the
   * way the coordinator's sign-up does. It gates both doors, and the activation route refuses
   * without it, so the box can't be talked past by a client that skips it. */
  const [agree, setAgree] = useState(!legal);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  /* Both staff doors sit behind Turnstile on the server. The widget runs quiet, as the counter
   * app's sign-in runs it: nothing is drawn unless Cloudflare actually wants an interaction, which
   * matters inside a WebView with no browser chrome to explain a card that appeared from nowhere. */
  const [cfToken, setCfToken] = useState("");
  const emailRef = useRef<HTMLInputElement | null>(null);

  const activating = mode === "activate";

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!ready) {
      setErr(activating && code.length < CODE_LEN ? "Your code is twelve letters and numbers, from the slip the uniform store gave you."
        : !email.trim() || !pw ? "Enter your email and a password."
        : "Tick the box to agree to the terms of use and privacy policy.");
      return;
    }
    setErr("");
    setBusy(true);
    const url = activating ? "/api/staff/activate" : "/api/staff/login";
    // Waited for rather than read: posting the empty string blames the person for a check they
    // were never shown.
    const token = cfToken || (turnstileOn() ? await awaitTurnstile() : "");
    const body = activating
      ? { code: formatCode(code), email, password: pw, cfToken: token, agreed: agree }
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
      setErr(!r ? "Couldn’t reach the server. Check the connection and try again." : j?.error || "That didn’t work. Try again.");
      setCfToken(""); resetTurnstile();
      return;
    }
    track(activating ? "staff_activated" : "staff_signin");
    setDone(true);
  }

  const ready = (activating ? code.length === CODE_LEN && !!email.trim() && !!pw : !!email.trim() && !!pw) && agree;
  const switchTo = (m: Mode) => { setMode(m); setErr(""); };

  return (
    <div className={s.root}>
      {done && <Yours code={activating ? code : ""} email={email.trim()} />}
      <div className={s.scroll}>
        <Stage app="Staff"
          kicker={activating ? "First time · your code" : "For people who wear the uniform"}
          lines={activating ? ["Make it", <em key="e">yours.</em>] : ["Your", <em key="e">uniform record.</em>]}
          lede={activating
            ? "The uniform store gives you a twelve-character code. Use it once, and pick how you’ll sign in from now on."
            : "What you have out, what you’re still owed and what’s on order — the same record the uniform store sees."} />

        <form className={s.body} noValidate onSubmit={submit}>
          {/* The two ways in, as doors: the one you came through is open. */}
          <div className={s.modeDoors} role="group" aria-label="How are you signing in?">
            <button type="button" className={s.modeDoor} aria-pressed={!activating} onClick={() => switchTo("signin")}>
              <span className={s.mdK}>Already set up</span><span className={s.mdT}>Sign in</span>
            </button>
            <button type="button" className={s.modeDoor} aria-pressed={activating} onClick={() => switchTo("activate")}>
              <span className={s.mdK}>First time?</span><span className={s.mdT}>I have a code</span>
            </button>
          </div>

          {activating && (
            <TagCode value={code} autoFocus onChange={(v) => { setCode(v); setErr(""); }} onFull={() => emailRef.current?.focus()} />
          )}
          <SlipField n={activating ? "02" : "01"} label="Email" value={email} hint={activating ? "One you can get to. It becomes your sign-in." : undefined}>
            {(c) => (
              <input {...c} ref={emailRef} type="email" value={email} autoComplete="email" inputMode="email"
                autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" autoFocus={!activating}
                placeholder="you@example.org"
                onChange={(e) => { setEmail(e.target.value); setErr(""); }} />
            )}
          </SlipField>
          <SlipField n={activating ? "03" : "02"} label={activating ? "Choose a password" : "Password"} value={pw}
            right={<ShowHide on={show} onToggle={() => setShow(!show)} />}
            hint={activating ? "At least 8 characters." : undefined}>
            {(c) => (
              <input {...c} type={show ? "text" : "password"} value={pw} enterKeyHint="go"
                autoComplete={activating ? "new-password" : "current-password"}
                onChange={(e) => { setPw(e.target.value); setErr(""); }} />
            )}
          </SlipField>
          {/* The links open in the phone's browser inside the shell, and in a new tab on the web,
              so ticking never means leaving a half-typed password behind. */}
          {legal && (
            <label className={s.consent}>
              <input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setErr(""); }} />
              <span>
                I agree to the {TERMS_URL ? <MExternalLink href={TERMS_URL}>Terms of use</MExternalLink> : "Terms of use"}{TERMS_URL && PRIVACY_URL ? " and the " : ""}{PRIVACY_URL ? <MExternalLink href={PRIVACY_URL}>Privacy policy</MExternalLink> : null}.
              </span>
            </label>
          )}
          {turnstileOn() && <Turnstile onToken={setCfToken} action={activating ? "staff-activate" : "staff-login"} quiet />}
          <ErrorLine msg={err} />
          {sp.get("deleted") === "1" && !err && <div className={s.info} role="status">Your sign-in has been deleted. The uniform store can give you a new code if you need one.</div>}
          {/* Submitting with the keyboard's Go key, without a visible second button. */}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />

          <div style={{ display: "grid", gap: 10 }}>
            <p className={s.small}>
              {activating
                ? "Your code works once. If it has already been used, ask the uniform store for a new one."
                : "Forgotten your password? The uniform store can clear your access and hand you a fresh code."}
            </p>
            <p className={s.small}>This is for people who wear the uniform.</p>
            {doors.demoOpen && !activating && (
              <p className={s.small} style={{ color: "var(--ink)", fontWeight: 700 }}>
                Just looking? The demo has no staff sign-ins; the ThreadCount counter app opens it without one.
              </p>
            )}
            {/* The policy line sits on the activation branch because that is where an email address
                and a password are collected — the point of collection. */}
            {activating && (
              <p className={s.small}>
                Setting this up stores your email address and a password so you can sign in. Your name,
                team and uniform record belong to your organisation.
              </p>
            )}
          </div>
        </form>
      </div>
      <div className={s.dock}>
        <Press label={activating ? "Make it mine" : "Sign in"} onClick={() => void submit()} busy={busy} />
      </div>
    </div>
  );
}

export default function StaffSignIn() {
  // useSearchParams suspends; the fallback is the same ink the stage draws, not a white rectangle.
  return (
    <Suspense fallback={<div className={s.root}><div className={s.stage} style={{ minHeight: 280 }} /></div>}>
      <SignInForm />
    </Suspense>
  );
}
