"use client";
/* 1J — Your sign-in. One thing on it, and one thing deliberately not on it.
 *
 * Changing the password is the only revocation a wearer has. A staff token carries a fingerprint of
 * the password hash, so setting a new one ends every session signed against the old one at once —
 * a phone left on a ward, a cookie copied off it, a password read over somebody's shoulder. That is
 * why the copy says so plainly: the consequence is the feature, and someone who does not know it
 * happened will not use this when they most need to.
 *
 * Deleting the account is not here, and is not an oversight. Access is the linen room's to grant
 * and theirs to remove: a wearer who could delete their own account would take the record of what
 * they were issued with it.
 */
import { DELETE_ACCOUNT_URL, PRIVACY_EMAIL, PRIVACY_URL, TERMS_URL } from "@/lib/links";
import { useState } from "react";
import { MBar, MBody, MError, MRow, MRule, MTop } from "@/components/m";
import { N600, N700, NumberedField } from "@/components/staffui";
import { useStaff } from "@/lib/staffclient";

const field: React.CSSProperties = {
  width: "100%", minHeight: 52, padding: "0 14px", border: "2px solid var(--color-divider)",
  borderRadius: 0, font: "inherit", fontSize: 16, background: "#fff", color: "var(--color-text)",
};

export default function AccountScreen({ email }: { email: string }) {
  const { mutate, busy } = useStaff();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  // The server enforces the same floor; checking it here only saves a round trip and a refusal.
  const ready = current.length > 0 && next.length >= 8;

  return (
    <>
      <MTop title="Your sign-in" back />
      <MRule />
      <MBody>
        <MError msg={err} onDismiss={() => setErr("")} />
        <div style={{ padding: "20px 16px 18px", borderBottom: "2px solid var(--color-text)", background: "var(--color-bg)" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 24, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
            {email}
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: N700, margin: "10px 0 0" }}>
            This is the address you sign in with. The linen room sets who you are on the register —
            your name, ward and sizes come from them, and only they can change them.
          </p>
        </div>

        {done ? (
          <div style={{ padding: 16 }}>
            <div style={{ background: "#fff", borderLeft: "6px solid var(--color-text)", padding: "14px 16px" }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Password changed</div>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, color: N700, margin: "8px 0 0" }}>
                Every other device signed in as you has been signed out. This one stays signed in.
              </p>
            </div>
          </div>
        ) : (
          <NumberedField n={1} label="Change your password" first>
            {/* Wrapping the box rather than sitting beside it: the two used to be siblings, so
                nothing tied the words to the field and both announced as an unnamed password box —
                on the one screen where typing in the wrong one of two is silent. */}
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: N600 }}>
                Current password
              </span>
              <input
                type="password" autoComplete="current-password" value={current}
                onChange={(e) => { setCurrent(e.target.value); setErr(""); }}
                style={{ ...field, marginTop: 8 }}
              />
            </label>
            <label style={{ display: "block", marginTop: 16 }}>
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: N600 }}>
                New password
              </span>
              <input
                type="password" autoComplete="new-password" value={next}
                onChange={(e) => { setNext(e.target.value); setErr(""); }}
                style={{ ...field, marginTop: 8 }}
              />
            </label>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: N700, margin: "12px 0 0" }}>
              At least 8 characters. Changing it signs you out everywhere else — every other phone or
              browser signed in as you stops working straight away. This device stays signed in.
            </p>
          </NumberedField>
        )}

        {/* Privacy, and the honest answer about deletion.
         *
         * Kyle's rule stands — a wearer cannot delete their own account, because the issue history
         * it hangs off is the linen room's record and not theirs to take away — but "you can't"
         * still has to be said somewhere the person can find it, together with who can. This is
         * also what Play looks for: a policy and a data-deletion route reachable from inside the
         * app, not only from the store listing.
         *
         * They are the shared external rows rather than words in a line, because this shell
         * registers no plugins at all: target="_blank" opens nothing in there, and no URL can be
         * handed to Chrome, so what used to look like three links was three taps that either did
         * nothing or dropped a wearer onto a marketing page with no way home. The row loads the
         * page here, says before the tap that it will, and the phone's back button returns to the
         * app. */}
        <div style={{ borderTop: "2px solid var(--color-text)", padding: "18px 16px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Privacy and your data
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: N700, margin: "10px 0 0" }}>
            ThreadCount holds your sign-in and the linen room&rsquo;s record of what you have been
            issued. You can&rsquo;t delete this account from here — access is the linen room&rsquo;s
            to give and theirs to take away, so ask your uniform coordinator and they can remove it
            straight away.{PRIVACY_EMAIL ? <> If you would rather not ask them, write to {PRIVACY_EMAIL}.</> : null}
          </p>
        </div>
        {PRIVACY_URL && <MRow href={PRIVACY_URL} external mark="ink" title="Privacy policy" sub="What ThreadCount stores, and what it never does" />}
        {DELETE_ACCOUNT_URL && <MRow href={DELETE_ACCOUNT_URL} external mark="ink" title="Deleting your account" sub="How it is done, and what goes with it" />}
        {TERMS_URL && <MRow href={TERMS_URL} external mark="ink" title="Terms of use" sub="What you and ThreadCount each agree to" />}

        <div style={{ height: 20 }} />
      </MBody>

      {!done && (
        <MBar
          label={busy ? "Saving…" : "Change my password"}
          glyph="check"
          disabled={!ready || busy}
          onClick={async () => {
            const r = await mutate("account.password", { current, next });
            if (!r.ok) { setErr(r.error); return; }
            setCurrent(""); setNext(""); setDone(true);
          }}
        />
      )}
    </>
  );
}
