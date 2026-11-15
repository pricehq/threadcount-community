"use client";
import Link from "next/link";
import { PageHead, Empty } from "@/components/ui";
import { usePortalCounts } from "@/lib/portalcounts";
import { todayHeadLine } from "@/lib/today";
import SetupGroup from "@/components/today/SetupGroup";
import CollectGroup from "@/components/today/CollectGroup";
import RoundGroup from "@/components/today/RoundGroup";
import PickGroup from "@/components/today/PickGroup";
import ReceiveGroup from "@/components/today/ReceiveGroup";
import CountsGroup from "@/components/today/CountsGroup";
import RunsOutPanel from "@/components/today/RunsOutPanel";
import MonthEndPanel from "@/components/today/MonthEndPanel";

/* Today: the work queue. Each group is a thing somebody has to go and do, and a group with nothing
   in it is not drawn. Membership and the head count both come from lib/portalcounts.ts, the same
   numbers the rail badge shows. */
export default function TodayPage() {
  const { today } = usePortalCounts();
  const column: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 18, minWidth: 0 };

  return (
    <section>
      <PageHead title="Today" sub={todayHeadLine(today.total, today.overdue)}>
        <Link href="/app/counter" className="btn btn-primary">Open the counter</Link>
      </PageHead>
      <div className="tc-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.75fr) minmax(0, 1fr)", gap: 24, alignItems: "start", marginTop: 24 }}>
        <div style={column}>
          <SetupGroup />
          <CollectGroup />
          <RoundGroup />
          <PickGroup />
          <ReceiveGroup />
          <CountsGroup />
          {today.total === 0 && <Empty pad={2}>Nothing in the queue.</Empty>}
        </div>
        <div style={column}>
          <RunsOutPanel />
          <MonthEndPanel />
        </div>
      </div>
    </section>
  );
}
