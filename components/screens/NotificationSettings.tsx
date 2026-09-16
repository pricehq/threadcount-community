"use client";
/* The Notifications section of Account: one switch per kind of thing this person can be told about.
 *
 * Two rules shape the whole thing.
 *
 * The phone is asked for permission when somebody turns the FIRST switch on, never at launch —
 * Android 13+ policy, and plain manners. A wearer who never wants to be told is never asked.
 *
 * "Something waiting on you" is offered to anybody a request can be addressed to, which is not the
 * same as "managers": the linen room can re-address one to somebody who manages nobody, and that
 * person most needs telling — and, having been told, is entitled to silence it.
 */
import { useEffect, useState } from "react";
import { MError, MSwitchRow } from "@/components/m";
import { N600 } from "@/components/staffui";
import { useStaff } from "@/lib/staffclient";
import { askForPush, pushShell, rememberedToken, type PushShell } from "@/lib/staffpush";

export type NotifyPrefs = { approved: boolean; ready: boolean; round: boolean; kitcheck: boolean; waiting: boolean };
type Key = keyof NotifyPrefs;

const KINDS: { key: Key; title: string }[] = [
  { key: "approved", title: "Approved or declined" },
  { key: "ready", title: "Ready to collect" },
  { key: "round", title: "On the ward round" },
  { key: "kitcheck", title: "Kit check opens" },
];

export default function NotificationSettings({ prefs, configured }: { prefs: NotifyPrefs; configured: boolean }) {
  const { me, counts, mutate } = useStaff();
  const [on, setOn] = useState<NotifyPrefs>(prefs);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<Key | null>(null);
  /* Settled after mount: the server cannot know whether this is the app or a browser, and a line
   * about where notifications arrive that changed on hydration would be worse than one that waits
   * a beat. "old" is a shell from before the notification bridge existed — see lib/staffpush.ts. */
  const [shell, setShell] = useState<PushShell>("none");
  useEffect(() => { setShell(pushShell()); }, []);
  const bridge = shell === "ready";

  /* The waiting switch belongs to whoever a request can be ADDRESSED to, which is what the queue,
   * the badge and the Team tab all key on. `counts.team` is the wrong number: it adds the bags on
   * a ward desk, so a clerk who manages nobody was offered a switch for a notification the sender
   * only ever writes to `r.managerId` — it could never fire, and it vanished off their Account
   * screen the moment they signed for the bags. */
  const rows = me.isManager || counts.approvals > 0
    ? [...KINDS, { key: "waiting" as Key, title: "Something waiting on you" }]
    : KINDS;

  async function toggle(k: Key) {
    if (busy) return;
    const before = on;
    const next = { ...on, [k]: !on[k] };
    setOn(next);
    setErr("");
    setBusy(k);

    const r = await mutate("notify.prefs", { [k]: next[k] });
    if (!r.ok) {
      setOn(before);
      setErr(r.error);
      setBusy(null);
      return;
    }

    /* Ask the phone after the preference is saved, not before: somebody who says no to Android
     * still meant to turn the switch on, and their answer is kept. In a browser there is no bridge
     * and nothing is asked — the preference is the server's either way, and it governs the phone
     * whenever they next open the app.
     *
     * The question is "is this phone registered", not "is this the first switch". The old test —
     * nothing on before this tap — could never be true: every switch defaults to ON, so a fresh
     * account arrives here with all of them set, and for a wearer `waiting` is on with no row to
     * turn it off. Android was therefore never asked, no device row was ever written, and every
     * send found nobody, on a server with a key installed and every switch saying yes. A remembered
     * token is the honest answer to whether this phone has ever handed one back. */
    if (next[k] && bridge && configured && !rememberedToken()) {
      const ask = await askForPush();
      if (ask.ok) await mutate("push.register", { token: ask.token, platform: "android" });
    }
    setBusy(null);
  }

  return (
    <>
      <MError msg={err} onDismiss={() => setErr("")} />
      {rows.map((r) => (
        <MSwitchRow
          key={r.key}
          title={r.title}
          on={on[r.key]}
          disabled={!configured || busy !== null}
          onToggle={() => void toggle(r.key)}
        />
      ))}
      {!configured ? (
        <div style={{ fontSize: 13, color: N600, padding: "12px 0 0", lineHeight: 1.5 }}>
          Notifications aren’t set up on this server.
        </div>
      ) : shell === "old" ? (
        // In the app, on a build from before notifications existed. Saying "they arrive in the app"
        // to somebody who is standing in it would be a line that explains nothing.
        <div style={{ fontSize: 13, color: N600, padding: "12px 0 0", lineHeight: 1.5 }}>
          Update the ThreadCount Staff app to turn these on.
        </div>
      ) : !bridge ? (
        <div style={{ fontSize: 13, color: N600, padding: "12px 0 0", lineHeight: 1.5 }}>
          Notifications come to the ThreadCount Staff app on your phone.
        </div>
      ) : null}
    </>
  );
}
