"use client";
/* Counter sign-in. Public: this is the one /m route someone reaches without a session, because it
   is how they get one.

   One orchestrated moment: the headline rises, the thread sews under it, and the server's swing tag
   swings in across the seam between the ink stage and the paper slip. The fields are a slip being
   filled in; the red button presses like a key; a right password stamps SIGNED IN on the tag. */
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Turnstile, { awaitTurnstile, resetTurnstile, turnstileOn } from "@/components/Turnstile";
import { track } from "@/lib/analytics";
import { MServerLabel, MSignedIn } from "@/components/MAuth";
import { DEMO_COUNTER_HREF, useDoors } from "@/components/MDoors";
import { Door, ErrorLine, Press, ShowHide, SlipField, Stage, s } from "@/components/m/auth/kit";

function LoginInner() {
  const sp = useSearchParams();
  const doors = useDoors();
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
  const [done, setDone] = useState("");

  const next = (() => {
    const n = sp.get("next") || "";
    return n.startsWith("/m") && !n.startsWith("//") ? n : "/m";
  })();
  /* Why they are looking at this page, when it isn't a plain first visit. A session that ended
     mid-count used to land here with nothing said, which reads as the app throwing the work away;
     the part-count is kept on the phone and `next` takes them straight back to it. */
  const why = sp.get("deleted") === "1"
    ? "Your account has been deleted."
    : next !== "/m" ? "You were signed out. Sign in again to carry on where you left off." : "";

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
    setDone(next);
  }

  async function submit() {
    if (!email.trim() || !pw) { setErr("Enter your email and password."); return; }
    setErr("");
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
    /* The request never arrived. Shop-floor wifi drops, and without this the promise rejected,
       `busy` never cleared and the button sat disabled until the app was killed — which reads as
       ThreadCount refusing to let you in. Nothing was signed in, so the token is spent and the
       widget reset like any other failed attempt. */
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
    // is server-rendered from it. MSignedIn does it with replace().
    setDone(next);
  }

  return (
    <div className={s.root}>
      {done && <MSignedIn to={done} />}
      <div className={s.scroll}>
        <Stage app="Counter" kicker={ticket ? "Sign in · second step" : "Uniform store · Sign in"}
          lines={ticket ? ["One more", <em key="e">code.</em>] : ["Sign in to", <>the <em>counter.</em></>]} />
        {/* Which server this is: the same app signs in to the hosted service or to a store's own. */}
        <MServerLabel />
        <form className={s.body} noValidate onSubmit={(e) => {
          e.preventDefault();
          if (ticket) { void submitCode(); return; }
          // Enter in the email box moves on to the password rather than complaining it is empty.
          if (email.trim() && !pw) { (e.currentTarget.querySelector('input[autocomplete="current-password"]') as HTMLInputElement | null)?.focus(); return; }
          void submit();
        }}>
          <p className={s.note}>
            {ticket ? "Your password was right. Now the six digits from your authenticator app." : "Use the account your uniform coordinator set up — or the one you made for your store."}
          </p>
          <ErrorLine msg={err} />
          {why && !err && !ticket && <div className={s.info} role="status">{why}</div>}
          {ticket ? (
            <>
              <SlipField n="01" label="Six-digit code" value={code} hint="Lost your phone? A recovery code works here instead.">
                {(c) => (
                  <input {...c} className={`${c.className} ${s.digits}`} inputMode="numeric" autoComplete="one-time-code" autoFocus
                    autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="go"
                    placeholder="000000" value={code}
                    onChange={(e) => { setCode(e.target.value); setErr(""); }} />
                )}
              </SlipField>
            </>
          ) : (
            <>
              <SlipField n="01" label="Work email" value={email}>
                {(c) => (
                  <input {...c} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off"
                    spellCheck={false} autoComplete="email" enterKeyHint="next" placeholder="you@yourstore.org"
                    value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} />
                )}
              </SlipField>
              <SlipField n="02" label="Password" value={pw} right={<ShowHide on={show} onToggle={() => setShow(!show)} />}>
                {(c) => (
                  <input {...c} type={show ? "text" : "password"} autoComplete="current-password"
                    enterKeyHint="go" value={pw}
                    onChange={(e) => { setPw(e.target.value); setErr(""); }} />
                )}
              </SlipField>
            </>
          )}
          {/* Enter / Go on the keyboard submits; the visible button is docked below. */}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />

          {/* Hidden during the code step, where it would be answering a question nobody asked. */}
          {ticket ? null : sentReset ? (
            <div className={`${s.info} ${s.red}`} role="status">
              If that address has an account, a reset link is on its way. It works once and expires in an hour.
            </div>
          ) : forgot ? (
            <div className={s.info}>
              Put your work email in the box above and we&rsquo;ll send a link to set a new password.
              <div><button type="button" className={s.textBtn} onClick={sendReset} disabled={busy} style={{ marginTop: 8 }}>
                {busy ? "Sending…" : "Send me a reset link"}
              </button></div>
            </div>
          ) : (
            <div><button type="button" className={s.textBtn} onClick={() => setForgot(true)}>Forgot password</button></div>
          )}

          {!ticket && (doors.signupsOpen || doors.demoOpen) && (
            <div className={s.doors}>
              {/* A new store starts here: one account per facility, and whoever makes it is its first admin. */}
              {doors.signupsOpen && (
                <Door href="/m/signup" title={<>New here? <em>Create a free account</em></>} sub="Set up your uniform store in three steps" />
              )}
              {/* The shared demo needs no account. A plain link: the route sets the session cookie
                  and redirects, so it has to be a real navigation. */}
              {doors.demoOpen && (
                <Door href={DEMO_COUNTER_HREF} dashed hollow title={<>Just looking? <em>Open the demo</em></>} sub="Shared, resets every 20 minutes" />
              )}
            </div>
          )}
          {turnstileOn() && <Turnstile onToken={setCfToken} action="login" quiet={!reveal} />}
        </form>
      </div>
      <div className={s.dock}>
        {ticket && (
          <div className={s.dockLine}>
            <span>Wrong account?</span>
            <button type="button" className={s.textBtn} onClick={() => { setTicket(""); setCode(""); setErr(""); }}>Start again</button>
          </div>
        )}
        <Press label={ticket ? "Verify" : "Sign in"} onClick={ticket ? submitCode : submit} busy={busy} />
      </div>
    </div>
  );
}

export default function MLogin() {
  return <Suspense fallback={null}><LoginInner /></Suspense>;
}
