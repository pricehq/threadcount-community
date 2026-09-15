"use client";
/* 1E — New request. One ask, however many garments it takes.
 *
 * A nurse who needs a tunic, trousers and a fleece used to raise three requests: three codes,
 * three emails to the same manager on the same morning, three bags to collect. So this screen is
 * built around a list the person is filling rather than a single garment — add a line, add
 * another, one reason and one note over the lot, one approval at the end.
 *
 * Two things carried over from the old screen because they do most of the work. Availability is
 * shown **before** the request is sent, so nobody asks for a size that isn't there and then waits
 * a week to find out. And the button names the actual approver — "Send to D. Adeyemi", not
 * "Submit" — because the single most common question about a request is who has it.
 *
 * What is new is that the screen also shows what the person already holds and what they are
 * allowed, from the same sum the manager's review screen uses. Being declined "Over allowance"
 * against a number you were never shown is the sort of refusal that ends in a phone call.
 *
 * No prices, no payment, no basket. A request covering four garments is not a basket; approval is
 * still the only control.
 */
import { useState } from "react";
import { MBar, MBody, MError, MRule, MTop } from "@/components/m";
import {
  DarkCard, DraftLineList, GarmentPicker, Kicker, N500, N600, N700, NumberedField, OptionList,
  StockTag, type DraftLine,
} from "@/components/staffui";
import { useStaff } from "@/lib/staffclient";
import { REQUEST_REASONS } from "@/lib/staffreq";
import { fmtDate } from "@/lib/compute";

type Size = { size: string; si: number; word: "in_stock" | "low" | "none" | string; countedOn: string; held: number };
type Item = {
  id: string; item: string; type: string; gender: string; sizes: Size[];
  recorded: string; recordedSource: "record" | "issued" | ""; held: number;
};
type Allowance = { capped: boolean; label: string; note: string; over: boolean };

