"use client";
import { useEffect, useRef, useState } from "react";

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue?: string; format?: string }[]> };

/* The symbologies a garment is actually labelled with, kept deliberately in step with SCAN_FORMATS
 * in lib/nativescan.ts so the desk and the phone bind the same code off the same tag. Code 93 is
 * here because suppliers print it and the phone has always read it; leaving it out made a label
 * that binds fine on a ward invisible at the desk. No QR: nothing in this product is identified by
 * one, and the QR on a polybag points at the supplier’s product page — binding that to a size
 * stores a chopped URL that no printed label can reproduce and that blocks the real EAN. */
const SCAN_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93"];

/** Full-screen camera scanner using getUserMedia + BarcodeDetector (350ms polls, 1.8s duplicate suppression). */
export default function Camera({ onHit, message, onClose }: { onHit: (raw: string) => void; message: string; onClose: () => void }) {
  const vid = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState("Starting camera…");
  const hit = useRef(onHit);
  hit.current = onHit;

  useEffect(() => {
    let stream: MediaStream | null = null, timer: ReturnType<typeof setInterval> | null = null, lastRaw = "", lastT = 0, stopped = false;
    const w = window as unknown as { BarcodeDetector?: new (o?: { formats?: string[] }) => Detector };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setStatus("No camera in this browser — type the barcode instead."); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then((st) => {
      if (stopped) { st.getTracks().forEach((t) => t.stop()); return; }
      stream = st;
      if (vid.current) { vid.current.srcObject = st; vid.current.play().catch(() => {}); }
      if (w.BarcodeDetector) {
        let bd: Detector;
        try { bd = new w.BarcodeDetector({ formats: SCAN_FORMATS }); } catch { bd = new w.BarcodeDetector(); }
        setStatus("Point the camera at a barcode");
        timer = setInterval(() => {
          const v = vid.current; if (!v || v.readyState < 2) return;
          bd.detect(v).then((codes) => {
            // A QR on a polybag is high-contrast and decodes before the small EAN on the swing tag,
            // so the first code in frame is often not the garment’s. Take the first one whose symbology
            // we actually bind — and filter here as well as in the constructor, because the fallback
            // above builds an unrestricted detector when the browser rejects the format list.
            const found = (codes || []).find((c) => !c.format || SCAN_FORMATS.includes(c.format));
            if (!found) return;
            const raw = String(found.rawValue || "").trim();
            if (!raw) return;
            if (raw === lastRaw && Date.now() - lastT < 1800) return;
            lastRaw = raw; lastT = Date.now();
            hit.current(raw);
          }).catch(() => {});
        }, 350);
      } else setStatus("Live barcode reading isn’t supported in this browser — type the code instead.");
    }).catch((e: Error) => setStatus("Camera blocked or unavailable — " + e.message));
    return () => { stopped = true; if (timer) clearInterval(timer); if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "#201e1d", display: "flex", flexDirection: "column" }}>
      <video ref={vid} autoPlay playsInline muted style={{ flex: 1, width: "100%", objectFit: "cover", minHeight: 0 }} />
      <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", padding: "var(--space-4)", background: "var(--color-bg)", borderTop: "2px solid var(--color-text)" }}>
        <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{message || status}</div>
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
