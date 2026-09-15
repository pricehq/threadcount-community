"use client";
/* 1A — Home.
 *
 * Answer "is anything waiting for me?" in one glance, then get out of the way. One live thing at
 * the top — the request furthest along — and everything else is a shortcut. There is no list of
 * orders here on purpose: that is what the Orders tab is for, and a home screen that tried to be
 * both would be neither.
 */
import { useState } from "react";
import { MBody, MTopBrand } from "@/components/m";
import {
  Banner, DarkCard, DarkRow, EdgeRow, IdentityBlock, Kicker, N600, Notice, QuickGrid, SecondaryBar,
} from "@/components/staffui";
import StaffNav from "@/components/staffnav";
import { statusText } from "@/lib/staffreq";
import type { ReqRow } from "@/lib/staffdata";

type Data = {
  name: string; num: string; ward: string; facility: string;
  hasManager: boolean; wardDesk: boolean;
  holding: number; live: ReqRow | null; openCount: number; notice: string;
  /** Open requests this person raised for somebody else — never their own. */
  raisedOpen: ReqRow[];
};

const ic = (d: React.ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden>{d}</svg>
);

export default function HomeScreen({ data, approvals, roundBags, kitCheckDue, canRaiseForTeam }: {
  data: Data; approvals: number; roundBags: number; kitCheckDue: string | null;
  /** Does anybody name this person as their manager? If so they may raise for them. */
  canRaiseForTeam: boolean;
}) {
  const [leaving, setLeaving] = useState(false);
  const live = data.live;
  const st = live ? statusText(live) : null;

  return (
    <>
      <MTopBrand
        facility={data.facility}
        right={
          <button
            onClick={async () => {
              setLeaving(true);
              await fetch("/api/staff/logout", {
                method: "POST", headers: { "content-type": "application/json" }, body: "{}",
              }).catch(() => {});
              // A full navigation: the cookie has just been cleared and every screen behind it is
              // server-rendered.
              window.location.replace("/my/signin");
            }}
            style={{
              background: "none", border: "1px solid rgba(243,242,242,0.4)", color: "var(--color-neutral-400)",
              font: "inherit", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em",
              textTransform: "uppercase", padding: "6px 10px", borderRadius: 0,
              cursor: leaving ? "wait" : "pointer", flex: "0 0 auto", minHeight: 30,
            }}
          >{leaving ? "…" : "Sign out"}</button>
        }
      />
      <MBody>
        {/* A manager with people waiting on them sees it before anything of their own. The queue
            is the one thing in this app where somebody else is blocked until they act. */}
        {approvals > 0 && (
          <Banner
            title={`${approvals} request${approvals === 1 ? "" : "s"} waiting on you`}
            body={approvals === 1 ? "Someone on your team is waiting to be approved." : "People on your team are waiting to be approved."}
            onOpen={() => { window.location.href = "/my/approvals"; }}
          />
        )}

        <IdentityBlock ward={data.ward} num={data.num} name={data.name} />

        <div style={{ padding: 16 }}>
          {live && st ? (
            /* One request covers as many garments as the person needed, so the card leads with the
             * summary — "5 garments · Tunic, Trousers, Fleece" — and the list itself is a tap away
             * on the order. This screen answers "is anything waiting for me?" and then gets out of
             * the way; a home screen that unpacked every request would be the Orders tab.
             *
             * The decision rides alongside the status because on a split one the status word is a
             * half-truth: "Approved — with linen room" over an ask where the fleece was knocked
             * back has somebody expecting three garments in a bag that holds two. */
            <DarkCard
              href={`/my/orders/${live.id}`}
              kicker={st.label}
              title={live.summary}
              meta={[live.decision && live.lineCount > 1 ? live.decision : "", st.note].filter(Boolean).join(" · ")}
            >
              {live.collectCode && <DarkRow label="Collection code" value={live.collectCode.split("").join(" ")} />}
            </DarkCard>
          ) : (
            <DarkCard
              kicker={data.holding > 0 ? "Nothing on the way" : "Nothing yet"}
              title={data.holding > 0 ? `${data.holding} garment${data.holding === 1 ? "" : "s"} with you` : "No uniform on your record"}
              meta={
                data.hasManager
                  ? "Ask for something and it goes to your manager first."
                  : "Your manager isn’t recorded yet — the linen room has to set who approves your requests before you can ask for anything."
              }
            />
          )}
        </div>

        <div style={{ padding: "0 16px 8px" }}><Kicker>Quick actions</Kicker></div>
        <QuickGrid
          items={[
            { label: "Request an item", href: "/my/request", icon: ic(<><path d="M12 5v14" /><path d="M5 12h14" /></>) },
            { label: "Swap a size", href: "/my/request?swap=1", icon: ic(<><path d="M3 7V3h4" /><path d="M17 3h4v4" /><path d="M21 17v4h-4" /><path d="M7 21H3v-4" /><path d="M8 12h8" /></>) },
            { label: "Report damage", href: "/my/damage", icon: ic(<><path d="M12 3 2 20h20z" /><path d="M12 10v4" /><path d="M12 17h.01" /></>) },
            { label: "What’s on the shelf", href: "/my/shelf", icon: ic(<><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>) },
          ]}
        />

        {/* The desk’s own work, only for the person on it: signing the trolley in.

            The round is listed by ward, so a clerk whose ward was never filled in has no round to
            open — /my/round refuses a blank ward, and signing is fenced the same way on the
            server. The card still appears, because the desk work is real and hiding it would tell
            her nothing; it just stops being a link and names the missing ward. Reading "nothing on
            the round right now" and tapping through to a not-found page was the worst of both:
            indistinguishable from a quiet day, and no clue the linen room had to fix anything. */}
        {data.wardDesk && (
          <div style={{ padding: "16px 16px 0" }}>
            {data.ward ? (
              <DarkCard
                href="/my/round"
                kicker="Ward desk"
                title={roundBags > 0 ? `${roundBags} bag${roundBags === 1 ? "" : "s"} to sign` : "Ward round"}
                meta={roundBags > 0 ? "Arriving on your ward today." : "Nothing on the round for your ward right now."}
              />
            ) : (
              <DarkCard
                kicker="Ward desk"
                title="No ward on your record"
                meta="The round is listed by ward, so there is nothing to show you until the linen room records which ward you are on. Ask them to set it."
              />
            )}
          </div>
        )}

        {/* Somebody who will not type a request themselves asks the person who approves it, which
            is the one door left for raising on another person's behalf. The server sends anything
            a manager raises up a level, which is why the card can say so plainly — approving your
            own raise is the one thing this must never let happen. */}
        {canRaiseForTeam && (
          <div style={{ padding: "16px 16px 0" }}>
            <DarkCard
              href="/my/raise"
              kicker="Your team"
              title="Raise for someone you manage"
              meta="Goes to your own manager for approval, not to you."
            />
          </div>
        )}

        {/* What they have raised for other people, as one row rather than a list.
            Every list in this app starts from the wearer, so until Orders grew a Raised tab a
            request somebody typed in for a colleague vanished the moment it was sent — and the
            raise screen promises they will see the outcome. Home is not the place for the list
            itself (that rule is the whole shape of this screen), but it is the place to say the
            requests exist and where they went. */}
        {data.raisedOpen.length > 0 && (
          <div style={{ padding: "16px 0 0" }}>
            <EdgeRow tone="ink" href="/my/orders?tab=raised">
              <Kicker>Raised by you</Kicker>
              <div style={{ fontSize: 16, fontWeight: 800, marginTop: 6, lineHeight: 1.3 }}>
                {data.raisedOpen.length === 1
                  ? `One request open for ${data.raisedOpen[0].subjectName}`
                  : `${data.raisedOpen.length} requests open for other people`}
              </div>
              <div style={{ fontSize: 13, color: N600, marginTop: 4, lineHeight: 1.45 }}>
                Not yours to collect — this is where they got to.
              </div>
            </EdgeRow>
          </div>
        )}

        {/* An open cycle they haven’t finished. Not a banner — this isn’t urgent, it’s a chore
            with a deadline, and dressing it as an alert would devalue the ones that are.

            The title is word for word the heading on the screen it opens, and it no longer asks
            about a locker. Wearers take their uniform home and wash it themselves; there is no
            locker to stand in front of, so the only answerable question is what they still have,
            wherever it happens to be that day. */}
        {kitCheckDue && (
          <div style={{ padding: "16px 16px 0" }}>
            <DarkCard
              href="/my/kitcheck"
              kicker="Kit check"
              title="Have you still got everything on your record?"
              meta={`Due by ${kitCheckDue}. Count what’s in the wash too. Nothing here is chargeable.`}
            />
          </div>
        )}

        {data.notice && <div style={{ padding: "0 16px" }}><Notice>{data.notice}</Notice></div>}

        {/* Sitting under everything else because it is the least often needed thing here — but it
            is the only way a wearer can end a session on a phone they no longer have, so it has to
            be somewhere they can find without asking. The label names privacy too: the policy and
            the answer about deleting an account live behind this row, and somebody looking for
            either would never guess that "your sign-in" was where they were kept. */}
        <div style={{ padding: "16px 16px 0" }}>
          <SecondaryBar label="Your sign-in and privacy" href="/my/account" />
        </div>

        <div style={{ height: 20 }} />
      </MBody>
      <StaffNav />
    </>
  );
}
