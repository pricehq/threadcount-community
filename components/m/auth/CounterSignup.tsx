"use client";
/* Creating a facility from the counter app — the website's three steps (components/AuthForm.tsx:
 * you, your facility, confirm) as a phone stepper. Same fields, same rules, same body posted to
 * /api/auth/signup, which checks it all again and sets the session cookie.
 *
 * Each step is a card hung on the thread; the stitched progress line in the stage sews on as you
 * go. The kinds of organisation are swatches of their trade's cloth. Confirm hangs the facility's
 * own swing tag, and creating it stamps FACILITY CREATED on it and counts in the four things to do
 * next. Every step is a history entry, so the phone's Back button walks back through the steps
 * rather than out of the app. */
import { useEffect, useRef, useState } from "react";
import Turnstile, { awaitTurnstile, resetTurnstile, turnstileOn } from "@/components/Turnstile";
import { MExternalLink } from "@/components/m";
import { track } from "@/lib/analytics";
import { barcodeSvg } from "@/lib/barcode";
import { CONNECT_URL, inCounterShell } from "@/lib/countershell";
import { doneBuzz } from "@/lib/feedback";
import { PRIVACY_URL, TERMS_URL } from "@/lib/links";
import { DEMO_COUNTER_HREF } from "@/components/MDoors";
import { Door, ErrorLine, Press, ShowHide, SlipField, Stage, TagString, cx, s, stillNow, useBack } from "./kit";
import { EMAIL_RE, KINDS, STATES, cloth, signupBody, strength, type SignupForm } from "./signup";

type Step = 1 | 2 | 3;
type Made = { email: string; mailed: boolean; mail: boolean };

const STEP_NAMES = ["You", "Facility", "Confirm"] as const;

function Progress({ step, made }: { step: Step; made: boolean }) {
  const p = made ? 1 : (step - 1) / 2;
  return (
    <ol className={s.steps} aria-label="Progress">
      <span className={s.stepsSewn} style={{ ["--p" as string]: p }} aria-hidden="true" />
      {STEP_NAMES.map((t, i) => {
        const n = (i + 1) as Step;
        const done = made || step > n, on = !made && step === n;
        return (
          <li key={t} className={s.step} data-on={on ? "1" : "0"} data-done={done ? "1" : "0"} aria-current={on ? "step" : undefined}>
            <span className={s.node} aria-hidden="true">{n}</span>
            <span className={s.stepLbl}>{t}<span className={s.sr}>{done ? ", done" : on ? ", current step" : ""}</span></span>
          </li>
        );
      })}
    </ol>
  );
}

/** The facility's own swing tag: its trade's cloth on the band and the size box, its name, a
 *  barcode, and who its first admin is. */
function FacilityTag({ f, stamp }: { f: SignupForm; stamp?: string }) {
  const c = cloth(f.setting);
  const name = f.facility.trim() || "Your facility";
  const [bars, setBars] = useState("");
  useEffect(() => {
    const code = (name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 14) || "FACILITY");
    setBars(barcodeSvg(code, { text: false, height: 44, module: 1, quiet: 0 }).replace("<svg ", '<svg preserveAspectRatio="none" '));
  }, [name]);
  const kind = KINDS.find((k) => k.key === f.setting)?.label;
  return (
    <div className={s.ftagWrap}>
      <TagString className={s.ftagString} />
      <div className={s.ftagSwing}>
        <div className={s.tagShadow}>
          <div className={s.ftagEdge}><div className={s.ftag} style={{ ["--sw" as string]: c.sw, ["--swfg" as string]: c.fg }}>
            <span className={s.ftagBand} aria-hidden="true" />
            <div className={s.ftagOrg}><span>{kind || "Uniform store"}</span><span>Free account</span></div>
            <div className={s.ftagName}><span className={s.ftagSize} aria-label={f.state ? `State: ${f.state}` : undefined}>{f.state || "—"}</span>{name}</div>
            <div className={s.ftagBars} aria-hidden="true" dangerouslySetInnerHTML={{ __html: bars }} />
            <div className={s.ftagTo}>
              <span style={{ font: "400 10.5px var(--mono)", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)" }}>First admin</span>
              <b>{`${f.first.trim()} ${f.last.trim()}`.trim() || "—"}</b>
              <span style={{ wordBreak: "break-all" }}>{f.email.trim() || "—"}</span>
            </div>
            {stamp && <><span className={s.shock} aria-hidden="true" style={{ top: 182, ["--at" as string]: ".85s" } as React.CSSProperties} /><span className={s.stamp} style={{ ["--at" as string]: ".85s" }}>{stamp}</span></>}
          </div></div>
        </div>
      </div>
    </div>
  );
}

