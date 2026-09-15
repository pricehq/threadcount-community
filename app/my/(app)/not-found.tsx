import { MBar, MBody, MEmpty, MRule, MTop } from "@/components/m";

/* What a staff screen shows when there is nothing behind it.
 *
 * Nine routes under /my call notFound(): a kit check between rounds, the waitlist with nothing
 * offered, the ward and desk screens for somebody without that role, an order that isn't theirs.
 * Without this file every one of them rendered the WEBSITE's 404 — marketing nav, "Open the demo",
 * a footer — inside the app, over the top of the tab bar, with the hardware back button as the
 * only way home. Seen on a Pixel 8 Pro on 2026-09-12 by opening Kit check with no check open.
 *
 * Next renders the nearest not-found.tsx, so this one stays inside the signed-in layout: same
 * chrome, same provider, and a bar that goes home.
 */
export default function StaffNotFound() {
  return (
    <>
      <MTop title="Nothing here" back />
      <MRule />
      <MBody>
        <MEmpty
          title="Nothing to show right now"
          sub="There’s no screen behind that link at the moment — a kit check that isn’t open, a list with nothing on it, or something that isn’t yours to see. Nothing on your record has changed."
        />
      </MBody>
      <MBar label="Back to home" href="/my" />
    </>
  );
}
