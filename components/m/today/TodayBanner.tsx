"use client";
/* The green line at the top of Today after something finished elsewhere: a shelf count committed
 * (?flash=counted&loc=<name>&gaps=<n>, or the older ?counted=1) or a facility just created
 * (?flash=created). Dismissing it drops the query so a reload does not bring it back. */
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { OK } from "@/components/m";

export function bannerText(q: URLSearchParams): string {
  const flash = q.get("flash");
  if (flash === "created") return "Facility created";
  if (flash === "counted" || q.get("counted")) {
    const loc = (q.get("loc") || "").slice(0, 80).trim();
    const gaps = Math.max(0, parseInt(q.get("gaps") || "0", 10) || 0);
    return `${loc || "Shelf"} counted${gaps > 0 ? ` · ${gaps} ${gaps === 1 ? "gap" : "gaps"}` : ""}`;
  }
  return "";
}

export default function TodayBanner() {
  const sp = useSearchParams();
  const router = useRouter();
  const [gone, setGone] = useState(false);
  const text = bannerText(new URLSearchParams(sp.toString()));
  if (!text || gone) return null;
  return (
    <div role="status" style={{ background: OK, color: "#ffffff", padding: "12px 14px", margin: "-16px -16px 12px", fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      <span>{text}</span>
      <button type="button" aria-label="Dismiss" onClick={() => { setGone(true); router.replace("/m"); }}
        style={{ background: "none", border: 0, color: "#ffffff", fontSize: 22, width: 44, height: 44, flex: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
        ×
      </button>
    </div>
  );
}
