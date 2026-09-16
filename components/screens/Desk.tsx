"use client";
/* 2C — Raise for someone you manage.
 *
 * A manager standing next to somebody who will not type it in themselves: they pick the person,
 * build the list, and the record says both names. The ward desk once had a screen of its own for
 * the same job, on the grounds that half a ward would never install anything; it is gone, because
 * the manager is already the person that ward would have asked.
 *
 * The rule that shapes it: **nobody approves their own raise.** The approver is the subject's
 * manager — which here is the person typing — so the server sends it a level up, and this screen
 * says so by name before the button is pressed. A manager who could approve a request they typed
 * themselves would be no approval at all.
 */
import { useMemo, useRef, useState } from "react";
import { MBar, MBody, MError, MRule, MTop, inputStyle } from "@/components/m";
import {
  ACCENT_300, DarkCard, DraftLineList, EdgeRow, GarmentPicker, GROUND, INK, N500, N600,
  NumberedField, OptionList, type DraftLine,
} from "@/components/staffui";
import Team, { Band } from "./Team";
import { useStaff } from "@/lib/staffclient";
import { REQUEST_REASONS, statusText } from "@/lib/staffreq";
import type { ReqRow } from "@/lib/staffdata";

type Person = {
  id: string; name: string; num: string; group: string; hasApp: boolean;
  recordedTop: string; recordedPants: string;
  held: Record<string, number>; lastSizes: Record<string, string>;
};
type Size = { size: string; si: number; word: string; countedOn: string };
type Item = { id: string; item: string; type: string; gender: string; sizes: Size[]; recorded: string; isTop: boolean; isPant: boolean };

