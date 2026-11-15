"use client";
/* The counter app's sign-in pieces that know about servers: the server's swing tag, and the beat
 * between a right password and the counter opening. The rest of the kit (stage, slip fields, the
 * press, doors) is in components/m/auth/kit.tsx and shared with sign-up and the staff app. */
import { useEffect, useState } from "react";
import { barcodeSvg } from "@/lib/barcode";
import { CONNECT_URL, inCounterShell } from "@/lib/countershell";
import { doneBuzz } from "@/lib/feedback";
import { s, cx, stillNow } from "@/components/m/auth/kit";

/** The host this page was served from, and whether it is inside the counter app — both read after
 *  mount, since the server render knows neither the address the phone used nor the shell. */
function useWhere() {
  const [host, setHost] = useState("");
  const [inApp, setInApp] = useState(false);
  const [bars, setBars] = useState("");
  useEffect(() => {
    const h = window.location.host;
    setHost(h);
    setInApp(inCounterShell());
    setBars(barcodeSvg(h, { text: false, height: 40, module: 1, quiet: 0 })
      .replace("<svg ", '<svg preserveAspectRatio="none" '));
  }, []);
  return { host, inApp, bars };
}

/** The server as a swing tag: hung from the ink stage across the seam onto the paper, with the
 *  host, its barcode (the same label the app's Connect screen reads), and — in the counter app
 *  only — Change, which goes back to the app's own Connect screen at https://localhost/#connect.
 *  A browser has no such screen, so there it just says where you are. `stamp` slams a stamp on it.
 *
 *  Its height is fixed before the host is known, so nothing below it moves when it arrives. */
export function MServerTag({ stamp, still }: { stamp?: string; still?: boolean }) {
  const { host, inApp, bars } = useWhere();
  return (
    <div className={s.swing} style={still ? { animation: "none" } : undefined}>
      <svg className={s.string} viewBox="0 0 60 96" aria-hidden="true"><path d="M9 96 C 0 66, 34 42, 24 0" /></svg>
      <div className={s.tagShadow}>
        <div className={s.tagEdge}><div className={s.tag}>
          <div className={s.tagHead}>
            <span className={s.tagLbl}>Server</span>
            {inApp && !stamp && <a className={s.tagChange} href={CONNECT_URL} aria-label="Change server">Change</a>}
          </div>
          <div className={cx(s.tagHost, !host && s.wait)}>{host || "—"}</div>
          <div className={s.tagBars} aria-hidden="true" dangerouslySetInnerHTML={{ __html: bars }} />
          <div className={s.tagFoot} aria-hidden="true"><span>Uniform store</span><span>Sign-in</span></div>
          {stamp && <><span className={s.shock} aria-hidden="true" /><span className={s.stamp} aria-hidden="true">{stamp}</span></>}
        </div></div>
      </div>
    </div>
  );
}

/** Hung across the seam between the stage and the slip. */
export function MServerLabel() {
  return <div className={s.seam}><MServerTag /></div>;
}

/* Between a right password and the counter: the tag drops in, SIGNED IN slams onto it with the
   phone's own success buzz, and the counter opens. The next page is server-rendered from the new
   session and can take a moment on shop-floor wifi; this is what is on screen meanwhile, instead
   of a sign-in form that looks as if nothing happened. replace(), not assign(), so Back doesn't
   land a signed-in person on the sign-in screen. */
export function MSignedIn({ to, title = <>Opening the <em>counter.</em></>, stamp = "Signed in" }: { to: string; title?: React.ReactNode; stamp?: string }) {
  useEffect(() => {
    // The password field still has focus, and the keyboard would sit over this screen.
    (document.activeElement as HTMLElement | null)?.blur?.();
    const still = stillNow();
    const buzz = setTimeout(() => doneBuzz(), still ? 0 : 520);
    const go = setTimeout(() => window.location.replace(to), still ? 250 : 1250);
    return () => { clearTimeout(buzz); clearTimeout(go); };
  }, [to]);
  return (
    <div className={s.beat} role="status" aria-live="polite">
      <div className={s.beatInner}>
        <MServerTag stamp={stamp} />
        <div className={s.beatKick}>{stamp}</div>
        <div className={s.beatTitle}>{title}</div>
        <div className={s.beatRun} aria-hidden="true" />
      </div>
    </div>
  );
}
