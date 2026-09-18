"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Turnstile, { awaitTurnstile, resetTurnstile, turnstileOn } from "@/components/Turnstile";
import { track } from "@/lib/analytics";
import { Field, LiveRegion } from "@/components/ui";
import { HAS_SITE, PRIVACY_URL, TERMS_URL } from "@/lib/links";
import { TRADES } from "@/lib/terms";

/* The desktop door: sign in and create a facility.
 *
 * Sign-in asks for the address first and only then shows the one thing that applies — a password,
 * the facility's single sign-on, or a pointer to the staff app — instead of every door at once.
 * Creating a facility is three short steps (you, the facility, confirm) rather than one long form,
 * and ends on the short list a new admin actually needs. */

const POINTS = [
  "Bring your catalogue, staff register and cost centres in from CSV, or type them in over an afternoon.",
  "Issue with a scan, and the order to replace it starts itself.",
  "Month-end reporting your finance team can open without ringing you about it.",
];

/* What a failed single sign-on says when it lands back here. The codes come from
 * /api/auth/sso/callback; every one of them means "you are not signed in", and the sentence says
 * what to do about it. */
const SSO_ERRORS: Record<string, string> = {
  sso_no_account: "Your identity provider signed you in, but that address has no account at this facility yet. Ask your admin to add you, using the same address.",
  sso_inactive: "That account has been deactivated. Ask an admin at your facility.",
  sso_state: "That sign-in link had expired or was opened in a different browser. Start again from here.",
  sso_failed: "Single sign-on didn’t complete. Try again, or use your password if you have one.",
  sso_unavailable: "Single sign-on isn’t available for that address.",
};

const SETTINGS: [string, string][] = [["", "Choose one (optional)"], ...TRADES.filter((t) => t.key !== "general").map((t): [string, string] => [t.key, t.label]), ["general", "Something else"]];
const STATES: [string, string][] = [["", "Choose one (optional)"], ["QLD", "Queensland"], ["NSW", "New South Wales"], ["VIC", "Victoria"], ["ACT", "Australian Capital Territory"], ["TAS", "Tasmania"], ["SA", "South Australia"], ["NT", "Northern Territory"], ["WA", "Western Australia"], ["NZ", "New Zealand"]];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Four bars: length 8, length 12, mixed case, a digit or symbol. A sentence scores full marks. */
function strength(pw: string): { score: number; word: string } {
  const score = [pw.length >= 8, pw.length >= 12, /[a-z]/.test(pw) && /[A-Z]/.test(pw), /\d|[^\w\s]/.test(pw)].filter(Boolean).length;
  return { score, word: ["Too short", "Weak", "Fair", "Good", "Strong"][pw.length < 8 ? 0 : score] };
}

type LoginStep = "email" | "password" | "sso" | "staff" | "2fa" | "reset";

