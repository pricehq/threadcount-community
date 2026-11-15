"use client";
/* Staff groups on their three routes, as drag targets.
 *
 * A route saves by sending both route lists whole (nursingGroups for the FTE table, kitGroups for the
 * starting kit, neither for manager approval) in one settings.update, because the server refuses any
 * save that leaves a group on two. Every chip action also has a keyboard path: the chip is a menu
 * button (Move to…, Rename, Remove), and Alt+← / Alt+→ moves it to the neighbouring route. */
import { useEffect, useRef, useState } from "react";
import { useSnap } from "@/lib/client";
import { ErrorLine } from "@/components/ui";
import { Panel, Tag, Icon } from "@/components/portal";
import { allowanceRoute, groupKey, isKitGroup, isNursingGroup, kitGroupsOf, nursingGroupsOf, type AllowanceRoute } from "@/lib/compute";
import { Msg } from "./common";

const ROUTES: { id: AllowanceRoute; label: string; now: string }[] = [
  { id: "fte", label: "FTE table", now: "on the FTE table" },
  { id: "kit", label: "Starting kit", now: "on the starting kit" },
  { id: "approval", label: "Manager approval", now: "on manager approval" },
];
const routeNow = (r: AllowanceRoute) => ROUTES.find((x) => x.id === r)?.now ?? "";

