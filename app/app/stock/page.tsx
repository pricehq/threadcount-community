"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSnap } from "@/lib/client";
import { PageHead } from "@/components/ui";
import { Seg } from "@/components/portal";
import { ItemDialog, ScanAddDialog } from "@/components/dialogs";
import OnHand, { asStockFilter } from "@/components/stock/OnHand";
import CountTab from "@/components/stock/CountTab";
import Locations from "@/components/stock/Locations";
import { StockStyles } from "@/components/stock/StockStyles";
import { ALL_GROUPS } from "@/lib/compute";

const TABS = ["onhand", "count", "locations"] as const;
type StockTab = (typeof TABS)[number];
const TAB_LABELS: Record<StockTab, string> = { onhand: "On hand", count: "Count", locations: "Locations" };
const TAB_HREFS: Record<StockTab, string> = { onhand: "/app/stock?tab=onhand", count: "/app/stock?tab=count", locations: "/app/stock?tab=locations" };

function StockScreen() {
  const router = useRouter();
  const sp = useSearchParams();
  const { isAdmin } = useSnap();
  const raw = sp.get("tab");
  const tab: StockTab = raw === "count" || raw === "locations" ? raw : "onhand";
  const [newItem, setNewItem] = useState(false);
  const [scanAdd, setScanAdd] = useState(false);

  return (
    <section>
      <StockStyles />
      <PageHead title="Stock">
        <Seg tone="ink" label="Stock view" opts={TABS} value={tab} onChange={() => {}} labels={TAB_LABELS} hrefs={TAB_HREFS} />
        {isAdmin && <button type="button" className="btn btn-onink" onClick={() => setScanAdd(true)}>Scan to add</button>}
        {isAdmin && <button type="button" className="btn btn-primary" onClick={() => setNewItem(true)}>Add garment</button>}
      </PageHead>
      {tab === "onhand" && (
        <OnHand init={{ filter: asStockFilter(sp.get("filter")), q: sp.get("q") || "", group: sp.get("group") || ALL_GROUPS, supplier: sp.get("supplier") || "" }} />
      )}
      {tab === "count" && <CountTab initLocation={sp.get("location") || ""} />}
      {tab === "locations" && <Locations />}
      {newItem && <ItemDialog onClose={() => setNewItem(false)} onSaved={(id) => router.push(`/app/stock/${encodeURIComponent(id)}`)} />}
      {scanAdd && <ScanAddDialog onClose={() => setScanAdd(false)} />}
    </section>
  );
}

// useSearchParams wants a Suspense boundary above it.
export default function StockPage() {
  return <Suspense fallback={null}><StockScreen /></Suspense>;
}
