"use client";
/* Delete my account, from the counter app itself.

   The app signs people up (the hosted door on /m/login), and Google Play requires an app that makes
   accounts to let them be deleted from inside it too — a pointer to a web page is not enough. The
   rule is the desktop's, enforced by the same op (me.deleteAccount): the password always, and when
   this is the last person who can sign in, the facility goes with them behind its typed name.

   It ends on the counter's own sign-in, not the website's home page — a counter phone that has just
   deleted its account should still look like the counter app. */
import { useState } from "react";
import { useSnap } from "@/lib/client";
import { clearAllCounts } from "@/lib/opencount";
import { clearBasket } from "@/components/MBasket";
import { MBar, MBody, MError, MField, MKick, MNote, MRule, MSection, MTop, inputStyle } from "@/components/m";

export default function MDeleteAccount() {
  const { s, isAdmin, mutate, busy } = useSnap();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [going, setGoing] = useState(false);

  // The user list reaches admins only, and there is always an active admin, so an issuer is never
  // the last one (the same reading as the desktop's Settings › People & sign-in).
  const othersLeft = s.users.filter((u) => !u.inactive && u.id !== s.session.userId).length;
  const last = isAdmin && othersLeft === 0;
  const facility = s.settings.facility;
  const demo = !!s.demo;
  const ready = !demo && !!password && (!last || confirm.trim() === facility) && !going && !busy;

  const go = async () => {
    if (!ready) return;
    setGoing(true);
    setErr("");
    const r = await mutate("me.deleteAccount", { password, confirm });
    if (!r.ok) { setGoing(false); setErr(r.error); return; }
    // The session points at a row that is gone. Their part-counts and basket go with it, then the
    // cookie; a full navigation because nothing behind the old session is worth keeping.
    clearAllCounts(s.session.userId);
    clearBasket(s.session.userId);
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* the cookie check on /m/login decides */ }
    window.location.replace("/m/login?deleted=1");
  };

  return (
    <>
      <MTop title="Delete account" back backHref="/m/settings" />
      <MRule />
      <MError msg={err} onDismiss={() => setErr("")} />
      <MBody pad>
        <MKick>{facility}</MKick>
        <h2 style={{ fontSize: 26, fontWeight: 900, margin: "2px 0 0", lineHeight: 1.15 }}>
          {last ? `Delete ${facility} and everything in it?` : "Delete your sign-in?"}
        </h2>
        <p style={{ fontSize: 15, lineHeight: 1.5, margin: "10px 0 0" }}>
          {last
            ? "You are the last person who can sign in, so the facility goes too: its catalogue, staff register, stock and every record. It can't be undone."
            : "Only your sign-in goes. The facility and its records stay, and what you recorded keeps your name on it."}
        </p>
        {last && <MNote tone="warn">Want a copy first? Download a backup from Settings › Data on a computer before you delete.</MNote>}
        {demo && <MNote>The demo is shared and resets itself every 20 minutes, so there is nothing to delete here.</MNote>}

        <MSection label="Confirm" />
        <MField label="Your password">
          <input type="password" autoComplete="current-password" value={password} disabled={demo}
            onChange={(e) => { setPassword(e.target.value); setErr(""); }} style={inputStyle} />
        </MField>
        {last && (
          <MField label="Type the facility name">
            <input value={confirm} placeholder={facility} autoComplete="off" disabled={demo}
              onChange={(e) => { setConfirm(e.target.value); setErr(""); }} style={inputStyle} />
          </MField>
        )}
      </MBody>
      <MBar label={going ? "Deleting…" : last ? "Delete everything" : "Delete my sign-in"} glyph="none" tone="ink"
        disabled={!ready} onClick={go}
        offReason={going ? undefined : demo ? "Not in the demo" : !password ? "Enter your password" : last ? "Type the facility name exactly" : undefined} />
    </>
  );
}