export default function RouteBoard({ ceiling, kitStart }: { ceiling: number; kitStart: number }) {
  const { s, isAdmin, busy, mutate } = useSnap();
  const [msg, setMsg] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [hover, setHover] = useState<AllowanceRoute | null>(null);
  /* Where keyboard focus goes after a chip moves, is renamed or removed. A chip remounts (new column,
     new name) or goes away, and the snapshot refresh lands after the mutation returns, so the request
     waits across renders until focus has dropped to the page and a named chip (or the fallback, the
     new-group box) is there to take it. */
  const [focusReq, setFocusReq] = useState<{ names: string[]; fallback: boolean; until: number } | null>(null);
  const routesRef = useRef<HTMLDivElement>(null);
  const newGroupRef = useRef<HTMLInputElement>(null);
  const wantFocus = (names: string[], fallback = false) => setFocusReq({ names, fallback, until: Date.now() + 5000 });
  useEffect(() => {
    if (!focusReq) return;
    if (Date.now() > focusReq.until) { setFocusReq(null); return; }
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected) return;
    const chips = Array.from(routesRef.current?.querySelectorAll<HTMLElement>("button[data-group]") || []);
    for (const n of focusReq.names) {
      const el = chips.find((c) => c.dataset.group === n);
      if (el) { el.focus(); setFocusReq(null); return; }
    }
    if (focusReq.fallback) { newGroupRef.current?.focus(); setFocusReq(null); }
  });
  /* Each group's route as just chosen, held only while the snapshot still carries the lists it was
     worked out from, so the chip does not spring back before the refresh lands. */
  const [routePick, setRoutePick] = useState<{ base: string; nursing: string[]; kit: string[] } | null>(null);

  const stored = { nursing: nursingGroupsOf(s), kit: kitGroupsOf(s) };
  const listSig = JSON.stringify([stored.nursing, stored.kit]);
  const lists = routePick && routePick.base === listSig ? routePick : stored;
  const routeOf = (g: string) => allowanceRoute({ nursing: isNursingGroup(lists.nursing, g), kit: isKitGroup(lists.kit, g) });

  const filedUnder: Record<string, number> = {};
  const spelt: Record<string, string> = {};
  for (const st of s.staff) {
    const k = groupKey(st.group);
    if (st.inactive || !k) continue;
    filedUnder[k] = (filedUnder[k] || 0) + 1;
    if (!spelt[k]) spelt[k] = st.group.trim();
  }
  const staffCount = (g: string) => filedUnder[groupKey(g)] || 0;
  /* The listed groups, then any name still on a route but no longer on the list: its people are still
     on that route, so it stays in sight. */
  const listedKeys = new Set(s.settings.staffGroups.map(groupKey));
  const offList: string[] = [];
  for (const g of [...lists.nursing, ...lists.kit]) {
    const k = groupKey(g);
    if (!listedKeys.has(k) && !offList.some((x) => groupKey(x) === k)) offList.push(g);
  }
  const groupRows = [...s.settings.staffGroups.map((g) => ({ g, listed: true })), ...offList.map((g) => ({ g, listed: false }))];
  const rowKeys = new Set(groupRows.map((r) => groupKey(r.g)));
  const unlisted = Object.keys(filedUnder).filter((k) => !rowKeys.has(k)).map((k) => ({ g: spelt[k], n: filedUnder[k] })).sort((a, b) => b.n - a.n);

  const desc: Record<AllowanceRoute, string> = {
    fte: `Hours proposes the kit; the manager signs up to ${ceiling}.`,
    kit: `${kitStart} sets on day one, more as needed up to ${ceiling}.`,
    approval: "Nothing until a manager approves it.",
  };

  /* One change to the groups at a time: each sends whole lists worked out from the screen. */
  const settled = () => { if (!busy) return true; setMsg("Still saving the last change — try again in a moment."); return false; };

  async function addGroup(name?: string) {
    const g = (name ?? newGroup).trim();
    if (!g || !settled()) return;
    const route = routeOf(g);
    const r = await mutate("settings.update", { staffGroups: [...s.settings.staffGroups, g] });
    setMsg(r.ok ? `${g} added, ${routeNow(route)}.` : r.error);
    if (r.ok && name === undefined) setNewGroup("");
  }
  async function removeGroup(g: string) {
    if (!settled()) return;
    const n = staffCount(g), route = routeOf(g);
    const who = `${n} staff member${n === 1 ? " is" : "s are"} filed under ${g}`;
    // Asked before, not after: taking a group off the list takes it off its route too.
    if (n && !confirm(route === "approval"
      ? `${who}. They stay filed under it, still on manager approval, but nobody new can be put in ${g}. Take it off the list?`
      : `${who}, which is ${routeNow(route)}. Taking it off the list puts them on manager approval — move them to another group first to keep their route.\n\nTake ${g} off the list?`)) return;
    const col = groupRows.filter((x) => routeOf(x.g) === route).map((x) => x.g);
    const at = col.indexOf(g);
    const r = await mutate("settings.update", { staffGroups: s.settings.staffGroups.filter((x) => x !== g) });
    if (r.ok) wantFocus([col[at + 1], col[at - 1]].filter((x): x is string => !!x), true);
    setMsg(!r.ok ? r.error
      : n ? `${g} removed. Its ${n} staff member${n === 1 ? " is" : "s are"} on manager approval.`
        : `${g} removed.`);
  }
  async function setRoute(g: string, to: AllowanceRoute, keepFocus = true) {
    const from = routeOf(g);
    if (from === to || !settled()) return;
    const k = groupKey(g);
    const nursing = lists.nursing.filter((x) => groupKey(x) !== k);
    // A group caught on both lists is on the FTE table already; clearing it off kit lets the save through.
    const kit = lists.kit.filter((x) => groupKey(x) !== k && !isNursingGroup(nursing, x));
    if (to === "fte") nursing.push(g);
    if (to === "kit") kit.push(g);
    setRoutePick({ base: listSig, nursing, kit });
    if (keepFocus) wantFocus([g]);
    const r = await mutate("settings.update", { nursingGroups: nursing, kitGroups: kit });
    // Refused: the chip goes back to its old column as a new element, so focus follows it there.
    if (!r.ok) { setRoutePick(null); if (keepFocus) wantFocus([g]); setMsg(r.error); return; }
    setMsg(`${g} is ${routeNow(to)}.`);
  }
  function moveBy(g: string, dir: -1 | 1) {
    const i = ROUTES.findIndex((r) => r.id === routeOf(g));
    const to = ROUTES[i + dir];
    if (!to) return;
    void setRoute(g, to.id);
  }

  return (
    <>
      {!groupRows.length ? (
        <div className="tc-flag" style={{ fontSize: 14, paddingLeft: 12 }}>
          <span className="tc-mark" aria-hidden="true" />No staff groups yet — everyone is on manager approval.
        </div>
      ) : (
        <div className="tc-routes" ref={routesRef}>
          {ROUTES.map((r) => {
            const chips = groupRows.filter(({ g }) => routeOf(g) === r.id);
            return (
              <div key={r.id} className={"tc-route" + (hover === r.id ? " drop-on" : "")}
                onDragOver={isAdmin ? (e) => { if (!e.dataTransfer.types.includes("text/x-tc-group")) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (hover !== r.id) setHover(r.id); } : undefined}
                onDragLeave={isAdmin ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover((h) => (h === r.id ? null : h)); } : undefined}
                onDrop={isAdmin ? (e) => {
                  e.preventDefault(); setHover(null);
                  const g = e.dataTransfer.getData("text/x-tc-group");
                  if (g && groupRows.some((x) => x.g === g)) void setRoute(g, r.id, false);
                } : undefined}>
                <Panel title={r.label} headingLevel={3}>
                  <div className="tc-route-desc">{desc[r.id]}</div>
                  <div className="tc-route-body">
                    {chips.map(({ g, listed }) => (
                      <GroupChip key={g} g={g} n={staffCount(g)} listed={listed} route={r.id} admin={isAdmin}
                        editing={renaming === g}
                        onEdit={() => { if (settled()) setRenaming(g); }}
                        onEditDone={(m, focusName) => { setRenaming(null); wantFocus([focusName]); if (m) setMsg(m); }}
                        onMove={(to) => { void setRoute(g, to); }}
                        onMoveBy={(d) => moveBy(g, d)}
                        onRemove={() => void removeGroup(g)}
                        onAdd={() => void addGroup(g)} />
                    ))}
                    {isAdmin && <div className="tc-drop" aria-hidden="true">Drop a group here</div>}
                    {!isAdmin && !chips.length && <div className="tc-meta-line">No groups</div>}
                  </div>
                </Panel>
              </div>
            );
          })}
        </div>
      )}

      <Msg text={msg} />

      {!!unlisted.length && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="tc-lbl">On the register, not on the list</span>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {unlisted.map(({ g, n }) => isAdmin
              ? <button key={g} className="btn btn-secondary" aria-label={`Add ${g} — ${n} staff member${n === 1 ? " is" : "s are"} filed under it`} onClick={() => void addGroup(g)}>Add {g} · <span className="tc-mono">{n}</span></button>
              : <Tag key={g} tone="quiet">{g} · {n}</Tag>)}
          </div>
        </div>
      )}

      {isAdmin && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input ref={newGroupRef} className="input" style={{ width: 280, maxWidth: "100%" }} aria-label="New group name" placeholder="New group name" maxLength={80} value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newGroup.trim()) void addGroup(); }} />
          <button className="btn btn-secondary" disabled={!newGroup.trim()} onClick={() => void addGroup()}><Icon name="plus" size={16} /> Add group</button>
        </div>
      )}
    </>
  );
}