/** Counts up to `to` once, as the checklist rows land. The final number is drawn first. */
function Count({ to }: { to: number }) {
  const [v, setV] = useState(to);
  useEffect(() => {
    if (stillNow()) return;
    let n = 0; setV(0);
    const t = setInterval(() => { n += 1; setV(n); if (n >= to) clearInterval(t); }, 170);
    return () => clearInterval(t);
  }, [to]);
  return <span className={s.bigCount} aria-hidden="true">{v}</span>;
}

export default function CounterSignup({ signupsOpen, demoOpen }: { signupsOpen: boolean; demoOpen: boolean }) {
  const back = useBack("/m/login");
  const [inApp, setInApp] = useState(false);
  const [host, setHost] = useState("");
  useEffect(() => { setInApp(inCounterShell()); setHost(window.location.host); }, []);

  const [step, setStep] = useState<Step>(1);
  /* The phone's sign-up funnel: started once, then each step as it is reached (number only). */
  const signupStarted = useRef(false);
  useEffect(() => {
    if (!signupStarted.current) { signupStarted.current = true; track("signup_started", { screen: "counter" }); }
    track("signup_step", { screen: "counter", step: String(step) });
  }, [step]);
  const [dir, setDir] = useState<"f" | "b">("f");
  const [f, setF] = useState<SignupForm>({ first: "", last: "", facility: "", email: "", pw: "", setting: "", state: "" });
  const [showPw, setShowPw] = useState(false);
  const legal = !!(TERMS_URL || PRIVACY_URL);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [cfToken, setCfToken] = useState("");
  const [cfSlow, setCfSlow] = useState(false);
  const [made, setMade] = useState<Made | null>(null);
  const madeRef = useRef<Made | null>(null); madeRef.current = made;
  const cardRef = useRef<HTMLDivElement | null>(null);
  const firstStep = useRef(true);

  // Each step is its own history entry, so the hardware Back button goes back a step.
  useEffect(() => {
    try { window.history.replaceState({ ...(window.history.state || {}), tcStep: 1 }, ""); } catch { /* sandboxed */ }
    const onPop = (e: PopStateEvent) => {
      // Once the facility exists, the form is gone: stay on the finish.
      if (madeRef.current) { try { window.history.pushState({ tcStep: 4 }, ""); } catch { /* */ } return; }
      const n = Number((e.state as { tcStep?: number } | null)?.tcStep || 1);
      if (n >= 1 && n <= 3) { setDir("b"); setStep(n as Step); setErr(""); }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // A new step takes focus to its card's first field, so a screen reader and the keyboard follow.
  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return; }
    const t = setTimeout(() => {
      const card = cardRef.current;
      // The finish opens from the top, so the stage's finished thread and the stamp land in view.
      if (made) { card?.focus({ preventScroll: true }); card?.closest("[data-scroll]")?.scrollTo({ top: 0 }); return; }
      const first = card?.querySelector<HTMLElement>("input:not(.x)");
      (first || card)?.focus({ preventScroll: true });
      cardRef.current?.scrollIntoView({ block: "start", behavior: stillNow() ? "auto" : "smooth" });
    }, 80);
    return () => clearTimeout(t);
  }, [step, made]);

  const set = (k: keyof SignupForm, v: string) => { setF((x) => ({ ...x, [k]: v })); setErr(""); };
  const st = strength(f.pw);
  const suEmailOk = EMAIL_RE.test(f.email);
  const pwOk = f.pw.length >= 8;
  const step1Ok = !!(f.first.trim() && f.last.trim()) && suEmailOk && pwOk && (!legal || agree);
  const step2Ok = !!f.facility.trim();

  function go(n: Step) {
    setDir("f"); setStep(n); setErr("");
    try { window.history.pushState({ tcStep: n }, ""); } catch { /* */ }
  }
  function stepBack() {
    if (step > 1) { window.history.back(); return; }
    back();
  }

  function next1() {
    if (!f.first.trim() || !f.last.trim()) { setErr("Enter your first and last name."); return; }
    if (!suEmailOk) { setErr("Enter your work email — password resets go there."); return; }
    if (!pwOk) { setErr("Use at least 8 characters for the password."); return; }
    if (legal && !agree) { setErr("Tick that you agree to the Terms of use and the Privacy policy."); return; }
    go(2);
  }
  function next2() {
    if (!step2Ok) { setErr("Give the facility a name."); return; }
    go(3);
  }

  /* The Turnstile token, waited for at submit time — as AuthForm does. On a network that filters
     challenges.cloudflare.com it never comes; wait up to eight seconds, then go anyway and let
     the server give an honest refusal, with a line saying what didn't finish. */
  async function cfNow(): Promise<string> {
    if (!turnstileOn()) return "";
    const t = cfToken || await awaitTurnstile();
    setCfSlow(!t);
    return t;
  }

  async function create() {
    if (!(step1Ok && step2Ok) || (legal && !agree)) { setErr("Something on an earlier step needs finishing."); return; }
    setBusy(true); setErr("");
    try {
      const token = await cfNow();
      const r = await fetch("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(signupBody(f, agree, token)) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        track("signup_failed", { screen: "counter", reason: r.status === 429 ? "throttled" : r.status === 400 ? "rejected" : "other" });
        setErr(j.error || "Couldn’t create the account."); setCfToken(""); resetTurnstile();
        // A refusal about the address or the password belongs on the step that asked for it.
        if (r.status === 409 || /email|password/i.test(String(j.error || ""))) { setDir("b"); setStep(1); }
        return;
      }
      track("signup_completed", { screen: "counter" });
      // The address is shown back before going anywhere: it is the only route back in if the
      // password is forgotten, and a typo is invisible until the day it matters.
      setMade({ email: String(j.email || f.email), mailed: !!j.mailed, mail: j.mail !== false });
      (document.activeElement as HTMLElement | null)?.blur?.();
      setTimeout(() => doneBuzz(), stillNow() ? 0 : 300);
    } catch {
      setErr("No connection — try again. If the address is already taken, the account was created.");
    } finally {
      setBusy(false);
    }
  }

  // ---------- this server isn't taking sign-ups ----------
  if (!signupsOpen) {
    return (
      <div className={s.root}>
        <div className={s.scroll} data-scroll>
          <Stage app="Counter" back={back} kicker="Sign-ups · closed here" lines={["This server", <>isn&rsquo;t taking</>, <em key="e">sign-ups.</em>]} />
          <div className={s.body}>
            <div className={s.info}>
              Accounts on <b>{host || "this server"}</b> are made by the people who run it. If your store uses it, your uniform coordinator can add you — then sign in.
            </div>
            <div className={s.doors}>
              {inApp && <Door href={CONNECT_URL} title={<>Somewhere else? <em>Use another server</em></>} sub="ThreadCount hosted, or your store’s own" />}
              {demoOpen && <Door href={DEMO_COUNTER_HREF} dashed hollow title={<>Just looking? <em>Open the demo</em></>} sub="Shared, resets every 20 minutes" />}
            </div>
          </div>
        </div>
        <div className={s.dock}>
          <Press label="Sign in instead" onClick={() => window.location.assign("/m/login")} />
        </div>
      </div>
    );
  }

  // ---------- the facility exists ----------
  if (made) {
    const todo: [string, string][] = [
      [made.mail && made.mailed ? "Check the note we sent" : "Check the address is right", made.mail && made.mailed ? "If it never arrives, the address on the account is wrong. Resets cannot reach you until it is fixed." : "It is the only route back in if the password is forgotten."],
      ["Add a second admin", "Settings › People & sign-in, on a computer. Two people can always get back in; one cannot."],
      ["Bring in the catalogue and staff", "CSV templates are on the import screen, or type them in over an afternoon."],
      ["Hand out the staff app", "Wearers sign in with a code printed from their record — no sign-up for them."],
    ];
    return (
      <div className={s.root}>
        <div className={s.scroll} data-scroll>
          <Stage app="Counter" kicker="Free account · created" lines={[<>{f.facility.trim() || "Your facility"}</>, <>is <em>open.</em></>]}>
            <Progress step={3} made />
          </Stage>
          <div className={s.body} ref={cardRef} tabIndex={-1} style={{ outline: "none" }}>
            <div role="status" aria-live="polite" className={s.sr}>Facility created. You are signed in as {made.email}.</div>
            <FacilityTag f={f} stamp="Facility created" />
            <p className={s.note}>You&rsquo;re signed in as <b style={{ wordBreak: "break-all" }}>{made.email}</b>{f.first.trim() ? `, ${f.first.trim()}` : ""}.</p>
            <div className={s.info} role="note">
              {!made.mail
                ? "No mail is configured on this server, so that address hasn’t been checked. Make sure it is right — it is where a password reset would go."
                : made.mailed
                  ? "We sent a note to that address. If it does not arrive, the address is wrong — fix it under Settings › Account before you sign out, or a forgotten password locks the facility."
                  : "We couldn’t send a note to that address. Check it is right under Settings › Account before you sign out — otherwise a forgotten password locks the facility."}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 6 }}>
                <Count to={todo.length} />
                <span className={s.fLabel} style={{ paddingBottom: 6 }}>Things to do next</span>
              </div>
              <div className={s.todo}>
                {todo.map(([t, sub], i) => (
                  <div key={t} className={s.todoRow} style={{ ["--d" as string]: `${0.2 + i * 0.17}s` }}>
                    <span className={s.todoN}>{i + 1}</span>
                    <div><div className={s.todoT}>{t}</div><div className={s.todoS}>{sub}</div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className={s.dock}>
          {/* A full navigation: the session cookie was just set, and /m is server-rendered from it.
              /m/signed-in?new=1 lands on Today with the new-facility banner. */}
          <Press label="Open the counter" onClick={() => window.location.replace("/m/signed-in?new=1")} />
        </div>
      </div>
    );
  }

  // ---------- the three steps ----------
  const headline: Record<Step, React.ReactNode[]> = {
    1: ["Open your", <><em>uniform store.</em></>],
    2: ["Name the", <em key="e">facility.</em>],
    3: ["Ready to", <>hang the <em>tag.</em></>],
  };
  const c = cloth(f.setting);

  return (
    <div className={s.root}>
      <div className={s.scroll} data-scroll>
        <Stage app="Counter" back={stepBack} kicker={`Free account · step ${step} of 3`} lines={headline[step]}
          lede={step === 1 ? <>Free, for any organisation that hands out uniforms. You become its <b>first admin</b>.</> : undefined}>
          <Progress step={step} made={false} />
        </Stage>
        <form className={s.body} noValidate onSubmit={(e) => { e.preventDefault(); if (step === 1) next1(); else if (step === 2) next2(); else void create(); }}>
          <div className={s.card} data-dir={dir} key={step} ref={cardRef} tabIndex={-1}>
            {step === 1 && (
              <>
                <div className={s.cardKick}><span>01 · You</span><span>Admin</span></div>
                <div className={s.twoUp}>
                  <SlipField label="First name" value={f.first}>
                    {(p) => <input {...p} autoComplete="given-name" autoCapitalize="words" enterKeyHint="next" value={f.first} onChange={(e) => set("first", e.target.value)} />}
                  </SlipField>
                  <SlipField label="Last name" value={f.last}>
                    {(p) => <input {...p} autoComplete="family-name" autoCapitalize="words" enterKeyHint="next" value={f.last} onChange={(e) => set("last", e.target.value)} />}
                  </SlipField>
                </div>
                <SlipField label="Work email" value={f.email} hint="Password resets go here, so it has to be right.">
                  {(p) => <input {...p} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="email" enterKeyHint="next" placeholder="you@yourstore.org" value={f.email} onChange={(e) => set("email", e.target.value)} />}
                </SlipField>
                <div>
                  <SlipField label="Password" value={f.pw} right={<ShowHide on={showPw} onToggle={() => setShowPw(!showPw)} />}
                    hint={f.pw ? `${st.word}. At least 8 characters; a sentence works best.` : "At least 8 characters; a sentence works best."}>
                    {(p) => <input {...p} type={showPw ? "text" : "password"} autoComplete="new-password" enterKeyHint="next" value={f.pw} onChange={(e) => set("pw", e.target.value)} />}
                  </SlipField>
                  <div className={s.meter} aria-hidden="true">
                    {[1, 2, 3, 4].map((n) => <i key={n} className={cx(pwOk && st.score >= n && s.on, pwOk && st.score === 4 && s.top)} />)}
                  </div>
                </div>
                {legal && (
                  <label className={s.consent}>
                    <input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setErr(""); }} />
                    <span>I agree to the {TERMS_URL ? <MExternalLink href={TERMS_URL}>Terms of use</MExternalLink> : "Terms of use"}{TERMS_URL && PRIVACY_URL ? " and the " : ""}{PRIVACY_URL ? <MExternalLink href={PRIVACY_URL}>Privacy policy</MExternalLink> : null}, and I can act for the facility I am setting up.</span>
                  </label>
                )}
                <p className={s.small}>Joining a store that already uses ThreadCount? Ask its admin to add you instead.</p>
              </>
            )}
            {step === 2 && (
              <>
                <div className={s.cardKick}><span>02 · Your facility</span><span>On every slip</span></div>
                <SlipField label="Facility name" value={f.facility} hint="It appears on every screen, report and order sheet.">
                  {(p) => <input {...p} autoComplete="organization" autoCapitalize="words" enterKeyHint="next" placeholder="e.g. Kestrel Bay Hotel" value={f.facility} onChange={(e) => set("facility", e.target.value)} />}
                </SlipField>
                <fieldset className={s.fieldset} aria-describedby="kind-hint">
                  <legend className={cx(s.fLabel, s.legend)}>Kind of organisation <span style={{ color: "var(--muted)", letterSpacing: ".08em" }}>· optional</span></legend>
                  <div className={s.chips}>
                    {KINDS.map((k) => (
                      <span key={k.key} style={{ display: "contents" }}>
                        <input className={cx(s.chipIn, "x")} type="radio" name="kind" id={"kind-" + k.key} value={k.key} checked={f.setting === k.key}
                          onChange={() => set("setting", k.key)} />
                        {/* Tapping the chosen swatch again un-chooses it: the question is optional. */}
                        <label htmlFor={"kind-" + k.key} className={s.chip} style={{ ["--sw" as string]: k.sw, ["--swfg" as string]: k.fg }}
                          onClick={(e) => { if (f.setting === k.key) { e.preventDefault(); set("setting", ""); } }}>
                          <span className={s.chipSw} aria-hidden="true">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="square"><path d="m5 12 5 5L20 7" /></svg>
                          </span>
                          {k.label}
                        </label>
                      </span>
                    ))}
                  </div>
                  <div id="kind-hint" className={s.hint}>Sets the words the screens use. Change them any time in Settings.</div>
                </fieldset>
                <fieldset className={s.fieldset} aria-describedby="state-hint">
                  <legend className={cx(s.fLabel, s.legend)}>State or territory <span style={{ color: "var(--muted)", letterSpacing: ".08em" }}>· optional</span></legend>
                  <div className={s.sizes}>
                    {STATES.map(([v, l]) => (
                      <span key={v} style={{ display: "contents" }}>
                        <input className={cx(s.chipIn, "x")} type="radio" name="state" id={"st-" + v} value={v} checked={f.state === v} onChange={() => set("state", v)} />
                        <label htmlFor={"st-" + v} className={s.size} title={l}
                          onClick={(e) => { if (f.state === v) { e.preventDefault(); set("state", ""); } }}>
                          <span aria-hidden="true">{v}</span><span className={s.sr}>{l}</span>
                        </label>
                      </span>
                    ))}
                  </div>
                  <div id="state-hint" className={s.hint}>Sets the time zone for counts and month-end, nothing else.</div>
                </fieldset>
              </>
            )}
            {step === 3 && (
              <>
                <div className={s.cardKick}><span>03 · Confirm</span><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><i style={{ width: 10, height: 10, background: c.sw, border: "1px solid rgba(0,0,0,.25)", display: "block" }} />{KINDS.find((k) => k.key === f.setting)?.label || "Any organisation"}</span></div>
                <FacilityTag f={f} />
                <p className={s.note}><b>{f.facility.trim()}</b> will be created with you as its first admin. Everything else can be handed to a colleague later.</p>
                <button type="button" className={s.textBtn} onClick={() => { setDir("b"); setStep(1); try { window.history.pushState({ tcStep: 1 }, ""); } catch { /* */ } }}>Change something</button>
                {turnstileOn() && <Turnstile action="signup" onToken={setCfToken} quiet />}
                {cfSlow && <div className={s.info} role="status">The security check didn&rsquo;t finish. If this keeps happening, your network may be blocking challenges.cloudflare.com — try again, or ask IT.</div>}
              </>
            )}
          </div>
          <ErrorLine msg={err} />
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      </div>
      <div className={s.dock}>
        <div className={s.dockLine}>
          <span>Already have an account?</span>
          <a className={s.textBtn} href="/m/login">Sign in</a>
        </div>
        {step === 1 && <Press label="Next: your facility" onClick={next1} />}
        {step === 2 && <Press label="Next: confirm" onClick={next2} />}
        {step === 3 && <Press label={`Create ${f.facility.trim() || "the facility"}`} busyLabel="Creating…" onClick={() => void create()} busy={busy} />}
      </div>
    </div>
  );
}
