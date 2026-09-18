"use client";
/* Settings, behind the gear on Today: this phone, the account, help and signing out. Everything else
   about the facility lives on the desktop, so there is one place a setting can be wrong. */
import { DELETE_ACCOUNT_URL, PRIVACY_URL, TERMS_URL } from "@/lib/links";
import { useEffect, useState } from "react";
import { useSnap } from "@/lib/client";
import { clearAllCounts } from "@/lib/opencount";
import { printState, type PrintState } from "@/lib/nativeprint";
import { clearBasket } from "@/components/MBasket";
import { MBody, MButton, MError, MONO, MPill, MRow, MRule, MSection, MStepper, MSwitchRow, MTop } from "@/components/m";

const BEEP_KEY = "tc.beep";

export default function MSettings() {
  const { s, isAdmin, mutate, busy } = useSnap();
  const [beep, setBeep] = useState(true);
  const [gate, setGate] = useState(s.settings.varianceReason);
  const [err, setErr] = useState("");
  const [printer, setPrinter] = useState<PrintState | null>(null);
  const [host, setHost] = useState("");
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    try { setBeep(localStorage.getItem(BEEP_KEY) !== "0"); } catch { /* blocked store */ }
    setHost(window.location.host);
    let live = true;
    printState().then((p) => { if (live) setPrinter(p); }).catch(() => { /* stays blank */ });
    return () => { live = false; };
  }, []);

  const toggleBeep = () => {
    const next = !beep;
    setBeep(next);
    try { localStorage.setItem(BEEP_KEY, next ? "1" : "0"); } catch { /* blocked store */ }
  };

  const saveGate = async (n: number) => {
    setGate(n);
    const r = await mutate("settings.update", { varianceReason: n });
    if (!r.ok) { setErr(r.error); setGate(s.settings.varianceReason); }
  };

  const signOut = async () => {
    // Part-counted shelves and the half-built basket are this person's, on a phone that is passed
    // around a linen room. Cleared before the logout POST so a failed request still leaves the
    // device tidy. A full navigation afterwards: the session cookie is gone and every page behind
    // it is server-rendered. /m/login, not /auth, keeps them inside the app.
    setLeaving(true);
    clearAllCounts(s.session.userId);
    clearBasket(s.session.userId);
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* the cookie check on /m/login decides */ }
    window.location.replace("/m/login");
  };

  const roleWord = s.session.role === "Admin" ? "Admin" : "Issuer";
  const tone = printer?.state === "ready" ? "ok" : printer?.state === "unavailable" ? "accent" : "mute";

  return (
    <>
      <MTop title="Settings" back />
      <MRule />
      <MError msg={err} onDismiss={() => setErr("")} />
      <MBody pad>
        <MSection label="This phone" />
        <MSwitchRow title="Beep and buzz on scan" on={beep} onToggle={toggleBeep} />
        <MRow title="Shelf printer" sub={printer?.sub ?? ""} right={printer ? <MPill tone={tone}>{printer.label}</MPill> : null} />
        <MRow title="Server" sub={host} />

        <MSection label="Account" />
        <MRow title={s.settings.facility} sub={s.session.title || roleWord} />
        <MRow title="Count gap needing a reason"
          right={isAdmin
            ? <MStepper n={gate} onChange={saveGate} min={1} max={99} label="gap" />
            : <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 14 }}>{gate}</span>} />
        <MRow title="Help" chev href="/app/help/apps/counter-app" />

        {/* Deleting an account has to be reachable from inside the app (a Play requirement), and this
            is the only place the signed-in counter app names the policies. They go to the site's own
            pages: there is one account-deletion flow, and it is the one on the website. */}
        {(DELETE_ACCOUNT_URL || PRIVACY_URL || TERMS_URL) && <MSection label="Your account and your data" />}
        {DELETE_ACCOUNT_URL && <MRow href={DELETE_ACCOUNT_URL} external title="Delete your account" />}
        {PRIVACY_URL && <MRow href={PRIVACY_URL} external title="Privacy policy" />}
        {TERMS_URL && <MRow href={TERMS_URL} external title="Terms of use" />}

        <div style={{ marginTop: 4 }}>
          <MButton label="Sign out" onClick={signOut} disabled={busy || leaving} />
        </div>
      </MBody>
    </>
  );
}
