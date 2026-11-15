import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { buildSnapshot } from "@/lib/snapshot";
import { CASUAL_SETS, FTE_CASUAL, FTE_OPTIONS, ccOf, fmtDate, initialSets, isKit, isNursing, setsForFte, staffName } from "@/lib/compute";
import { SET_GARMENTS, setsCap, setsHeld, setsOnStart } from "@/lib/sets";
import AutoPrint from "@/components/AutoPrint";
import { cap as capTerm } from "@/lib/terms";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

const lb: React.CSSProperties = { fontSize: 8.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#201e1d" };
/** A field is a label over a rule to write on. Filled or blank, the rule is the same height, so a
 *  form printed from a staff record and one printed from a request line up sheet for sheet. */
const F = ({ label, v, big }: { label: string; v?: string; big?: boolean }) => (
  <div>
    <div style={lb}>{label}</div>
    <div style={{ borderBottom: "1.2px solid #201e1d", minHeight: big ? 24 : 21, fontSize: big ? 13 : 11, fontWeight: big ? 700 : 600, padding: "1px 2px 0", display: "flex", alignItems: "flex-end" }}>{v || " "}</div>
  </div>
);
const CB = ({ label }: { label: string }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
    <span style={{ width: 11, height: 11, border: "1.2px solid #201e1d", display: "inline-block" }} />
    <span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
  </span>
);
/** Sets, said the way the form says them out loud. Three different rules quote a number of sets in
 *  three different sentences, and the plural is not worth writing out three times. */
const nSets = (n: number) => `${n} set${n === 1 ? "" : "s"}`;
const H = ({ t, note }: { t: string; note?: string }) => (
  <div style={{ marginTop: 9, borderBottom: "2px solid #201e1d", paddingBottom: 2, display: "flex", alignItems: "baseline", gap: 8 }}>
    <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" }}>{t}</span>
    {note && <span style={{ fontSize: 8.5, fontWeight: 600, color: "#57534f" }}>{note}</span>}
  </div>
);

/* The uniform order form — the one the manager signs.
 *
 * It is the paper half of a mechanism the app already has: an Approval records what came back
 * signed, and this prints the thing that goes out to be signed. Three ways in, one document.
 * `?staff=` gives blank garment rows for somebody to fill in at the ward; `?request=` gives the same
 * form with a request that already exists in ThreadCount written onto it, so the signature and the
 * record are about the same garments; `?approval=` reprints one approval that was already recorded,
 * as it was recorded.
 *
 * That last one is a copy of history and is held to history's rules. An approval row keeps the sets,
 * the FTE and the name as signed, and nothing else about the day it was signed — so those three
 * print as they stand and every other field the form asks for prints blank. Filling the ward, the
 * role or the cost centre in from today's record would put this year's answers on last year's
 * decision, which is exactly the question somebody looking up March came here to ask. The sheet says
 * which is which in its own words rather than leaving a reader to guess.
 *
 * Every word that identifies a hospital — the name across the top, the org line under it, the logo,
 * the contacts in the footer — comes out of that facility's own settings, exactly as the collection
 * slip's do. None of it is written down here. This form was copied off a real health service's
 * paperwork, and shipping any of theirs to every other customer is the one mistake this file cannot
 * make, so an unset field prints an empty space and never a stand-in that reads like a real address.
 *
 * The rule printed at the bottom is the one that belongs to the person named at the top, and only
 * that one. There are three — the FTE table, a fixed starting kit, and manager approval a set at a
 * time — all ending at the same six sets held. Which one a person is on is their group's, as the
 * facility put it in its own settings, and every number in them is read out of those settings
 * through lib/sets rather than written down here. The words on the page name the route, never a job
 * title: one employer's names for its roles printed on another's paperwork is the same mistake as
 * printing its address. Somebody signs under that sentence, so a sentence describing an entitlement
 * that is not theirs is worse on this page than no sentence at all.
 *
 * One A4 page, always. A form that runs onto a second sheet gets thrown away and hand-written, which
 * is exactly the paperwork this replaces — so the blocks are sized to fit together and a long
 * request spills into a counted note rather than pushing the signature over the fold. */
export default async function OrderForm({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await currentUser();
  if (!user) redirect("/auth");
  const q = await searchParams;
  const staffId = String(q.staff || "").trim().slice(0, 64);
  const requestId = String(q.request || "").trim().slice(0, 64);
  const approvalId = String(q.approval || "").trim().slice(0, 64);
  if (!staffId && !requestId && !approvalId) redirect("/app/staff");

  const [fac, snap] = await Promise.all([
    prisma.facility.findUniqueOrThrow({ where: { id: user.facilityId } }),
    buildSnapshot(user),
  ]);

  /** The garments on the form: one row per live request line, or nothing at all when the form is
   *  printed blank for the ward to fill in. */
  type Row = { garment: string; size: string; qty: number };
  let rows: Row[] = [];
  let subjectId = staffId;
  let meta = "";
  let requestSets = 0;
  /** The whole of what an approval remembers about the day it was signed. Four facts, and the page
   *  below prints these four and leaves the rest of the form empty. */
  let recorded: { date: string; by: string; sets: number; fte: string; photo: boolean } | null = null;

  if (requestId) {
    const req = await prisma.request.findFirst({
      where: { id: requestId, facilityId: user.facilityId },
      include: { lines: { include: { item: { select: { item: true, gender: true, type: true, sizes: true } } }, orderBy: { sort: "asc" } } },
    });
    if (!req) redirect("/app/requests");
    subjectId = req.subjectId;
    // A declined line is not being ordered, so it has no business on the order. It stays on the
    // request in the app, where the wearer is told which garment was knocked back and why.
    const live = req.lines.filter((l) => l.status !== "declined");
    rows = live.map((l) => ({
      garment: l.item.item + (l.item.gender !== "Unisex" ? ` — ${l.item.gender}` : ""),
      size: String(l.item.sizes[l.sizeIndex] ?? l.sizeIndex),
      qty: l.qty,
    }));
    requestSets = setsHeld(live.map((l) => ({ item: { type: l.item.type, item: l.item.item }, qty: l.qty })));
    meta = `Request ${req.code}${req.reason ? ` · ${req.reason}` : ""}`;
  } else if (approvalId) {
    const a = await prisma.approval.findFirst({ where: { id: approvalId, facilityId: user.facilityId } });
    if (!a) redirect("/app/staff");
    subjectId = a.staffId;
    // byName is the signature as it was written, kept as a copy on purpose — a manager who has since
    // married or left still signed this form under the name that is on the paper.
    recorded = { date: a.date, by: a.byName, sets: a.sets, fte: a.fte, photo: !!a.photoId };
    meta = `Approval recorded ${fmtDate(a.date)}`;
  }

  const st = snap.staff.find((x) => x.id === subjectId);
  if (!st) redirect(requestId ? "/app/requests" : "/app/staff");

  /* Which of the three allowances this person is on, asked of the facility's own two lists through
     lib/compute, so the paper and the counter screen cannot answer it differently. A group on
     neither list is on manager approval. Both figures go through the helpers rather than straight
     off the settings: a coordinator who has never opened the box, or who cleared it, still gets the
     standing number printed and not a zero. */
  const t = snap.settings.terms;
  const nursing = isNursing(snap, st);
  const onKit = isKit(snap, st);
  const startKit = setsOnStart(snap.settings.initialSets);
  const cap = setsCap(snap.settings.capSets);
  const proposed = initialSets(snap, st);
  /* What the rule says, printed beside what is being asked for. The number is a proposal and never
     a refusal — a manager may write a larger one — but the basis has to be on the page next to it, or
     the deviation is invisible the moment the form is filed. */
  const casual = st.fte.trim().toLowerCase() === FTE_CASUAL.toLowerCase();
  /* A reprint quotes the decision, not the rule. What a manager signed for may well be above what
     any table proposes — that discretion is the point of the form — so printing today's proposal
     under a decision already made would read as a correction nobody has asked for. */
  const basis = recorded
    ? `Recorded approval: ${nSets(recorded.sets)}${recorded.fte ? ` at ${recorded.fte} FTE` : " · no FTE was recorded with it"} · signed by ${recorded.by || "a name that was not recorded"} on ${fmtDate(recorded.date)}`
    : nursing
    ? proposed !== null
      ? `FTE table: ${proposed} set${proposed === 1 ? "" : "s"} at ${st.fte} FTE`
      : casual
        ? `Casual — ${CASUAL_SETS.join(" / ")} sets at the manager's discretion`
        : "No FTE recorded — the table proposes nothing until one is"
    : onKit
      ? `Starting kit for this role: ${nSets(startKit)}`
      : `Ceiling for this role: ${nSets(cap)} — ${cap * SET_GARMENTS} garments — each one approved by the manager`;

  /* The rule in words, under whichever block prints below. Written for the folder this ends up in
     rather than for the wearer: the staff app tells somebody what their manager will approve, a
     signed form has to say who approves what. */
  const rule = nursing
    ? `The table proposes the initial kit; a manager may sign above it, up to ${nSets(cap)} — ${cap * SET_GARMENTS} garments — held at any time.`
    : onKit
      ? `${nSets(startKit)} are issued on starting, and more as needed, up to ${nSets(cap)} — ${cap * SET_GARMENTS} garments — held at any time. Nothing has to be handed back first.`
      : `This role is capped at ${nSets(cap)} — ${cap * SET_GARMENTS} garments — held at any time, and every set needs the manager's approval.`;

  /* The last clause of what the delegate is putting their name to. It has to point at a rule that
     is both on this page and this person's: the FTE table only prints for the groups on it, so
     pointing at it on anybody else's form would be asking for a signature against somebody else's
     numbers. */
  const authorises = nursing
    ? "Where that number is above the table below, I authorise the additional sets."
    : onKit
      ? `Where that number is above the ${nSets(startKit)} issued on starting, I authorise the additional sets.`
      : `I authorise each of those sets against this facility's ceiling of ${nSets(cap)}.`;

  /* The bands off the signed form, read back out of the table in lib/compute.ts rather than typed
     again here, and shown only to the groups on the FTE table. Two FTEs that propose the same number share a column,
     which is how the paper form groups them, and a change to the table changes what prints without
     anybody having to remember that this page exists. */
  const bands: { ftes: string[]; sets: number }[] = [];
  for (const f of FTE_OPTIONS) {
    if (f === FTE_CASUAL) continue;
    const n = setsForFte(f);
    if (n === null) continue;
    const last = bands[bands.length - 1];
    if (last && last.sets === n) last.ftes.push(f);
    else bands.push({ ftes: [f], sets: n });
  }

  const org = fac.slipOrg;
  const blank = rows.length === 0;
  const shown = rows.slice(0, 8);
  const spilled = rows.length - shown.length;
  const garments = rows.reduce((n, r) => n + r.qty, 0);
  // Blank rules are there to be written on at the ward: enough of them to be worth signing, few
  // enough to leave the office-use block on the page. A copy of a decision already made gets none
  // of them — rules to write on are an invitation to fill this in and hand it back as a second
  // approval, and the garments it does not know are said in words underneath instead.
  const empties = recorded ? 0 : blank ? 5 : Math.max(0, 5 - shown.length);
  // A blank form pre-fills the proposal, but only where a rule actually proposes something. The
  // groups on manager approval have a limit and no proposal, so the rule stays empty for the manager
  // to write in: printing the starting kit there would offer them a number nobody agreed.
  const setsAsked = recorded
    ? String(recorded.sets)
    : blank
      ? (nursing || onKit) && proposed !== null ? String(proposed) : ""
      : requestSets > 0 ? `${requestSets} (${garments} garment${garments === 1 ? "" : "s"})` : `${garments} garment${garments === 1 ? "" : "s"}`;

  const contacts = [snap.settings.coordinator, snap.settings.coordinatorEmail, snap.settings.coordinatorPhone].map((x) => x.trim()).filter(Boolean);

  return (
    <div style={{ background: "#fff", color: "#201e1d", fontFamily: "var(--font-body)", minHeight: "100vh" }}>
      <style>{`@page{size:A4;margin:0} html,body{background:#fff !important} .sheet{width:210mm;padding:10mm 14mm 8mm;margin:0 auto;-webkit-print-color-adjust:exact;print-color-adjust:exact} .t{width:100%;border-collapse:collapse} .t th{font-size:8.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;text-align:left;padding:2px 4px;border-bottom:1.5px solid #201e1d} .t td{height:8.4mm;padding:0 4px;font-size:11px;font-weight:600;vertical-align:bottom;border-bottom:1.2px solid #201e1d} .fte{width:100%;border-collapse:collapse;margin-top:3px} .fte th,.fte td{border:1.2px solid #201e1d;padding:2px 4px;font-size:9.5px;text-align:center} .fte th{font-weight:700;background:#f1efee} .fte td{font-weight:700} @media print{.no-print{display:none !important}}`}</style>

      <div className="no-print" style={{ padding: "10px 16px", borderBottom: "2px solid #201e1d", display: "flex", gap: 12, alignItems: "center", fontSize: 13, flexWrap: "wrap" }}>
        <b>Uniform order form</b>
        <span style={{ color: "#57534f" }}>{staffName(st)}{meta ? ` · ${meta}` : ` · blank rows for the ${t.team} to fill in`}</span>
        {recorded && <b>A copy of what was recorded — not a form to sign.</b>}
        {/* The footer is the only thing telling a ward where to send the signed form back to. If
            nobody has filled the contacts in, say so here rather than printing an empty line and
            letting the forms come back to nobody. */}
        {contacts.length === 0 && <b style={{ color: "#b8240e" }}>No {t.store} contacts are set — add the coordinator&apos;s name, e-mail and phone in Settings so this form carries them.</b>}
        <AutoPrint />
      </div>

      <div className="sheet">
        <div style={{ height: 7, background: "linear-gradient(90deg,#201e1d 72%,#9ACBD8 72%)" }} />
        <div style={{ marginTop: 9, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em", textTransform: "uppercase", lineHeight: 1.1 }}>Uniform order form</div>
            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2 }}>{snap.settings.facility}</div>
            {org && <div style={{ fontSize: 9.5, fontWeight: 600, color: "#57534f" }}>{org}</div>}
            {meta && <div style={{ fontSize: 9.5, fontWeight: 700, marginTop: 2 }}>{meta}</div>}
          </div>
          {fac.logoData && <img src={fac.logoData} alt={org || snap.settings.facility} style={{ width: 110, height: 34, objectFit: "contain", objectPosition: "right top" }} />}
        </div>
        {/* Said on the paper, not only on the screen it was printed from, because the paper is what
            ends up in the folder. Somebody pulling this out in a year has to be able to tell at a
            glance which figures are the decision and which fields nobody ever recorded — otherwise
            an empty ward or cost centre reads as a form filled in badly rather than as a fact the
            record never held. */}
        {recorded && (
          <div style={{ marginTop: 8, border: "1.5px solid #201e1d", padding: "5px 7px", fontSize: 9, fontWeight: 600, lineHeight: 1.4 }}>
            A copy of the approval recorded on {fmtDate(recorded.date)} — not a form to sign. The uniform sets, the FTE and the name as signed are printed as they were recorded that day. The staff member is named from the register as it reads today. Every other field the form asks for — the garments, the contact details, the {t.team}, the role, the cost centre — was never recorded against this approval, so it is left blank rather than filled in from today&apos;s record.
            {recorded.photo ? " The signed sheet itself was photographed and is on their record in ThreadCount." : " No photograph of the signed sheet was kept."}
          </div>
        )}

        <H t="Staff details" />
        <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "2fr 1fr 1fr", columnGap: 14 }}>
          <F label="Staff name" v={staffName(st)} big />
          <F label="Payroll number" v={st.num} big />
          <F label={recorded ? "Date approved" : "Date"} v={fmtDate(recorded ? recorded.date : snap.today)} />
        </div>
        <div style={{ marginTop: 7, display: "grid", gridTemplateColumns: "1.7fr 1fr", columnGap: 14 }}>
          {/* Only an e-mail the staff member gave us themselves, on their own self-service account.
              Blank is the right answer when they have never claimed one — the ward writes it in. */}
          <F label="E-mail" v={recorded ? "" : st.selfEmail} />
          <F label="Mobile" v={recorded ? "" : st.phone} />
        </div>

        <H t="Uniforms requested" note={recorded ? "not recorded against this approval — the garments were written on the signed sheet" : blank ? "one garment to a line" : `${rows.length} line${rows.length === 1 ? "" : "s"} · ${garments} garment${garments === 1 ? "" : "s"}`} />
        <table className="t" style={{ marginTop: 3 }}>
          <thead>
            <tr><th style={{ width: "6%" }}>No.</th><th style={{ width: "44%" }}>Garment</th><th style={{ width: "14%" }}>Size</th><th style={{ width: "10%" }}>Qty</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i}><td>{i + 1}</td><td>{r.garment}</td><td>{r.size}</td><td>{r.qty}</td><td> </td></tr>
            ))}
            {Array.from({ length: empties }).map((_, i) => (
              <tr key={`b${i}`}><td>{shown.length + i + 1}</td><td> </td><td> </td><td> </td><td> </td></tr>
            ))}
          </tbody>
        </table>
        {/* The full count is printed in the heading above, so a form that could not fit every line
            says how many it is short rather than quietly ending a garment early. */}
        {spilled > 0 && <div style={{ fontSize: 9.5, fontWeight: 700, marginTop: 3 }}>+{spilled} more line{spilled === 1 ? "" : "s"} — see the request in ThreadCount.</div>}
        {recorded && (
          <div style={{ fontSize: 9, fontWeight: 600, color: "#57534f", marginTop: 3, lineHeight: 1.35 }}>
            The garments were written on the signed sheet by hand. What was recorded here is the number of sets, not the garments, so there is nothing to print on these lines — the sets are in the approval below{recorded.photo ? ", and the photographed sheet on their record has the handwriting" : ""}.
          </div>
        )}

        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "auto 1.4fr 0.9fr", alignItems: "end", columnGap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 3 }}>
            <span style={lb}>Fitting completed</span><CB label="Yes" /><CB label="No" />
          </div>
          <F label="Staff member signature" />
          <F label="Date" />
        </div>

        <H t="Manager / financial delegate approval" note={recorded ? "as recorded — a blank field was never part of the record" : undefined} />
        <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1.5fr 0.8fr 1fr", columnGap: 14 }}>
          <F label={recorded ? "Manager / delegate name (as signed)" : "Manager / delegate name"} v={recorded ? recorded.by : undefined} />
          {/* The cost centre is read off the person's ward as it stands today and wards do change.
              On a reprint that makes it a guess at which budget carried last year's garments, so it
              is left for whoever is reconciling to read off the paper. */}
          <F label="Cost centre" v={recorded ? "" : ccOf(snap, st)} />
          <F label="Contact number" />
        </div>
        <div style={{ marginTop: 7, display: "grid", gridTemplateColumns: "1.5fr 0.7fr 0.6fr 0.8fr", columnGap: 14 }}>
          <F label={capTerm(t.team)} v={recorded ? "" : st.dept} />
          <F label="Role" v={recorded ? "" : st.group} />
          <F label="Combined FTE" v={recorded ? recorded.fte : st.fte} />
          <F label="Uniform sets" v={setsAsked} />
        </div>
        <div style={{ fontSize: 8.5, fontWeight: 600, color: "#57534f", marginTop: 2 }}>{basis}</div>
        <div style={{ fontSize: 9.5, fontWeight: 600, marginTop: 5, lineHeight: 1.35 }}>
          {recorded
            ? `${recorded.by || "Somebody whose name was not recorded"} approved ${nSets(recorded.sets)} for the staff member named above${recorded.fte ? `, at ${recorded.fte} FTE` : ""}. That is the whole of the decision as ThreadCount holds it — the declaration it was signed under is on the signed sheet.`
            : `I confirm this staff member is employed in the role and at the FTE shown above, and I approve the uniform sets requested against the cost centre shown. ${authorises}`}
        </div>
        <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1.6fr 1fr 0.9fr", columnGap: 14 }}>
          {/* The signature rule stays empty on a reprint. The ink is on the sheet that was signed,
              and a copy carrying a signature would be a second decision to file. */}
          <F label={recorded ? "Signature (on the signed sheet)" : "Signature"} />
          <F label="Position" />
          <F label="Date" v={recorded ? fmtDate(recorded.date) : undefined} />
        </div>

        {/* The FTE table is the rule only for the groups the facility put on it, so it prints only on
            their forms. The other two routes have no table to print — a starting kit and a ceiling
            are each one sentence — and the page they save is why a long request still fits above
            the signature.

            A reprint gets none of the three. Which allowance somebody is on is read from their role,
            an approval never recorded the role, and a rule quoted off today's role would be this
            year's entitlement printed underneath last year's decision. */}
        {recorded ? (
          <>
            <H t="Uniform sets" note="the decision, not the rule behind it" />
            <div style={{ fontSize: 8.5, fontWeight: 600, color: "#57534f", marginTop: 3 }}>
              A set is one top and one pair of trousers. The allowance this was signed against is not part of what was recorded, so no entitlement rule is printed on a copy — the sets above are the decision itself.
            </div>
          </>
        ) : (
          <>
            {nursing ? (
              <>
                <H t="Uniform sets by combined FTE" note="for this role · a proposal, not a limit" />
                <table className="fte">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Total combined FTE</th>
                      {bands.map((b) => <th key={b.sets}>{b.ftes.join(" / ")}</th>)}
                      <th>{FTE_CASUAL}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ textAlign: "left" }}>Uniform sets</td>
                      {bands.map((b) => <td key={b.sets}>{b.sets}</td>)}
                      <td>{CASUAL_SETS.join(" / ")} at manager's discretion</td>
                    </tr>
                  </tbody>
                </table>
              </>
            ) : (
              <H t="Uniform sets for this role" note={onKit ? `starting kit · issued by the ${t.store}` : "each set approved by the manager"} />
            )}
            <div style={{ fontSize: 8.5, fontWeight: 600, color: "#57534f", marginTop: 3 }}>
              A set is one top and one pair of trousers. {rule}
            </div>
          </>
        )}

        {/* Never filled in by the app. The counter writes these on the paper as the order goes out and
            the garments come back, and ThreadCount does not yet know a PO number or an invoice value
            — printing a guess at one would be worse than the empty rule it replaced. On a copy they
            are blank for the same reason every other unrecorded field is: whatever the counter wrote
            is on the original, and this page has never been told any of it. */}
        <H t="Office use only" note={recorded ? "written on the original, not held in ThreadCount" : undefined} />
        <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", columnGap: 14, rowGap: 7 }}>
          <F label="Date ordered" />
          <F label="PO number" />
          <F label="Value" />
          <F label="Invoice number" />
          <F label="Stock received" />
          <F label="Date collected" />
          <F label="Staff signature" />
          <div>
            <div style={lb}>Alterations</div>
            <div style={{ borderBottom: "1.2px solid #201e1d", minHeight: 21, display: "flex", alignItems: "flex-end", gap: 10, paddingBottom: 2 }}><CB label="Yes" /><CB label="No" /></div>
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <div style={lb}>Staff notified</div>
            <div style={{ borderBottom: "1.2px solid #201e1d", minHeight: 21, display: "flex", alignItems: "flex-end", gap: 10, paddingBottom: 2 }}><CB label="Phone" /><CB label="E-mail" /><CB label="Date" /></div>
          </div>
        </div>

        <div style={{ marginTop: 9, paddingTop: 5, borderTop: "2px solid #201e1d", fontSize: 9, fontWeight: 600, color: "#57534f" }}>
          {contacts.length > 0 ? `Return the signed form to ${contacts.join(" · ")}` : " "}
        </div>
      </div>
    </div>
  );
}
