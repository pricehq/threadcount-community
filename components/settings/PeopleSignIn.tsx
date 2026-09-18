"use client";
/* People & sign-in: your account, password, two-factor, users, deactivated users, single sign-on,
 * and deleting your own account. Sign out lives in the rail, and in the More sheet on a phone. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSnap } from "@/lib/client";
import { Field } from "@/components/ui";
import { Tag } from "@/components/portal";
import TwoFactor from "@/components/TwoFactor";
import SsoSettings from "@/components/SsoSettings";
import type { UserRec } from "@/lib/compute";
import { Msg, SectionHead, useSaver } from "./common";
import { useBackupExport } from "./backup";
import UserDialog from "./UserDialog";

const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 14, padding: "11px 16px", borderTop: "1px solid #cfcccb", fontSize: 14, flexWrap: "wrap" };

export default function PeopleSignIn() {
  const { s, isAdmin, mutate } = useSnap();
  const router = useRouter();
  const { msg, say } = useSaver();
  const { bkBusy, exportBackup } = useBackupExport(say);
  const [me, setMe] = useState({ first: s.session.first, last: s.session.last, title: s.session.title });
  const meDirty = me.first !== s.session.first || me.last !== s.session.last || me.title !== s.session.title;
  const [pw, setPw] = useState({ current: "", next: "", again: "" });
  const [userDlg, setUserDlg] = useState<UserRec | null | false>(false);
  const [del, setDel] = useState({ open: false, password: "", confirm: "", busy: false, err: "" });

  const activeUsers = s.users.filter((u) => !u.inactive);
  const inactiveUsers = s.users.filter((u) => u.inactive);
  // The user list reaches admins only, and there is always an active admin, so an issuer is never last.
  const othersLeft = s.users.filter((u) => !u.inactive && u.id !== s.session.userId).length;
  const last = isAdmin && othersLeft === 0;

  return (
    <>
      <SectionHead divider={false}>Your account</SectionHead>
      <div style={{ fontSize: 14 }}>Signed in as <b>{s.session.name}</b> · {s.session.role} · {s.session.email}</div>
      <div className="tc-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, maxWidth: 720 }}>
        <Field label="First name">{(c) => <input {...c} className="input" value={me.first} onChange={(e) => setMe({ ...me, first: e.target.value })} disabled={!!s.demo} />}</Field>
        <Field label="Last name">{(c) => <input {...c} className="input" value={me.last} onChange={(e) => setMe({ ...me, last: e.target.value })} disabled={!!s.demo} />}</Field>
        <Field label="Title">{(c) => <input {...c} className="input" value={me.title} onChange={(e) => setMe({ ...me, title: e.target.value })} placeholder="e.g. Uniform Coordinator" disabled={!!s.demo} />}</Field>
      </div>
      <div><button className="btn btn-secondary" disabled={!meDirty || !me.first.trim() || !me.last.trim()} onClick={async () => { const r = await mutate("me.profile", me); say("me", r.ok ? "Saved." : r.error); }}>Save my details</button></div>
      <Msg text={msg.me} />

      <SectionHead>Password</SectionHead>
      <div className="tc-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, maxWidth: 720 }}>
        <Field label="Current password">{(c) => <input {...c} className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />}</Field>
        <Field label="New password" hint="At least 8 characters.">{(c) => <input {...c} className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />}</Field>
        <Field label="Confirm" error={pw.again && pw.next !== pw.again ? "The two new passwords don’t match." : undefined}>{(c) => <input {...c} className="input" type="password" autoComplete="new-password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} />}</Field>
      </div>
      <div><button className="btn btn-secondary" disabled={!pw.current || pw.next.length < 8 || pw.next !== pw.again} onClick={async () => { const r = await mutate("me.password", { current: pw.current, next: pw.next }); say("pw", r.ok ? "Password changed." : r.error); if (r.ok) setPw({ current: "", next: "", again: "" }); }}>Change password</button></div>
      <Msg text={msg.pw} />

      <SectionHead>Two-factor</SectionHead>
      <TwoFactor isAdmin={isAdmin} />

      {isAdmin && (
        <>
          <SectionHead meta={<><span className="tc-mono">{activeUsers.length}</span> can sign in</>} right={<button className="btn btn-secondary" onClick={() => setUserDlg(null)}>Add user</button>}>Users</SectionHead>
          <div style={{ border: "2px solid var(--color-text)" }}>
            {activeUsers.map((u, i) => (
              <div key={u.id} style={{ ...row, borderTop: i ? row.borderTop : 0 }}>
                <div style={{ flex: 1, minWidth: 200 }}><b>{u.first} {u.last}</b> <span className="tc-meta-line">{u.title}</span><div className="tc-meta-line">{u.email}</div></div>
                <Tag tone={u.role === "ADMIN" ? "ink" : "quiet"}>{u.role === "ADMIN" ? "Admin" : "Issuer"}</Tag>
                <button className="btn btn-ghost" aria-label={`Edit ${u.first} ${u.last}`} onClick={() => setUserDlg(u)}>Edit</button>
              </div>
            ))}
          </div>
          {inactiveUsers.length > 0 && (
            <>
              <SectionHead>Deactivated users</SectionHead>
              <div style={{ border: "2px solid var(--color-text)" }}>
                {inactiveUsers.map((u, i) => (
                  <div key={u.id} style={{ ...row, borderTop: i ? row.borderTop : 0, color: "var(--color-neutral-700)" }}>
                    <div style={{ flex: 1, minWidth: 200 }}><b>{u.first} {u.last}</b> {u.title}<div className="tc-meta-line">{u.email}</div></div>
                    <Tag tone="quiet">{u.role === "ADMIN" ? "Admin" : "Issuer"}</Tag>
                    <button className="btn btn-ghost" aria-label={`Let ${u.first} ${u.last} sign in again`} onClick={async () => { const r = await mutate("users.update", { id: u.id, inactive: false }); say("users", r.ok ? `${u.first} reactivated.` : r.error); }}>Reactivate</button>
                  </div>
                ))}
              </div>
              <Msg text={msg.users} />
            </>
          )}
        </>
      )}

      <SectionHead>Single sign-on</SectionHead>
      <SsoSettings isAdmin={isAdmin} demo={!!s.demo} sso={s.settings.sso} users={s.users} onChanged={() => router.refresh()} mutate={mutate} />

      <SectionHead meta={last ? "deletes the facility and everything in it" : "the facility and its records stay"}>Delete my account</SectionHead>
      {last && (
        <div style={{ fontSize: 13 }}>
          <button className="btn btn-ghost" disabled={bkBusy} onClick={exportBackup} style={{ color: "var(--color-accent-700)", fontWeight: 700, paddingLeft: 0 }}>Download a backup first</button>
          <Msg text={msg.backup} />
        </div>
      )}
      {!del.open ? (
        <div>
          <button className="btn btn-secondary" style={{ borderColor: "var(--color-accent)", color: "var(--color-accent-700)" }} onClick={() => setDel({ open: true, password: "", confirm: "", busy: false, err: "" })} disabled={!!s.demo}>
            Delete my account{last ? " and this facility" : ""}
          </button>
        </div>
      ) : (
        <div className="tc-flag" style={{ border: "2px solid var(--color-text)", borderLeft: "4px solid var(--color-accent)", padding: 16, maxWidth: 520 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "var(--color-accent-700)" }}><span className="tc-mark" aria-hidden="true" />{last ? `Delete ${s.settings.facility} and everything in it?` : "Delete your login?"}</div>
          <Field label="Your password" style={{ marginTop: 12 }} error={del.err || undefined}>{(c) => <input {...c} className="input" type="password" autoComplete="current-password" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value, err: "" })} />}</Field>
          {last && <Field label="Type the facility name to confirm" style={{ marginTop: 8 }}>{(c) => <input {...c} className="input" value={del.confirm} placeholder={s.settings.facility} onChange={(e) => setDel({ ...del, confirm: e.target.value, err: "" })} />}</Field>}
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button className="btn btn-ghost" onClick={() => setDel({ open: false, password: "", confirm: "", busy: false, err: "" })}>Cancel</button>
            <button className="btn btn-primary" disabled={del.busy || !del.password || (last && del.confirm.trim() !== s.settings.facility)}
              onClick={async () => {
                setDel((d) => ({ ...d, busy: true, err: "" }));
                const r = await mutate("me.deleteAccount", { password: del.password, confirm: del.confirm });
                if (!r.ok) { setDel((d) => ({ ...d, busy: false, err: r.error })); return; }
                // The session points at a row that is gone; drop the cookie.
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.assign("/?deleted=1");
              }}>
              {del.busy ? "Deleting…" : last ? "Delete everything" : "Delete my login"}
            </button>
          </div>
        </div>
      )}

      {userDlg !== false && <UserDialog user={userDlg} onClose={() => setUserDlg(false)} />}
    </>
  );
}
