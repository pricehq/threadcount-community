"use client";
import { useState } from "react";
import { useSnap } from "@/lib/client";
import { Dialog, ErrorLine, Field } from "@/components/ui";
import type { UserRec } from "@/lib/compute";

/** Add a user, or edit one (role, name, new password, deactivate). */
export default function UserDialog({ user, onClose }: { user: UserRec | null; onClose: () => void }) {
  const { s, mutate } = useSnap();
  const [f, setF] = useState({ first: user?.first || "", last: user?.last || "", title: user?.title || "", email: user?.email || "", role: user?.role || "ISSUER", password: "" });
  const [err, setErr] = useState("");
  const invalid = !f.first.trim() || !f.last.trim() || (!user && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email) || f.password.length < 8)) || (!!user && f.password !== "" && f.password.length < 8);
  async function save() {
    if (invalid) return;
    const r = user ? await mutate("users.update", { id: user.id, first: f.first, last: f.last, title: f.title, role: f.role, password: f.password }) : await mutate("users.add", f);
    if (!r.ok) { setErr(r.error); return; }
    onClose();
  }
  async function remove() {
    if (!user || !confirm(`Deactivate ${user.first} ${user.last}'s login? They can be reactivated later.`)) return;
    const r = await mutate("users.remove", { id: user.id });
    if (!r.ok) { setErr(r.error); return; }
    onClose();
  }
  return (
    <Dialog title={user ? "Edit user" : "Add user"} width={520} onClose={onClose}>
      <div className="tc-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
        <Field label="First name">{(c) => <input {...c} className="input" value={f.first} onChange={(e) => setF({ ...f, first: e.target.value })} />}</Field>
        <Field label="Last name">{(c) => <input {...c} className="input" value={f.last} onChange={(e) => setF({ ...f, last: e.target.value })} />}</Field>
        <Field label="Title">{(c) => <input {...c} className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Linen Room Assistant" />}</Field>
        <Field label="Role">{(c) => <select {...c} className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as "ADMIN" | "ISSUER" })}><option value="ISSUER">Issuer</option><option value="ADMIN">Admin</option></select>}</Field>
        <Field label="Work email" style={{ gridColumn: "1 / -1" }} hint={user ? "Can’t be changed." : undefined}>{(c) => <input {...c} className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} disabled={!!user} />}</Field>
        <Field label={user ? "New password (leave blank to keep)" : "Password"} style={{ gridColumn: "1 / -1" }} hint="At least 8 characters. Not emailed; hand it over yourself.">{(c) => <input {...c} className="input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />}</Field>
      </div>
      <ErrorLine msg={err} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
        <div>{user && user.id !== s.session.userId && <button className="btn btn-ghost" onClick={remove}>Deactivate</button>}</div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={invalid}>Save</button></div>
      </div>
    </Dialog>
  );
}
