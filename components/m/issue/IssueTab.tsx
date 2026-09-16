"use client";
/* Person › Issue: their kit in their size, a basket with per-line flags and reasons, and the bar to
 * the Sign step. The flags are issueLineFlags(), the same function issue.create checks inside its
 * lock, and the cap is capCheck() (the shell draws the meters from the same basket). */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDerived, useSnap } from "@/lib/client";
import { OVERRIDE_REASONS, bcParse, ccOf, garmentForGroup, garmentForStyle, isPantItem, isTopItem, issueLineFlags, key, label, money, onhand, sizeIndexOf, splitKey, type Item } from "@/lib/compute";
import { scanReject } from "@/lib/feedback";
import MScan from "@/components/MScan";
import { MBar, MButton, MChipRow, MKitCard, MLine, MONO, MReasonChips, MSection, MStepper, useToast } from "@/components/m";
import { useBasket, type IssueLine } from "@/components/MBasket";
import type { PersonTabProps } from "@/components/m/handback/HandBackTab";
import { plural } from "@/components/m/issue/meta";

const rank = (it: Item) => (isTopItem(it) ? 0 : isPantItem(it) ? 1 : 2);

export default function IssueTab({ staffId, setBar }: PersonTabProps) {
  const { s } = useSnap();
  const { L, byId } = useDerived();
  const router = useRouter();
  const toast = useToast();
  const basket = useBasket();
  const st = s.staff.find((x) => x.id === staffId);
  const lines = basket.issue(staffId);
  const [pick, setPick] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [scan, setScan] = useState(false);

  const shelf = (k: string) => Math.max(0, onhand(s, L, k));
  const sizeOf = (it: Item | undefined, si: number) => String(it?.sizes[si] ?? si);

  /* Their kit: garments the server would issue them without an override (group and cut) that are a
   * top, a pair of pants, or something they have held before. Anything else comes in by scanning. */
  const kit = useMemo(() => {
    if (!st) return [];
    const last: Record<string, { si: number; at: string }> = {};
    for (const i of s.issues) {
      if (i.staffId !== st.id) continue;
      const at = i.date + (i.createdAt || "");
      if (!last[i.itemId] || at > last[i.itemId].at) last[i.itemId] = { si: i.si, at };
    }
    return s.catalog
      .filter((it) => !it.archived && garmentForGroup(it, st.group) && garmentForStyle(it, st.uniformStyle) && (rank(it) < 2 || !!last[it.id]))
      .sort((a, b) => rank(a) - rank(b) || label(a).localeCompare(label(b)))
      .map((it) => {
        const want = isTopItem(it) ? st.top : isPantItem(it) ? st.pants : "";
        let si = want ? sizeIndexOf(it, want) : -1;
        if (si < 0 && last[it.id] && last[it.id].si < it.sizes.length) si = last[it.id].si;
        return { it, si: si < 0 ? null : si };
      });
  }, [s, st]);

  const flags = useMemo(() => (st ? issueLineFlags(s, st, lines) : []), [s, st, lines]);

  const add = (itemId: string, si: number) => {
    const it = byId[itemId];
    if (!it) return;
    const k = key(itemId, si);
    const cur = basket.issue(staffId);
    const inBasket = cur.find((l) => l.key === k)?.qty || 0;
    if (shelf(k) - inBasket <= 0) { toast(`None of ${label(it)} ${sizeOf(it, si)} on the shelf`); return; }
    const next: IssueLine[] = inBasket
      ? cur.map((l) => (l.key === k ? { ...l, qty: l.qty + 1 } : l))
      : [...cur, { key: k, itemId, si, qty: 1, reason: null }];
    basket.setIssue(staffId, next);
  };
  const setQty = (k: string, v: number) => {
    const cur = basket.issue(staffId);
    const oh = shelf(k);
    let n = v;
    if (n > oh) { toast(`Only ${oh} on the shelf`); n = oh; }
    basket.setIssue(staffId, n <= 0 ? cur.filter((l) => l.key !== k) : cur.map((l) => (l.key === k ? { ...l, qty: n } : l)));
  };
  const setReason = (k: string, r: string | null) => {
    basket.setIssue(staffId, basket.issue(staffId).map((l) => (l.key === k ? { ...l, reason: r } : l)));
  };
  const onCode = (raw: string) => {
    const code = raw.trim();
    const hit = bcParse(s, code);
    if (!hit) {
      scanReject();
      const bound = s.barcodes[code];
      let it: Item | undefined = bound ? byId[splitKey(bound).itemId] : undefined;
      if (!it && /^93\d{7}$/.test(code)) it = s.catalog.find((x) => x.sort === Math.floor((+code - 930000000) / 100));
      toast(it?.archived ? `${label(it)} is discontinued` : `${code} isn’t a garment ThreadCount knows`);
      return;
    }
    add(hit.itemId, hit.si);
  };
  // The bar and the scanner are drawn by the shell as direct children of the app column (the native
  // scanner hides everything else), so the scanner reads the latest handler through a ref.
  const onCodeRef = useRef(onCode);
  useEffect(() => { onCodeRef.current = onCode; });

  const n = lines.reduce((t, l) => t + l.qty, 0);
  const needReason = flags.some((f, i) => !!f && !lines[i]?.reason);
  const short = lines.find((l) => l.qty > shelf(l.key));
  const shortText = short ? `Only ${shelf(short.key)} of ${label(byId[short.itemId])} ${sizeOf(byId[short.itemId], short.si)} on the shelf` : "";
  const inactive = !!st?.inactive;
  const off = inactive || n === 0 || needReason || !!short;
  const small = n === 0 ? "nothing yet" : needReason ? "reason each flag" : plural(n, "item");
  const offReason = inactive ? "Reactivate them in the portal first" : n === 0 ? "Nothing to issue yet" : needReason ? "Pick a reason for each flagged line" : shortText;

  useEffect(() => {
    setBar(
      <>
        <MBar label="Review and sign" small={small} disabled={off} offReason={off ? offReason : undefined}
          onClick={() => router.push(`/m/person/${encodeURIComponent(staffId)}/sign`)} />
        {scan && <MScan title="Scan a garment" onHit={(raw) => { setScan(false); onCodeRef.current(raw); }} onClose={() => setScan(false)} />}
      </>,
    );
  }, [setBar, small, off, offReason, scan, router, staffId]);
  useEffect(() => () => setBar(null), [setBar]);

  if (!st) return null;
  const cc = ccOf(s, st);
  const total = lines.reduce((t, l) => t + l.qty * (byId[l.itemId]?.cost || 0), 0);

  return (
    <>
      <MSection label="Their size" />
      {kit.map(({ it, si: def }) => {
        const si = pick[it.id] ?? def;
        const k = si === null ? "" : key(it.id, si);
        const oh = si === null ? null : shelf(k);
        const inBasket = si === null ? 0 : lines.find((l) => l.key === k)?.qty || 0;
        const size = si === null ? null : sizeOf(it, si);
        return (
          <MKitCard key={it.id} title={label(it)} size={size} onShelf={oh} sizeOpen={open === it.id}
            onSize={() => setOpen((o) => (o === it.id ? null : it.id))}
            onAdd={() => { if (si !== null) add(it.id, si); }}
            addDisabled={si === null || (oh ?? 0) - inBasket <= 0}
            addLabel={size === null ? `Pick a size for ${label(it)}` : `Add ${label(it)} ${size}`}>
            <MChipRow label={`Sizes of ${label(it)}`} value={si === null ? null : String(si)}
              options={it.sizes.map((sz, i) => ({ value: String(i), label: String(sz), n: shelf(key(it.id, i)) }))}
              disabled={(v) => shelf(key(it.id, +v)) <= 0}
              onPick={(v) => { setPick((p) => ({ ...p, [it.id]: +v })); setOpen(null); }} />
          </MKitCard>
        );
      })}
      <MButton icon="scan" label="Scan a garment" onClick={() => setScan(true)} />

      {lines.length > 0 && (
        <>
          <MSection label="Issuing now" right={plural(n, "item")} />
          {lines.map((l, i) => {
            const it = byId[l.itemId];
            const f = flags[i];
            return (
              <MLine key={l.key} title={label(it)} size={sizeOf(it, l.si)} flag={f?.label}
                right={<MStepper label={label(it)} n={l.qty} min={0} max={999} onChange={(v) => setQty(l.key, v)} />}>
                {f && <MReasonChips reasons={OVERRIDE_REASONS} value={l.reason} label={`Reason for ${label(it)}`} onPick={(r) => setReason(l.key, r)} />}
              </MLine>
            );
          })}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", fontWeight: 800 }}>
            <span>{cc ? `To cost centre ${cc}` : "To cost centre"}</span>
            <b style={{ fontFamily: MONO }}>{money(total)}</b>
          </div>
        </>
      )}
    </>
  );
}
