"use client";
/* 1A — Home.
 *
 * Two questions, in this order: what is on the way, and what you hold. Everything else is a
 * shortcut one row lower. There is no list of orders here on purpose — that is the Orders tab, and
 * a home screen that tried to be both would be neither.
 *
 * The one banner at the top is the only place on this screen where somebody else is blocked until
 * this person acts. At most one is ever drawn: a screen with two things shouting at once has
 * nothing at the top.
 */
import { MBody, MRow, MSection, MTopAction, MTopBrand } from "@/components/m";
import {
  AlertBar, DarkButton, DarkCard, DarkRow, EdgeRow, IdentityBlock, Kicker, N600, Notice, QuickGrid,
} from "@/components/staffui";
import StaffNav from "@/components/staffnav";
import { useStaff } from "@/lib/staffclient";
import { statusText } from "@/lib/staffreq";
import type { ReqRow } from "@/lib/staffdata";

type Data = {
  name: string; num: string; ward: string; group: string; facility: string;
  hasManager: boolean; wardDesk: boolean;
  holding: number; live: ReqRow | null; openCount: number; notice: string;
  /** Open requests this person raised for somebody else — never their own. */
  raisedOpen: ReqRow[];
  lastRequest: { itemId: string; si: number; reason: string; code: string } | null;
};

export type HoldRow = { item: string; size: string; qty: number; last: string };

const plural = (n: number, w: string) => `${n} ${n === 1 ? w : w + "s"}`;