export default function AuthForm({ initialMode, next, signupsOpen, ssoError = "", sso: ssoOffered = false }: { initialMode: "login" | "signup"; next: string; signupsOpen: boolean; ssoError?: string; sso?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [busy, setBusy] = useState(false);
  const [cfToken, setCfToken] = useState("");
  /** The security check was asked for and never answered — see cfNow. */
  const [cfSlow, setCfSlow] = useState(false);

  // ---- sign in ----
  const [step, setStep] = useState<LoginStep>("email");
  const [li, setLi] = useState({ email: "", pw: "", err: SSO_ERRORS[ssoError] || "" });
  const [showPw, setShowPw] = useState(false);
  const [caps, setCaps] = useState(false);
  const [remember, setRemember] = useState(false);
  const [sso, setSso] = useState<{ on: boolean; required: boolean; facility: string }>({ on: false, required: false, facility: "" });
  const [ticket, setTicket] = useState("");
  const [code, setCode] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [trust, setTrust] = useState(false);
  const [resetAgain, setResetAgain] = useState(0);

  // ---- create a facility ----
  const [su, setSu] = useState({ first: "", last: "", facility: "", email: "", pw: "", setting: "", state: "", err: "" });
  const [suStep, setSuStep] = useState<1 | 2 | 3>(1);
  const [showSuPw, setShowSuPw] = useState(false);
  const [agree, setAgree] = useState(false);
  /** Sign-in's own consent tick: asked on the first screen so password, single sign-on and the
   *  staff-app pointer all pass through it. */
  const [liAgree, setLiAgree] = useState(false);
  /** Set once the facility exists, so the address it was created with can be shown back. */
  const [made, setMade] = useState<{ email: string; mailed: boolean; mail: boolean } | null>(null);
  const legal = !!(TERMS_URL || PRIVACY_URL);

  /* The Turnstile token, waited for at submit time rather than demanded before the button works.
   * On a network that filters challenges.cloudflare.com the token never comes; wait up to eight
   * seconds, then go anyway and let the server give an honest refusal, with a line saying what
   * didn't finish. */
  async function cfNow(): Promise<string> {
    if (!turnstileOn()) return "";
    const t = cfToken || await awaitTurnstile();
    setCfSlow(!t);
    return t;
  }
  const cfNote = cfSlow ? "The security check didn’t finish. If this keeps happening, your network may be blocking challenges.cloudflare.com — try again, or ask IT." : "";

  const email = li.email.trim().toLowerCase();

  /** Step one: the address decides the door. Any failure to decide falls back to the password box. */
  async function decideDoor() {
    if (legal && !liAgree) { setLi({ ...li, err: "Tick that you agree to the Terms of use and the Privacy policy." }); return; }
    if (!EMAIL_RE.test(email)) { setLi({ ...li, err: "Enter your work email." }); return; }
    setBusy(true);
    try {
      const post = (url: string) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }).then((r) => r.json()).catch(() => ({}));
      const [s, l] = await Promise.all([ssoOffered ? post("/api/auth/sso/lookup") : Promise.resolve({}), post("/api/auth/lookup")]);
      const on = !!s.sso;
      setSso({ on, required: !!s.required, facility: String(s.facility || "") });
      setLi({ ...li, err: "" });
      if (on) { setStep("sso"); return; }
      if (l.staff) { setStep("staff"); return; }
      setStep("password");
    } finally {
      setBusy(false);
    }
  }
  function goSso() {
    // A full navigation: the route answers with a redirect to the broker, and the state cookie it
    // sets has to belong to this tab's navigation, not to a fetch.
    window.location.assign("/api/auth/sso/start?email=" + encodeURIComponent(email));
  }
  function backToEmail() { setStep("email"); setLi({ ...li, pw: "", err: "" }); setTicket(""); setCode(""); setRecoveryMode(false); }

  /* Every one of these used to `await fetch` with nothing around it. A dropped connection rejects,
   * so setBusy(false) never ran and the button stayed disabled for good. The finally clause is the
   * fix; the catch is what turns "nothing happened" into a sentence somebody can act on. */
  async function doLogin() {
    if (!li.pw) { setLi({ ...li, err: "Enter your password." }); return; }
    setBusy(true);
    try {
      const token = await cfNow();
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: li.pw, cfToken: token, remember }) });
      const j = await r.json().catch(() => ({}));
      // The facility signs in through its identity provider: the password was right and is still
      // refused. Nothing to explain — carry on to single sign-on with the same address.
      if (j.ssoRequired) { track("signin_sso_redirect", { screen: "desktop" }); goSso(); return; }
      if (!r.ok) {
        track("signin_failed", { screen: "desktop", reason: r.status === 429 ? "throttled" : r.status === 400 ? "security_check" : "credentials" });
        setLi({ ...li, err: j.error || "Email or password doesn’t match." }); setCfToken(""); resetTurnstile(); return;
      }
      // Password accepted, but the account carries a second factor — nothing is signed in yet.
      if (j.need2fa) { track("signin_2fa_required", { screen: "desktop" }); setTicket(j.ticket); setLi({ ...li, err: "" }); setStep("2fa"); return; }
      track("signin", { screen: "desktop", kind: j.staff ? "staff" : "coordinator" });
      // A wearer, not a coordinator: the cookie just set is the staff one and /my is the staff app.
      // A full navigation, so no prefetched signed-out copy of the destination is served.
      if (j.staff) { window.location.assign("/my"); return; }
      router.push(next); router.refresh();
    } catch {
      setLi({ ...li, err: "No connection — check the network and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function doCode() {
    if (!code.trim()) { setLi({ ...li, err: recoveryMode ? "Enter one of your recovery codes." : "Enter the code from your authenticator app." }); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/2fa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticket, code, trust, remember }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        track("signin_failed", { screen: "desktop", reason: "second_factor" });
        setLi({ ...li, err: j.error || "That code isn’t right." });
        if (r.status === 400) { setTicket(""); setCode(""); setStep("password"); } // expired — back a step
        return;
      }
      track("signin", { screen: "desktop", kind: "coordinator", second_factor: true });
      router.push(next); router.refresh();
    } catch {
      setLi({ ...li, err: "No connection — check the network and try again." });
    } finally {
      setBusy(false);
    }
  }

  /** Always reports the same thing, so the reply can’t be used to test whether an address exists. */
  async function sendReset() {
    // Said before the request goes: the answer is the same either way by design, and waiting on the
    // security check first would leave the link looking dead for up to eight seconds.
    setStep("reset"); setResetAgain((n) => n + 1);
    const token = await cfNow();
    await fetch("/api/auth/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, cfToken: token }) }).catch(() => {});
  }

  // ---- create a facility ----
  const suEmailOk = EMAIL_RE.test(su.email);
  const pwOk = su.pw.length >= 8;
  const step1Ok = !!(su.first.trim() && su.last.trim()) && suEmailOk && pwOk && (!legal || agree);
  const step2Ok = !!su.facility.trim();
  const st = strength(su.pw);

  async function doSignup() {
    if (!(step1Ok && step2Ok) || (legal && !agree)) return;
    setBusy(true);
    try {
      const token = await cfNow();
      const r = await fetch("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ first: su.first, last: su.last, facility: su.facility, email: su.email, password: su.pw, setting: su.setting, state: su.state, agreed: agree, cfToken: token }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        track("signup_failed", { screen: "desktop", reason: r.status === 429 ? "throttled" : r.status === 400 ? "rejected" : "other" });
        setSu({ ...su, err: j.error || "Couldn’t create the account." }); setCfToken(""); resetTurnstile();
        // A refusal about the address or the password belongs on the step that asked for it.
        if (r.status === 409 || /email|password/i.test(String(j.error || ""))) setSuStep(1);
        return;
      }
      track("signup_completed", { screen: "desktop" });
      /* Show the address back before going anywhere: it is where a password reset goes and the only
       * route back into a facility whose one admin is locked out, and a typo is invisible until the
       * day it matters. */
      setMade({ email: String(j.email || su.email), mailed: !!j.mailed, mail: j.mail !== false });
    } catch {
      setSu({ ...su, err: "No connection — try again. If the address is already taken, the account was created." });
    } finally {
      setBusy(false);
    }
  }

  // A LiveRegion rather than a plain div: a refusal that only appears is a refusal a screen-reader
  // user never hears, and this is the box that says why they are not signed in.
  const errBox = (msg: string) => (
    <LiveRegion tone="alert" msg={msg} style={{ border: "2px solid var(--color-accent)", padding: "8px 12px", fontSize: 13, fontWeight: 600, color: "var(--color-accent-700)", marginTop: 12 }} />
  );
  const cfBox = cfNote ? (
    <LiveRegion msg={cfNote} style={{ borderLeft: "6px solid var(--color-text)", padding: "8px 12px", fontSize: 12.5, lineHeight: 1.55, color: "var(--color-neutral-800)", marginTop: 12 }} />
  ) : null;
  const title: React.CSSProperties = { fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 26, letterSpacing: "-0.01em", margin: 0 };
  const sub: React.CSSProperties = { fontSize: 13.5, color: "var(--color-neutral-800)", marginTop: 8, lineHeight: 1.6 };
  const small: React.CSSProperties = { fontSize: 12, color: "var(--color-neutral-700)", lineHeight: 1.6 };
  const kicker: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-700)" };
  const linkBtn: React.CSSProperties = { background: "none", border: 0, padding: 0, font: "inherit", fontWeight: 700, color: "var(--color-accent-700)", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer" };
  const arrowBtn = (label: string, extra?: React.CSSProperties) => (
    <span style={{ display: "flex", justifyContent: "space-between", width: "100%", ...extra }}><span>{label}</span><span aria-hidden>→</span></span>
  );
  /** The address being signed in, with the way back to change it. */
  const whoLine = (
    <div style={{ ...small, display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
      <button type="button" onClick={backToEmail} style={linkBtn}>← Not you?</button>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</span>
    </div>
  );
  const showToggle = (on: boolean, set: (v: boolean) => void) => (
    <button type="button" onClick={() => set(!on)} aria-pressed={on} style={{ ...linkBtn, fontSize: 12, position: "absolute", right: 10, top: 0, height: 36, display: "flex", alignItems: "center" }}>{on ? "Hide" : "Show"}</button>
  );

  // ---------------- left pane ----------------
  const brand = (
    <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "var(--color-text)" }}>
      <div style={{ width: 16, height: 16, background: "var(--color-accent)" }} />
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, letterSpacing: "-0.01em" }}>ThreadCount</div>
    </Link>
  );
  const bigTitle: React.CSSProperties = { fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 42, lineHeight: 1.05, letterSpacing: "-0.02em", textWrap: "balance" as never };
  const paneFoot = <div style={{ fontSize: 11, color: "var(--color-neutral-600)", textTransform: "uppercase", letterSpacing: "0.08em" }}>No per-seat pricing · your data stays yours</div>;
  const pane = mode === "login" ? (
    <div>
      <div style={bigTitle}>Welcome back.</div>
      <div style={{ marginTop: 18, fontSize: 14, lineHeight: 1.6, color: "var(--color-neutral-800)", maxWidth: 400 }}>One address, one door. Type your work email and you are taken the right way: password, single sign-on, or the staff app if that is where you belong.</div>
      <div style={{ marginTop: 32, borderTop: "2px solid var(--color-text)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 400 }}>
        <div style={kicker}>Not a coordinator?</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}><span style={{ width: 8, height: 8, background: "var(--color-text)", flex: "none" }} /><span>Wearing the uniform? <Link href="/my/signin" style={{ fontWeight: 700 }}>Staff sign-in</Link></span></div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}><span style={{ width: 8, height: 8, background: "var(--color-text)", flex: "none" }} /><span>At the counter on a phone? <Link href="/m/login" style={{ fontWeight: 700 }}>Counter sign-in</Link></span></div>
      </div>
    </div>
  ) : (
    <div>
      <div style={bigTitle}>Set up your facility in three short steps.</div>
      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 14 }}>
        {(["You", "Your facility", "Confirm"] as const).map((t, i) => {
          const on = made ? true : suStep === i + 1, done = made || suStep > i + 1;
          return (
            <div key={t} style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 13, ...(on || done ? { background: "var(--color-text)", color: "var(--color-bg)" } : { border: "2px solid var(--color-text)" }) }}>{done ? "✓" : i + 1}</div>
              <div style={{ fontSize: 14, fontWeight: on ? 700 : 500, color: on ? "var(--color-text)" : "var(--color-neutral-700)" }}>{t}</div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 12, maxWidth: 420 }}>
        {POINTS.map((pt) => (
          <div key={pt} style={{ display: "flex", gap: 12, alignItems: "baseline", fontSize: 13.5, lineHeight: 1.55, color: "var(--color-neutral-800)" }}>
            <span style={{ width: 8, height: 8, background: "var(--color-accent)", flex: "none", transform: "translateY(-1px)" }} />{pt}
          </div>
        ))}
      </div>
    </div>
  );


  /** The terms line with its tick box. Shown only where the server publishes documents (a Community
   *  instance without TERMS_URL/PRIVACY_URL asks nothing). */
  const consentBox = (checked: boolean, set: (v: boolean) => void, tail: string) => legal ? (
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, lineHeight: 1.5, marginTop: 14, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} style={{ width: 16, height: 16, margin: "2px 0 0", flex: "none" }} />
      <span>I agree to the {TERMS_URL ? <a href={TERMS_URL} target="_blank" rel="noopener">Terms of use</a> : "Terms of use"}{TERMS_URL && PRIVACY_URL ? " and the " : ""}{PRIVACY_URL ? <a href={PRIVACY_URL} target="_blank" rel="noopener">Privacy policy</a> : null}{tail}.</span>
    </label>
  ) : null;

  // ---------------- sign-in steps ----------------
  const loginBody = (() => {
    if (step === "email") return (
      <form onSubmit={(e) => { e.preventDefault(); void decideDoor(); }}>
        <h1 style={title}>Sign in</h1>
        <p style={sub}>Your work email decides the way in.</p>
        <div style={{ marginTop: 20 }}>
          <Field label="Work email">{(c) => <input {...c} className="input" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" autoComplete="email" autoFocus value={li.email} onChange={(e) => setLi({ ...li, email: e.target.value, err: "" })} placeholder="you@yourfacility.org" />}</Field>
        </div>
        {consentBox(liAgree, (v) => { setLiAgree(v); setLi({ ...li, err: "" }); }, "")}
        {errBox(li.err)}
        <button type="submit" className="btn btn-primary" disabled={busy || (legal && !liAgree)} style={{ marginTop: 16, width: "100%" }}>{arrowBtn(busy ? "One moment…" : "Continue")}</button>
        {signupsOpen && <div style={{ ...small, marginTop: 14 }}>New facility? <button type="button" onClick={() => { setMode("signup"); setSu({ ...su, err: "" }); }} style={linkBtn}>Create its account</button> · one per facility, you become its first admin.</div>}
      </form>
    );
    if (step === "password") return (
      <form onSubmit={(e) => { e.preventDefault(); void doLogin(); }}>
        {whoLine}
        <h1 style={title}>Welcome back</h1>
        {sso.on && <p style={sub}>{sso.facility} signs in with single sign-on. This password is the break-glass admin’s only.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
          <div style={{ position: "relative" }}>
            <Field label="Password">{(c) => <input {...c} className="input" type={showPw ? "text" : "password"} enterKeyHint="go" autoComplete="current-password" autoFocus value={li.pw} style={{ paddingRight: 56 }}
              onChange={(e) => setLi({ ...li, pw: e.target.value, err: "" })}
              onKeyDown={(e) => setCaps(e.getModifierState && e.getModifierState("CapsLock"))} onKeyUp={(e) => setCaps(e.getModifierState && e.getModifierState("CapsLock"))} />}</Field>
            <div style={{ position: "absolute", right: 0, top: 19 }}>{showToggle(showPw, setShowPw)}</div>
          </div>
          <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: 16, height: 16, margin: 0 }} />
            <span>Keep me signed in on this computer for 30 days</span>
          </label>
        </div>
        {caps && <LiveRegion msg="Caps Lock is on." style={{ borderLeft: "6px solid var(--color-text)", padding: "8px 12px", fontSize: 12.5, color: "var(--color-neutral-800)", marginTop: 12 }} />}
        <Turnstile action="login" onToken={setCfToken} />
        {cfBox}
        {errBox(li.err)}
        <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 16, width: "100%" }}>{arrowBtn(busy ? "Signing in…" : "Sign in")}</button>
        <div style={{ ...small, marginTop: 14 }}><button type="button" onClick={() => void sendReset()} style={linkBtn}>Forgot your password?</button></div>
      </form>
    );
    if (step === "sso") return (
      <div>
        {whoLine}
        <h1 style={title}>{sso.facility || "Your facility"} signs in with single sign-on</h1>
        <p style={sub}>You will be taken to your organisation’s login and brought straight back.</p>
        {errBox(li.err)}
        <button type="button" className="btn btn-primary" onClick={goSso} style={{ marginTop: 20, width: "100%" }}>{arrowBtn(`Continue with ${sso.facility || "single sign-on"}`)}</button>
        <details style={{ marginTop: 18 }}>
          <summary style={{ fontSize: 12, fontWeight: 700, color: "var(--color-neutral-700)", cursor: "pointer" }}>{sso.required ? "Break-glass admin? Sign in with a password instead" : "Prefer your password?"}</summary>
          <div style={{ ...small, marginTop: 8 }}>
            {sso.required ? "Only the facility’s break-glass admin has a password here; everybody else uses the button above." : "Single sign-on is optional at this facility. A password set on your account still works."}
            {" "}<button type="button" onClick={() => setStep("password")} style={linkBtn}>Use a password</button>
          </div>
        </details>
      </div>
    );
    if (step === "staff") return (
      <div>
        {whoLine}
        <h1 style={title}>That address is a staff sign-in</h1>
        <p style={sub}>It belongs to a uniform record, not a coordinator account. Your kit, requests and orders live in the staff app.</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.assign("/my/signin")} style={{ marginTop: 20, width: "100%" }}>{arrowBtn("Open the staff sign-in")}</button>
        <div style={{ ...small, marginTop: 14 }}>Work in the uniform store as well? Ask its admin to add you under Settings → Users; the same address can hold both. <button type="button" onClick={() => setStep("password")} style={linkBtn}>I have a coordinator password</button></div>
      </div>
    );
    if (step === "2fa") return (
      <form onSubmit={(e) => { e.preventDefault(); void doCode(); }}>
        {whoLine}
        <h1 style={title}>Two-factor</h1>
        <p style={sub}>{recoveryMode ? "Enter one of the recovery codes you saved when you set this up. Each works once." : "Your password was right. Enter the six-digit code from your authenticator app."}</p>
        <div style={{ marginTop: 20 }}>
          <Field label={recoveryMode ? "Recovery code" : "Code"}>{(c) => (
            <input {...c} className="input" inputMode={recoveryMode ? "text" : "numeric"} autoComplete="one-time-code" autoFocus autoCapitalize="characters" spellCheck={false}
              value={code} onChange={(e) => { setCode(e.target.value); setLi({ ...li, err: "" }); }}
              placeholder={recoveryMode ? "XXXXX-XXXXX" : "000000"}
              style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: recoveryMode ? 18 : 24, letterSpacing: recoveryMode ? "0.08em" : "0.35em", minHeight: 52 }} />
          )}</Field>
        </div>
        <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, cursor: "pointer", marginTop: 14 }}>
          <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} style={{ width: 16, height: 16, margin: 0 }} />
          <span>Trust this computer for 30 days</span>
        </label>
        {errBox(li.err)}
        <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 16, width: "100%" }}>{arrowBtn(busy ? "Checking…" : "Verify")}</button>
        <div style={{ ...small, marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
          <button type="button" onClick={() => { setRecoveryMode(!recoveryMode); setCode(""); setLi({ ...li, err: "" }); }} style={{ ...linkBtn, alignSelf: "flex-start" }}>{recoveryMode ? "Use the authenticator app instead" : "Use a recovery code instead"}</button>
          <details><summary style={{ cursor: "pointer" }}>Lost the phone and the codes?</summary><div style={{ marginTop: 6 }}>{/* Only the account holder can remove two-factor; no admin control clears it for someone else. */}Your recovery codes are the way back in. Without them, ask whoever looks after this server.</div></details>
        </div>
      </form>
    );
    // reset
    return (
      <div>
        <div style={{ ...small, marginBottom: 14 }}><button type="button" onClick={() => setStep("password")} style={linkBtn}>← Back to sign in</button></div>
        <h1 style={title}>Reset link sent</h1>
        <p style={sub}>To <b>{email}</b>. It works once and expires in an hour.</p>
        <LiveRegion msg={<>Nothing there after a few minutes? The address above is the one on the account. If it is wrong, another admin at your facility can fix it under Settings → Users.{resetAgain > 1 ? " Sent again just now." : ""}</>} style={{ borderLeft: "6px solid var(--color-text)", padding: "8px 12px", fontSize: 12.5, lineHeight: 1.55, color: "var(--color-neutral-800)", marginTop: 12 }} />
        <button type="button" className="btn btn-secondary" onClick={() => void sendReset()} style={{ marginTop: 16, width: "100%" }}>Send it again</button>
        <details style={{ ...small, marginTop: 14 }}><summary style={{ cursor: "pointer", fontWeight: 700 }}>You are the only admin and cannot get the mail?</summary><div style={{ marginTop: 6 }}>The facility is not lost. This server belongs to your own organisation, so whoever looks after it can reset an admin password directly — the self-hosting notes explain how. It is also why the install guide asks you to add a second administrator before you sign out.</div></details>
      </div>
    );
  })();

  // ---------------- create a facility ----------------
  const signupBody = made ? (
    <div>
      <div style={{ display: "inline-block", fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", padding: "3px 6px", background: "var(--color-text)", color: "var(--color-bg)" }}>Facility created</div>
      <h1 style={{ ...title, marginTop: 12 }}>{su.facility.trim() || "Your facility"} is ready{su.first.trim() ? `, ${su.first.trim()}` : ""}</h1>
      <p style={sub}>You are signed in as <b>{made.email}</b>.</p>
      <LiveRegion msg={!made.mail
        ? "No mail is configured on this server, so that address hasn’t been checked. Make sure it is right — it is where a password reset would go."
        : made.mailed
          ? "We sent a note to that address. If it does not arrive, the address is wrong — fix it under Settings → Account before you sign out, or a forgotten password locks the facility."
          : "We couldn’t send a note to that address. Check it is right under Settings → Account before you sign out — otherwise a forgotten password locks the facility."}
        style={{ borderLeft: "6px solid var(--color-text)", padding: "8px 12px", fontSize: 12.5, lineHeight: 1.55, color: "var(--color-neutral-800)", marginTop: 12 }} />
      <div style={{ marginTop: 20 }}>
        {[
          [made.mail && made.mailed ? "Check the note we sent" : "Check the address is right", made.mail && made.mailed ? "If it never arrives, the address on the account is wrong. Resets cannot reach you until it is fixed." : "It is the only route back in if the password is forgotten."],
          ["Add a second admin", "Settings → Users. Two people can always get back in; one cannot."],
          ["Bring in the catalogue and staff register", "CSV templates are on the import screen, or type them over an afternoon."],
          ["Put the apps on the store’s phones", "The counter app for the uniform store, the staff app for wearers. Both sign in with this facility’s addresses."],
        ].map(([t, s], i) => (
          <div key={t} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 0", borderTop: "1px solid var(--color-divider)" }}>
            <div style={{ width: 26, height: 26, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12, border: "2px solid var(--color-text)" }}>{i + 1}</div>
            <div><div style={{ fontWeight: 700, fontSize: 14 }}>{t}</div><div style={{ ...small, marginTop: 2 }}>{s}</div></div>
          </div>
        ))}
      </div>
      <button className="btn btn-primary" style={{ marginTop: 20, width: "100%" }} onClick={() => { router.push("/app?welcome=1"); router.refresh(); }}>{arrowBtn("Open ThreadCount")}</button>
    </div>
  ) : suStep === 1 ? (
    <form onSubmit={(e) => { e.preventDefault(); if (step1Ok) { setSu({ ...su, err: "" }); setSuStep(2); } }}>
      <div style={{ ...kicker, marginBottom: 10 }}>Step 1 of 3 · You</div>
      <h1 style={title}>Who is setting this up?</h1>
      <p style={sub}>You will be the facility’s first admin. Everything else can be handed to a colleague later.</p>
      <div className="tc-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 20 }}>
        <Field label="First name">{(c) => <input {...c} className="input" autoComplete="given-name" autoCapitalize="words" autoFocus value={su.first} onChange={(e) => setSu({ ...su, first: e.target.value, err: "" })} />}</Field>
        <Field label="Last name">{(c) => <input {...c} className="input" autoComplete="family-name" autoCapitalize="words" value={su.last} onChange={(e) => setSu({ ...su, last: e.target.value, err: "" })} />}</Field>
        <Field label="Work email" style={{ gridColumn: "1/-1" }} hint="Password resets go here, so it has to be right.">{(c) => <input {...c} className="input" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="email" value={su.email} onChange={(e) => setSu({ ...su, email: e.target.value, err: "" })} placeholder="you@yourfacility.org" />}</Field>
        <div style={{ gridColumn: "1/-1", position: "relative" }}>
          <Field label="Password" hint={su.pw ? `${st.word}. At least 8 characters; a sentence works best.` : "At least 8 characters; a sentence works best."}>{(c) => <input {...c} className="input" type={showSuPw ? "text" : "password"} autoComplete="new-password" value={su.pw} style={{ paddingRight: 56 }} onChange={(e) => setSu({ ...su, pw: e.target.value, err: "" })} />}</Field>
          <div style={{ position: "absolute", right: 0, top: 19 }}>{showToggle(showSuPw, setShowSuPw)}</div>
          <div aria-hidden style={{ display: "flex", gap: 4, marginTop: 6 }}>{[1, 2, 3, 4].map((n) => <div key={n} style={{ flex: 1, height: 4, background: su.pw.length >= 8 && st.score >= n ? "var(--color-text)" : "var(--color-neutral-300)" }} />)}</div>
        </div>
      </div>
      {consentBox(agree, setAgree, ", and I can act for the facility I am setting up")}
      {errBox(su.err)}
      <button type="submit" className="btn btn-primary" disabled={!step1Ok} style={{ marginTop: 20, width: "100%" }}>{arrowBtn("Next: your facility")}</button>
      <div style={{ ...small, marginTop: 14 }}>Already set up? <button type="button" onClick={() => { setMode("login"); setStep("email"); }} style={linkBtn}>Sign in</button>. Joining a facility that already uses ThreadCount? Ask its admin to add you under Settings → Users instead.</div>
    </form>
  ) : suStep === 2 ? (
    <form onSubmit={(e) => { e.preventDefault(); if (step2Ok) setSuStep(3); }}>
      <div style={{ ...kicker, marginBottom: 10 }}>Step 2 of 3 · Your facility</div>
      <h1 style={title}>Name the facility</h1>
      <p style={sub}>It appears on every screen, report and order sheet.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
        <Field label="Facility name">{(c) => <input {...c} className="input" autoComplete="organization" autoCapitalize="words" autoFocus value={su.facility} onChange={(e) => setSu({ ...su, facility: e.target.value, err: "" })} placeholder="e.g. Kestrel Bay Hotel" />}</Field>
        <Field label="Kind of organisation" hint="Sets the words the screens use. Change them any time in Settings.">{(c) => <select {...c} className="input" value={su.setting} onChange={(e) => setSu({ ...su, setting: e.target.value })}>{SETTINGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}</Field>
        <Field label="State or territory" hint="Sets the time zone for counts and month-end, nothing else.">{(c) => <select {...c} className="input" value={su.state} onChange={(e) => setSu({ ...su, state: e.target.value })}>{STATES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}</Field>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button type="button" className="btn btn-secondary" onClick={() => setSuStep(1)}>← Back</button>
        <button type="submit" className="btn btn-primary" disabled={!step2Ok} style={{ flex: 1 }}>{arrowBtn("Next: confirm")}</button>
      </div>
    </form>
  ) : (
    <form onSubmit={(e) => { e.preventDefault(); void doSignup(); }}>
      <div style={{ ...kicker, marginBottom: 10 }}>Step 3 of 3 · Confirm</div>
      <h1 style={title}>Ready to create it</h1>
      <p style={sub}>{su.facility.trim()} will be created with you as its first admin.</p>
      <Turnstile action="signup" onToken={setCfToken} />
      {cfBox}
      {errBox(su.err)}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button type="button" className="btn btn-secondary" onClick={() => setSuStep(2)}>← Back</button>
        <button type="submit" className="btn btn-primary" disabled={busy || (legal && !agree)} style={{ flex: 1, minWidth: 0 }}>{arrowBtn(busy ? "Creating…" : `Create ${su.facility.trim() || "the facility"}`, { overflow: "hidden" })}</button>
      </div>
    </form>
  );

  return (
    <div className="tc-auth" style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr", fontFamily: "var(--font-body)", color: "var(--color-text)", background: "var(--color-bg)" }}>
      <div className="tc-brandpane" style={{ borderRight: "2px solid var(--color-text)", padding: 48, display: "flex", flexDirection: "column", justifyContent: "space-between", background: "var(--color-surface)" }}>
        {brand}
        {pane}
        {paneFoot}
      </div>
      <div className="tc-authpane" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <div style={{ width: 400, maxWidth: "100%" }}>
          <div className="tc-brandmobile" style={{ display: "none", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 14, marginBottom: 18, borderBottom: "2px solid var(--color-text)" }}>
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", color: "var(--color-text)" }}>
              <div style={{ width: 14, height: 14, background: "var(--color-accent)" }} />
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 19, letterSpacing: "-0.01em" }}>ThreadCount</div>
            </Link>
            <span style={{ fontSize: 11, color: "var(--color-neutral-700)", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "right" }}>{mode === "signup" && !made ? `Step ${suStep} of 3` : "Uniform management"}</span>
          </div>
          {mode === "login" ? loginBody : signupBody}
          {HAS_SITE && (
            <div className="tc-authfoot" style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 28, paddingTop: 14, borderTop: "1px solid var(--color-divider)", fontSize: 12 }}>
              <Link href="/" style={{ fontWeight: 700 }}>← threadcount.tech</Link>
              <Link href="/demo" style={{ fontWeight: 700 }}>Try the working demo</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
