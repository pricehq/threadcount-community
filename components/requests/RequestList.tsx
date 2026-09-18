"use client";
/* The request queue, as one reusable list.
 *
 * Imported by /app/requests (the full queue), the staff record's Requests tab and Today's Pick
 * group; the command panel reads useRequests(). `lines` is what was asked, `bag` is what is
 * picked: the pick, the slip and the collection code are always built from `bag`, so a garment
 * the ward declined never goes in somebody's hands. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSnap } from "@/lib/client";
import { openSlip } from "@/components/dialogs";
import { Empty, ErrorLine } from "@/components/ui";
import { Panel, Tag } from "@/components/portal";
import { formatInZone, genderLabel, key, onhand, slipLive, type Ledger, type Snapshot } from "@/lib/compute";
import type { ReqLine } from "@/lib/staffdata";
import { NEEDS_STAFF, OPEN_REQUEST, ROUTED_TO_ROUND, statusText } from "@/lib/staffreq";
import type { Terms } from "@/lib/terms";

export type RequestMessage = { id: string; fromStaff: boolean; authorName: string; body: string; at: string };
export type RequestEvent = { id: string; label: string; meta: string; actorName: string; at: string };

/** One request exactly as GET /api/requests returns it (the API does not change). */
export type RequestRow = {
  id: string; code: string; status: string; staffId: string; staffName: string; staffNum: string; ward: string;
  lines: ReqLine[]; bag: ReqLine[];
  summary: string; garments: number; lineCount: number; decision: string | null;
  reason: string; note: string;
  managerName: string; managerId: string | null;
  declineReason: string | null; route: string | null;
  collectCode: string | null; holdUntil: string; signerName: string | null; signerRole: string | null;
  signedAt: string | null; claimedAt: string | null;
  raisedById: string | null; raisedByName: string;
  createdAt: string; decidedAt: string | null;
  messages: RequestMessage[]; events: RequestEvent[];
};
export type DisputeRow = { id: string; body: string; staffName: string; staffNum: string; ward: string; at: string };
export type CycleRow = { id: string; dueBy: string; openedBy: string; openedAt: string; answers: number };
export type WaitingRow = { id: string; staffName: string; staffNum: string; ward: string; item: string; size: string; since: string; offeredAt: string | null };
export type DamageRow = { id: string; kind: string; note: string; photoId: string | null; staffId: string; staffName: string; staffNum: string; ward: string; item: string; size: string; requestCode: string; at: string };
export type ShortfallRow = { id: string; staffId: string; staffName: string; staffNum: string; ward: string; item: string; size: string; onRecord: number; confirmed: number; short: number; at: string };
export type RequestsPayload = {
  requests: RequestRow[]; requestLimit: number; moreRequests: boolean;
  /** Absent when fetched with ?staff= */
  disputes?: DisputeRow[]; cycle?: CycleRow | null; shortfalls?: ShortfallRow[]; waiting?: WaitingRow[]; damage?: DamageRow[];
};

export const REQUEST_FILTERS = ["todo", "noapprover", "open", "all", "queries", "damage", "cycles"] as const;
export type RequestFilter = (typeof REQUEST_FILTERS)[number];
export type RequestRowFilter = Extract<RequestFilter, "todo" | "noapprover" | "open" | "all">;
export const REQUEST_FILTER_LABEL: Record<RequestFilter, string> = {
  todo: "To do", noapprover: "Needs an approver", open: "Open", all: "All",
  queries: "Record queries", damage: "Damage", cycles: "Kit check & waitlist",
};
export const isRowFilter = (f: RequestFilter): f is RequestRowFilter => f === "todo" || f === "noapprover" || f === "open" || f === "all";

/* ---------- status predicates: the only definitions screens may use ---------- */

const TODO = new Set(["accepted", "picking", "ready", "round"]);
export function isTodo(r: RequestRow): boolean { return TODO.has(r.status); }
/** Nobody was ever asked to approve it, so nobody on the ward can move it. */
export function isStranded(r: RequestRow): boolean { return r.status === "awaiting" && !r.managerName; }
export function isOpenRequest(r: RequestRow): boolean { return OPEN_REQUEST.has(r.status as never); }
export function isPickable(r: RequestRow): boolean { return r.status === "accepted"; }