export default function DeskScreen({ people, items, raised, maxLines, maxQty }: {
  /** The people who report to whoever is raising, which is exactly the set the server accepts. */
  people: Person[]; items: Item[];
  /** What they have raised for other people and not yet seen the end of. */
  raised: ReqRow[];
  maxLines: number; maxQty: number;
}) {
  const { mutate, busy } = useStaff();
  const [q, setQ] = useState("");
  const [personId, setPersonId] = useState<string | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [adding, setAdding] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [sent, setSent] = useState<{ id: string; code: string; manager: string; escalated: boolean } | null>(null);

  const person = people.find((p) => p.id === personId) || null;
  const garments = lines.reduce((n, l) => n + l.qty, 0);
  const full = lines.length >= maxLines;
  const picking = adding || lines.length === 0;

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return people.slice(0, 8);
    return people.filter((p) => p.name.toLowerCase().includes(needle) || p.num.toLowerCase().includes(needle)).slice(0, 12);
  }, [people, q]);

  function pick(id: string) {
    setPersonId(id);
    setErr("");
    setLines([]);
    setAdding(false);
  }

  /* The result list is a radio group, so it has to answer the arrow keys.
   *
   * A screen reader in forms mode announces it as "radio group, 1 of 8", and a manager standing
   * next to the nurse they are raising for presses Down to reach her — having been told it is a
   * radio group, they have no reason to try Tab. Without this they sit on the first name and give
   * up. Two halves make it work: one tab stop into the group (the roving tabIndex below), and the
   * arrows moving inside it. Moving also selects, the way a radio group does everywhere else,
   * which clears any draft lines exactly as clicking a different name always has. */
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIdx = Math.max(0, matches.findIndex((p) => p.id === personId));

  function moveTo(i: number) {
    const next = matches[i];
    if (!next) return;
    pick(next.id);
    radios.current[i]?.focus();
  }

  function onResultKey(e: React.KeyboardEvent) {
    if (!matches.length) return;
    const fwd = e.key === "ArrowDown" || e.key === "ArrowRight";
    const back = e.key === "ArrowUp" || e.key === "ArrowLeft";
    if (!fwd && !back && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault(); // otherwise the arrows scroll the list out from under the focused name
    if (e.key === "Home") return moveTo(0);
    if (e.key === "End") return moveTo(matches.length - 1);
    // Nothing chosen yet — or the search has moved on past whoever was — so the first press lands
    // on the first match rather than skipping it.
    const at = matches.findIndex((p) => p.id === personId);
    if (at < 0) return moveTo(0);
    moveTo((at + (fwd ? 1 : -1) + matches.length) % matches.length);
  }

  /* Their recorded size, not the clerk's guess. Tops and trousers carry one on the register; for
   * everything else — a fleece, a vest, a dress — the size of the last one they were issued is all
   * the record knows, and it is a far better opening bid than an empty grid. */
  function sizeFor(it: Item): string {
    if (!person) return "";
    if (it.isPant) return person.recordedPants;
    if (it.isTop) return person.recordedTop;
    return person.lastSizes[it.id] || "";
  }

  function add(l: { itemId: string; si: number; item: string; size: string; qty: number }) {
    setErr("");
    setLines((cur) => {
      // The server sums duplicate lines before it writes them, so two identical rows on the screen
      // would be showing something that cannot be saved.
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

  const ready = !!person && lines.length > 0;

  /* Where it actually went.
   *
   * A manager raising for their own report is approving nothing: the server sends it up a level,
   * or leaves it for the linen room to address when there is nobody above them. Either way the
   * person who typed it needs to be told, by name, rather than dropped on an order screen that
   * says "awaiting approval" and leaves them to work out whose. */
  if (sent) {
    return (
      <>
        <MTop title="Raised" />
        <MRule />
        <MBody>
          <div style={{ padding: 16 }}>
            <DarkCard
              kicker={sent.code}
              title={sent.manager ? `With ${sent.manager}` : "Nobody approves this yet"}
              meta={sent.manager
                ? (sent.escalated
                  ? "You approve their requests, so this went up a level — nobody approves their own raise."
                  : "They have been told, and it stays on your list until it is done.")
                : "There is nobody above you on the register, so the linen room will address it to an approver."}
            >
              <div style={{ borderTop: "1px solid #4a4746", marginTop: 16, paddingTop: 14, fontSize: 13, lineHeight: 1.55, color: N500 }}>
                You&rsquo;ll see the outcome here and under Raised in your orders.
              </div>
            </DarkCard>
          </div>
        </MBody>
        <MBar label="See the order" glyph="arrow" href={`/my/orders/${sent.id}`} />
      </>
    );
  }

  /* The bar lives below the scrolling body, so the shell is handed it rather than it being drawn
     inside the list, where it would scroll away with the garments it is about to send. */
  const sendBar = (
    <MBar
      label={busy ? "Sending…" : "Send for approval"}
      sub={person && lines.length ? `${garments} garment${garments === 1 ? "" : "s"} for ${person.name.split(" ")[0]}` : undefined}
      disabled={!ready || busy}
      onClick={async () => {
        if (!person || !lines.length) return;
        const r = await mutate<{ id: string; code: string; manager: string; escalated: boolean }>("request.create", {
          subjectId: person.id,
          lines: lines.map((l) => ({ itemId: l.itemId, si: l.si, qty: l.qty })),
          reason: reason || "", note,
        });
        if (!r.ok) { setErr(r.error); return; }
        // A raise that went somewhere other than the obvious place — up a level, or to nobody at
        // all — is worth a screen of its own. Anything ordinary goes straight to the order, which
        // is where the person who typed it will come looking for it.
        if (r.result.escalated || !r.result.manager) {
          setSent({ id: r.result.id, code: r.result.code, manager: r.result.manager, escalated: r.result.escalated });
          return;
        }
        window.location.assign(`/my/orders/${r.result.id}`);
      }}
    />
  );

  return (
    <Team active="/my/raise" foot={sendBar}>
        <div style={{ padding: "16px 16px 0" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
            Raise for your team
          </div>
          {/* The one rule that shapes this screen: a manager who could approve what they typed
              themselves would be no approval at all. */}
          <p style={{ fontSize: 14, lineHeight: 1.5, color: N600, margin: "4px 0 0" }}>
            Goes above you, not to you — your own manager approves it.
          </p>
        </div>

        <NumberedField n={1} label="Who is it for" first>
          {/* The NumberedField heading names the step, not this box, so the box says what it is
              itself — a placeholder disappears the moment anyone types into it. */}
          <input
            value={q} onChange={(e) => { setQ(e.target.value); setErr(""); }}
            aria-label="Search by name or staff number"
            placeholder="Name or staff number" autoComplete="off"
            style={{ ...inputStyle, width: "100%" }}
          />
          <div role="radiogroup" aria-label="Search results" onKeyDown={onResultKey} style={{ display: "grid", gap: 2, marginTop: 12 }}>
            {matches.map((p, i) => {
              const on = p.id === personId;
              return (
                <button key={p.id} role="radio" aria-checked={on}
                  ref={(el) => { radios.current[i] = el; }}
                  // One tab stop for the whole group: Tab reaches the chosen name (or the first
                  // one), and the arrows move between them from there.
                  tabIndex={i === activeIdx ? 0 : -1}
                  onClick={() => pick(p.id)}
                  style={{
                    textAlign: "left", padding: "12px 14px", border: 0, borderRadius: 0, font: "inherit",
                    background: on ? INK : "#fff", color: on ? GROUND : INK, cursor: "pointer", minHeight: 48,
                  }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{p.name}</div>
                  <div style={{ fontSize: 12.5, marginTop: 3, opacity: 0.85 }}>{[p.num, p.group].filter(Boolean).join(" · ")}</div>
                  {on && !p.hasApp && (
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: ACCENT_300, marginTop: 6 }}>
                      No app — you&rsquo;ll have to pass the outcome on
                    </div>
                  )}
                </button>
              );
            })}
            {matches.length === 0 && (
              <p style={{ fontSize: 14, color: N600, lineHeight: 1.6, margin: 0 }}>Nobody on your team matches that.</p>
            )}
          </div>
        </NumberedField>

        {person && (
          <NumberedField n={2} label={`What ${person.name.split(" ")[0]} needs`}>
            {lines.length > 0 && (
              <div style={{ marginBottom: picking ? 14 : 0 }}>
                <DraftLineList
                  lines={lines}
                  maxQty={maxQty}
                  onQty={(k, q2) => setLines((cur) => cur.map((l) => (l.key === k ? { ...l, qty: q2 } : l)))}
                  onRemove={(k) => setLines((cur) => cur.filter((l) => l.key !== k))}
                />
              </div>
            )}

            {picking ? (
              <GarmentPicker
                items={items}
                maxQty={maxQty}
                addLabel={lines.length ? "Add it" : "Add to the request"}
                onCancel={lines.length ? () => setAdding(false) : undefined}
                defaultSi={(it) => {
                  const want = sizeFor(it);
                  return it.sizes.find((s) => String(s.size) === String(want))?.si ?? null;
                }}
                note={(it) => {
                  const rec = sizeFor(it);
                  const holds = person.held[it.id] || 0;
                  return [
                    rec ? `Recorded size ${rec}` : "No size on record for this one",
                    holds ? `holds ${holds}` : "",
                  ].filter(Boolean).join(" · ");
                }}
                onAdd={add}
              />
            ) : full ? (
              <p style={{ fontSize: 13, color: N600, lineHeight: 1.55, margin: "12px 0 0" }}>
                That is {maxLines} lines — as much as one request carries. Send this one and raise
                another for anything else.
              </p>
            ) : (
              <button
                onClick={() => { setAdding(true); setErr(""); }}
                style={{
                  width: "100%", minHeight: 52, marginTop: 2, border: `2px solid ${INK}`, borderRadius: 0,
                  background: "transparent", color: INK, font: "inherit", fontWeight: 800, fontSize: 13,
                  letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "left", padding: "0 16px", cursor: "pointer",
                }}
              >Add another garment</button>
            )}

            {lines.length > 0 && !picking && (
              <div style={{ marginTop: 14 }}>
                <OptionList
                  label="Why"
                  columns={2}
                  value={reason}
                  onPick={setReason}
                  options={REQUEST_REASONS.map((r) => ({ key: r, label: r }))}
                />
                <textarea
                  value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                  aria-label="Anything the linen room should know (optional)"
                  placeholder="Anything the linen room should know (optional)"
                  style={{ width: "100%", minHeight: 68, marginTop: 14, padding: 12, border: "2px solid var(--color-divider)", borderRadius: 0, font: "inherit", fontSize: 15, resize: "none", background: "#fff", color: "var(--color-text)" }}
                />
              </div>
            )}
          </NumberedField>
        )}

        {/* What they have already raised for other people. Without this the manager who was told
            "you'll see the outcome" had nowhere to see it: every list in this app starts from the
            wearer, and a request raised for somebody else belongs to none of them. */}
        {raised.length > 0 && (
          <>
            <Band label="Raised by you · still open" />
            <div style={{ display: "grid", gap: 2, padding: "12px 0" }}>
              {raised.map((r) => {
                const st = statusText(r, { mine: false, first: r.subjectName?.split(" ")[0] });
                return (
                  <EdgeRow key={r.id} tone={st.ink === "attention" ? "accent" : "divider"} href={`/my/orders/${r.id}`}>
                    <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                      <span style={{ flex: 1, fontSize: 16, fontWeight: 800 }}>{r.subjectName}</span>
                      <span style={{ fontSize: 12, color: N600 }}>{r.code}</span>
                    </div>
                    <div style={{ fontSize: 14.5, fontWeight: 600, marginTop: 5, lineHeight: 1.35 }}>{r.summary}</div>
                    <div style={{ fontSize: 12.5, color: N600, marginTop: 4 }}>
                      {[st.label, st.note].filter(Boolean).join(" · ")}
                    </div>
                  </EdgeRow>
                );
              })}
            </div>
          </>
        )}

        <MError msg={err} onDismiss={() => setErr("")} />
        <div style={{ height: 12 }} />
    </Team>
  );
}
