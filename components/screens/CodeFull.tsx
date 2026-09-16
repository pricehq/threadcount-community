"use client";
/* 1G — the collection code, full screen and nothing else.
 *
 * This is held up across a counter, often at arm's length, so everything the order screen carries
 * is something to read past: no app bar, no accent rule, no tab bar. The wearer's name and what is
 * in the bag sit under the digits, because a clerk hands a bag to a person, not to a number.
 *
 * Done is a real link back to the order, never history.back() — the screen is opened cold at least
 * three ways (a notification tap, a refresh on a ward phone, an app link) and in each of them there
 * is no history to pop, so a back-button Done walks somebody out of the app holding an unread code.
 * FullCode takes the href for exactly that reason.
 */
import { MStyles } from "@/components/m";
import { FullCode, lineText } from "@/components/staffui";
import { useKeepAwake } from "@/lib/wakelock";

export default function CodeFullScreen({ id, code, name, lines }: {
  id: string; code: string; name: string; lines: { item: string; size: string; qty: number }[];
}) {
  /* Keep the screen alight while the code is up.
   *
   * There is no brightness control on this platform — neither the WebView nor the Capacitor shell
   * offers one — so the honest version of "make it readable across a counter" is the Screen Wake
   * Lock API: it is what stops Android dimming and then locking the phone in the time it takes to
   * reach the front of the queue. A no-op where it isn't supported, and the digits are already
   * drawn as large as the screen allows.
   */
  useKeepAwake(true);

  return (
    <>
      {/* The furniture styles are normally injected by MTop, which this screen deliberately does
          not have; without them the Done link loses its focus ring. */}
      <MStyles />
      <FullCode
        code={code}
        name={name}
        lines={lines.map(lineText)}
        backHref={`/my/orders/${id}`}
      />
    </>
  );
}