type Scope = { staffId?: string; ward?: string };

const inScope = (r: { staffId?: string; ward: string }, scope?: Scope) =>
  (!scope?.staffId || r.staffId === scope.staffId) && (!scope?.ward || r.ward === scope.ward);

export function requestsFor(rows: readonly RequestRow[], f: RequestRowFilter, scope?: Scope): RequestRow[] {
  const pick = f === "todo" ? isTodo : f === "noapprover" ? isStranded : f === "open" ? isOpenRequest : () => true;
  return rows.filter((r) => inScope(r, scope) && pick(r));
}

/** The payload narrowed to one person or one ward. Record queries and the waitlist carry no staff
 *  id, so a person is matched on their staff number there: pass it when you have the snapshot,
 *  otherwise it is read off that person's own requests, damage or shortfall rows. */
export function scopePayload(p: RequestsPayload, scope?: Scope, staffNum?: string): RequestsPayload {
  if (!scope?.staffId && !scope?.ward) return p;
  const num = scope.staffId
    ? staffNum ?? [...p.requests, ...(p.damage ?? []), ...(p.shortfalls ?? [])].find((r) => r.staffId === scope.staffId)?.staffNum
    : undefined;
  const byNum = (r: { staffNum: string; ward: string }) =>
    (!scope.staffId || (!!num && r.staffNum === num)) && (!scope.ward || r.ward === scope.ward);
  return {
    ...p,
    requests: p.requests.filter((r) => inScope(r, scope)),
    disputes: p.disputes?.filter(byNum),
    waiting: p.waiting?.filter(byNum),
    damage: p.damage?.filter((r) => inScope(r, scope)),
    shortfalls: p.shortfalls?.filter((r) => inScope(r, scope)),
  };
}

export function requestCounts(p: RequestsPayload, scope?: Scope): Record<RequestFilter, number> {
  const q = scopePayload(p, scope);
  return {
    todo: q.requests.filter(isTodo).length,
    noapprover: q.requests.filter(isStranded).length,
    open: q.requests.filter(isOpenRequest).length,
    all: q.requests.length,
    queries: q.disputes?.length ?? 0,
    damage: q.damage?.length ?? 0,
    cycles: q.waiting?.length ?? 0,
  };
}

/** Shelf check of a request's bag: inStock when every bag line has onhand(itemId:si) >= qty. */
export function bagStock(s: Snapshot, L: Ledger, r: RequestRow): { inStock: boolean; shortLines: ReqLine[] } {
  // Two lines for the same garment and size draw on the same shelf, so they are summed first.
  const want: Record<string, number> = {};
  for (const l of r.bag) want[key(l.itemId, l.si)] = (want[key(l.itemId, l.si)] || 0) + l.qty;
  const shortLines = r.bag.filter((l) => onhand(s, L, key(l.itemId, l.si)) < want[key(l.itemId, l.si)]);
  return { inStock: shortLines.length === 0, shortLines };
}

const lineText = (l: ReqLine) => `${l.qty} × ${l.item}${l.gender && l.gender !== "Unisex" ? ` (${genderLabel(l.gender)})` : ""} — ${l.size}`;

/** The slip payload for openSlip() (bag lines only, collection code, cut). */
export function requestSlip(s: Snapshot, r: RequestRow): Record<string, string | number> {
  return {
    staffName: r.staffName, dept: r.ward, deliverTo: r.ward,
    sets: r.garments, po: r.code, code: r.collectCode || "",
    lines: r.bag.map(lineText).join("\n"),
    dateReceived: s.today, requestedBy: r.staffNum,
    deliveredBy: s.settings.coordinator, dateTime: s.today,
  };
}

/* ---------- fetching: one module-level cache per key, shared by every screen ---------- */

type Entry = { at: number; data: RequestsPayload | null; error: string; loading: boolean; inflight: Promise<void> | null };
const TTL = 60_000;
const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();

