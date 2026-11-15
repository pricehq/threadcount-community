"use client";
import { useState } from "react";
import { useSnap } from "@/lib/client";
import { PageHead } from "@/components/ui";
import ToOrder from "@/components/orders/ToOrder";
import OnTheWay from "@/components/orders/OnTheWay";
import ThisMonth from "@/components/orders/ThisMonth";
import RecentOrders from "@/components/orders/RecentOrders";
import { NewOrder, OrdersStyles } from "@/components/orders/bits";

export default function OrdersPage() {
  const { isAdmin } = useSnap();
  const [dlg, setDlg] = useState<null | "stock" | "staff">(null);
  return (
    <section>
      <OrdersStyles />
      <PageHead title="Orders">
        <button type="button" className="btn btn-onink" onClick={() => setDlg("staff")}>Order for a person</button>
        <button type="button" className="btn btn-primary" onClick={() => setDlg("stock")}>New order</button>
      </PageHead>
      <div className="tc-orders-grid">
        <div className="tc-orders-toorder">{isAdmin ? <ToOrder /> : <RecentOrders />}</div>
        <div className="tc-orders-otw"><OnTheWay /></div>
        <div className="tc-orders-month"><ThisMonth /></div>
      </div>
      {dlg && <NewOrder onClose={() => setDlg(null)} initOrderFor={dlg === "staff" ? "Staff Member" : undefined} />}
    </section>
  );
}
