import { MBar, MBody, MEmpty, MRule, MTop } from "@/components/m";

/* What a staff screen shows when a link leads nowhere it is allowed to go.
 *
 * Two different things are told apart on purpose, and only one of them lands here. A REFUSAL — the
 * record is not yours, the role is not yours — is this page, and it explains nothing: a refusal
 * that gave its reason would confirm the thing exists and say something about somebody else's
 * record. "Nothing to show" — a kit check between rounds, an empty queue, a day with no bags — is
 * the screen itself with a short state on it and a way out, which is where those cases now go.
 *
 * Next renders the nearest not-found.tsx, so this one stays inside the signed-in layout: same
 * chrome, same provider, and a bar that goes home rather than the website's 404 with its marketing
 * nav landing on top of the tab bar (seen on a Pixel 8 Pro, 2026-09-12).
 *
 * The words are load-bearing: scripts/e2e-staffapp.sh greps every refusal for "That page isn" and
 * then checks that none of the refused screen's own words came with it.
 */
export default function StaffNotFound() {
  return (
    <>
      <MTop title="Not here" back />
      <MRule />
      <MBody>
        <MEmpty title="That page isn’t here." />
      </MBody>
      <MBar label="Back to home" href="/my" />
    </>
  );
}
