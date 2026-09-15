"use client";
/* 1F — Order messages. Ask about *this* order.
 *
 * One thread per order, and no general inbox. That is the rule that keeps this from becoming a
 * chat app nobody staffs: every message arrives attached to the thing it is about, so whoever
 * picks it up in the linen room already knows what is being asked.
 */
import { useEffect, useRef, useState } from "react";
import { Bubble, Composer, ContextStrip, DateSeparator, N600 } from "@/components/staffui";
import { MBody, MError, MRule, MTop } from "@/components/m";
import { useStaff } from "@/lib/staffclient";
import { statusText } from "@/lib/staffreq";
import { addDays, facilityDate, facilityToday, formatInZone } from "@/lib/compute";

type Msg = { id: string; fromStaff: boolean; authorName: string; body: string; at: string };
type Data = {
  id: string; code: string; status: string; summary: string;
  managerName: string; declineReason: string | null; holdUntil: string; ward: string;
  signerName: string | null; signerRole: string | null;
  messages: Msg[];
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
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const [sent, setSent] = useState<Msg[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

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
      <MTop title={data.code} back right={<span style={{ fontSize: 12, color: "var(--color-neutral-400)" }}>Messages</span>} />
      <MRule />
      <ContextStrip>
        {/* The summary rather than the lines: this strip is here to say which order the thread
            belongs to, and a request for four garments would push the first message off the
            screen. Whoever needs the detail is one tap away on the order itself. */}
        {data.summary} · {st.label.toLowerCase()}
      </ContextStrip>
      <MBody>
        {all.length === 0 && (
          <div style={{ padding: "28px 16px", fontSize: 14, color: N600, lineHeight: 1.6 }}>
            Nothing here yet. Ask the linen room about this order and they&rsquo;ll see it against
            the request.
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
        value={body}
        onChange={(v) => { setBody(v); setErr(""); }}
        busy={busy}
        placeholder="Ask about this order"
        onSend={async () => {
          const text = body.trim();
          if (!text) return;
          setBody("");
          const r = await mutate<{ id: string; at: string }>("request.message", { id: data.id, body: text });
          if (!r.ok) { setErr(r.error); setBody(text); return; }
          // Shown immediately with the server's own stamp, so the thread doesn't jump when the
          // page refreshes underneath it.
          setSent((s) => [...s, { id: r.result.id, fromStaff: true, authorName: me.name, body: text, at: r.result.at }]);
        }}
      />
    </>
  );
}
