import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { buildSnapshot } from "@/lib/snapshot";
import { prisma } from "@/lib/db";
import { SnapshotProvider } from "@/lib/client";
import type { ServerCounts } from "@/lib/portalcounts";
import Shell from "@/components/Shell";
import Analytics from "@/components/Analytics";
import SourceNotice from "@/components/SourceNotice";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/auth");
  const facilityId = user.facilityId;
  // The four rail counts the snapshot cannot make: requests, record queries and damage live in
  // their own tables and are never loaded into the snapshot. mutate()'s router.refresh() re-runs
  // this layout, so the badges follow every write.
  const [snap, pick, stranded, queries, damage] = await Promise.all([
    buildSnapshot(user),
    prisma.request.count({ where: { facilityId, status: "accepted" } }),
    prisma.request.count({ where: { facilityId, status: "awaiting", managerName: "" } }),
    prisma.recordDispute.count({ where: { facilityId, resolvedAt: null } }),
    prisma.damageReport.count({ where: { facilityId, handedInAt: null } }),
  ]);
  const serverCounts: ServerCounts = { pick, stranded, queries, damage };
  return (
    <SnapshotProvider snap={snap}>
      <Shell serverCounts={serverCounts}>{children}</Shell>
      <Analytics site="app" />
      {/* Community only: the AGPL's offer of source, to the people using this server. */}
      <SourceNotice />
    </SnapshotProvider>
  );
}