export default function RequestScreen({
  items, managerName, swap, heldItemIds, preItemId, preSi, holding, allowance, maxLines, maxQty,
}: {
  items: Item[]; managerName: string; swap: boolean; heldItemIds: string[];
  preItemId: string | null; preSi: number | null;
  holding: { total: number; sets: number }; allowance: Allowance;
  maxLines: number; maxQty: number;
}) {
  const { mutate, busy } = useStaff();
  // Swapping a size is a request against something you already hold, so the list is the shorter
  // one. Everything else about the screen is identical — a swap is not a different kind of ask.
  const list = swap && heldItemIds.length ? items.filter((i) => heldItemIds.includes(i.id)) : items;

  /* Arriving from the waitlist's "or take a stocked size", the garment and size are already
   * decided — the person picked them on the previous screen and should not have to again. So the
   * list starts with that line already on it rather than with an empty picker. */
  const [lines, setLines] = useState<DraftLine[]>(() => {
    const it = preItemId ? list.find((i) => i.id === preItemId) : null;
    const s = it && preSi !== null ? it.sizes.find((x) => x.si === preSi) : null;
    return it && s ? [{ key: "pre", itemId: it.id, si: s.si, item: it.item, size: String(s.size), qty: 1 }] : [];
  });
  const [adding, setAdding] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState(swap ? "Swapping a size." : "");
  const [err, setErr] = useState("");
  const [sent, setSent] = useState<{ id: string; manager: string } | null>(null);

  const garments = lines.reduce((n, l) => n + l.qty, 0);
  const full = lines.length >= maxLines;
  // With nothing on the list there is nothing to show but the picker, so it opens itself.
  const picking = adding || lines.length === 0;

  /* The same garment in the same size, added twice, is one line of two rather than two lines of
   * one. The server sums duplicates anyway before it writes them, so a screen that showed two
   * identical rows would be showing something that cannot be saved. */
  function add(l: { itemId: string; si: number; item: string; size: string; qty: number }) {
    setErr("");
    setLines((cur) => {
      const at = cur.findIndex((x) => x.itemId === l.itemId && x.si === l.si);
      if (at >= 0) {
        const next = [...cur];
        next[at] = { ...next[at], qty: Math.min(maxQty, next[at].qty + l.qty) };
        return next;
      }
      return [...cur, { ...l, key: `${l.itemId}:${l.si}:${cur.length}` }];
    });
    setAdding(false);
  }

  /* Raised, but nobody has been emailed.
   *
   * Not an error — the request is on the manager's list either way — but the order screen it would
   * otherwise jump straight to says "Awaiting approval" and nothing else, and somebody who believes
   * there is a message sitting in their manager's inbox will wait a fortnight before chasing it.
   * So the one case where no email left the server is said plainly, once, with the thing to do. */
  if (sent) {
    return (
      <>
        <MTop title="Sent" />
        <MRule />
        <MBody>
          <div style={{ padding: 16 }}>
            <DarkCard
              kicker="Raised"
              title={sent.manager ? `${sent.manager} hasn’t been emailed` : "Your manager hasn’t been emailed"}
              meta="It is on their list in the app and nothing has been lost — but no message went out, so they will not hear about it unless somebody tells them."
            >
              <div style={{ borderTop: "1px solid #4a4746", marginTop: 16, paddingTop: 14, fontSize: 13, lineHeight: 1.55, color: N500 }}>
                Ask the linen room to give {sent.manager || "your manager"} a code for the staff app,
                or mention it to them yourself.
              </div>
            </DarkCard>
          </div>
        </MBody>
        <MBar label="See the order" glyph="arrow" href={`/my/orders/${sent.id}`} />
      </>
    );
  }

  return (
    <>
      <MTop title={swap ? "Swap a size" : "New request"} back />
      <MRule />
      <MBody>
        <NumberedField n={1} label={swap ? "What you’re swapping" : "What you need"} first>
          {list.length === 0 ? (
            <p style={{ fontSize: 14, color: N600, lineHeight: 1.6, margin: 0 }}>
              {swap
                ? "Nothing on your record to swap. Ask for an item instead."
                : "The linen room hasn’t listed any garments yet."}
            </p>
          ) : (
            <>
              {lines.length > 0 && (
                <div style={{ marginBottom: picking ? 14 : 0 }}>
                  <DraftLineList
                    lines={lines}
                    maxQty={maxQty}
                    onQty={(k, q) => setLines((cur) => cur.map((l) => (l.key === k ? { ...l, qty: q } : l)))}
                    onRemove={(k) => setLines((cur) => cur.filter((l) => l.key !== k))}
                  />
                </div>
              )}

              {picking ? (
                <GarmentPicker
                  items={list}
                  maxQty={maxQty}
                  addLabel={lines.length ? "Add it" : "Add to the request"}
                  onCancel={lines.length ? () => setAdding(false) : undefined}
                  // The size the record already knows — their recorded top or trouser size, or the
                  // size of the last one they were issued for everything else.
                  defaultSi={(it) => it.sizes.find((s) => String(s.size) === String(it.recorded))?.si ?? null}
                  note={(it, s) => (
                    <>
                      {it.recordedSource === "record" ? `Your recorded size is ${it.recorded}. ` : ""}
                      {it.recordedSource === "issued" ? `Last issued in ${it.recorded}. ` : ""}
                      {it.held > 0 ? `You hold ${it.held}. ` : ""}
                      {s ? (
                        <>
                          <StockTag word={s.word} />
                          {s.word === "none" && " — the linen room will order it in"}
                          {s.countedOn ? ` · counted ${fmtDate(s.countedOn)}` : ""}
                        </>
                      ) : "Pick a size."}
                    </>
                  )}
                  onAdd={add}
                />
              ) : full ? (
                <p style={{ fontSize: 13, color: N600, lineHeight: 1.55, margin: "12px 0 0" }}>
                  That is {maxLines} lines — as much as one request carries. Send this one and
                  raise another for anything else.
                </p>
              ) : (
                <button
                  onClick={() => { setAdding(true); setErr(""); }}
                  style={{
                    width: "100%", minHeight: 52, marginTop: 2, border: "2px solid var(--color-text)",
                    borderRadius: 0, background: "transparent", color: "var(--color-text)", font: "inherit",
                    fontWeight: 800, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase",
                    textAlign: "left", padding: "0 16px", cursor: "pointer",
                  }}
                >Add another garment</button>
              )}
            </>
          )}
        </NumberedField>

        {/* What they hold and what they are entitled to, in the manager's own words. Shown while
            they are still choosing rather than in the decline. */}
        <div style={{ margin: "0 16px", background: "#fff", borderLeft: `6px solid ${allowance.over ? "var(--color-accent)" : "var(--color-text)"}`, padding: "14px 16px" }}>
          <Kicker tone={allowance.over ? "attention" : "quiet"}>What you hold</Kicker>
          <div style={{ fontSize: 15, lineHeight: 1.5, marginTop: 6 }}>
            {holding.total === 0
              ? "Nothing on your record yet."
              : `${holding.total} garment${holding.total === 1 ? "" : "s"}${holding.sets ? ` · ${holding.sets} set${holding.sets === 1 ? "" : "s"}` : ""}`}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5, marginTop: 4, color: N700 }}>{allowance.label}</div>
          <p style={{ fontSize: 13, lineHeight: 1.55, color: N600, margin: "8px 0 0" }}>{allowance.note}</p>
        </div>

        {lines.length > 0 && (
          <NumberedField n={2} label="Why">
            <OptionList
              columns={2}
              value={reason}
              onPick={(k) => { setReason(k); setErr(""); }}
              options={REQUEST_REASONS.map((r) => ({ key: r, label: r }))}
            />
            <textarea
              value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              aria-label="Anything the linen room should know (optional)"
              placeholder="Anything the linen room should know (optional)"
              style={{ width: "100%", minHeight: 84, marginTop: 14, padding: 12, border: "2px solid var(--color-divider)", borderRadius: 0, font: "inherit", fontSize: 15, resize: "none", background: "#fff", color: "var(--color-text)" }}
            />
            <p style={{ fontSize: 13, color: N600, lineHeight: 1.55, margin: "12px 0 0" }}>
              One reason covers the whole request. {managerName || "Your manager"} can approve some
              garments and knock others back.
            </p>
          </NumberedField>
        )}

        <MError msg={err} onDismiss={() => setErr("")} />

        {!managerName && (
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: N700, padding: "16px 16px 0", margin: 0 }}>
            Nobody is recorded as your approver yet, so this can&rsquo;t be sent. Ask the linen room
            to set your manager on your staff record.
          </p>
        )}
        <div style={{ height: 12 }} />
      </MBody>
      <MBar
        label={busy ? "Sending…" : managerName ? `Send to ${managerName}` : "Send for approval"}
        sub={lines.length ? `${garments} garment${garments === 1 ? "" : "s"} on ${lines.length} line${lines.length === 1 ? "" : "s"}` : undefined}
        disabled={!lines.length || busy || !managerName}
        onClick={async () => {
          if (!lines.length) return;
          const r = await mutate<{ id: string; notified: boolean }>("request.create", {
            lines: lines.map((l) => ({ itemId: l.itemId, si: l.si, qty: l.qty })),
            reason: reason || "", note,
          });
          if (!r.ok) { setErr(r.error); return; }
          // `notified` means an email actually left the server, not that the manager has an account.
          // Nothing was lost either way — the request is raised and waiting for them — but somebody
          // who thinks their manager has been told will wait a fortnight before asking, so the one
          // case where nobody has been told says so before the screen changes.
          if (!r.result.notified) {
            setSent({ id: r.result.id, manager: managerName });
            return;
          }
          window.location.assign(`/my/orders/${r.result.id}`);
        }}
      />
    </>
  );
}
