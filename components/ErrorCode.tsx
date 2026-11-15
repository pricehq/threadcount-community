"use client";
/* The code under every error: "Something went wrong — code TC-XXXX-XXXX", with Copy and a
 * Contact support link that already carries the code (lib/errorcode.ts explains the code).
 *
 * Contact support goes to the hosted service's contact page when this is the hosted service; a
 * Community server has no support desk of ours, so there the line says who to tell instead and
 * Copy is the whole of it. */
import { useState } from "react";
import { HAS_SITE } from "@/lib/links";
import { errorLine } from "@/lib/errorcode";

export function supportHref(code: string): string | null {
  return HAS_SITE ? `/contact?code=${encodeURIComponent(code)}` : null;
}

export default function ErrorCode({ code, tone = "light", compact }: { code: string; tone?: "light" | "dark"; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const fg = tone === "dark" ? "#f2f2ee" : "var(--color-text)";
  const href = supportHref(code);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch {
      // An old WebView without the async clipboard: select the code so a long-press copies it.
      const el = document.getElementById(`tc-code-${code}`);
      if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); }
    }
  };
  const btn: React.CSSProperties = {
    minHeight: 40, padding: "0 12px", border: `2px solid ${fg}`, background: "transparent", color: fg,
    font: "inherit", fontWeight: 800, fontSize: 13, cursor: "pointer", borderRadius: 0, textDecoration: "none",
    display: "inline-flex", alignItems: "center",
  };
  return (
    <div role="status" style={{ marginTop: compact ? 8 : 18, color: fg }}>
      <div style={{ fontSize: compact ? 13 : 14, lineHeight: 1.5 }}>
        {errorLine("")}<b id={`tc-code-${code}`} style={{ fontFamily: "var(--font-plex-mono), ui-monospace, monospace", letterSpacing: "0.04em", userSelect: "all" }}>{code}</b>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <button type="button" onClick={() => void copy()} style={btn} aria-label={`Copy the code ${code}`}>{copied ? "Copied" : "Copy"}</button>
        {href
          ? <a href={href} style={btn}>Contact support</a>
          : <span style={{ fontSize: 13, alignSelf: "center" }}>Give this code to whoever looks after this server.</span>}
      </div>
    </div>
  );
}