const entryOf = (k: string): Entry => {
  let e = cache.get(k);
  if (!e) { e = { at: 0, data: null, error: "", loading: false, inflight: null }; cache.set(k, e); }
  return e;
};
const notify = (k: string) => listeners.get(k)?.forEach((fn) => fn());

function load(k: string, force: boolean): Promise<void> {
  const e = entryOf(k);
  if (e.inflight) return e.inflight;
  if (!force && e.data && Date.now() - e.at < TTL) return Promise.resolve();
  e.loading = true;
  notify(k);
  e.inflight = (async () => {
    try {
      const r = await fetch(k ? `/api/requests?staff=${encodeURIComponent(k)}` : "/api/requests");
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        e.error = (j && j.error) || "Couldn’t load the requests.";
      } else {
        e.data = await r.json();
        e.error = "";
        e.at = Date.now();
      }
    } catch {
      e.error = "Couldn’t reach the server — requests aren’t loaded.";
    } finally {
      e.loading = false;
      e.inflight = null;
      notify(k);
    }
  })();
  return e.inflight;
}

/** Fetch hook. Unscoped = the whole queue plus disputes/cycle/waiting/damage; staffId = GET /api/requests?staff=<id>.
 *  Results are cached per key at module level for 60s; reload() refetches. Errors are returned, never thrown. */
export function useRequests(opts?: { staffId?: string; enabled?: boolean }): { data: RequestsPayload | null; error: string; loading: boolean; reload: () => Promise<void> } {
  const k = opts?.staffId || "";
  const enabled = opts?.enabled !== false;
  const [, bump] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let set = listeners.get(k);
    if (!set) { set = new Set(); listeners.set(k, set); }
    const subs = set;
    const fn = () => bump((n) => n + 1);
    subs.add(fn);
    void load(k, false);
    return () => { subs.delete(fn); };
  }, [k, enabled]);
  const reload = useCallback(() => load(k, true), [k]);
  if (!enabled) return { data: null, error: "", loading: false, reload };
  const e = entryOf(k);
  return { data: e.data, error: e.error, loading: e.loading || (!e.data && !e.error), reload };
}

type QueueOp = "request.pick" | "request.hold" | "request.round" | "request.collected" | "request.reply" | "request.reassign" | "request.withdraw" | "damage.handedIn" | "dispute.resolve" | "kitcheck.open" | "kitcheck.close" | "waitlist.offer";

/** Runs a request-queue op through mutate(), then reload(). Returns ok. */
export function useRequestActions(reload: () => Promise<void>): { act: (op: QueueOp, payload: Record<string, unknown>) => Promise<boolean>; error: string; clearError: () => void } {
  const { mutate } = useSnap();
  const [error, setError] = useState("");
  const act = useCallback(async (op: QueueOp, payload: Record<string, unknown>) => {
    setError("");
    const r = await mutate(op, payload);
    if (!r.ok) { setError(r.error); return false; }
    // Every screen sharing this cache key sees the change, not just the one that made it.
    await reload();
    return true;
  }, [mutate, reload]);
  const clearError = useCallback(() => setError(""), []);
  return { act, error, clearError };
}

/* ---------- the list ---------- */

export type RequestListProps = {
  /** Scope. staffId fetches ?staff=<id> unless `data` is passed; ward filters client-side on r.ward. */
  staffId?: string;
  ward?: string;
  /** Which rows. Default "open". */
  filter?: RequestRowFilter;
  /** Row expanded on first render (from ?open=). */
  openId?: string | null;
  /** Hide the person/ward text on each row (every row is the same person). */
  hidePerson?: boolean;
  /** Panel title; null renders rows without panel chrome. Default REQUEST_FILTER_LABEL[filter]. */
  title?: React.ReactNode | null;
  /** One-sentence empty state. Default per filter. */
  emptyText?: string;
  /** Called whenever data loads or changes. */
  onCounts?: (counts: Record<RequestFilter, number>) => void;
  /** Use an already-loaded payload (the /app/requests page shares one hook between its segment and the list). */
  data?: RequestsPayload | null;
  reload?: () => Promise<void>;
};

