"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSnap } from "@/lib/client";

/* The first-run checklist. Six things a new room does once, each read from the records rather than
 * remembered: a tick appears because the staff register has a row in it, not because somebody
 * clicked "done". Every row links to the screen that does it. The panel goes on its own once all
 * six are ticked, or once the room is 60 days old with three or more ticked, and an admin can put
 * it away with Dismiss (Facility.checklistDismissed). Today renders it through useSetupSteps(). */
const DAY = 86_400_000;

export type SetupStep = { label: string; done: boolean; href: string; cta: string };

/** The steps, the tally and whether the checklist should show. `welcome` comes from ?welcome=1. */
export function useSetupSteps(): { steps: SetupStep[]; done: number; finished: boolean; visible: boolean; dismiss: () => Promise<void> } {
  const { s, mutate } = useSnap();
  const [hidden, setHidden] = useState(false);
  const [welcome, setWelcome] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("welcome") === "1") setWelcome(true);
  }, []);
  const admin = s.session.role === "Admin";
  const steps: SetupStep[] = [
    { label: "Add staff, or import the register", done: s.staff.length > 0, href: "/app/settings?tab=data", cta: "Settings › Data" },
    { label: "Add garments", done: s.catalog.length > 0, href: "/app/settings?tab=data", cta: "Settings › Data" },
    { label: "Set reorder levels", done: Object.values(s.stock).some((x) => x.reorder !== null && x.reorder !== undefined), href: "/app/stock", cta: "Stock" },
    { label: "Record opening stock", done: s.moves.length > 0 || Object.values(s.stock).some((x) => x.opening > 0), href: "/app/stock", cta: "Stock" },
    { label: "Issue a garment", done: s.issues.length > 0, href: "/app/counter", cta: "Counter" },
    { label: "Bind a barcode or print labels", done: Object.keys(s.barcodes).length > 0, href: "/app/stock", cta: "Stock" },
  ];
  const done = steps.filter((x) => x.done).length;
  const ageDays = Math.floor((Date.now() - new Date(s.createdAt).getTime()) / DAY);
  const finished = done === steps.length || (ageDays >= 60 && done >= 3);
  const visible = !hidden && !s.settings.checklistDismissed && (!finished || welcome);
  async function dismiss() {
    setHidden(true);
    if (admin) await mutate("settings.checklist", { dismissed: true });
  }
  return { steps, done, finished, visible, dismiss };
}

export default function Checklist({ welcome, onDismissWelcome }: { welcome: boolean; onDismissWelcome: () => void }) {
  const { s } = useSnap();
  const admin = s.session.role === "Admin";
  const { steps, done, finished, visible, dismiss: hide } = useSetupSteps();
  const [gone, setGone] = useState(false);
  const show = !gone && (visible || (welcome && !s.settings.checklistDismissed));
  if (!show) return null;

  async function dismiss() {
    setGone(true);
    onDismissWelcome();
    await hide();
  }

  return (
    <div className="tc-panel" style={{ marginBottom: "var(--space-6)" }}>
      <div className="tc-panel-head">
        <div>{welcome ? "Welcome to ThreadCount" : "Getting set up"}</div>
        <div className="tc-panel-aside">{done} of {steps.length}</div>
      </div>
      <div className="tc-panel-list">
        {steps.map((st) => (
          <div key={st.label} className="tc-row" style={{ alignItems: "center" }}>
            <div className="tc-row-fig" style={{ width: 32, flex: "none", fontSize: 16, color: st.done ? "var(--color-accent-700)" : "var(--color-neutral-600)" }} aria-label={st.done ? "done" : "to do"}>{st.done ? "✓" : "○"}</div>
            <div className="tc-row-main">
              <div className="tc-row-name" style={{ textDecoration: st.done ? "line-through" : "none", color: st.done ? "var(--color-neutral-700)" : undefined }}>{st.label}</div>
            </div>
            {!st.done && <Link href={st.href} className="btn btn-secondary">{st.cta}</Link>}
          </div>
        ))}
      </div>
      {(admin || welcome) && (
        <div className="tc-panel-body" style={{ display: "flex", justifyContent: "flex-end", paddingTop: 0 }}>
          <button className="btn btn-ghost" onClick={dismiss}>{finished ? "Done" : "Dismiss"}</button>
        </div>
      )}
    </div>
  );
}
