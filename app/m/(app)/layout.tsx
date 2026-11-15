import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { buildSnapshot } from "@/lib/snapshot";
import { SnapshotProvider } from "@/lib/client";
import { MToastProvider } from "@/components/m";
import { MBasketProvider } from "@/components/MBasket";

export const dynamic = "force-dynamic";

/* Everything that needs a signed-in coordinator. Sending them to /m/login rather than /auth keeps
   them in the app's own world: /auth is the website's two-pane sign-in, which is a jarring thing
   to meet on a phone halfway through opening an app.

   The toast and the in-progress basket sit inside the snapshot, and neither renders a wrapper
   element, so every screen stays a direct child of .tcx-app (the native scan transparency relies
   on that). */
export default async function MobileAppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/m/login");
  const snap = await buildSnapshot(user);
  return (
    <SnapshotProvider snap={snap}>
      <MToastProvider>
        <MBasketProvider>{children}</MBasketProvider>
      </MToastProvider>
    </SnapshotProvider>
  );
}