const EMPTY: Record<RequestRowFilter, string> = {
  todo: "Nothing approved and waiting.",
  noapprover: "Every waiting request has somebody to approve it.",
  open: "No open requests.",
  all: "No requests yet.",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/* Row layout rules. Kept with the component (and hoisted once by React) because only the list
 * wears them; the mobile rule stretches an expanded row's actions to full width. */

/** The row styles, rendered once however many lists are on screen. */
export function RequestStyles() {
  return null; // the rules are in app/globals.css under portal redesign
}

export default function RequestList({ staffId, ward, filter = "open", openId, hidePerson, title, emptyText, onCounts, data: given, reload: givenReload }: RequestListProps) {
  const external = given !== undefined;
  const own = useRequests({ staffId, enabled: !external });
  const data = external ? given : own.data;
  const reload = external ? givenReload ?? own.reload : own.reload;
  const { act, error } = useRequestActions(reload);

  const [openRow, setOpenRow] = useState<string | null>(openId ?? null);
  useEffect(() => { if (openId) setOpenRow(openId); }, [openId]);
  // Bring a deep-linked row into view once it is on screen.
  const scrolled = useRef<string | null>(null);
  useEffect(() => {
    if (!openId || scrolled.current === openId || !data) return;
    const el = document.getElementById(`req-${openId}`);
    if (el) { scrolled.current = openId; el.scrollIntoView({ block: "center" }); }
  }, [openId, data, filter]);

  const scope = useMemo(() => ({ staffId, ward }), [staffId, ward]);
  const counts = useMemo(() => (data ? requestCounts(data, scope) : null), [data, scope]);
  const countsRef = useRef(onCounts);
  useEffect(() => { countsRef.current = onCounts; }, [onCounts]);
  useEffect(() => { if (counts) countsRef.current?.(counts); }, [counts]);

  const rows = useMemo(() => (data ? requestsFor(data.requests, filter, scope) : []), [data, filter, scope]);
  const pad = title === null ? 0 : "0 16px";

  let body: React.ReactNode;
  if (!data) {
    const loadErr = external ? "" : own.error;
    body = loadErr ? (
      <div style={{ padding: title === null ? 0 : "0 16px 12px" }}>
        <ErrorLine msg={loadErr} />
        <div style={{ marginTop: 12 }}><button type="button" className="btn btn-secondary" onClick={() => void own.reload()}>Try again</button></div>
      </div>
    ) : <div style={{ padding: "0 16px" }}><Empty pad={3}>Loading…</Empty></div>;
  } else if (rows.length === 0) {
    // The loading and empty lines always keep side padding: embedded with no title (the staff
    // record's Requests tab) the list sits directly inside a bordered panel, and a sentence flush
    // against that border reads as broken. Request rows lay themselves out and keep `pad`.
    body = <div style={{ padding: "0 16px" }}><Empty pad={3}>{emptyText ?? EMPTY[filter]}</Empty></div>;
  } else {
    body = rows.map((r) => (
      <RequestRowView key={r.id} r={r} open={openRow === r.id} hidePerson={hidePerson}
        onToggle={() => setOpenRow((o) => (o === r.id ? null : r.id))} act={act} />
    ));
  }

  return (
    <div>
      <RequestStyles />
      <ErrorLine msg={error} />
      {title === null
        ? <div>{body}</div>
        : (
          <div style={{ marginTop: error ? 12 : 0 }}>
            <Panel title={title ?? REQUEST_FILTER_LABEL[filter]} count={data ? rows.length : undefined}>{body}</Panel>
          </div>
        )}
      {data?.moreRequests && (
        <p className="tc-meta-line" style={{ margin: "12px 0 0" }}>Only the latest {data.requestLimit} are loaded — older ones are on the staff record.</p>
      )}
    </div>
  );
}

/* Who a waiting request can be handed to. The wearer may approve their own (marked as a
 * self-approval); the person who raised it never can, and the counter refuses that on the id.
 * A manager with no staff-app account cannot be asked, so they are grouped apart. */
type ApproverChoice = { id: string; reachable: boolean; label: string };
function approverChoices(s: Snapshot, r: RequestRow): ApproverChoice[] {
  return s.staff
    .filter((x) => !x.inactive && x.first && x.id !== r.raisedById && (x.id !== r.staffId || x.managerId === x.id))
    .map((x) => ({
      id: x.id,
      reachable: !!x.selfEmail,
      label: `${`${x.first} ${x.last}`.trim()}${x.dept ? ` · ${x.dept}` : ""}`
        + (x.id === r.staffId ? " · this request is theirs — self-approval" : "")
        + (x.selfEmail ? "" : x.selfCode && slipLive(x.selfCodeAt, s.today, s.tz) ? " · code printed, not used yet" : " · no staff-app account"),
    }));
}

/* Two event labels are matched by equality elsewhere, so their stored words never change; they are
 * put in the facility's own words only here, where they are read. */
const eventLabel = (label: string, t: Terms) =>
  label === ROUTED_TO_ROUND ? `Out on the ${t.round}`
    : label === "Withdrawn by the linen room" ? `Withdrawn by the ${t.store}`
      : label;

function RequestRowView({ r, open, hidePerson, onToggle, act }: {
  r: RequestRow; open: boolean; hidePerson?: boolean; onToggle: () => void;
  act: (op: QueueOp, payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const { s } = useSnap();
  const t = s.settings.terms;
  const [reply, setReply] = useState("");
  const [hold, setHold] = useState("");
  const [reassign, setReassign] = useState("");

  const st = statusText(r, { mine: false, first: r.staffName.split(" ")[0], terms: t });
  const awaiting = r.status === "awaiting";
  const orphan = isStranded(r);
  const onRound = r.status === "round" || r.status === "delivered";
  const wearerApproves = !!r.managerId && r.managerId === r.staffId;
  const approval = awaiting
    ? (r.managerName ? `with ${r.managerName}${wearerApproves ? " · self-approval" : ""}` : "nobody asked yet")
    : r.status === "declined"
      ? (r.decision || "declined")
      : `${r.decision || "Approved"} by ${r.managerName}${wearerApproves ? " · self-approved" : ""}`;

  const choices = useMemo(() => (open && awaiting ? approverChoices(s, r) : []), [open, awaiting, s, r]);
  const reachable = choices.filter((c) => c.reachable);
  const unreachable = choices.filter((c) => !c.reachable);
  const picked = open && reassign ? s.staff.find((x) => x.id === reassign) ?? null : null;
  const refused = r.lines.filter((l) => l.status === "declined").length;

  function toggle() {
    setReply(""); setHold(""); setReassign("");
    onToggle();
  }
  async function send() {
    if (reply.trim() && await act("request.reply", { id: r.id, body: reply })) setReply("");
  }

  const orderForm = (
    <button type="button" className="btn btn-secondary" aria-label={`Print order form for ${r.code}`}
      title={awaiting ? "Everything asked for, manager’s block blank" : "The approved lines only"}
      onClick={() => window.open(`/print/order-form?request=${encodeURIComponent(r.id)}`, "_blank", "noopener")}>
      Print order form
    </button>
  );

  return (
    <div id={`req-${r.id}`} className={"tc-req-row" + (orphan ? " tc-flag" : "")} style={{ opacity: awaiting && !orphan && !open ? 0.6 : 1 }}>
      <div className="tc-req-head">
        <span className="tc-mono" style={{ fontSize: 12, fontWeight: 500, width: 74, flex: "none" }}>{r.code}</span>
        <span style={{ flex: 1, minWidth: 160 }}>
          <b>{r.summary}</b>
          {!hidePerson && <span style={{ color: "var(--color-neutral-700)" }}> · {r.staffName}{r.ward ? ` (${r.ward})` : ""}</span>}
        </span>
        {orphan && <Tag tone="accent">No approver</Tag>}
        <Tag tone={NEEDS_STAFF.has(r.status as never) ? "accent" : "quiet"}>{st.label}</Tag>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 30, padding: "2px 8px" }} aria-expanded={open} onClick={toggle}
          aria-label={open ? `Close ${r.code}` : `Open ${r.code}`}>
          {open ? "Close" : `Open${r.lineCount > 1 ? ` · ${r.lineCount} lines` : ""}`}
        </button>
      </div>
      <div className="tc-meta-line tc-req-meta">
        {[r.reason, approval, r.raisedByName ? `raised by ${r.raisedByName}` : "", formatInZone(r.createdAt, s.tz)].filter(Boolean).join(" · ")}
      </div>

      {open && (
        <div className="tc-req-body">
          <div>
            {r.lines.map((l) => {
              const off = l.status === "declined";
              return (
                <div key={l.id} className="tc-req-item">
                  <span style={{ flex: 1, minWidth: 160, fontWeight: off ? 400 : 600, textDecoration: off ? "line-through" : "none", color: off ? "var(--color-neutral-700)" : undefined }}>
                    {l.qty} × {l.item}{l.gender && l.gender !== "Unisex" ? ` (${genderLabel(l.gender)})` : ""} — <span className="tc-mono">{l.size}</span>
                  </span>
                  <Tag tone={l.status === "approved" ? "quiet" : off ? "outline" : "low"}>{l.statusLabel}</Tag>
                  {off && l.declineReason && <span className="tc-meta-line">{l.declineReason}</span>}
                </div>
              );
            })}
            <div className="tc-meta-line" style={{ marginTop: 4 }}>
              {r.status === "declined" ? "Nothing to pick"
                : awaiting ? `${plural(r.garments, "garment", "garments")} asked for`
                  : `In the bag: ${plural(r.garments, "garment", "garments")}${refused ? ` · ${plural(refused, "declined line", "declined lines")} not picked` : ""}`}
            </div>
          </div>
          {r.note && <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: "10px 0 0", maxWidth: "70ch" }}>&ldquo;{r.note}&rdquo;</p>}

          <div className="tc-req-actions" style={{ marginTop: 12 }}>
            {awaiting && (
              <>
                <select className="input" style={{ width: 280, maxWidth: "100%" }} value={reassign} onChange={(e) => setReassign(e.target.value)}
                  aria-label={orphan ? `Choose who approves ${r.code}` : `Send ${r.code} to a different approver`}>
                  <option value="">{orphan ? "Choose an approver…" : "Send it to somebody else…"}</option>
                  {unreachable.length === 0
                    ? reachable.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)
                    : (
                      <>
                        {reachable.length > 0 && (
                          <optgroup label="Can decide it today">
                            {reachable.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                          </optgroup>
                        )}
                        <optgroup label="Can’t be asked — no staff-app account">
                          {unreachable.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </optgroup>
                      </>
                    )}
                </select>
                <button type="button" className="btn btn-primary"
                  onClick={async () => { if (reassign && await act("request.reassign", { id: r.id, managerId: reassign })) setReassign(""); }}>
                  {orphan ? "Ask them" : "Re-address"}
                </button>
                <button type="button" className="btn btn-secondary"
                  onClick={() => { if (confirm(`Withdraw ${r.code}? ${r.staffName} is told it was declined by the ${t.store}.`)) void act("request.withdraw", { id: r.id, reason: "Withdrawn — no approver available" }); }}>
                  Withdraw it
                </button>
                {orderForm}
              </>
            )}
            {r.status === "accepted" && <button type="button" className="btn btn-primary" onClick={() => void act("request.pick", { id: r.id })}>Start picking</button>}
            {r.status === "picking" && (
              <>
                <input className="input" style={{ width: 200 }} aria-label={`Held until, for ${r.code}`} placeholder="Held until — e.g. Fri 6pm" value={hold} onChange={(e) => setHold(e.target.value)} />
                <button type="button" className="btn btn-primary" onClick={async () => { if (await act("request.hold", { id: r.id, holdUntil: hold })) setHold(""); }}>Hold at the counter</button>
                <button type="button" className="btn btn-secondary" onClick={() => void act("request.round", { id: r.id })}>Send on the {t.round}</button>
              </>
            )}
            {r.status === "ready" && (
              <>
                <span style={{ fontSize: 13 }}>
                  Code <span className="tc-mono" style={{ fontSize: 15, fontWeight: 600 }}>{r.collectCode}</span> · {plural(r.garments, "garment", "garments")}{r.holdUntil ? ` · until ${r.holdUntil}` : ""}
                </span>
                <button type="button" className="btn btn-primary" onClick={() => void act("request.collected", { id: r.id })}>Collected</button>
              </>
            )}
            {r.status === "round" && <span className="tc-meta-line" style={{ fontSize: 13 }}>On the {t.round} to {r.ward || `the ${t.team}`} · {plural(r.garments, "garment", "garments")}</span>}
            {r.status === "delivered" && <span className="tc-meta-line" style={{ fontSize: 13 }}>Signed by {r.signerName}{r.signerRole ? `, ${r.signerRole}` : ""}{r.claimedAt ? " · collected" : ` · not yet collected from the ${t.team}`}</span>}
            {r.status === "collected" && <span className="tc-meta-line" style={{ fontSize: 13 }}>Handed over at the counter</span>}
            {r.status === "declined" && <span className="tc-meta-line" style={{ fontSize: 13 }}>Declined — {r.declineReason || "no reason recorded"}</span>}
            {!awaiting && r.status !== "declined" && (
              <>
                <button type="button" className="btn btn-secondary" onClick={() => openSlip(onRound ? "delivery" : "collection", requestSlip(s, r))}>
                  {onRound ? "Delivery slip" : "Collection slip"}
                </button>
                {orderForm}
              </>
            )}
          </div>

          {awaiting && choices.length === 0 && (
            <p className="tc-meta-line" style={{ margin: "8px 0 0" }}>Nobody on the register can approve this one — <Link href="/app/staff">add a manager</Link> or withdraw it.</p>
          )}
          {picked && picked.id === r.staffId && (
            <p className="tc-meta-line" style={{ margin: "8px 0 0" }}>{picked.first}&apos;s own request — sending it to them is a self-approval.</p>
          )}
          {picked && !picked.selfEmail && (
            <p className="tc-meta-line" style={{ margin: "8px 0 0" }}>
              {picked.first} can&apos;t be asked:{" "}
              {picked.selfCode && slipLive(picked.selfCodeAt, s.today, s.tz)
                ? <>the code on <Link href={`/app/staff/${picked.id}`}>their record</Link> isn&apos;t used yet.</>
                : picked.selfCode
                  ? <>the code on <Link href={`/app/staff/${picked.id}`}>their record</Link> has expired.</>
                  : <>no staff-app account — <Link href={`/app/staff/${picked.id}`}>give them a code</Link>.</>}
            </p>
          )}

          <h3 className="tc-lbl tc-req-sub">Messages</h3>
          {r.messages.length === 0 && <div className="tc-meta-line" style={{ padding: "4px 0" }}>No messages.</div>}
          {r.messages.map((m) => (
            <div key={m.id} className="tc-req-item" style={{ display: "block" }}>
              <b>{m.fromStaff ? m.authorName : `${m.authorName} (${t.store})`}</b>
              <span className="tc-meta-line" style={{ marginLeft: 8 }}>{formatInZone(m.at, s.tz)}</span>
              <div style={{ marginTop: 3, lineHeight: 1.5 }}>{m.body}</div>
            </div>
          ))}
          <div className="tc-req-actions" style={{ marginTop: 8 }}>
            <input className="input" style={{ flex: 1, minWidth: 200 }} aria-label={`Reply about ${r.code}`} placeholder="Reply to this order" value={reply}
              onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void send(); }} />
            <button type="button" className="btn btn-secondary" onClick={() => void send()}>Send</button>
          </div>

          <h3 className="tc-lbl tc-req-sub">History</h3>
          {r.events.map((e) => (
            <div key={e.id} className="tc-req-item">
              <span style={{ flex: 1, minWidth: 160 }}>{eventLabel(e.label, t)}{e.meta ? ` — ${e.meta}` : ""}</span>
              <span className="tc-meta-line">{e.actorName} · {formatInZone(e.at, s.tz)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
