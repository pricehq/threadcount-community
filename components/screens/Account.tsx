"use client";
/* 1J — Account.
 *
 * What a wearer can do to their own sign-in, and one thing they deliberately cannot.
 *
 * Changing the password is the only revocation they have: a staff token carries a fingerprint of
 * the password hash, so setting a new one ends every session signed against the old one at once —
 * a phone left on a ward, a cookie copied off it, a password read over somebody's shoulder. The
 * copy says so plainly, because the consequence is the feature and somebody who does not know it
 * happens will not reach for this when they most need it.
 *
 * Deleting the account is not here, and is not an oversight. Access is the linen room's to grant
 * and theirs to remove: a wearer who could delete their own account would take the record of what
 * they were issued with it.
 */
import { PRIVACY_EMAIL, PRIVACY_URL, TERMS_URL } from "@/lib/links";
import { useState } from "react";
import { MBar, MBody, MError, MRow, MRule, MSection, MTop } from "@/components/m";
import { INK, N600, N700 } from "@/components/staffui";
import { useStaff } from "@/lib/staffclient";
import { forgetPush } from "@/lib/staffpush";
import NotificationSettings, { type NotifyPrefs } from "@/components/screens/NotificationSettings";

const field: React.CSSProperties = {
  width: "100%", minHeight: 52, padding: "0 14px", border: "2px solid var(--color-divider)",
  borderRadius: 0, font: "inherit", fontSize: 16, background: "#fff", color: "var(--color-text)",
};

const label: React.CSSProperties = {
  display: "block", fontSize: 12.5, fontWeight: 800, letterSpacing: "0.06em",
  textTransform: "uppercase", color: N600,
};

