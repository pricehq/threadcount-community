"use client";
/* Every figure on Reports, computed once per snapshot and month. The computation is today's report
 * moved here unchanged; the redesign only regroups where each table is shown. Two additions sit at
 * the end of R: the number of placed orders (Spend figures) and the distinct people per staff
 * group (By staff group). */
import { useMemo } from "react";
import { useDerived, useSnap } from "@/lib/client";
import { ccOf, countsAsIssued, csvEsc, csvOf, fmtDate, fyStart, issueCost, label, longLabel, money, monthLabel, onhand, orderTotal, prevMonth, setsCap, shiftMonth, signedInt, signedMoney, staffName } from "@/lib/compute";
import { downloadCsv, printDoc, tbl, type Col } from "@/lib/print";

export function useReportData(month: string) {
  const { s } = useSnap();
  const { L, byId, staffById } = useDerived();

  const R = useMemo(() => {
    const months = new Set([s.today.slice(0, 7)]);
    s.issues.forEach((i) => months.add(i.date.slice(0, 7))); s.orders.forEach((o) => o.date && months.add(o.date.slice(0, 7)));
    for (let i = 5; i >= 0; i--) months.add(shiftMonth(month, -i)); // trend bars are clickable, so they must be selectable
    const repMonths = [...months].sort().reverse();
    const cost = (itemId: string) => byId[itemId]?.cost || 0; // catalogue cost (stocktake lines, valuation)
    const mIssues = s.issues.filter((i) => i.date.slice(0, 7) === month && countsAsIssued(i) && !i.preloved);
    const mPl = s.issues.filter((i) => i.date.slice(0, 7) === month && countsAsIssued(i) && i.preloved);
    const pm = prevMonth(month);
    const pIssues = s.issues.filter((i) => i.date.slice(0, 7) === pm && countsAsIssued(i) && !i.preloved);
    // Pre-loved: free reissues (value saved at catalogue cost), hand-ins, and the pool at $0.
    const plIssueRows = mPl.map((i) => { const it = byId[i.itemId]; return { date: i.date, who: staffName(staffById[i.staffId], "—"), item: label(it), size: it ? String(it.sizes[i.si]) : "?", qty: i.qty, saved: i.qty * (it?.cost || 0) }; });
    const plSaved = plIssueRows.reduce((t, r) => t + r.saved, 0), plQty = mPl.reduce((t, i) => t + i.qty, 0);
    const mHi = s.handins.filter((h) => h.date.slice(0, 7) === month);
    const hiRows = mHi.map((h) => ({ date: h.date, who: staffName(staffById[h.staffId], "—"), by: h.by, good: h.lines.filter((l) => l.cond === "Good").reduce((t, l) => t + l.qty, 0), rag: h.lines.filter((l) => l.cond === "Rag").reduce((t, l) => t + l.qty, 0), credit: h.credit ? "Credited" : "—" }));
    const ragMonth = hiRows.reduce((t, r) => t + r.rag, 0);
    const plByItem: Record<string, string[]> = {};
    for (const k in s.stock) { const n = s.stock[k].preloved; if (!(n > 0)) continue; const itemId = k.slice(0, k.lastIndexOf(":")), si = +k.slice(k.lastIndexOf(":") + 1); const it = byId[itemId]; if (!it) continue; (plByItem[itemId] = plByItem[itemId] || []).push(`${it.sizes[si]} ×${n}`); }
    const plPoolRows = Object.keys(plByItem).map((itemId) => ({ item: label(byId[itemId]), sizes: plByItem[itemId].join(", "), total: plByItem[itemId].reduce((t, x) => t + parseInt(x.split("×")[1], 10), 0) }));
    const plPoolTotal = plPoolRows.reduce((t, r) => t + r.total, 0);
    type Agg = { items: number; amt: number };
    const sumBy = (arr: typeof mIssues, keyFn: (i: (typeof arr)[number]) => string) => { const m: Record<string, Agg> = {}; for (const i of arr) { const k = keyFn(i); if (!m[k]) m[k] = { items: 0, amt: 0 }; m[k].items += i.qty; m[k].amt += i.qty * issueCost(i, byId); } return m; };
    const ccKey = (i: (typeof mIssues)[number]) => { const st = staffById[i.staffId]; return st ? (ccOf(s, st) || "—") + "|" + (st.dept || "Unknown") : "—|Unknown"; };
    const byCC = sumBy(mIssues, ccKey), byCCPrev = sumBy(pIssues, ccKey);
    // Union of this month's and last month's cost centres so the Prev column reconciles to the previous-month total.
    const ccKeys = [...new Set([...Object.keys(byCC), ...Object.keys(byCCPrev)])];
    const ccRows = ccKeys.map((k) => { const v = byCC[k] || { items: 0, amt: 0 }; const [cc, dept] = k.split("|"); const prev = byCCPrev[k]?.amt || 0; return { key: k, cc, dept, items: v.items, amt: v.amt, prev, delta: v.amt - prev }; }).sort((a, b) => b.amt - a.amt || b.prev - a.prev);
    // What each cost-centre figure is actually made of, filed under the same key the total was
    // grouped on. Grouping the detail the same way as the total is what stops a drill-down from
    // disagreeing with the row that opened it — a ward manager checking their number would rather
    // have no drill-down than one that doesn't add up.
    const ccLines: Record<string, { date: string; who: string; item: string; size: string; qty: number; unit: number; amt: number }[]> = {};
    for (const i of mIssues) { const k = ccKey(i); const it = byId[i.itemId]; const unit = issueCost(i, byId); (ccLines[k] = ccLines[k] || []).push({ date: i.date, who: staffName(staffById[i.staffId], "—"), item: label(it), size: it ? String(it.sizes[i.si]) : "?", qty: i.qty, unit, amt: i.qty * unit }); }
    const totAmt = mIssues.reduce((t, i) => t + i.qty * issueCost(i, byId), 0), totPrev = pIssues.reduce((t, i) => t + i.qty * issueCost(i, byId), 0), totItems = mIssues.reduce((t, i) => t + i.qty, 0);
    // "Placed" = sent to the supplier; drafts (incl. auto-replenishment) are not spend yet.
    // Back orders carry the parent's short lines, so they're excluded from spend to avoid counting those lines twice.
    const placed = (o: (typeof s.orders)[number]) => o.status !== "Cancelled" && o.status !== "Draft" && !o.parentId;
    const mOrders = s.orders.filter((o) => o.date.slice(0, 7) === month && placed(o));
    const ordSpend = mOrders.reduce((t, o) => t + orderTotal(o, byId), 0);
    const byG = sumBy(mIssues, (i) => staffById[i.staffId]?.group || "Unknown");
    const groupRows = Object.entries(byG).sort((a, b) => b[1].amt - a[1].amt).map(([g, v]) => ({ g, ...v }));
    const supAgg: Record<string, { n: number; amt: number; inv: string[] }> = {};
    for (const o of mOrders) { const v = orderTotal(o, byId); if (!supAgg[o.supplier]) supAgg[o.supplier] = { n: 0, amt: 0, inv: [] }; supAgg[o.supplier].n++; supAgg[o.supplier].amt += v; if (o.invoice && !supAgg[o.supplier].inv.includes(o.invoice)) supAgg[o.supplier].inv.push(o.invoice); for (const rc of o.receipts) if (rc.invoice && !supAgg[o.supplier].inv.includes(rc.invoice)) supAgg[o.supplier].inv.push(rc.invoice); }
    const supRows = Object.entries(supAgg).sort((a, b) => b[1].amt - a[1].amt).map(([name, v]) => ({ name, n: v.n, amt: v.amt, invoices: v.inv.join(", ") || "—" }));
    const issueAgg = (m: string) => { const a = s.issues.filter((i) => i.date.slice(0, 7) === m && countsAsIssued(i) && !i.preloved); return { items: a.reduce((t, i) => t + i.qty, 0), amt: a.reduce((t, i) => t + i.qty * issueCost(i, byId), 0) }; };
    const orderAgg = (m: string) => s.orders.filter((o) => o.date.slice(0, 7) === m && placed(o)).reduce((t, o) => t + orderTotal(o, byId), 0);
    const fyMonths: string[] = []; { let cur = fyStart(month + "-15").slice(0, 7); let g = 0; while (cur <= month && g++ < 13) { fyMonths.push(cur); cur = shiftMonth(cur, 1); } }
    let fti = 0, fta = 0, fto = 0;
    const fyRows = fyMonths.map((m) => { const ia = issueAgg(m); const ov = orderAgg(m); fti += ia.items; fta += ia.amt; fto += ov; return { m, label: monthLabel(m, { month: "short", year: "2-digit" }), items: ia.items, issued: ia.amt, orders: ov }; });
    const trendM: string[] = []; for (let i = 5; i >= 0; i--) trendM.push(shiftMonth(month, -i));
    const tv = trendM.map((m) => issueAgg(m).amt); const tmax = Math.max(...tv, 1);
    const trend = trendM.map((m, i) => ({ m, label: monthLabel(m, { month: "short" }), amt: tv[i], h: tv[i] ? Math.max(Math.round((tv[i] / tmax) * 70), 4) : 2, sel: m === month }));
    const byS = sumBy(mIssues, (i) => i.staffId);
    const staffRows = Object.entries(byS).sort((a, b) => b[1].amt - a[1].amt).map(([sid, v]) => { const st = staffById[sid]; return { who: staffName(st, "—"), cc: ccOf(s, st), ...v }; });
    // Journal
    const glAcct = s.settings.glAccount || "—";
    const jnDesc = `${s.settings.journalDesc || "Uniform issues"} ${monthLabel(month)}`;
    // One debit per cost centre: departments that share a CC (or a ccOverride pointing at another dept's code) fold together.
    const jnAgg: Record<string, { cc: string; depts: string[]; keys: string[]; items: number; debit: number }> = {};
    for (const r of ccRows) { if (r.items <= 0) continue; const cc = r.cc === "—" ? "UNALLOCATED" : r.cc; const a = jnAgg[cc] || (jnAgg[cc] = { cc, depts: [], keys: [], items: 0, debit: 0 }); if (!a.depts.includes(r.dept)) a.depts.push(r.dept); a.keys.push(r.key); a.items += r.items; a.debit += r.amt; }
    const jnRows = Object.values(jnAgg).sort((a, b) => b.debit - a.debit).map((a) => ({ cc: a.cc, dept: a.depts.join(" / "), keys: a.keys, gl: glAcct, desc: jnDesc, items: a.items, debit: a.debit }));
    const jnUnallocated = jnRows.some((r) => r.cc === "UNALLOCATED");
    // Top stock
    const byItem: Record<string, Agg> = {}; const fyByItem: Record<string, number> = {};
    const fy = fyStart(month + "-15"); // financial year of the selected month
    // Every FY figure on this page — Top stock's, Exceptions' and Shrinkage's — stops at the end of
    // the selected month. Without the upper bound, reprinting June's pack in September counts three
    // months that hadn't happened when June closed, so the reprint no longer agrees with the pack
    // finance was already given.
    const fyCutoff = shiftMonth(month, 1) + "-01"; // exclusive: dates in `month` sort before it
    for (const i of mIssues) { if (!byItem[i.itemId]) byItem[i.itemId] = { items: 0, amt: 0 }; byItem[i.itemId].items += i.qty; byItem[i.itemId].amt += i.qty * issueCost(i, byId); }
    for (const i of s.issues) if (countsAsIssued(i) && !i.preloved && i.date >= fy && i.date < fyCutoff) fyByItem[i.itemId] = (fyByItem[i.itemId] || 0) + i.qty;
    const mTotQty = Object.values(byItem).reduce((t, v) => t + v.items, 0);
    const topRows = Object.entries(byItem).sort((a, b) => b[1].items - a[1].items).slice(0, 15).map(([id, v], n) => ({ n: n + 1, item: label(byId[id]), supplier: byId[id]?.supplier || "—", qty: v.items, val: v.amt, share: Math.round((v.items / Math.max(mTotQty, 1)) * 100) + "%", fyQty: fyByItem[id] || 0 }));
    // Valuation
    let negSizes = 0;
    const valRows = s.catalog.map((it) => { const units = it.sizes.reduce((t, _sz, si) => { const oh = onhand(s, L, `${it.id}:${si}`); if (oh < 0) negSizes++; return t + Math.max(0, oh); }, 0); return { item: longLabel(it), sku: it.sku || "—", supplier: it.supplier || "—", units, cost: it.cost, val: units * it.cost }; }).filter((x) => x.units > 0).sort((a, b) => b.val - a.val);
    const valTotUnits = valRows.reduce((t, x) => t + x.units, 0), valTot = valRows.reduce((t, x) => t + x.val, 0);
    // Shrinkage
    // Bounded at fyCutoff like the other FY figures: a count filed in July must not change the
    // shrinkage figure on June's pack after finance has it. Pool counts are at $0, not shrinkage.
    const fyTakes = s.stocktakes.filter((h) => h.date >= fy && h.date < fyCutoff && h.mode !== "preloved");
    let shU = 0, shV = 0;
    const shRows = fyTakes.map((h) => { const nu = h.lines.reduce((t, l) => t + (l.counted - l.sys), 0); const nv = h.lines.reduce((t, l) => t + (l.counted - l.sys) * cost(l.itemId), 0); shU += nu; shV += nv; return { date: h.date, by: h.by, counted: h.counted, variances: h.variances, net: nu, netVal: nv }; });
    // Exceptions
    const excThreshold = s.settings.exceptionHigh || 10;
    const mByStaff: Record<string, number> = {}; for (const i of mIssues) mByStaff[i.staffId] = (mByStaff[i.staffId] || 0) + i.qty;
    const cap = setsCap(s.settings.capSets);
    // Garments handed over this month past the six sets one person holds, on a coordinator's
    // override. That is the one exception the ceiling itself produces, and the counter stamps it on
    // the issue for this tab to find. It is read from that stamp rather than from anybody's locker
    // today, because today's locker is not June's: a June pack reprinted in September would name
    // whoever happens to be past the ceiling now, and saying who that is belongs to the staff
    // register and the dashboard. Every stamped row in the month counts, pre-loved and since-returned
    // included, because the decision was made at the counter on the day. A partial hand-in splits a
    // row without changing its date, so the halves still add up to what went over.
    const ovByStaff: Record<string, number> = {};
    for (const i of s.issues) if (i.override && i.date.slice(0, 7) === month) ovByStaff[i.staffId] = (ovByStaff[i.staffId] || 0) + i.qty;
    // Garments handed over this month outside the person's staff group, on the same tick but stamped
    // apart (offGroup), so they are counted and named apart. Same month rule as above. A garment can
    // be both, and then it is on both lines, because two rules were bent.
    const ogByStaff: Record<string, Record<string, number>> = {};
    for (const i of s.issues) if (i.offGroup && i.date.slice(0, 7) === month) { const m = (ogByStaff[i.staffId] = ogByStaff[i.staffId] || {}); const n = label(byId[i.itemId]); m[n] = (m[n] || 0) + i.qty; }
    // Garments handed over this month in a cut the person isn't offered, on the same tick and stamped
    // apart again (offStyle). Same month rule, and the same reason for counting it apart: the ceiling,
    // the staff group and the cut are three different decisions a coordinator made, and a row that
    // named them all as "an override" tells whoever reads the pack nothing about which was bent.
    const osByStaff: Record<string, Record<string, number>> = {};
    for (const i of s.issues) if (i.offStyle && i.date.slice(0, 7) === month) { const m = (osByStaff[i.staffId] = osByStaff[i.staffId] || {}); const n = label(byId[i.itemId]); m[n] = (m[n] || 0) + i.qty; }
    // What each person has drawn this financial year, to the end of the selected month. It is a
    // tally printed beside the month's figure, and nobody is flagged on it: what anybody may have is
    // six sets held at any time, with no year in it, and a report calling somebody over on a yearly
    // count sends a coordinator after a new starter the counter has kitted out quite properly.
    // Counted here rather than with entUsed(), which always measures the year containing today, so a
    // closed month reprints with the figures it was first printed with. fyCutoff is the one Top
    // stock and Shrinkage count to, so no two tabs quote a different window for the same month. Same
    // rules as entUsed(): pre-loved is free and not counted, a garment returned in good condition
    // never counted, and a credited hand-in takes the good garments back off.
    const fyByStaff: Record<string, number> = {};
    for (const i of s.issues) if (!i.preloved && countsAsIssued(i) && i.date >= fy && i.date < fyCutoff) fyByStaff[i.staffId] = (fyByStaff[i.staffId] || 0) + i.qty;
    for (const h of s.handins) if (h.credit && h.date >= fy && h.date < fyCutoff) for (const l of h.lines) fyByStaff[h.staffId] = (fyByStaff[h.staffId] || 0) - l.credited;
    const excRows: { who: string; group: string; cc: string; mQty: number; fyQty: number; ovQty: number; ogQty: number; osQty: number; flags: string[]; flag: string }[] = [];
    for (const st of s.staff) {
      const fyQ = Math.max(0, fyByStaff[st.id] || 0); const mQ = mByStaff[st.id] || 0; const ov = ovByStaff[st.id] || 0;
      const og = Object.entries(ogByStaff[st.id] || {}); const ogQ = og.reduce((t, [, n]) => t + n, 0);
      const os = Object.entries(osByStaff[st.id] || {}); const osQ = os.reduce((t, [, n]) => t + n, 0);
      const flags: string[] = [];
      if (ov) flags.push(`Past ${cap} sets on an override — ${ov} garment${ov === 1 ? "" : "s"}`);
      if (ogQ) flags.push(`Outside their staff group on an override — ${og.map(([n, q]) => `${n} ×${q}`).join(", ")}`);
      if (osQ) flags.push(`Not their uniform style on an override — ${os.map(([n, q]) => `${n} ×${q}`).join(", ")}`);
      if (mQ >= excThreshold) flags.push(`${mQ} items this month (threshold ${excThreshold})`);
      if (flags.length) excRows.push({ who: staffName(st), group: st.group, cc: ccOf(s, st), mQty: mQ, fyQty: fyQ, ovQty: ov, ogQty: ogQ, osQty: osQ, flags, flag: flags.join(" · ") });
    }
    // Overrides first, of any kind. Each one is a decision somebody made at the counter, and it is
    // the row a coordinator gets asked about. Volume on its own comes after, busiest first.
    excRows.sort((a, b) => Number(b.ovQty + b.ogQty + b.osQty > 0) - Number(a.ovQty + a.ogQty + a.osQty > 0) || b.mQty - a.mQty);
    // Approvals
    const apprRows = s.approvals.filter((a) => a.sets - a.used > 0).map((a) => { const st = staffById[a.staffId]; return { who: staffName(st, "—"), dept: st?.dept || "—", by: a.by, date: a.date, sets: a.sets, used: a.used, rem: a.sets - a.used }; });
    const apprTot = apprRows.reduce((t, a) => t + a.rem, 0);
    // Redesign additions: orders placed this month, and distinct people issued per staff group.
    const ordCount = mOrders.length;
    const groupPeopleSets: Record<string, Set<string>> = {};
    for (const i of mIssues) { const g = staffById[i.staffId]?.group || "Unknown"; (groupPeopleSets[g] = groupPeopleSets[g] || new Set()).add(i.staffId); }
    const groupRowsP = groupRows.map((g) => ({ ...g, people: groupPeopleSets[g.g]?.size || 0 }));
    return { repMonths, ccRows, ccLines, totAmt, totPrev, totItems, ordSpend, ordCount, groupRows: groupRowsP, supRows, fyRows, fyTot: { items: fti, issued: fta, orders: fto }, trend, staffRows, glAcct, jnDesc, jnRows, jnUnallocated, topRows, valRows, valTotUnits, valTot, negSizes, shRows, shU, shV, cap, excThreshold, excRows, apprRows, apprTot, plIssueRows, plSaved, plQty, hiRows, ragMonth, plPoolRows, plPoolTotal };
  }, [s, L, byId, staffById, month]);

  const mLbl = monthLabel(month);
  const meta = `${s.settings.facility} · ${s.settings.location} · prepared ${fmtDate(s.today)}${s.settings.coordinator ? " by " + s.settings.coordinator : ""}`;
  const jnTotItems = R.jnRows.reduce((t, r) => t + r.items, 0), jnTot = R.jnRows.reduce((t, r) => t + r.debit, 0);
  const C = (t: string, r = false): Col => ({ t, r });

  const ccTable = () => tbl([C("CC"), C("Department"), C("Items", true), C("This period", true), C("Prev", true), C("Δ", true)], [...R.ccRows.map((r) => [r.cc, r.dept, r.items, money(r.amt), money(r.prev), signedMoney(r.delta)] as (string | number)[]), ["TOTAL", "", R.totItems, money(R.totAmt), money(R.totPrev), ""]]);
  const staffTable = () => tbl([C("Staff"), C("CC"), C("Items", true), C("Value", true)], R.staffRows.map((r) => [r.who, r.cc, r.items, money(r.amt)]));
  const fyTable = () => tbl([C("Month"), C("Items", true), C("Issued", true), C("Orders", true)], [...R.fyRows.map((m) => [m.label, m.items, money(m.issued), money(m.orders)] as (string | number)[]), ["FY TOTAL", R.fyTot.items, money(R.fyTot.issued), money(R.fyTot.orders)]]);
  const ccCsvRows = () => csvOf(["Cost Centre", "Department", "Items", "Amount", "Previous Month"], [...R.ccRows.map((r) => [r.cc, r.dept, r.items, r.amt.toFixed(2), r.prev.toFixed(2)] as (string | number)[]), ["TOTAL", "", R.totItems, R.totAmt.toFixed(2), R.totPrev.toFixed(2)]]);
  const staffCsvRows = () => csvOf(["Staff", "Cost Centre", "Items", "Amount"], R.staffRows.map((r) => [r.who, r.cc, r.items, r.amt.toFixed(2)]));
  const fyCsvRows = () => csvOf(["FY Month", "Items Issued", "Issued Value", "Orders Placed"], [...R.fyRows.map((m) => [m.label, m.items, m.issued.toFixed(2), m.orders.toFixed(2)] as (string | number)[]), ["FY TOTAL", R.fyTot.items, R.fyTot.issued.toFixed(2), R.fyTot.orders.toFixed(2)]]);

  const csv = {
    /* Today's Overview CSV, whole: the Spend head's Export CSV. */
    overview: () => {
      let out = `ThreadCount monthly report,${month},${csvEsc(s.settings.facility)}\n\n` + ccCsvRows();
      out += "\n" + csvOf(["Staff Group", "Items", "Amount"], R.groupRows.map((g) => [g.g, g.items, g.amt.toFixed(2)]));
      out += "\n" + staffCsvRows();
      out += "\n" + csvOf(["Supplier", "Orders", "Amount"], R.supRows.map((r) => [r.name, r.n, r.amt.toFixed(2)]));
      out += "\n" + fyCsvRows();
      downloadCsv(`threadcount-report-${month}.csv`, out);
    },
    costCentres: () => downloadCsv(`threadcount-cost-centres-${month}.csv`, `Issued value by cost centre,${month},${csvEsc(s.settings.facility)}\n\n` + ccCsvRows()),
    staff: () => downloadCsv(`threadcount-staff-${month}.csv`, `Issued value by staff member,${month},${csvEsc(s.settings.facility)}\n\n` + staffCsvRows()),
    fy: () => downloadCsv(`threadcount-financial-year-${month}.csv`, `Financial year to the end of,${month},${csvEsc(s.settings.facility)}\n\n` + fyCsvRows()),
    journal: () => downloadCsv(`threadcount-journal-${month}.csv`, csvOf(["Cost Centre", "Department", "GL Account", "Description", "Items", "Debit"], [...R.jnRows.map((r) => [r.cc, r.dept, r.gl, r.desc, r.items, r.debit.toFixed(2)] as (string | number)[]), ["TOTAL", "", "", "", jnTotItems, jnTot.toFixed(2)]])),
    valuation: () => downloadCsv(`threadcount-valuation-${s.today}.csv`, `Stock valuation as at,${s.today}\n` + csvOf(["Item", "SKU", "Supplier", "Units", "Unit cost", "Value"], R.valRows.map((x) => [x.item, x.sku, x.supplier, x.units, x.cost, x.val.toFixed(2)]))),
    topStock: () => downloadCsv(`threadcount-top-stock-${month}.csv`, csvOf(["Rank", "Item", "Supplier", "Qty (month)", "Value (month)", "Share", "Qty (FY)"], R.topRows.map((r) => [r.n, r.item, r.supplier, r.qty, r.val.toFixed(2), r.share, r.fyQty]))),
    shrinkage: () => downloadCsv(`threadcount-shrinkage-${month}.csv`, csvOf(["Date", "Counted by", "Lines counted", "Variances", "Net units", "Net value"], R.shRows.map((r) => [r.date, r.by, r.counted, r.variances, r.net, r.netVal.toFixed(2)]))),
    exceptions: () => downloadCsv(`threadcount-exceptions-${month}.csv`, csvOf(["Staff", "Group", "Cost centre", "Items (month)", "Items (FY)", "Flag"], R.excRows.map((r) => [r.who, r.group, r.cc, r.mQty, r.fyQty, r.flag]))),
    suppliers: () => downloadCsv(`threadcount-supplier-spend-${month}.csv`, csvOf(["Supplier", "Orders", "Value", "Invoices"], R.supRows.map((r) => [r.name, r.n, r.amt.toFixed(2), r.invoices]))),
    approvals: () => downloadCsv(`threadcount-approvals-outstanding-${s.today}.csv`, csvOf(["Staff", "Ward", "Approved by", "Date", "Sets approved", "Collected", "Remaining"], R.apprRows.map((r) => [r.who, r.dept, r.by, r.date, r.sets, r.used, r.rem]))),
    preloved: () => downloadCsv(`threadcount-preloved-${month}.csv`, `Pre-loved issues ${month}\n` + csvOf(["Date", "Staff", "Item", "Size", "Qty", "Value saved"], R.plIssueRows.map((r) => [r.date, r.who, r.item, r.size, r.qty, r.saved.toFixed(2)])) + "\nHand-ins\n" + csvOf(["Date", "Staff", "Received by", "Good", "Rag", "Credit"], R.hiRows.map((r) => [r.date, r.who, r.by, r.good, r.rag, r.credit])) + "\nPool snapshot\n" + csvOf(["Item", "Sizes", "Total"], R.plPoolRows.map((r) => [r.item, r.sizes, r.total]))),
  };

  const print = {
    overview: () => printDoc(`Cost centre report — ${mLbl}`, meta, [
      { h: "Summary", html: tbl([C(""), C("", true)], [["Issued value (period)", money(R.totAmt)], ["Items issued", R.totItems], ["Supplier orders placed", money(R.ordSpend)], ["vs previous month", money(R.totPrev)]]) },
      { h: "Issued value by cost centre", html: ccTable() },
      { h: "By staff group", html: tbl([C("Group"), C("Items", true), C("Value", true)], R.groupRows.map((g) => [g.g, g.items, money(g.amt)])) },
      { h: "By staff member", html: staffTable() },
      { h: "Financial year", html: fyTable() },
    ]),
    costCentres: () => printDoc(`Cost centre report — ${mLbl}`, meta, [{ h: "Issued value by cost centre", html: ccTable() }]),
    staff: () => printDoc(`Issued value by staff member — ${mLbl}`, meta, [{ h: "By staff member", html: staffTable() }]),
    fy: () => printDoc(`Financial year — to the end of ${mLbl}`, meta, [{ h: "Financial year", html: fyTable() }]),
    journal: () => printDoc(`End-of-month journal — ${mLbl}`, meta, [{ h: `One debit per cost centre — GL ${R.glAcct}`, html: tbl([C("CC"), C("Department"), C("GL"), C("Description"), C("Items", true), C("Debit", true)], [...R.jnRows.map((r) => [r.cc, r.dept, r.gl, r.desc, r.items, money(r.debit)] as (string | number)[]), ["TOTAL", "", "", "", jnTotItems, money(jnTot)]]) }]),
    topStock: () => printDoc(`Top stock — ${mLbl}`, meta, [{ h: "Most issued items", html: tbl([C("#"), C("Item"), C("Supplier"), C("Qty", true), C("Value", true), C("Share", true), C("Qty FY", true)], R.topRows.map((r) => [r.n, r.item, r.supplier, r.qty, money(r.val), r.share, r.fyQty])) }]),
    valuation: () => printDoc(`Stock valuation — as at ${fmtDate(s.today)}`, meta, [{ h: "On-hand value by item", html: tbl([C("Item"), C("SKU"), C("Supplier"), C("Units", true), C("Unit cost", true), C("Value", true)], [...R.valRows.map((r) => [r.item, r.sku, r.supplier, r.units, money(r.cost), money(r.val)] as (string | number)[]), ["TOTAL", "", "", R.valTotUnits, "", money(R.valTot)]]) }]),
    shrinkage: () => printDoc(`Stocktake variance / shrinkage — FY to end of ${mLbl}`, meta, [{ h: `${R.shRows.length} stocktakes · net ${signedInt(R.shU)} units · ${signedMoney(R.shV)}`, html: tbl([C("Date"), C("Counted by"), C("Lines", true), C("Variances", true), C("Net units", true), C("Net value", true)], R.shRows.map((r) => [fmtDate(r.date), r.by, r.counted, r.variances, signedInt(r.net), signedMoney(r.netVal)])) }]),
    exceptions: () => printDoc(`Staff exceptions — ${mLbl}`, meta, [{ h: `Past ${R.cap} sets, outside their staff group or not their uniform style on an override, or ≥ ${R.excThreshold} items this month`, html: tbl([C("Staff"), C("Group"), C("CC"), C("Month", true), C("FY", true), C("Flag")], R.excRows.map((r) => [r.who, r.group, r.cc, r.mQty, r.fyQty, r.flag])) }]),
    suppliers: () => printDoc(`Supplier spend — ${mLbl}`, meta, [{ h: "Orders placed this period", html: tbl([C("Supplier"), C("Orders", true), C("Value", true), C("Invoices")], R.supRows.map((r) => [r.name, r.n, money(r.amt), r.invoices])) }]),
    approvals: () => printDoc(`Uncollected manager's approvals — as at ${fmtDate(s.today)}`, meta, [{ h: `${R.apprTot} sets outstanding`, html: tbl([C("Staff"), C("Ward"), C("Approved by"), C("Date"), C("Sets", true), C("Collected", true), C("Remaining", true)], R.apprRows.map((r) => [r.who, r.dept, r.by, fmtDate(r.date), r.sets, r.used, r.rem])) }]),
    preloved: () => printDoc(`Pre-loved uniforms — ${mLbl}`, meta, [
      { h: `Issued free this period — saved ${money(R.plSaved)}`, html: tbl([C("Date"), C("Staff"), C("Item"), C("Size"), C("Qty", true), C("Value saved", true)], R.plIssueRows.map((r) => [fmtDate(r.date), r.who, r.item, r.size, r.qty, money(r.saved)])) },
      { h: `Hand-ins this period · ${R.ragMonth} to rag disposal`, html: tbl([C("Date"), C("Staff"), C("Received by"), C("Good", true), C("Rag", true), C("Credit")], R.hiRows.map((r) => [fmtDate(r.date), r.who, r.by, r.good, r.rag, r.credit])) },
      { h: `Pool snapshot — ${R.plPoolTotal} items at $0 book value`, html: tbl([C("Item"), C("Sizes"), C("Total", true)], R.plPoolRows.map((r) => [r.item, r.sizes, r.total])) },
    ]),
  };

  function printEomPack() {
    const sections = [
      { h: "Summary", html: tbl([C(""), C("", true), C(""), C("", true)], [["Issued value", money(R.totAmt), "Items issued", R.totItems], ["Supplier orders placed", money(R.ordSpend), "Stock on hand value", money(R.valTot)], ["Shrinkage (FY to end of month)", signedMoney(R.shV), "Stocktakes counted (FY)", R.shRows.length]]) },
      { h: "Cost centre summary", html: tbl([C("CC"), C("Department"), C("Items", true), C("Value", true)], [...R.jnRows.map((r) => [r.cc, r.dept, r.items, money(r.debit)] as (string | number)[]), ["TOTAL", "", jnTotItems, money(jnTot)]]) },
      { h: `Journal — one debit per cost centre (GL ${R.glAcct})`, html: tbl([C("CC"), C("Description"), C("Debit", true)], R.jnRows.map((r) => [r.cc, r.desc, money(r.debit)])) },
      { h: "Top stock", html: tbl([C("Item"), C("Qty", true), C("Value", true)], R.topRows.slice(0, 10).map((r) => [r.item, r.qty, money(r.val)])) },
    ];
    // Finance is promised shrinkage in this pack, and the net figure is in the summary above every
    // month. The count-by-count table only turns up when counts were actually filed, the same rule
    // the exceptions and approvals sections below follow — a heading over an empty table tells
    // finance nothing and costs them a page.
    if (R.shRows.length) sections.push({ h: `Shrinkage — stocktake variance, FY to end of ${mLbl} · net ${signedInt(R.shU)} units · ${signedMoney(R.shV)}`, html: tbl([C("Date"), C("Counted by"), C("Variances", true), C("Net units", true), C("Net value", true)], R.shRows.map((r) => [fmtDate(r.date), r.by, r.variances, signedInt(r.net), signedMoney(r.netVal)])) });
    if (R.excRows.length) sections.push({ h: "Staff exceptions", html: tbl([C("Staff"), C("Cost centre"), C("Flag")], R.excRows.map((r) => [r.who, r.cc, r.flag])) });
    if (R.apprRows.length) sections.push({ h: "Uncollected manager's approvals", html: tbl([C("Staff"), C("Approved by"), C("Remaining sets", true)], R.apprRows.map((r) => [r.who, r.by, r.rem])) });
    printDoc(`Month-end pack — ${mLbl}`, meta, sections);
  }

  return { R, month, mLbl, meta, jnTotItems, jnTot, csv, print, printEomPack };
}

export type ReportData = ReturnType<typeof useReportData>;
