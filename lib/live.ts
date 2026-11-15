"use client";
import { useEffect, useRef } from "react";

/* Keeping a screen honest about changes it did not make.
 *
 * Every mutation in this product already ends in router.refresh(), so a screen is never stale about
 * its OWN work. What it had no way to learn was that somebody else had changed something: a phone
 * left open on a ward went on showing the catalogue as it stood when it was opened, and a
 * coordinator adding a garment at the desk had to go and tell the counter to reload.
 *
 * Polling the snapshot itself to find out would mean every open device re-reading the facility's
 * catalogue, register, stock and history every few seconds to discover, nearly always, that nothing
 * had happened. So the server keeps a counter and bumps it once per mutation; this asks for that
 * one number, and only pays for the real reload when it has moved — with one exception, the first
 * answer this tab has no baseline for, for the reason set out in tick().
 *
 * Two things keep it quiet. It stops entirely while the tab is hidden — a phone in a pocket costs
 * nothing, and the first thing it does on becoming visible again is ask, so coming back to the app
 * is immediate rather than up to a poll late. And a mutation made HERE records the revision it
 * produced, so your own save never bounces the screen a second time a few seconds later.
 */

const POLL_MS = 5000;

/** The last revision this tab knows about, from a poll or from its own mutation. */
let lastRev: number | null = null;

/* Bumped every time lastRev moves, so a poll can tell whether its answer was already out of date
 * by the moment it arrived. A question asked before lastRev changed may have been read on the
 * server before that change landed; one asked after it cannot have been. That is the whole of how
 * we tell "an answer from before my own save" from "the world really is at a smaller number" —
 * see the lower-revision branch in tick(). */
let revGen = 0;

function setRev(rev: number) {
  lastRev = rev;
  revGen++;
}

/** Called by mutate() with the revision its own write produced, so the poll does not re-fire it. */
export function noteRev(rev: unknown) {
  if (typeof rev === "number") setRev(rev);
}

export function useLiveRefresh(refresh: () => void) {
  const busy = useRef(false);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };

    const tick = async () => {
      if (stopped) return schedule();
      // Hidden tabs ask nothing at all; visibilitychange below wakes them.
      if (document.visibilityState !== "visible" || busy.current) return schedule();
      busy.current = true;
      // Taken before the question goes out, so the answer can be judged against what we knew when
      // we asked rather than against what we have learned while waiting.
      const genAsked = revGen;
      try {
        const r = await fetch("/api/rev", { cache: "no-store" });
        if (r.ok) {
          const { rev } = (await r.json()) as { rev?: unknown };
          if (typeof rev === "number") {
            if (lastRev === null) {
              /* Nothing to compare against, so we cannot prove this screen is current.
               *
               * The server rendered the page at some revision nobody told the browser, and the
               * linen room can mark a bag ready in the gap between that render and this first
               * question. Quietly adopting the answer as a baseline loses that change for good:
               * the ward phone goes on saying "Being picked" until somebody else in the facility
               * happens to move the number again, and the nurse never walks down for the bag. So
               * the first answer always reloads. It costs one extra render per page load, and the
               * loop below is started at mount rather than a poll later so that render lands at
               * launch, before anyone has begun counting into the screen.
               *
               * Once per fresh load of the app, then — not once per screen. lastRev belongs to the
               * tab, so moving between screens inside the app still has a baseline to compare
               * with, and anything that happened around that later render leaves the counter above
               * the baseline, which the ordinary branch below picks up on its own.
               */
              setRev(rev);
              refresh();
            } else if (rev > lastRev) {
              // The ordinary case: somebody else moved the counter on.
              setRev(rev);
              refresh();
            } else if (rev < lastRev && revGen === genAsked) {
              /* The counter has genuinely gone backwards, and the screen has to follow it down.
               *
               * Restoring a backup rebuilds the facility row, and the revision it comes back with
               * can be lower than a number this tab has already seen. A tab that only ever accepted
               * higher numbers would then refuse every answer for as long as it stayed open — going
               * on showing a catalogue and a stock position that no longer exist, with nothing on
               * screen to say so. That is worse than the double refresh guarded against below,
               * because nothing ever ends it.
               *
               * What separates the two is whether anything moved lastRev while this question was in
               * the air. Nothing did, so this read cannot be an echo of the world before our own
               * save: it was issued after we already held the newer number, and the server still
               * answered with a smaller one. That is news, not a straggler, so we take it.
               */
              setRev(rev);
              refresh();
            }
            /* Anything left is our own save coming back to haunt us: this poll's read ran before
             * mutate() bumped the facility, so it answers with the old number while noteRev has
             * already recorded the new one. Taking it would walk lastRev backwards and reload the
             * screen for a change it had already applied — then again five seconds later when the
             * real number reappeared. And the same number twice was never news to begin with. */
          }
        }
      } catch {
        // Offline, asleep, or the server restarting mid-deploy. The next tick asks again; a missed
        // poll is a few seconds of staleness, not an error worth putting in front of anybody.
      } finally {
        busy.current = false;
      }
      schedule();
    };

    const onVisible = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVisible);
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);
}
