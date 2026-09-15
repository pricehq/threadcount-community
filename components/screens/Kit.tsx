"use client";
/* 1B — My kit.
 *
 * The linen room's record of what this person holds, shown to the person it is about, and a way
 * to say it is wrong. "This isn't right" is deliberately blunt and deliberately last: the record
 * is usually correct, and a dispute button placed first would invite one before anybody had read
 * the list.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MBody, MError, MRule, MTop } from "@/components/m";
import { INK, N600, N700, SecondaryBar, Segments } from "@/components/staffui";
import StaffNav from "@/components/staffnav";
import { useStaff } from "@/lib/staffclient";
import { fmtDate } from "@/lib/compute";

type Held = { itemId: string; item: string; size: string; si: number; qty: number; last: string };
type Slip = { id: string; date: string; lines: { item: string; size: string }[]; signed: boolean };
type Data = { held: Held[]; total: number; handedBackThisYear: number; fyFrom: string; sizes: { top: string; pants: string }; slips?: Slip[] };

export default function KitScreen({ data }: { data: Data }) {
  const { mutate, busy } = useStaff();
  const router = useRouter();
  const [tab, setTab] = useState<"holding" | "sizes" | "slips">("holding");
  const [disputing, setDisputing] = useState(false);
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <>
      <MTop title="My kit" right={<span style={{ fontSize: 12, color: "var(--color-neutral-400)" }}>{data.total} item{data.total === 1 ? "" : "s"}</span>} />
      <MRule />
      <MBody>
        <Segments
          label="What to show"
          value={tab}
          onPick={setTab}
          options={[{ key: "holding" as const, label: "Holding" }, { key: "sizes" as const, label: "My sizes" }, { key: "slips" as const, label: "Slips" }]}
        />

        {tab === "holding" ? (
          <>
            <div style={{ display: "flex", padding: "8px 16px", borderBottom: "2px solid " + INK, background: "var(--color-bg)" }}>
              <span style={{ flex: 1, fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: N600 }}>Uniform</span>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: N600 }}>Issued</span>
            </div>
            {data.held.length === 0 ? (
              <div style={{ padding: "22px 16px", fontSize: 14, color: N600, lineHeight: 1.6 }}>
                Nothing on your record. Anything the linen room issues you shows up here.
              </div>
            ) : (
              data.held.map((h) => (
                <div key={`${h.itemId}:${h.si}`} style={{ display: "flex", gap: 12, alignItems: "center", padding: "14px 16px", background: "#fff", borderTop: "1px solid var(--color-divider)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3 }}>{h.item} — {h.size}</div>
                    <div style={{ fontSize: 12, color: N600, marginTop: 3 }}>
                      {h.qty} held · last issued {fmtDate(h.last)}
                    </div>
                  </div>
                  <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{h.qty}</div>
                </div>
              ))
            )}

            <div style={{ borderTop: "2px solid " + INK, padding: "16px", background: "var(--color-bg)" }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: N600 }}>Handed back this year</div>
              <p style={{ fontSize: 14, lineHeight: 1.55, margin: "8px 0 0" }}>
                {data.handedBackThisYear === 0
                  ? `Nothing handed back since ${fmtDate(data.fyFrom)}.`
                  : `${data.handedBackThisYear} garment${data.handedBackThisYear === 1 ? "" : "s"} handed back since ${fmtDate(data.fyFrom)}.`}
              </p>
            </div>
          </>
        ) : tab === "slips" ? (
          (data.slips || []).length === 0 ? (
            <div style={{ padding: "22px 16px", fontSize: 14, color: N600 }}>No signed slips</div>
          ) : (
            (data.slips || []).map((sl) => (
              <div key={sl.id} style={{ padding: "14px 16px", background: "#fff", borderTop: "1px solid var(--color-divider)" }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{fmtDate(sl.date)}</div>
                <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
                  {sl.lines.map((l, i) => (
                    <li key={i} style={{ fontSize: 14, lineHeight: 1.5 }}>{l.item} — {l.size}</li>
                  ))}
                </ul>
                {sl.signed && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/staff/slip/${encodeURIComponent(sl.id)}/sig`} alt="Your signature" style={{ display: "block", maxHeight: 80, maxWidth: "100%", marginTop: 10 }} />
                )}
              </div>
            ))
          )
        ) : (
          <>
            {[["Top", data.sizes.top], ["Trouser", data.sizes.pants]].map(([label, value]) => (
              <div key={label} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "16px", background: "#fff", borderTop: "1px solid var(--color-divider)" }}>
                <span style={{ flex: 1, fontSize: 16, fontWeight: 800 }}>{label}</span>
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 20 }}>{value || "not recorded"}</span>
              </div>
            ))}
            <p style={{ fontSize: 13, lineHeight: 1.6, color: N700, padding: "16px" }}>
              These are the sizes the linen room has on file, and what a new request starts from.
              If one is wrong, tell them — this page can&rsquo;t be edited from your side.
            </p>
          </>
        )}

        {sent && (
          <div style={{ margin: 16, background: INK, color: "var(--color-bg)", padding: 16, fontSize: 14, lineHeight: 1.55 }}>
            Sent. The linen room will look at your record and come back to you.
          </div>
        )}

        {disputing && !sent && (
          <div style={{ padding: 16, borderTop: "2px solid " + INK }}>
            <label htmlFor="tc-dispute" style={{ display: "block", fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>What doesn&rsquo;t look right?</label>
            <textarea
              id="tc-dispute"
              value={body} onChange={(e) => { setBody(e.target.value); setErr(""); }} rows={4}
              placeholder="e.g. I handed two tunics back in August but they’re still on here"
              style={{ width: "100%", minHeight: 84, marginTop: 12, padding: 12, border: "2px solid var(--color-divider)", borderRadius: 0, font: "inherit", fontSize: 15, resize: "none", background: "#fff", color: INK }}
            />
            <MError msg={err} onDismiss={() => setErr("")} />
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <button
                disabled={busy || !body.trim()}
                onClick={async () => {
                  const r = await mutate("dispute.raise", { body });
                  if (!r.ok) { setErr(r.error); return; }
                  setSent(true); setDisputing(false); setBody(""); router.refresh();
                }}
                style={{ minHeight: 48, padding: "0 20px", background: "var(--color-accent)", color: "#fff", border: 0, borderRadius: 0, font: "inherit", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", cursor: busy ? "wait" : "pointer", opacity: busy || !body.trim() ? 0.45 : 1 }}
              >{busy ? "Sending…" : "Send to the linen room"}</button>
              <button onClick={() => { setDisputing(false); setBody(""); setErr(""); }}
                style={{ minHeight: 48, padding: "0 20px", background: "transparent", color: INK, border: "2px solid " + INK, borderRadius: 0, font: "inherit", fontWeight: 800, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        )}

        {!disputing && !sent && (
          <div style={{ padding: 16 }}>
            <SecondaryBar label="This isn’t right" onClick={() => setDisputing(true)} />
          </div>
        )}
        <div style={{ height: 12 }} />
      </MBody>
      <StaffNav />
    </>
  );
}
