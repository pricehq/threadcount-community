"use client";
/* 1F — Order messages. Ask about *this* order.
 *
 * One thread per order, and no general inbox. That is the rule that keeps this from becoming a
 * chat app nobody staffs: every message arrives attached to the thing it is about, so whoever
 * picks it up in the linen room already knows what is being asked.
 */
import { useEffect, useRef, useState } from "react";
import { Bubble, Composer, ContextStrip, DateSeparator, N600, N700 } from "@/components/staffui";
import { MBody, MError, MRule, MTop } from "@/components/m";
import { useDraft, useStaff } from "@/lib/staffclient";
import { statusText } from "@/lib/staffreq";
import { addDays, facilityDate, facilityToday, formatInZone } from "@/lib/compute";

type Msg = { id: string; fromStaff: boolean; authorName: string; body: string; at: string };
type Data = {
  id: string; code: string; status: string; summary: string;
  managerName: string; declineReason: string | null; holdUntil: string; ward: string;
  signerName: string | null; signerRole: string | null;
  messages: Msg[];
  /** The linen room has said something on this thread that nobody here has opened. */
  unreadRoom?: boolean;
};

/* Both of these run twice — once on the server rendering this screen, once in the browser hydrating
 * it — so neither may read the ambient zone. `toDateString()` did exactly that: on a UTC host a
 * message sent at 08:00 Brisbane was separated under "Yesterday" and stamped 22:30, then flipped to
 * "Today" and 08:30 when React took over. Comparing calendar dates in the facility's zone gives the
 * same answer in both places, and it is the ward's answer. */
const dayLabel = (iso: string, tz: string) => {
  const day = facilityDate(iso, tz);
  if (!day) return "";
  const today = facilityToday(tz);
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return formatInZone(iso, tz, { day: "numeric", month: "long" });
};
const timeLabel = (iso: string, tz: string) => formatInZone(iso, tz, { hour: "2-digit", minute: "2-digit", hour12: false });

export default function ThreadScreen({ data }: { data: Data }) {
  const { mutate, busy, me } = useStaff();
  /* The box keeps what was typed, per order, through a dropped send and a walk to another screen.
   *
   * Ward wifi drops mid-sentence, and the one thing worse than a message that did not send is a
   * message that did not send and is gone. sessionStorage, so it is the tab's unfinished business
   * and not a record. */
  const draft = useDraft(`msg.${data.id}`);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState<Msg[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  /* Opening the thread is what marks it read — once, and only when there is something to mark.
   *
   * `mutate` refreshes this screen, so the flag comes back false and the effect does not fire
   * again. A screen that called this on every mount would refresh the page every time anybody
   * glanced at a thread. */
  const marked = useRef(false);
  useEffect(() => {
    if (!data.unreadRoom || marked.current) return;
    marked.current = true;
    void mutate("request.read", { id: data.id });
  }, [data.unreadRoom, data.id, mutate]);

  /* Anything the server has already told us about wins: `mutate` refreshes this screen, so a message
   * we optimistically appended comes back in `data.messages` under the same id a moment later. Without
   * this the nurse sees her own question twice, once from each list, for as long as she stays on the
   * thread — and the clerk reading the same order sees the doubled conversation too. */
  const confirmed = new Set(data.messages.map((m) => m.id));
  const all = [...data.messages, ...sent.filter((m) => !confirmed.has(m.id))];
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [all.length]);

  const st = statusText(data);
  let lastDay = "";

  return (
    <>
      <MTop title={`Ask about ${data.code}`} back backHref={`/my/orders/${data.id}`} />
      <MRule />
      <ContextStrip>
        {/* Which order this thread belongs to: the code and the status word, then the summary
            rather than the lines — a request for four garments would push the first message off
            the screen, and whoever needs the detail is one tap away on the order itself. */}
        <span style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: N700 }}>
          {data.code} · {st.label}
        </span>
        <span style={{ display: "block", fontSize: 14, color: "var(--color-text)", marginTop: 3 }}>
          {data.summary}
        </span>
      </ContextStrip>
      <MBody>
        {all.length === 0 && (
          <div style={{ padding: "26px 16px", fontSize: 14, color: N600, lineHeight: 1.6 }}>
            Nothing yet. Ask anything about this order.
          </div>
        )}
        {all.map((m) => {
          const day = dayLabel(m.at, me.tz);
          const sep = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {sep && <DateSeparator>{day}</DateSeparator>}
              <Bubble
                mine={m.fromStaff && m.authorName === me.name}
                author={m.fromStaff ? m.authorName : "Linen room"}
                body={m.body}
                stamp={timeLabel(m.at, me.tz)}
              />
            </div>
          );
        })}
        <MError msg={err} onDismiss={() => setErr("")} />
        <div ref={endRef} style={{ height: 8 }} />
      </MBody>
      <Composer
        value={draft.value}
        onChange={(v) => { draft.set(v); setErr(""); }}
        busy={busy}
        placeholder="Ask about this order"
        onSend={async () => {
          const text = draft.value.trim();
          if (!text) return;
          // Cleared optimistically so the box is empty the moment it is sent, and put back below if
          // the send never left the building — which on ward wifi is the whole reason for the draft.
          draft.clear();
          const r = await mutate<{ id: string; at: string }>("request.message", { id: data.id, body: text });
          if (!r.ok) { setErr(r.error); draft.set(text); return; }
          // Shown immediately with the server's own stamp, so the thread doesn't jump when the
          // page refreshes underneath it.
          setSent((s) => [...s, { id: r.result.id, fromStaff: true, authorName: me.name, body: text, at: r.result.at }]);
        }}
      />
    </>
  );
}
