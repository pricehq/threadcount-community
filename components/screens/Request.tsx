"use client";
/* Asking for a uniform, in three taps.
 *
 * 01 what you need — the things already on your record first, in the size the record has for them
 * 02 the size, each one carrying the word the ward is allowed to see, and how many
 * 03 why
 *
 * The old screen put a picker dialog between the person and all three, which is six or seven taps
 * for the commonest ask in the product: another of the top I already wear. The picker is gone; the
 * garments they hold are at the top of the list, choosing one fills in their size, and the bar
 * names the person it is going to — "Send to" and the approver's own name, not "Submit" —
 * because who has it is the single most asked question about a request.
 *
 * Two things the mockup's three taps do not cover are kept, because the product rests on them.
 * One request may carry up to REQUEST_MAX_LINES garments — the manager's per-line decline, the one
 * collection code and one bag all depend on it — so *Add another garment* appears once a line is
 * complete and the chosen lines are listed above. And the allowance the manager will measure this
 * against is on screen while they are still choosing, in one line, rather than arriving inside a
 * refusal against a number they were never shown.
 *
 * No prices, no payment, no basket, and no count of what is on the shelf: a size carries a word.
 */
import { useState } from "react";
import Link from "next/link";
import { MBar, MBody, MChipRow, MError, MONO, MRule, MStepper, MTop, useToast } from "@/components/m";
import {
  ACCENT, DraftLineList, INK, N200, N500, N600, N700, NumberedField, OptionList, SecondaryBar,
  type DraftLine,
} from "@/components/staffui";
import Sent from "@/components/screens/Sent";
import { useStaff } from "@/lib/staffclient";
import { REQUEST_REASONS, stockLabel, type StockWord } from "@/lib/staffreq";
import { genderLabel } from "@/lib/compute";

type Size = { size: string; si: number; word: StockWord | string; countedOn: string; held: number };
type Item = {
  id: string; item: string; type: string; gender: string; sizes: Size[];
  recorded: string; recordedSource: "record" | "issued" | ""; held: number;
};
type Allowance = { capped: boolean; label: string; note: string; over: boolean };

/** The word under a size chip. The short lowercase forms are the mockup's; `stockLabel()` is what
 *  a screen reader is given, so the vocabulary the rest of the app uses is the one announced. */
function chipWord(w: string): string {
  return w === "in_stock" ? "in stock" : w === "low" ? "low" : "none";
}

function lineOf(l: { qty: number; item: string; size: string }): string {
  return l.qty > 1 ? `${l.qty} × ${l.item} — ${l.size}` : `${l.item} — ${l.size}`;
}

