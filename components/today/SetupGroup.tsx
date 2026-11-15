"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSnap } from "@/lib/client";
import { Panel, QueueRow } from "@/components/portal";
import { useSetupSteps } from "@/components/Checklist";

/* The first-run checklist, as the first queue group until it is done or dismissed. Which steps are
   done and when it shows come from Checklist's hook, so the rules live in one place. */
export default function SetupGroup() {
  const { isAdmin } = useSnap();
  const { steps, done, finished, visible, dismiss } = useSetupSteps();
  const [welcome, setWelcome] = useState(false);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("welcome") === "1") setWelcome(true); }, []);
  if (!visible) return null;

  return (
    <Panel
      id="setup"
      icon="doc"
      title={welcome ? "Welcome to ThreadCount" : "Getting set up"}
      count={steps.length - done}
      foot={(isAdmin || welcome) ? <button type="button" className="btn btn-ghost" onClick={() => dismiss()}>{finished ? "Done" : "Dismiss"}</button> : undefined}
    >
      {steps.map((st) => (
        <QueueRow
          key={st.label}
          age={<span aria-hidden="true">{st.done ? "✓" : "○"}</span>}
          ageLabel={st.done ? "done" : "to do"}
          title={<span style={st.done ? { textDecoration: "line-through", color: "var(--color-neutral-700)", fontWeight: 500 } : undefined}>{st.label}</span>}
          meta={null}
          actions={st.done ? undefined : <Link href={st.href} className="btn btn-secondary" aria-label={`${st.label}: ${st.cta}`}>{st.cta}</Link>}
        />
      ))}
    </Panel>
  );
}
