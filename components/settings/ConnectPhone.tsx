"use client";
/* Connect a phone: this server's address, as a QR code the counter app's Connect screen scans.
 *
 * ThreadCount is self-hosted, so a phone can't know where its organisation's server is. The app
 * accepts any link to the server (it keeps only the host), which is what makes this code the same
 * as the address in the browser bar: nothing is secret in it, and it signs nobody in. */
import { useEffect, useState } from "react";
import { SectionHead } from "./common";

export default function ConnectPhone() {
  const [origin, setOrigin] = useState("");
  const [svg, setSvg] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const o = window.location.origin;
    setOrigin(o);
    let live = true;
    import("qrcode")
      .then((Q) => Q.toString(`${o}/m`, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#201e1d", light: "#ffffff" } }))
      .then((s) => { if (live) setSvg(s); })
      .catch(() => { /* the address below still works */ });
    return () => { live = false; };
  }, []);

  const host = origin.replace(/^https?:\/\//, "");
  const https = origin.startsWith("https://");

  return (
    <>
      <SectionHead divider={false} meta="Scan from the ThreadCount phone app's Connect screen">Connect a phone</SectionHead>
      <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap", border: "2px solid var(--color-text)", background: "#fff", padding: 20, maxWidth: 720 }}>
        <div aria-label={`QR code for ${host}`} role="img"
          style={{ width: 168, height: 168, flex: "none", display: "grid", placeItems: "center" }}
          dangerouslySetInnerHTML={svg ? { __html: svg.replace("<svg ", '<svg width="168" height="168" ') } : undefined} />
        <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}>Server address</span>
          <b style={{ fontSize: 22, letterSpacing: "-0.01em", wordBreak: "break-all" }}>{host}</b>
          {!https && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-accent-700)" }}>The app connects over https only.</span>}
          <div>
            <button className="btn btn-secondary" type="button"
              onClick={() => { navigator.clipboard?.writeText(host).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {}); }}>
              {copied ? "Copied" : "Copy address"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
