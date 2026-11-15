"use client";
import { useEffect, useState } from "react";

/* Open the print dialog on arrival, and say so when there isn't one.
 *
 * The Android WebView the counter app runs in has no window.print at all. The effect's try/catch
 * swallowed the TypeError, the visible button threw uncaught, and the result was a print screen
 * where nothing happened and nothing explained why — the worst possible answer, because the slip
 * looks correct and the person keeps tapping. The one /m route that reached this page has since
 * been closed off, but /print is still reachable by hand and by a shared link, so the page itself
 * has to be honest.
 *
 * The capability is read after mount rather than during render: the server has no window, and the
 * first client render has to match what the server sent.
 */
export default function AutoPrint() {
  const [canPrint, setCanPrint] = useState(true);

  useEffect(() => {
    if (typeof window.print !== "function") { setCanPrint(false); return; }
    const t = setTimeout(() => { try { window.print(); } catch { /* a dialog the browser wouldn't open — the button is still there to try again */ } }, 500);
    return () => clearTimeout(t);
  }, []);

  if (!canPrint) {
    return (
      <span style={{ marginLeft: "auto", color: "#b8240e", fontWeight: 600 }}>
        This app can&apos;t print. Open this page in a browser — on the computer at the counter — to print it.
      </span>
    );
  }

  return <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => window.print()}>Print</button>;
}
