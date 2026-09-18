"use client";
/* The full request queue: /app/requests?filter=&staff=&ward=&open=
 *
 * Approval is the ward's and fulfilment is the linen room's; this screen is the linen room's side.
 * The rows come from components/requests/RequestList, the same list the staff record and Today
 * use. One payload is fetched and every filter, count and export is a narrowing of it. */
import { Suspense, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSnap } from "@/lib/client";
import { Empty, ErrorLine, PageHead } from "@/components/ui";
import { MonoNum, Seg } from "@/components/portal";
import RequestList, {
  REQUEST_FILTERS, REQUEST_FILTER_LABEL, RequestStyles, isRowFilter, requestCounts, requestsFor, scopePayload,
  useRequestActions, useRequests, type RequestFilter,
} from "@/components/requests/RequestList";
import Queries from "@/components/requests/Queries";
import Damage from "@/components/requests/Damage";
import KitCheck from "@/components/requests/KitCheck";
import { exportCount, exportRequestsCsv } from "@/components/requests/csv";

// useSearchParams needs a Suspense boundary for static rendering.
export default function RequestsPage() {
  return <Suspense fallback={null}><RequestsInner /></Suspense>;
}

const isFilter = (v: string | null): v is RequestFilter => !!v && (REQUEST_FILTERS as readonly string[]).includes(v);

function RequestsInner() {
  const { s } = useSnap();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const rawFilter = sp.get("filter");
  const staffId = sp.get("staff") || undefined;
  const ward = sp.get("ward") || undefined;
  const openId = sp.get("open");

  const { data, error, reload } = useRequests();
  const { act, error: actError } = useRequestActions(reload);

  const person = staffId ? s.staff.find((x) => x.id === staffId) : undefined;
  const scope = useMemo(() => ({ staffId, ward }), [staffId, ward]);
  const scoped = useMemo(() => (data ? scopePayload(data, scope, person?.num) : null), [data, scope, person?.num]);
  const counts = useMemo(() => (scoped ? requestCounts(scoped) : null), [scoped]);

  /* A deep link to one request with no filter named lands on the first filter that holds it, so
     ?open= always shows the row expanded. */
  const filter: RequestFilter = useMemo(() => {
    if (isFilter(rawFilter)) return rawFilter;
    if (openId && scoped) {
      for (const f of ["todo", "open", "all"] as const) if (requestsFor(scoped.requests, f).some((r) => r.id === openId)) return f;
    }
    return "todo";
  }, [rawFilter, openId, scoped]);

  function setParams(next: Record<string, string | null>) {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) { if (v === null) q.delete(k); else q.set(k, v); }
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // An unknown ?filter= is dropped rather than left in the address bar disagreeing with the screen.
  useEffect(() => {
    if (!rawFilter || isFilter(rawFilter)) return;
    const q = new URLSearchParams(window.location.search);
    q.delete("filter");
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [rawFilter, router, pathname]);

  const showing = staffId ? (person ? `${person.first} ${person.last}`.trim() : data?.requests.find((r) => r.staffId === staffId)?.staffName || "one person") : ward;
  const more = data?.moreRequests ? "+" : "";
  const segCounts = counts
    ? Object.fromEntries(REQUEST_FILTERS.map((f) => [f, `${counts[f]}${isRowFilter(f) ? more : ""}`])) as Record<RequestFilter, string>
    : undefined;

  const shown = scoped ? exportCount(filter, scoped) : 0;
  const narrowed = !!showing || (filter !== "all" && filter !== "cycles");

  return (
    <section>
      <RequestStyles />
      <PageHead title="Requests">
        <button type="button" className="btn btn-ghost" disabled={!scoped || shown === 0}
          onClick={() => { if (scoped) exportRequestsCsv(s, filter, scoped, showing); }}>
          {narrowed && filter !== "cycles" ? `Export CSV (${shown} shown)` : "Export CSV"}
        </button>
      </PageHead>

      {showing && (
        <div className="tc-req-actions" style={{ marginBottom: 12 }}>
          <span className="tc-meta-line" style={{ fontSize: 13 }}>Showing <b style={{ color: "var(--color-text)" }}>{showing}</b></span>
          <button type="button" className="btn btn-ghost" style={{ minHeight: 30, padding: "2px 8px" }}
            aria-label={`Clear, show every ${staffId ? "person" : s.settings.terms.team}`}
            onClick={() => setParams(staffId ? { staff: null, open: null } : { ward: null, open: null })}>
            Clear
          </button>
        </div>
      )}

      {!data ? (
        error ? (
          <>
            <ErrorLine msg={error} />
            <div style={{ marginTop: 12 }}><button type="button" className="btn btn-secondary" onClick={() => void reload()}>Try again</button></div>
          </>
        ) : <Empty>Loading…</Empty>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {error && <ErrorLine msg={error} />}
          {counts && counts.noapprover > 0 && filter !== "noapprover" && (
            <div className="tc-flag tc-req-actions" style={{ border: "2px solid var(--color-text)", borderLeft: "4px solid var(--color-accent)", padding: "10px 16px", justifyContent: "space-between" }}>
              <b style={{ fontSize: 13.5 }}>
                <span className="tc-mark" aria-hidden="true" />
                <MonoNum weight={600} tone="accent" size={15}>{counts.noapprover}{more}</MonoNum> with no approver
              </b>
              <button type="button" className="btn btn-secondary" onClick={() => setParams({ filter: "noapprover" })}>Address them</button>
            </div>
          )}

          <div className="tc-req-scroll">
            <Seg label="Which requests" opts={REQUEST_FILTERS} labels={REQUEST_FILTER_LABEL} counts={segCounts} value={filter}
              onChange={(f) => setParams({ filter: f })} style={{ flexWrap: "nowrap", width: "max-content" }} />
          </div>

          {actError && <ErrorLine msg={actError} />}

          {isRowFilter(filter) ? (
            <RequestList filter={filter} openId={openId} data={scoped} reload={reload} />
          ) : filter === "queries" ? (
            <Queries rows={scoped?.disputes ?? []} act={act} />
          ) : filter === "damage" ? (
            <Damage rows={scoped?.damage ?? []} act={act} />
          ) : (
            <KitCheck cycle={scoped?.cycle ?? null} shortfalls={scoped?.shortfalls ?? []} waiting={scoped?.waiting ?? []} act={act} />
          )}
        </div>
      )}
    </section>
  );
}