type ChipProps = {
  g: string; n: number; listed: boolean; route: AllowanceRoute; admin: boolean; editing: boolean;
  onEdit: () => void; onEditDone: (msg: string | null, focusName: string) => void;
  onMove: (to: AllowanceRoute) => void; onMoveBy: (dir: -1 | 1) => void; onRemove: () => void; onAdd: () => void;
};

/* Module scope so a chip keeps its identity (and its menu and rename box) across board renders. */
function GroupChip({ g, n, listed, route, admin, editing, onEdit, onEditDone, onMove, onMoveBy, onRemove, onAdd }: ChipProps) {
  const { mutate } = useSnap();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(g);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const count = <span className="tc-mono tc-chip-count">{n} {n === 1 ? "person" : "people"}</span>;

  useEffect(() => { if (editing) { setName(g); setErr(""); } }, [editing, g]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", down);
    requestAnimationFrame(() => wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    return () => document.removeEventListener("mousedown", down);
  }, [open]);

  if (!admin) {
    return (
      <div className="tc-chip">
        <span className="tc-chip-name">{g}</span>
        {!listed && <Tag tone="quiet">not on the list</Tag>}
        {count}
      </div>
    );
  }

  if (editing) {
    const save = async () => {
      const to = name.trim();
      if (!to || saving) return;
      if (to === g) { onEditDone(null, g); return; }
      setSaving(true);
      const r = await mutate<{ staff: number }>("settings.renameGroup", { from: g, to });
      setSaving(false);
      if (!r.ok) { setErr(r.error); return; }
      const moved = r.result.staff;
      onEditDone(`${g} is now ${to}, on the same route as before.${moved ? ` ${moved} staff record${moved === 1 ? "" : "s"} moved with it.` : ""}`, to);
    };
    return (
      <div>
        <div className="tc-chip">
          <span className="tc-chip-handle" aria-hidden="true">⋮⋮</span>
          <input className="input" autoFocus aria-label={`New name for ${g}`} maxLength={80} value={name} disabled={saving} style={{ flex: 1, minWidth: 0, minHeight: 30, padding: "2px 8px" }}
            onChange={(e) => { setName(e.target.value); setErr(""); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void save(); }
              else if (e.key === "Escape") { e.preventDefault(); onEditDone(null, g); }
            }} />
          {count}
        </div>
        <ErrorLine msg={err} />
      </div>
    );
  }

  const items: { label: string; run: () => void; danger?: boolean }[] = [
    ...ROUTES.filter((r) => r.id !== route).map((r) => ({ label: `Move to ${r.label}`, run: () => onMove(r.id) })),
    ...(listed ? [{ label: "Rename", run: onEdit }, { label: "Remove", run: onRemove, danger: true }] : [{ label: "Add to list", run: onAdd }]),
  ];
  function menuKey(e: React.KeyboardEvent) {
    const els = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || []);
    const at = els.indexOf(document.activeElement as HTMLElement);
    const to = e.key === "ArrowDown" ? at + 1 : e.key === "ArrowUp" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? els.length - 1 : null;
    if (to !== null) { e.preventDefault(); els[(to + els.length) % els.length]?.focus(); return; }
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); btn.current?.focus(); }
    if (e.key === "Tab") setOpen(false);
  }

  return (
    <div className="tc-chipwrap tc-more" ref={wrap} style={{ display: "block" }} onKeyDown={open ? menuKey : undefined}>
      <button ref={btn} type="button" className="tc-chip" data-group={g} draggable aria-haspopup="menu" aria-expanded={open}
        aria-label={`${g}, ${n} ${n === 1 ? "person" : "people"}, ${ROUTES.find((r) => r.id === route)?.label}${listed ? "" : ", not on the list"}. Alt+arrow keys move it.`}
        onClick={() => setOpen((o) => !o)}
        onDoubleClick={(e) => { if (listed && (e.target as HTMLElement).closest(".tc-chip-name")) { setOpen(false); onEdit(); } }}
        onDragStart={(e) => { setOpen(false); e.dataTransfer.setData("text/x-tc-group", g); e.dataTransfer.setData("text/plain", g); e.dataTransfer.effectAllowed = "move"; }}
        onKeyDown={(e) => {
          if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); setOpen(false); onMoveBy(e.key === "ArrowLeft" ? -1 : 1); }
        }}>
        <span className="tc-chip-handle" aria-hidden="true">⋮⋮</span>
        <span className="tc-chip-name">{g}</span>
        {!listed && <Tag tone="quiet">not on the list</Tag>}
        {count}
      </button>
      {open && (
        <div className="tc-more-menu tc-chip-menu" role="menu" aria-label={`${g} actions`}>
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" tabIndex={-1} className={"tc-more-item" + (it.danger ? " danger" : "")}
              onClick={() => { setOpen(false); btn.current?.focus(); it.run(); }}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
