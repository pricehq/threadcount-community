"use client";
/* Turning a second factor on, from your own account settings.
 *
 * Optional, with admins prompted rather than forced. Issuers are casual counter users on shared
 * ward phones, where mandatory TOTP gets worked around — shared logins, codes written on the wall
 * — which is worse than not having it. Admins can change pricing, delete records and wipe the
 * facility, so they get a standing nudge.
 *
 * Recovery codes are shown exactly once, at the moment they are created, because they are stored
 * hashed. The copy says so plainly: an admin locked out with no codes is a locked-out facility,
 * since deleting the last admin deletes everything.
 */
import { useCallback, useEffect, useState } from "react";
import { Field } from "@/components/ui";

type Status = { enabled: boolean; enabledAt: string | null; recoveryLeft: number };

export default function TwoFactor({ isAdmin }: { isAdmin: boolean }) {
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [confirming, setConfirming] = useState<"disable" | "regenerate" | null>(null);

  /* A failed status fetch used to render nothing at all.
   *
   * With no catch and no error state, `if (!st) return null` meant a dropped connection or a 500
   * deleted the whole two-factor section out of Settings → Account — silently, so somebody who
   * came here to turn 2FA on found no control and no explanation, and the honest conclusion is
   * that ThreadCount doesn't offer it. Saying so and offering the retry is the difference between
   * a hiccup and a feature that appears not to exist. */
  const [loadErr, setLoadErr] = useState("");
  const load = useCallback(async () => {
    setLoadErr("");
    try {
      const r = await fetch("/api/2fa");
      if (!r.ok) { const j = await r.json().catch(() => ({})); setLoadErr(j.error || "Couldn’t check whether two-factor is on."); return; }
      setSt(await r.json());
    } catch {
      setLoadErr("Couldn’t reach the server, so we can’t say whether two-factor is on.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function post(body: Record<string, unknown>) {
    setBusy(true); setErr("");
    const r = await fetch("/api/2fa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error || "That didn’t work."); return null; }
    return j;
  }

  const box: React.CSSProperties = { border: "2px solid var(--color-text)", padding: 20, marginTop: 16 };

  if (loadErr) {
    return (
      <div style={box}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 20 }}>Two-factor authentication</div>
        <p role="alert" style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 8, color: "var(--color-accent-700)", fontWeight: 600, maxWidth: "60ch" }}>{loadErr}</p>
        <div style={{ marginTop: 16 }}><button className="btn btn-secondary" onClick={() => void load()}>Try again</button></div>
      </div>
    );
  }

  if (!st) return null;

  // Shown once, immediately after enabling or regenerating.
  if (codes) {
    return (
      <div style={box}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 20 }}>Save these recovery codes</div>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 8, color: "var(--color-neutral-800)", maxWidth: "60ch" }}>
          Each works once, in place of a code from your app. This is the only time they can be
          shown — they are stored hashed, so nobody, including us, can read them back. Print them or
          put them somewhere you would still reach without your phone.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 16, fontFamily: "monospace", fontSize: 15 }}>
          {codes.map((c) => <div key={c} style={{ border: "1px solid var(--color-divider)", padding: "8px 10px", background: "#fff" }}>{c}</div>)}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={() => navigator.clipboard?.writeText(codes.join("\n")).catch(() => {})}>Copy all</button>
          <button className="btn btn-primary" onClick={() => { setCodes(null); setSetup(null); setCode(""); void load(); }}>I have saved them</button>
        </div>
      </div>
    );
  }

  if (setup) {
    return (
      <div style={box}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 20 }}>Scan this with your authenticator</div>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 8, color: "var(--color-neutral-800)", maxWidth: "60ch" }}>
          Any authenticator app will do. Then type the six-digit code it shows to prove it worked —
          nothing changes until you do.
        </p>
        <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ background: "#fff", padding: 10, border: "1px solid var(--color-divider)" }} dangerouslySetInnerHTML={{ __html: setup.qr }} />
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>Or type it in</div>
            <div style={{ fontFamily: "monospace", fontSize: 14, wordBreak: "break-all", maxWidth: 260, marginTop: 6 }}>{setup.secret}</div>
          </div>
        </div>
        <Field style={{ marginTop: 16, maxWidth: 220 }} label="Code from the app">
          {(c) => (
            <input {...c} className="input" inputMode="numeric" autoComplete="one-time-code" value={code} placeholder="000000"
              onChange={(e) => { setCode(e.target.value); setErr(""); }} />
          )}
        </Field>
        {err && <div style={{ marginTop: 10, color: "var(--color-accent-700)", fontWeight: 700, fontSize: 13.5 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button className="btn btn-primary" disabled={busy} onClick={async () => {
            const j = await post({ action: "enable", code });
            if (j?.codes) setCodes(j.codes);
          }}>{busy ? "Checking…" : "Turn it on"}</button>
          <button className="btn btn-secondary" onClick={() => { setSetup(null); setCode(""); setErr(""); }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 20 }}>Two-factor authentication</div>
        <span className={st.enabled ? "tag tag-accent" : "tag tag-neutral"}>{st.enabled ? "On" : "Off"}</span>
      </div>

      {st.enabled ? (
        <>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 8, color: "var(--color-neutral-800)", maxWidth: "60ch" }}>
            Signing in asks for a code from your authenticator app as well as your password.{" "}
            {st.recoveryLeft} recovery code{st.recoveryLeft === 1 ? "" : "s"} left.
            {st.recoveryLeft <= 2 && " Worth generating a fresh set."}
          </p>
          {confirming ? (
            <div style={{ marginTop: 14, maxWidth: 320 }}>
              <Field label="Confirm with your password">
                {(c) => (
                  <input {...c} className="input" type="password" autoComplete="current-password" value={pw}
                    onChange={(e) => { setPw(e.target.value); setErr(""); }} />
                )}
              </Field>
              {err && <div style={{ marginTop: 8, color: "var(--color-accent-700)", fontWeight: 700, fontSize: 13.5 }}>{err}</div>}
              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <button className="btn btn-primary" disabled={busy} onClick={async () => {
                  const j = await post({ action: confirming, password: pw });
                  if (!j) return;
                  setPw(""); setConfirming(null);
                  if (j.codes) setCodes(j.codes); else void load();
                }}>{busy ? "Working…" : confirming === "disable" ? "Turn it off" : "Generate new codes"}</button>
                <button className="btn btn-secondary" onClick={() => { setConfirming(null); setPw(""); setErr(""); }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button className="btn btn-secondary" onClick={() => setConfirming("regenerate")}>New recovery codes</button>
              <button className="btn btn-secondary" onClick={() => setConfirming("disable")}>Turn off</button>
            </div>
          )}
        </>
      ) : (
        <>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 8, color: "var(--color-neutral-800)", maxWidth: "60ch" }}>
            A code from your phone as well as your password. ThreadCount holds names, payroll
            numbers and phone numbers for every person on your register, and a password on its own
            is thin protection for that.
          </p>
          {isAdmin && (
            <p style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 10, color: "var(--color-accent-700)", fontWeight: 600, maxWidth: "60ch" }}>
              You are an admin — you can change pricing, delete records and delete the facility.
              Worth turning on.
            </p>
          )}
          {err && <div style={{ marginTop: 10, color: "var(--color-accent-700)", fontWeight: 700, fontSize: 13.5 }}>{err}</div>}
          <button className="btn btn-primary" style={{ marginTop: 14 }} disabled={busy} onClick={async () => {
            const j = await post({ action: "setup" });
            if (j) setSetup({ secret: j.secret, qr: j.qr });
          }}>{busy ? "Preparing…" : "Set up two-factor"}</button>
        </>
      )}
    </div>
  );
}