export default function AccountScreen({ email, prefs, pushReady }: {
  email: string; prefs: NotifyPrefs; pushReady: boolean;
}) {
  const { me, mutate, busy } = useStaff();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delPw, setDelPw] = useState("");
  const [deleting, setDeleting] = useState(false);

  /* Delete my sign-in (account.delete). The staff record the linen room keeps is not theirs to
   * delete and stays; this is the login and the phones it told. Ends on the sign-in screen, saying
   * so, because a phone that has just deleted its account should not look like it has crashed. */
  async function deleteMe() {
    if (!delPw || deleting) return;
    setDeleting(true);
    setErr("");
    forgetPush();
    const r = await mutate("account.delete", { password: delPw });
    if (!r.ok) { setDeleting(false); setErr(r.error); return; }
    window.location.replace("/my/signin?deleted=1");
  }

  // The server enforces the same floor; checking it here only saves a round trip and a refusal.
  const ready = current.length > 0 && next.length >= 8;

  /* ⛔ Signing out never waits on push.forget succeeding, and never fails because it didn't.
   * Somebody on a ward with no signal still has to be able to leave a phone they are handing on.
   * An orphaned token is reclaimed three other ways — the next registration re-points it, FCM
   * reports it gone, and a password change clears the lot. */
  async function signOut() {
    setLeaving(true);
    const token = forgetPush();
    if (token) void mutate("push.forget", { token });
    await fetch("/api/staff/logout", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    }).catch(() => {});
    // A full navigation: the cookie has just been cleared and every screen behind it is
    // server-rendered.
    window.location.replace("/my/signin");
  }

  return (
    <>
      <MTop title="Account" back backHref="/my" />
      <MRule />
      <MBody>
        <MError msg={err} onDismiss={() => setErr("")} />

        <div style={{ padding: "20px 16px 18px", borderBottom: `2px solid ${INK}`, background: "var(--color-bg)" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 26, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
            {me.name}
          </div>
          <div style={{ fontSize: 13, color: N600, marginTop: 4 }}>{email}</div>
        </div>

        <div style={{ padding: "0 16px" }}>
          <MSection label="Notifications" />
          <NotificationSettings prefs={prefs} configured={pushReady} />

          <MSection label="Sign-in" />
          {done ? (
            <div style={{ background: "#fff", borderLeft: `6px solid ${INK}`, padding: "14px 16px", marginTop: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Password changed</div>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, color: N700, margin: "8px 0 0" }}>
                Every other device signed in as you has been signed out, and any phone of yours set
                up for notifications has been unregistered. This one stays signed in.
              </p>
            </div>
          ) : (
            <>
              {/* A disclosure, not a link: the form is on this screen, so the row says so in words
                  a screen reader is given rather than only by what appears underneath it. */}
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 60,
                  padding: "9px 0", background: "none", border: 0,
                  borderBottom: "1px solid var(--color-divider)", font: "inherit", color: "inherit",
                  textAlign: "left", cursor: "pointer",
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>Change your password</span>
                  <span style={{ display: "block", fontSize: 13, color: N600, marginTop: 1 }}>Signs you out on other devices</span>
                </span>
                <span aria-hidden="true" style={{ color: N600, fontSize: 18 }}>{open ? "–" : "›"}</span>
              </button>

              {open && (
                <div style={{ padding: "16px 0 4px" }}>
                  {/* The words wrap the box rather than sitting beside it: on the one screen where
                      typing in the wrong one of two password fields is silent, both must announce
                      which they are. */}
                  <label style={{ display: "block" }}>
                    <span style={label}>Current password</span>
                    <input
                      type="password" autoComplete="current-password" value={current}
                      onChange={(e) => { setCurrent(e.target.value); setErr(""); }}
                      style={{ ...field, marginTop: 8 }}
                    />
                  </label>
                  <label style={{ display: "block", marginTop: 16 }}>
                    <span style={label}>New password</span>
                    <input
                      type="password" autoComplete="new-password" value={next}
                      onChange={(e) => { setNext(e.target.value); setErr(""); }}
                      style={{ ...field, marginTop: 8 }}
                    />
                  </label>
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: N700, margin: "12px 0 0" }}>
                    At least 8 characters. Changing it signs you out everywhere else straight away.
                    This device stays signed in.
                  </p>
                </div>
              )}
            </>
          )}

          <MSection label="Privacy" />
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: N700, margin: "12px 0 4px" }}>
            ThreadCount holds your sign-in and the {me.terms.store}&rsquo;s record of what you have been
            issued. Deleting your sign-in removes the login and signs this phone out; the record of what
            was issued to you stays with the {me.terms.store}{PRIVACY_EMAIL ? <> (write to {PRIVACY_EMAIL} about that)</> : null}.
          </p>
          {!delOpen ? (
            <button type="button" onClick={() => setDelOpen(true)}
              style={{ background: "none", border: 0, padding: "8px 0", color: "var(--color-accent-700)", font: "inherit", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
              Delete my sign-in
            </button>
          ) : (
            <div style={{ border: `2px solid ${INK}`, borderLeft: "6px solid var(--color-accent)", background: "#fff", padding: "12px 14px", marginTop: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>Delete your sign-in?</div>
              <label style={{ display: "block", marginTop: 10 }}>
                <span style={{ display: "block", fontSize: 12, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: N600, marginBottom: 6 }}>Your password</span>
                <input type="password" autoComplete="current-password" value={delPw} onChange={(e) => { setDelPw(e.target.value); setErr(""); }}
                  style={{ width: "100%", minHeight: 52, padding: "0 14px", border: `2px solid ${INK}`, background: "#fff", color: INK, fontSize: 16, fontFamily: "inherit", borderRadius: 0, boxSizing: "border-box" }} />
              </label>
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button type="button" onClick={() => { setDelOpen(false); setDelPw(""); }}
                  style={{ flex: 1, minHeight: 48, border: `2px solid ${INK}`, background: "transparent", color: INK, font: "inherit", fontWeight: 800, cursor: "pointer" }}>Cancel</button>
                <button type="button" onClick={() => void deleteMe()} disabled={!delPw || deleting}
                  style={{ flex: 1, minHeight: 48, border: 0, background: !delPw || deleting ? "var(--color-neutral-400)" : "var(--color-accent)", color: "#fff", font: "inherit", fontWeight: 800, cursor: "pointer" }}>
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          )}
        </div>

        {PRIVACY_URL && <MRow href={PRIVACY_URL} external mark="ink" title="Privacy policy" sub="What ThreadCount stores, and what it never does" />}
        {TERMS_URL && <MRow href={TERMS_URL} external mark="ink" title="Terms of use" sub="What you and ThreadCount each agree to" />}

        {/* The one thing a wearer can do to a phone they no longer have, so it is findable without
            asking — and at the foot, because it is the last thing anybody comes here to do. */}
        <div style={{ padding: "22px 16px 0" }}>
          <button
            type="button"
            onClick={() => void signOut()}
            style={{
              minHeight: 52, width: "100%", border: `2px solid ${INK}`, borderRadius: 0,
              background: "transparent", color: INK, font: "inherit",
              fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 14,
              letterSpacing: "0.05em", textTransform: "uppercase", display: "flex",
              alignItems: "center", justifyContent: "center", padding: "0 14px",
              cursor: leaving ? "wait" : "pointer",
            }}
          >{leaving ? "Signing out…" : "Sign out"}</button>
        </div>

        <div style={{ height: 24 }} />
      </MBody>

      {open && !done && (
        <MBar
          label={busy ? "Saving…" : "Change my password"}
          glyph="check"
          disabled={!ready || busy}
          onClick={async () => {
            const r = await mutate("account.password", { current, next });
            if (!r.ok) { setErr(r.error); return; }
            setCurrent(""); setNext(""); setOpen(false); setDone(true);
          }}
        />
      )}
    </>
  );
}
