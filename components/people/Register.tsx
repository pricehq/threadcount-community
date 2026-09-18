"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useSnap } from "@/lib/client";
import { usePortalCounts } from "@/lib/portalcounts";
import { PageHead, Empty } from "@/components/ui";
import { Meter, Panel, Seg, SelectButton, Tag } from "@/components/portal";
import { StaffDialog } from "@/components/dialogs";
import { capState, ccFor, ccOf, csvOf, heldByStaff, isNursing, slipLive, staffName, type CapState, type GarmentCounts, type Snapshot, type StaffRec } from "@/lib/compute";
import { downloadCsv } from "@/lib/print";
import { PeopleStyles } from "./shared";
import { cap } from "@/lib/terms";

/* The register as this screen reads it: the snapshot, and the same staff indexed by id, so the
 * approver gap is a lookup rather than a scan of the register per row. */
type Reg = { s: Snapshot; byId: Record<string, StaffRec> };

const approverOf = (r: Reg, st: StaffRec) => (st.managerId ? r.byId[st.managerId] : undefined);
const NOTHING: GarmentCounts = { tops: 0, pants: 0, other: 0, sets: 0 };

/** AT LIMIT is a full half (six tops, or six pairs, or six outside a set); OVER is the counter's own answer. */
const holdState = (c: CapState): "OVER" | "AT LIMIT" | "OK" =>
  c.over ? "OVER" : c.tops >= c.cap || c.pants >= c.cap || c.other >= c.otherCap ? "AT LIMIT" : "OK";

/** The tooltip behind the status tag: capState's own words inside the ceiling, what is true of the locker past it. */
const holdWhy = (c: CapState) => {
  if (!c.over) return c.note;
  const past = [
    ...(c.overTops || c.overPants ? [`${c.tops} ${c.tops === 1 ? "top" : "tops"} and ${c.pants} ${c.pants === 1 ? "pair" : "pairs"}, past the ${c.cap}-set ceiling`] : []),
    ...(c.overOther ? [`${c.other} ${c.other === 1 ? "garment" : "garments"} outside a set, past the ${c.otherCap} allowed`] : []),
  ];
  return `Holding ${past.join("; and ")}.`;
};

/** A code is outstanding and would still be accepted at activation (slipLive is the activation route's own test). */
const liveSlip = (s: Snapshot, st: StaffRec) => !!st.selfCode && slipLive(st.selfCodeAt, s.today, s.tz);

/* What a record still needs before the product can do its job for the person on it. `required`
 * gaps stop something working; the staff app and uniform style are offers, never a backlog.
 * Inactive staff have no gaps. */
type GapKey = "manager" | "fte" | "sizes" | "app" | "style";
const GAPS: { key: GapKey; short: string; filter: string; why: string; required: boolean; done?: string; missing: (r: Reg, st: StaffRec) => boolean }[] = [
  { key: "manager", short: "Approver", filter: "No approver", required: true, why: "No approver on the register, so they can't raise a request.", missing: (r, st) => { const mgr = approverOf(r, st); return !mgr || mgr.inactive; } },
  { key: "fte", short: "FTE", filter: "No FTE", required: true, why: "No FTE, so no initial kit is proposed.", missing: (r, st) => isNursing(r.s, st) && !st.fte.trim() },
  { key: "sizes", short: "Sizes", filter: "No sizes", required: true, why: "No top or pants size recorded.", missing: (_r, st) => !st.top.trim() || !st.pants.trim() },
  { key: "app", short: "Staff app", filter: "No staff app", required: false, why: "Optional: no account, and no code that still works.", done: "Nobody is waiting on that: everyone has an account or has been offered one.", missing: (r, st) => !st.selfEmail && !liveSlip(r.s, st) },
  { key: "style", short: "Uniform style", filter: "No uniform style", required: false, why: "Optional: no cut set, so every style is offered.", done: "Nobody is waiting on that: every record has a uniform style set.", missing: (_r, st) => !st.uniformStyle.trim() },
];
const REQUIRED = GAPS.filter((g) => g.required);

const SHOW = ["all", "any", "manager", "fte", "sizes", "app", "style", "unsigned", "over"] as const;
type Show = (typeof SHOW)[number];
const asShow = (v: string | null): Show => (SHOW as readonly string[]).includes(v || "") ? (v as Show) : "all";