export default function HomeScreen({ data, held, lastItem, managerName, kitCheckOpen }: {
  data: Data;
  /** Up to three, most recently issued first. The total is the section's own note. */
  held: HoldRow[];
  /** The garment on the last request, for the "Same again" tile. Null when they never asked. */
  lastItem: string | null;
  managerName: string;
  kitCheckOpen: boolean;
}) {
  const { me, counts } = useStaff();
  const live = data.live;
  const st = live ? statusText(live) : null;

  /* At most one banner, approvals first.
   *
   * Driven by the count of requests ADDRESSED to this person, never by "is a manager": the linen
   * room can re-address a request to somebody who manages nobody, and a manager's last report can
   * move away while their request is still waiting. Gating on the role would take this banner away
   * from the one person who has to act on it. A desk that is also an approver keeps its bags on
   * the Team tab's badge. */
  const banner = counts.approvals > 0
    ? { title: `${plural(counts.approvals, "request")} waiting on you`, href: "/my/approvals" }
    : me.wardDesk && counts.round > 0 && data.ward
      ? { title: `${plural(counts.round, "bag")} to sign on ${data.ward}`, href: "/my/round" }
      : null;

  return (
    <>
      {/* Sign out has left this screen. It lives on Account, with the password — where people look
          for it, and where the one thing a wearer can do to a phone they no longer have belongs. */}
      <MTopBrand facility={data.facility} right={<MTopAction label="Account" href="/my/account" />} />
      <MBody>
        {banner && <AlertBar title={banner.title} href={banner.href} />}

        <IdentityBlock ward={data.ward} num={data.num} name={data.name} group={data.group} />

        <div style={{ padding: 16 }}>
          <MSection label="On the way" />
          {live && st ? (
            /* The bag furthest along — ready beats out on the round beats waiting on a manager.
             * One request covers as many garments as the person needed, so the card leads with the
             * summary and the list itself is a tap away on the order. */
            <div style={{ marginTop: 12 }}>
              <DarkCard kicker={st.label} title={live.summary} meta={[st.note, live.code].filter(Boolean).join(" · ")}>
                {live.status === "ready" && live.collectCode ? (
                  <>
                    <DarkRow label="Collection code" value={live.collectCode} />
                    <DarkButton label="Show at the counter" href={`/my/orders/${live.id}/code`} />
                  </>
                ) : (
                  <DarkButton label="Open this order" href={`/my/orders/${live.id}`} />
                )}
              </DarkCard>
            </div>
          ) : (
            <div style={{ padding: "26px 0" }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Nothing on the way</div>
              <div style={{ fontSize: 14, color: N600, marginTop: 2, lineHeight: 1.45 }}>
                {data.hasManager && managerName
                  ? `Ask for something and it goes to ${managerName} first.`
                  : "Your manager isn’t recorded yet — the linen room has to set who approves your requests."}
              </div>
            </div>
          )}

          <MSection label="You hold" right={plural(data.holding, "garment")} />
          {held.length > 0 ? held.map((h) => (
            <MRow
              key={`${h.item}:${h.size}`}
              title={`${h.item} — ${h.size}`}
              sub={`Last issued ${h.last}`}
              right={`×${h.qty}`}
            />
          )) : (
            <div style={{ padding: "18px 0", fontSize: 14, color: N600 }}>Nothing on your record yet.</div>
          )}

          {/* 2×2. "Same again" is drawn only when there is a last request to repeat: a shortcut
              that opens an empty screen is worse than no shortcut. Swapping a size has moved to
              My kit, which is where a wearer reads the size that is wrong. */}
          <div style={{ marginTop: 12 }}>
            <QuickGrid
              items={[
                { label: "Request an item", caption: "Ask for", href: "/my/request" },
                ...(data.lastRequest && lastItem
                  ? [{ label: "Same again", caption: `Last: ${lastItem}`, href: "/my/request?again=1" }]
                  : []),
                { label: "Report damage", caption: "Torn, stained, worn", href: "/my/damage" },
                { label: "What is on the shelf", caption: "Words, not counts", href: "/my/shelf" },
              ]}
            />
          </div>

          {/* A chore with a deadline, not an alert: dressing it as one would devalue the banner.
              The title is word for word the heading on the screen it opens. */}
          {kitCheckOpen && (
            <div style={{ marginTop: 12 }}>
              <EdgeRow tone="accent" href="/my/kitcheck">
                <div style={{ fontSize: 15, fontWeight: 800 }}>Kit check is open</div>
                <div style={{ fontSize: 13, color: N600, marginTop: 2 }}>Have you still got everything on your record?</div>
              </EdgeRow>
            </div>
          )}

          {/* What they raised for other people, as one row rather than a list. Until Orders grew a
              Raised tab a request typed in for a colleague vanished the moment it was sent. */}
          {data.raisedOpen.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <EdgeRow tone="ink" href="/my/orders?tab=raised">
                <Kicker>Raised by you</Kicker>
                <div style={{ fontSize: 16, fontWeight: 800, marginTop: 6, lineHeight: 1.3 }}>
                  {data.raisedOpen.length === 1
                    ? `One request open for ${data.raisedOpen[0].subjectName}`
                    : `${data.raisedOpen.length} requests open for other people`}
                </div>
                <div style={{ fontSize: 13, color: N600, marginTop: 2 }}>Not yours to collect — this is where they got to.</div>
              </EdgeRow>
            </div>
          )}

          {/* Somebody who will not type a request themselves asks the person who approves it. The
              server sends anything a manager raises up a level, which is why the row can say so
              plainly — approving your own raise is the one thing this must never allow. */}
          {me.isManager && (
            <div style={{ marginTop: 12 }}>
              <EdgeRow tone="ink" href="/my/raise">
                <div style={{ fontSize: 15, fontWeight: 800 }}>Raise for someone you manage</div>
                <div style={{ fontSize: 13, color: N600, marginTop: 2 }}>Goes to your own manager, not to you.</div>
              </EdgeRow>
            </div>
          )}

          {/* The round is listed by ward, so a clerk whose ward was never filled in has no round to
              open. Saying so beats a banner that never appears and a tap that 404s. */}
          {data.wardDesk && !data.ward && (
            <div style={{ marginTop: 12 }}>
              <DarkCard kicker="Ward desk" title="No ward on your record" meta="Ask the linen room to record which ward you are on." />
            </div>
          )}

          {data.notice && <Notice>{data.notice}</Notice>}
        </div>

        <div style={{ height: 20 }} />
      </MBody>
      <StaffNav />
    </>
  );
}
