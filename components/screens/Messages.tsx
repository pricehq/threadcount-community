"use client";
/* 1F — Messages. Every conversation with the linen room, newest word first.
 *
 * There is no inbox and no direct messaging in this product: a message always hangs off the request
 * it is about, which is what stops it becoming a chat app nobody staffs. So this screen is a list of
 * requests that have been talked about — not a mailbox — and under it the orders that could be
 * talked about but haven't been yet.
 *
 * The tab that opens this used to be a button that pushed /my/orders: a control among links, absent
 * from any list of the app's navigation, and a tab that lied about where it went. It is a link now
 * (components/staffnav.tsx) and this is the screen behind it.
 */
import { MBody, MRow, MRule, MSection, MTop } from "@/components/m";
import { EdgeRow, N600 } from "@/components/staffui";
import StaffNav from "@/components/staffnav";
import { useStaff } from "@/lib/staffclient";
import { statusText } from "@/lib/staffreq";
import { addDays, facilityDate, facilityToday, formatInZone } from "@/lib/compute";
import type { ReqRow, ThreadRow } from "@/lib/staffdata";
import { cap } from "@/lib/terms";

/* How long a line of somebody else's message is allowed to be before the row stops being a row.
 * The mockup's 54 characters, kept as a number so the truncation and the ellipsis agree. */
const PREVIEW = 54;
const preview = (body: string) => {
  const one = body.replace(/\s+/g, " ").trim();
  return one.length > PREVIEW ? one.slice(0, PREVIEW) + "…" : one;
};

/* The right-hand stamp: a time today, a weekday this week, a date before that.
 *
 * Formatted in the facility's zone on both sides of hydration for the same reason the thread's own
 * separators are — this screen is server-rendered and then hydrated, and a stamp read off the
 * server's ambient zone is a different string in the browser, which React logs and a nurse sees
 * flicker. */
function stamp(iso: string, tz: string): string {
  const day = facilityDate(iso, tz);
  const today = facilityToday(tz);
  if (!day) return "";
  if (day === today) return formatInZone(iso, tz, { hour: "2-digit", minute: "2-digit", hour12: false });
  if (day >= addDays(today, -6)) return formatInZone(iso, tz, { weekday: "short" });
  return formatInZone(iso, tz, { day: "numeric", month: "short" });
}

export default function MessagesScreen({ threads, startable }: { threads: ThreadRow[]; startable: ReqRow[] }) {
  const { me } = useStaff();
  const terms = me.terms;

  return (
    <>
      <MTop title="Messages" />
      <MRule />
      <MBody>
        {threads.length === 0 ? (
          /* Nothing to show, not a refusal: there is a way out of it and the screen says what it
             is. A dead end with no explanation is reserved for a record that isn't yours. */
          <div style={{ padding: "26px 16px" }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>No messages yet</div>
            <div style={{ fontSize: 14, color: N600, marginTop: 2 }}>Ask about any order and the thread starts here.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 2, padding: "12px 0" }}>
            {threads.map((t) => {
              const st = statusText({ status: t.status }, { mine: t.mine, first: t.subjectName.split(" ")[0], terms });
              return (
                <EdgeRow
                  key={t.id}
                  /* Accent only where the linen room has said something nobody here has opened.
                     Everything else keeps the ink edge, so the colour means one thing. */
                  tone={t.unread ? "accent" : "ink"}
                  href={`/my/orders/${t.id}/messages`}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 15, fontWeight: 800 }}>
                        {/* Whose uniform it is only needs saying when it isn't yours — a manager or
                            a clerk reading a thread on a request they typed in for somebody else. */}
                        {t.mine ? cap(terms.store) : `${t.subjectName} · you raised this`}
                      </span>
                      <span style={{ display: "block", fontSize: 13, color: N600, marginTop: 2, lineHeight: 1.45 }}>
                        {preview(t.last.body)}
                      </span>
                      <span style={{ display: "block", fontSize: 13, color: N600, marginTop: 2, lineHeight: 1.45 }}>
                        {t.code} · {st.label}
                      </span>
                    </span>
                    <span style={{ flex: "0 0 auto", fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, color: N600, whiteSpace: "nowrap" }}>
                      {stamp(t.last.at, me.tz)}
                    </span>
                  </div>
                </EdgeRow>
              );
            })}
          </div>
        )}

        {/* Open orders only. A question about a bag collected in March is a question for the
            counter, and listing every order this person has ever had would bury the three that are
            actually moving. */}
        {startable.length > 0 && (
          <div style={{ padding: "0 16px" }}>
            <MSection label="Start one" />
            {startable.map((r) => (
              <MRow key={r.id} title={r.code} sub={r.summary} chev href={`/my/orders/${r.id}/messages`} />
            ))}
          </div>
        )}
        <div style={{ height: 12 }} />
      </MBody>
      <StaffNav />
    </>
  );
}
