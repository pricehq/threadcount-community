import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/staffsession";
import { ordersData } from "@/lib/staffdata";
import OrdersScreen from "@/components/screens/Orders";

export const dynamic = "force-dynamic";

export default async function MyOrders({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");
  const { tab } = await searchParams;
  const { open, done, raised } = await ordersData(sess);
  // Landing from the Messages tab with nothing open should still show the Open tab and its empty
  // state, rather than a list of finished orders nobody asked for. `raised` is what this person
  // typed in for somebody else — the desk's whole day, and now a manager's too.
  return (
    <OrdersScreen
      open={open}
      done={done}
      raised={raised}
      initialTab={tab === "done" ? "done" : tab === "raised" ? "raised" : "open"}
    />
  );
}
