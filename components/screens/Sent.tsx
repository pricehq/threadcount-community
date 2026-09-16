"use client";
/* The screen you land on when something has gone to your approver.
 *
 * It exists because the old flow jumped straight to the order, which opens on "Awaiting approval"
 * and nothing else: the one question somebody has the second after tapping Send — has anyone
 * actually been told? — was answered by a status word that says only that nobody has decided yet.
 *
 * So the sentence under "What happens next" is computed from what this server can really do
 * (`notifyWays()` — a registered phone, a working mail server, or neither), not from what is
 * usually true elsewhere. A screen that promises a notification nobody configured is how a request
 * sits for three weeks.
 *
 * No back chevron. Behind this screen is a half-filled form for a request that has already been
 * raised, and the one thing worse than losing a draft is sending the same ask twice.
 */
import Link from "next/link";
import { MBar, MBody, MRule, MTop } from "@/components/m";
import { INK, N600 } from "@/components/staffui";

export type SentAction = { label: string; href: string };

export default function Sent({ title = "Sent", headline, sub, next, actions, bar }: {
  /** App-bar title. */
  title?: string;
  /** The 26/900 line: "Sent to" and whoever the approver is. */
  headline: string;
  /** What was asked for, and the code it was given. */
  sub?: string;
  /** One line under "What happens next" — never a paragraph. */
  next?: string;
  /** The outlined buttons, in order. */
  actions?: SentAction[];
  /** The 64px bar at the foot. */
  bar: SentAction;
}) {
  return (
    <>
      <MTop title={title} />
      <MRule />
      <MBody>
        <div style={{ padding: "26px 16px 0" }}>
          <h2 style={{
            fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 26, letterSpacing: "-0.015em",
            lineHeight: 1.1, margin: 0,
          }}>{headline}</h2>
          {sub && <div style={{ fontSize: 14, color: N600, marginTop: 6, lineHeight: 1.5 }}>{sub}</div>}

          {next && (
            /* The mockup's `.notice`: a full 2px ink border rather than staffui's accent edge,
               which is the linen room's voice and this is not from them. */
            <div style={{ border: `2px solid ${INK}`, background: "#fff", padding: "12px 14px", marginTop: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: N600 }}>
                What happens next
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.5, marginTop: 6 }}>{next}</div>
            </div>
          )}

          {actions && actions.length > 0 && (
            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              {actions.map((a) => (
                <Link
                  key={a.href + a.label}
                  href={a.href}
                  className="tcx-bar"
                  style={{
                    minHeight: 52, width: "100%", border: `2px solid ${INK}`, background: "transparent",
                    color: INK, textDecoration: "none", font: "inherit", fontFamily: "var(--font-heading)",
                    fontWeight: 800, fontSize: 14, letterSpacing: "0.05em", textTransform: "uppercase",
                    display: "flex", alignItems: "center", justifyContent: "center", padding: "0 14px",
                  }}
                >{a.label}</Link>
              ))}
            </div>
          )}
        </div>
      </MBody>
      <MBar label={bar.label} href={bar.href} />
    </>
  );
}