export default function Register() {
  const { s, isAdmin } = useSnap();
  const t = s.settings.terms;
  const counts = usePortalCounts();
  const router = useRouter();
  const pathname = usePathname() || "/app/staff";
  const sp = useSearchParams();
  const [add, setAdd] = useState(false);
  const [q, setQ] = useState(() => sp.get("q") || "");
  const [group, setGroup] = useState(() => sp.get("group") || "All");
  const [show, setShow] = useState<Show>(() => asShow(sp.get("filter")));
  const [inactive, setInactive] = useState<"hide" | "show">(() => (sp.get("inactive") === "1" ? "show" : "hide"));

  /* The filters live in the address, so Today's "Chase" link and a copied URL open the same list. */
  const sync = useCallback((next: { group?: string; show?: Show; inactive?: "hide" | "show" }) => {
    const p = new URLSearchParams();
    const g = next.group ?? group, f = next.show ?? show, i = next.inactive ?? inactive;
    if (q.trim()) p.set("q", q.trim());
    if (g !== "All") p.set("group", g);
    if (f !== "all") p.set("filter", f);
    if (i === "show") p.set("inactive", "1");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [group, show, inactive, q, pathname, router]);

  const reg = useMemo<Reg>(() => { const byId: Record<string, StaffRec> = {}; for (const st of s.staff) byId[st.id] = st; return { s, byId }; }, [s]);
  const gapsOf = useCallback((st: StaffRec) => (st.inactive ? [] : GAPS.filter((g) => g.missing(reg, st))), [reg]);
  const held = useMemo(() => heldByStaff(s), [s]);
  const holdingOf = useCallback((st: StaffRec) => capState({ held: held[st.id] || NOTHING, capSets: s.settings.capSets }), [held, s.settings.capSets]);

  /** People holding at least one garment whose receipt is not signed. */
  const unsigned = useMemo(() => {
    const set = new Set<string>();
    for (const i of s.issues) if (!i.receipt && !i.returned && !i.handedIn) set.add(i.staffId);
    return set;
  }, [s]);

  /* Every queue count is over the whole active register, so narrowing the search never shrinks the job. */
  const tally = useMemo(() => {
    const c = { any: 0, manager: 0, fte: 0, sizes: 0, app: 0, style: 0, unsigned: 0, over: 0 } as Record<Exclude<Show, "all">, number>;
    for (const st of reg.s.staff) {
      if (st.inactive) continue;
      let some = false;
      for (const g of GAPS) if (g.missing(reg, st)) { c[g.key]++; if (g.required) some = true; }
      if (some) c.any++;
      if (unsigned.has(st.id)) c.unsigned++;
      if (holdingOf(st).over) c.over++;
    }
    return c;
  }, [reg, unsigned, holdingOf]);

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const wanted = (st: StaffRec) => {
      if (show === "all") return true;
      if (st.inactive) return false;
      if (show === "any") return REQUIRED.some((g) => g.missing(reg, st));
      if (show === "unsigned") return unsigned.has(st.id);
      if (show === "over") return holdingOf(st).over;
      return GAPS.find((g) => g.key === show)!.missing(reg, st);
    };
    return reg.s.staff.filter((st) => (inactive === "show" || !st.inactive) && (group === "All" || st.group === group) && wanted(st)
      && (!ql || `${st.first} ${st.last}`.toLowerCase().includes(ql) || st.num.toLowerCase().includes(ql) || st.dept.toLowerCase().includes(ql)));
  }, [reg, q, group, inactive, show, unsigned, holdingOf]);

  const groups = ["All", ...new Set(s.staff.map((st) => st.group).filter(Boolean))];
  const nInactive = s.staff.filter((st) => st.inactive).length;
  const nActive = s.staff.length - nInactive;
  const nDesk = s.staff.filter((st) => !st.inactive && st.wardDesk).length;
  const total = inactive === "show" ? s.staff.length : nActive;
  const gapSel = GAPS.find((g) => g.key === show);

  /* The file is the rows on screen. Headers are the staff import template's, so an edited register
     imports back in Settings > Data. Notes and start dates stay out: this file gets emailed to wards.
     Department cost centre is the ward's own code (the template's cc); Cost centre in use is what an
     issue is charged to. Manager number is read back by the importer; the approver name is reference only. */
  function exportCsv() {
    const cols = ["Staff no.", "First name", "Last name", "Phone", "Group", "Department", "Department cost centre", "Cost centre override", "Cost centre in use", "Top", "Pants", "FTE", "Uniform style", "Manager number", "Approver name (reference only)", cap(t.desk), "Entitlement", "Sets held", "Tops held", "Pairs held", "Outside a set held", "Ceiling (sets)", "Holding status", "Register status", "Missing"];
    downloadCsv(`threadcount-staff-${s.today}.csv`, csvOf(cols, rows.map((st) => {
      const c = holdingOf(st);
      const mgr = approverOf(reg, st);
      return [st.num, st.first, st.last, st.phone, st.group, st.dept, ccFor(s, st.dept), st.ccOverride, ccOf(s, st), st.top, st.pants, st.fte, st.uniformStyle, mgr?.num ?? "", mgr?.inactive ? `${staffName(mgr)} — no longer on the register` : staffName(mgr), st.wardDesk ? "Yes" : "No", st.ent ?? "", c.sets, c.tops, c.pants, c.other, c.cap,
        // One value per header: holding status and register status are separate columns. They were
        // written as one ("Inactive" or the holding state), which shifted every later column left
        // and left Missing blank.
        holdState(c), st.inactive ? "Inactive" : "Active", gapsOf(st).filter((g) => g.required).map((g) => g.short).join(", ")];
    })));
  }

  const showOptions = [
    { value: "all", label: "Everyone" },
    { value: "any", label: `Missing something (${tally.any})` },
    ...REQUIRED.map((g) => ({ value: g.key, label: `${g.filter} (${tally[g.key]})` })),
    ...GAPS.filter((g) => !g.required).map((g) => ({ value: g.key, label: `${g.filter} (${tally[g.key]})` })),
    { value: "unsigned", label: `Receipts to sign (${tally.unsigned})` },
    { value: "over", label: `Over the ceiling (${tally.over})` },
  ];

  const emptyText = s.staff.length === 0
    ? "No staff on the register yet. Add a person, or import the register."
    : show === "all" ? "No staff match."
      : show === "unsigned" ? (tally.unsigned === 0 ? "Every receipt is signed." : "Nobody in this search has a receipt to sign.")
        : show === "over" ? (tally.over === 0 ? "Nobody is over the ceiling." : "Nobody in this search is over the ceiling.")
          : tally[show] === 0
            ? show === "any" ? "Every record is finished." : gapSel && !gapSel.required ? gapSel.done ?? "Nobody is waiting on that." : "Nobody on the register is missing that. That list is done."
            : "Nobody in this search matches. Clear the search or the group to see the rest.";

  return (
    <section>
      <PeopleStyles />
      <PageHead title="People">
        {isAdmin && <Link href="/app/settings?tab=data&import=staff" className="btn btn-onink">Import the register</Link>}
        {isAdmin && <button type="button" className="btn btn-primary" onClick={() => setAdd(true)}>Add a person</button>}
      </PageHead>

      <div className="tc-people-filters">
        <input className="input" type="search" style={{ width: 260 }} aria-label={`Search the register by name, number or ${t.team}`} placeholder={`Name, number or ${t.team}`} value={q}
          onChange={(e) => setQ(e.target.value)} onBlur={() => sync({})} onKeyDown={(e) => { if (e.key === "Enter") sync({}); }} />
        <SelectButton label="Group" value={group} anyValue="All" options={groups.map((g) => ({ value: g, label: g }))} onChange={(v) => { setGroup(v); sync({ group: v }); }} />
        <SelectButton label="Show" value={show} anyValue="all" options={showOptions} onChange={(v) => { const f = asShow(v); setShow(f); sync({ show: f }); }} />
        {nInactive > 0 && (
          <Seg label="Inactive" opts={["hide", "show"] as const} value={inactive} labels={{ hide: "Active", show: `Include inactive (${nInactive})` }}
            onChange={(v) => { setInactive(v); sync({ inactive: v }); }} />
        )}
        <div className="tc-people-right">
          <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={rows.length === 0}>Export CSV</button>
          <Link href="/app/requests" className="btn btn-secondary">Requests <Tag tone="ink" mono>{counts.people.attention}</Tag></Link>
        </div>
      </div>

      <p className="tc-people-metaline">
        <span className="tc-mono">{nActive}</span> on the register · <span className="tc-mono">{nDesk}</span> on the {t.desk} · <span className={tally.over > 0 ? "hot" : undefined}><span className="tc-mono">{tally.over}</span> over the ceiling</span> · <span className={tally.any > 0 ? "hot" : undefined}><span className="tc-mono">{tally.any}</span> records to finish</span>
      </p>

      <Panel title={q.trim() || group !== "All" || show !== "all" ? "Matching staff" : "The register"} foot={<span className="tc-mono" style={{ fontSize: 12 }}>Showing {rows.length} of {total}</span>}>
        {rows.length > 0 && (
          <div className="table-wrap">
            <table className="tc-table tc-people-reg">
              <thead>
                <tr><th>Staff no.</th><th>Name</th><th>Group</th><th>{cap(t.team)}</th><th>{cap(t.desk)}</th><th>Cost centre</th><th>Sizes</th><th>Holding</th><th>Status</th><th>Missing</th><th><span className="sr-only">Open</span></th></tr>
              </thead>
              <tbody>
                {rows.map((st) => {
                  const c = holdingOf(st), state = holdState(c);
                  const missing = gapsOf(st);
                  const name = `${st.first} ${st.last}`;
                  return (
                    <tr key={st.id} className={st.inactive ? "inactive" : undefined}>
                      <td className="dsk tc-mono">{st.num}</td>
                      <td className="nm">
                        <Link href={`/app/staff/${st.id}`} className="link-name">{name}</Link>
                        {st.phone && <div className="tc-mono dsk-meta" style={{ fontSize: 11, color: "#57534f" }}>{st.phone}</div>}
                        <div className="mob"><span className="tc-mono">{st.num}</span>{[st.group, st.dept].filter(Boolean).length ? ` · ${[st.group, st.dept].filter(Boolean).join(" · ")}` : ""}</div>
                      </td>
                      <td className="dsk wrapcap">{st.group}</td>
                      <td className="dsk wrapcap">{st.dept}</td>
                      <td className="dsk">{st.wardDesk ? <Tag>desk</Tag> : <span style={{ color: "var(--color-neutral-600)" }}>–</span>}</td>
                      <td className="dsk tc-mono">{ccOf(s, st) || "–"}</td>
                      <td className="dsk sz tc-mono">{st.top || "–"} / {st.pants || "–"}</td>
                      <td className="hold">
                        <div className="meters">
                          <Meter label="Tops" value={c.tops} of={c.cap} size="sm" />
                          <Meter label="Pants" value={c.pants} of={c.cap} size="sm" />
                          {c.other > 0 && <Meter label="Other" value={c.other} of={c.otherCap} size="sm" />}
                        </div>
                      </td>
                      <td>
                        {st.inactive ? <Tag>Inactive</Tag> : <Tag tone={state === "OVER" ? "accent" : state === "AT LIMIT" ? "outline" : "quiet"} title={holdWhy(c)}>{state}</Tag>}
                      </td>
                      <td>
                        {missing.length
                          ? <span className="tc-people-tags">{missing.map((g) => g.required
                              ? <Tag key={g.key} title={g.why}>{g.short}</Tag>
                              : <span key={g.key} style={{ fontSize: 11, color: "var(--color-neutral-600)" }} title={g.why}>{g.short}</span>)}</span>
                          : <span className="dsk-dash" style={{ color: "var(--color-neutral-600)" }}>–</span>}
                      </td>
                      <td className="open" style={{ textAlign: "right" }}>
                        <Link href={`/app/staff/${st.id}`} className="btn btn-ghost tc-people-ghost" aria-label={`View ${name}`}>View ›</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length === 0 && <div style={{ padding: "0 16px" }}><Empty pad={4}>{emptyText}</Empty></div>}
      </Panel>
      {add && <StaffDialog staff={null} onClose={() => setAdd(false)} />}
    </section>
  );
}
