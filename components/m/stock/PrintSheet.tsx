"use client";
/* The print sheet over a stock line: copies, why, and the bar that sends it. A native shell hands the
   label page to Android printing; a browser opens the printable label page. */
import { useEffect, useState } from "react";
import { printLabels, printState, type PrintState } from "@/lib/nativeprint";
import { MBar, MChipRow, MKick, MRow, MSheet, MStepper, useToast } from "@/components/m";

const REASONS = ["Torn", "Faded", "New shelf"] as const;
type Reason = (typeof REASONS)[number];

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export default function PrintSheet({ open, onClose, code, title }: { open: boolean; onClose: () => void; code: string; title: string }) {
  const toast = useToast();
  const [copies, setCopies] = useState(1);
  const [reason, setReason] = useState<Reason>("Torn");
  const [state, setState] = useState<PrintState | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCopies(1); setReason("Torn");
    let live = true;
    printState().then((p) => { if (live) setState(p); });
    return () => { live = false; };
  }, [open]);

  const go = async () => {
    if (sending) return;
    setSending(true);
    const r = await printLabels({ code, copies, reason });
    setSending(false);
    if (!r.ok) { toast(r.error); return; }
    onClose();
    toast(state?.state === "browser" ? `${plural(copies, "label")} opened to print` : `${plural(copies, "label")} sent to the shelf printer`);
  };

  return (
    <MSheet open={open} onClose={onClose} labelId="tc-print-title"
      bar={<MBar label={sending ? "Sending…" : `Print ${plural(copies, "label")}`} onClick={go} disabled={sending} />}>
      <MKick>Shelf printer{state ? ` · ${state.label}` : ""}</MKick>
      <h2 id="tc-print-title" style={{ fontSize: 20, fontWeight: 900, margin: "2px 0 0", lineHeight: 1.15 }}>{title}</h2>
      <MRow title="Copies" sub="Barcode, garment, size, shelf"
        right={<MStepper n={copies} onChange={setCopies} min={1} max={20} label="copies" />} />
      <MChipRow label="Why it is being reprinted" value={reason} onPick={setReason}
        options={REASONS.map((r) => ({ value: r, label: r }))} />
    </MSheet>
  );
}