export default function RequestScreen({
  items, managerName, swap, heldItemIds, preItemId, preSi, preReason, filledFrom,
  holding, allowance, notifyWays, maxLines, maxQty,
}: {
  items: Item[]; managerName: string; swap: boolean; heldItemIds: string[];
  preItemId: string | null; preSi: number | null; preReason: string | null;
  /** The code of the request *Same again* copied, for the one line that says so. */
  filledFrom: string | null;
  holding: { total: number; sets: number }; allowance: Allowance;
  notifyWays: { email: boolean; push: boolean };
  maxLines: number; maxQty: number;
}) {
  const { mutate, busy, me } = useStaff();
  const terms = me.terms;
  const toast = useToast();

  // Swapping a size is a request against something you already hold, so the list is the shorter
  // one. Everything else about the screen is identical — a swap is not a different kind of ask.
  const base = swap && heldItemIds.length ? items.filter((i) => heldItemIds.includes(i.id)) : items;
  /* The things on your record first. That is the whole point of the redesign: the commonest ask is
   * another of something you already wear, and it used to be somewhere down an alphabetical list
   * of the entire catalogue. Within each half the linen room's own order is kept. */
  const list = [...base.filter((i) => i.held > 0), ...base.filter((i) => i.held === 0)];
  // Names that more than one garment on this list answers to (see the option label below).
  const sharedNames = new Set(list.filter((i, _n, all) => all.some((o) => o.id !== i.id && o.item === i.item)).map((i) => i.item));

  const [lines, setLines] = useState<DraftLine[]>([]);
  /* A pre-selection only counts if it is on the list this screen is offering. `?swap=1` narrows the
   * list to what they hold, and an `?item=` arriving from the shelf or a waitlist alternative can
   * fall outside it — leaving a chosen garment nothing could resolve, and steps 02 and 03 never
   * drawn. */
  const [itemId, setItemId] = useState<string | null>(() => (preItemId && list.some((i) => i.id === preItemId) ? preItemId : null));
  const [si, setSi] = useState<number | null>(preSi);
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState<string | null>(preReason);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState<{ id: string; code: string; manager: string; notified: boolean; lines: string[] } | null>(null);

  const item = list.find((i) => i.id === itemId) || null;
  const size = item && si !== null ? item.sizes.find((s) => s.si === si) || null : null;
  const current = item && size ? { itemId: item.id, si: size.si, item: item.item, size: String(size.size), qty } : null;
  const all = current ? [...lines, current] : lines;
  const garments = all.reduce((n, l) => n + l.qty, 0);
  const full = all.length >= maxLines;
  const ready = all.length > 0 && !!reason && !!managerName;
  /* Which step the bar is still waiting for.
   *
   * The mockup draws "pick an item" under a disabled bar, which is right on an empty screen and
   * wrong a moment later: with a garment and a size already chosen and only the reason outstanding,
   * it tells somebody to do the one thing they have just done. So the note names what is actually
   * missing, in the same order the screen asks for it. */
  const missing = !itemId && all.length === 0
    ? { short: "pick an item", full: "Pick an item, a size and a reason" }
    : itemId && si === null
      ? { short: "pick a size", full: "Pick a size" }
      : !reason
        ? { short: "pick a reason", full: "Pick a reason" }
        : { short: "pick an item", full: "Pick an item, a size and a reason" };

  /** Choosing a garment opens on the size the record already has for it — the difference between
   *  three taps and five. Not when that size is the one that isn't there: pre-selecting a size the
   *  linen room cannot pick is worse than asking. */
  function pickItem(id: string) {
    setErr("");
    setItemId(id);
    setQty(1);
    const it = list.find((i) => i.id === id);
    const rec = it ? it.sizes.find((s) => String(s.size) === String(it.recorded)) : null;
    setSi(rec && rec.word !== "none" ? rec.si : null);
  }

  /** Put the garment being chosen on the list and start the next one. */
  function addAnother() {
    if (!current) return;
    setLines((cur) => {
      // The same garment in the same size twice is one line of two: the server sums duplicates
      // before it writes them, so two identical rows would be showing something that cannot save.
      const at = cur.findIndex((x) => x.itemId === current.itemId && x.si === current.si);
      if (at >= 0) {
        const next = [...cur];
        next[at] = { ...next[at], qty: Math.min(maxQty, next[at].qty + current.qty) };
        return next;
      }
      return [...cur, { ...current, key: `${current.itemId}:${current.si}:${cur.length}` }];
    });
    setItemId(null);
    setSi(null);
    setQty(1);
  }

  if (sent) {
    /* What happens next, answered by what this server can actually do rather than by what is
     * usually true: a registered phone, an email that really went out, or neither. */
    const who = sent.manager || "your manager";
    return (
      <Sent
        headline={`Sent to ${who}`}
        sub={`${sent.lines.join(", ")} · ${sent.code}`}
        next={
          notifyWays.push
            ? "You get a notification when it is approved, and again when it is ready."
            : sent.notified
              ? `${who} has been emailed.`
              : `It is waiting with ${who}.`
        }
        actions={[
          { label: "Open the order", href: `/my/orders/${sent.id}` },
          { label: "Back to home", href: "/my" },
        ]}
        bar={{ label: "Back to home", href: "/my" }}
      />
    );
  }

  return (
    <>
      <MTop title={swap ? "Swap a size" : "Request an item"} back backHref="/my" />
      <MRule />
      <MBody>
        {/* The mockup toasts "Filled in from R-0042". Kept as a line on the screen rather than a
            toast: the toast host is mounted, but this screen is server-rendered and arrives with
            the garment already chosen, so a 2.2-second toast is gone — or never announced — before
            somebody has looked up from the list. A line a screen reader is told about survives. */}
        {filledFrom && (
          <div role="status" style={{
            background: INK, color: "var(--color-bg)", borderLeft: `6px solid ${ACCENT}`,
            padding: "12px 14px", fontSize: 14, fontWeight: 800,
          }}>Filled in from {filledFrom}</div>
        )}

        {lines.length > 0 && (
          <div style={{ padding: "16px 16px 0" }}>
            <DraftLineList
              lines={lines}
              maxQty={maxQty}
              onQty={(k, q) => setLines((cur) => cur.map((l) => (l.key === k ? { ...l, qty: q } : l)))}
              onRemove={(k) => setLines((cur) => cur.filter((l) => l.key !== k))}
            />
          </div>
        )}

        <NumberedField n={1} label={swap ? "What you’re swapping" : "What you need"} first>
          {list.length === 0 ? (
            <p style={{ fontSize: 14, color: N600, lineHeight: 1.6, margin: 0 }}>
              {swap
                ? "Nothing on your record to swap. Ask for an item instead."
                : `The ${terms.store} hasn’t listed any garments yet.`}
            </p>
          ) : (
            <OptionList
              value={itemId}
              onPick={pickItem}
              options={list.map((i) => {
                const held = i.sizes.find((s) => s.held > 0);
                return {
                  key: i.id,
                  /* Two garments can carry the same name in different cuts — a women's and a
                     unisex scrub top are two rows on the register, and somebody set to "either"
                     is offered both. Named identically they read as the list repeating itself, so
                     the cut is added to whichever names are shared, and to nothing else. */
                  label: sharedNames.has(i.item) ? `${i.item} · ${genderLabel(i.gender)}` : i.item,
                  meta: i.held > 0 && held
                    ? `You hold ${i.held === 1 ? "one" : i.held} in ${held.size}`
                    : "Not on your record",
                };
              })}
            />
          )}
        </NumberedField>

        {item && (
          <>
            <NumberedField n={2} label="Size">
              {/* Every size is shown, including the ones that aren't there: "it isn't there" is
                  information somebody came for. A none size is a link to the queue for it —
                  ⛔ never a `disabled` button, which takes no tap and no focus, so the one route
                  that answers their problem would be unreachable by touch and by keyboard alike. */}
              <div role="group" aria-label="Size" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {item.sizes.map((s) => {
                  const on = si === s.si;
                  const none = s.word === "none";
                  const st: React.CSSProperties = {
                    minHeight: 46, minWidth: 50, padding: "0 12px", borderRadius: 0,
                    border: `2px solid ${none ? "var(--color-divider)" : INK}`,
                    background: none ? "transparent" : on ? INK : "#fff",
                    color: none ? N500 : on ? "var(--color-bg)" : INK,
                    font: "inherit", fontSize: 14, fontWeight: 700, textDecoration: "none",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                    cursor: "pointer",
                  };
                  const inner = (
                    <>
                      {s.size}
                      <small style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, color: on ? N200 : N600 }}>
                        {chipWord(String(s.word))}
                      </small>
                    </>
                  );
                  return none ? (
                    <Link
                      key={s.si}
                      href={`/my/waitlist?item=${encodeURIComponent(item.id)}&si=${s.si}`}
                      aria-disabled="true"
                      aria-label={`${s.size}, ${stockLabel("none")} — join the waitlist`}
                      style={st}
                    >{inner}</Link>
                  ) : (
                    <button
                      key={s.si}
                      type="button"
                      onClick={() => { setSi(s.si); setErr(""); }}
                      aria-pressed={on}
                      aria-label={`${s.size}, ${stockLabel(s.word as StockWord)}`}
                      style={st}
                    >{inner}</button>
                  );
                })}
              </div>

              {size && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 12, minHeight: 60, marginTop: 8,
                  borderTop: "1px solid var(--color-divider)", paddingTop: 10,
                }}>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 700 }}>How many</span>
                  <MStepper n={qty} onChange={setQty} min={1} max={maxQty} label="garments" />
                </div>
              )}
            </NumberedField>

          </>
        )}

        {/* One reason covers the whole request, so it stays put once anything is on the list.
            Gated on the garment being chosen, *Add another garment* took the only control that sets
            a reason off the screen — and the bar then asked for one that could no longer be picked. */}
        {(item || lines.length > 0) && (
          <NumberedField n={3} label="Why">
            {/* Chips, as the mockup draws them. Four short words do not need four 58px boxes with a
                chevron each: the reason is the last of the three taps, and at option-list size it
                pushed the bar that sends the request off the bottom of the screen. */}
            <MChipRow
              label="Why"
              value={reason}
              onPick={(r) => { setReason(r); setErr(""); }}
              options={REQUEST_REASONS.map((r) => ({ value: r as string, label: r }))}
            />
          </NumberedField>
        )}

        {/* What they hold and what they are measured against, in one line, while they are still
            choosing — not inside the decline. Same sum the manager's review screen uses. */}
        <div style={{
          margin: "0 16px", background: "#fff", padding: "14px 16px",
          borderLeft: `6px solid ${allowance.over ? ACCENT : INK}`,
          fontSize: 14, lineHeight: 1.5, color: N700,
        }}>
          {holding.total === 0 ? "Nothing on your record yet" : `${holding.total} garment${holding.total === 1 ? "" : "s"} on your record`}
          {" · "}{allowance.label}
        </div>

        {current && !full && (
          <div style={{ padding: "16px 16px 0" }}>
            <SecondaryBar label="Add another garment" onClick={addAnother} />
          </div>
        )}
        {full && (
          <p style={{ fontSize: 13, color: N600, lineHeight: 1.55, margin: "12px 16px 0" }}>
            That is {maxLines} garments — as much as one request carries.
          </p>
        )}

        <MError msg={err} onDismiss={() => setErr("")} />

        {!managerName && (
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: N700, padding: "16px 16px 0", margin: 0 }}>
            Nobody is recorded as your approver yet, so this can&rsquo;t be sent. Ask the {terms.store}
            to set your manager on your staff record.
          </p>
        )}
        <div style={{ height: 12 }} />
      </MBody>
      {/* What the bar is still waiting for. A single "pick an item" was what the mockup drew on an
          empty screen, but it stayed there with a garment and a size already chosen and only the
          reason outstanding — telling somebody to do the one thing they have just done. */}
      <MBar
        label={busy ? "Sending…" : managerName ? `Send to ${managerName}` : "Send for approval"}
        small={ready ? `${garments} garment${garments === 1 ? "" : "s"}` : managerName ? missing.short : "no approver"}
        disabled={!ready || busy}
        offReason={managerName ? missing.full : "Nobody is recorded as your approver yet"}
        onClick={async () => {
          if (!ready) return;
          const r = await mutate<{ id: string; code: string; manager: string; notified: boolean }>("request.create", {
            lines: all.map((l) => ({ itemId: l.itemId, si: l.si, qty: l.qty })),
            reason: reason || "",
            // The one thing the swap route has always told the linen room, kept now that the free
            // note has gone: this is an exchange, not another garment on top.
            note: swap ? "Swapping a size." : "",
          });
          if (!r.ok) { setErr(r.error); return; }
          toast("Sent");
          setSent({
            id: r.result.id, code: r.result.code, manager: r.result.manager || managerName,
            notified: r.result.notified, lines: all.map(lineOf),
          });
        }}
      />
    </>
  );
}
