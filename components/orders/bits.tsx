"use client";
/* Small pieces the Orders screens share. */
import Link from "next/link";
import { Icon } from "@/components/portal";
import { NewOrderDialog } from "@/components/dialogs";

/* `‹ Parent / Current` directly under the page head (the staff-record pattern). */
export function Crumb({ href, parent, current }: { href: string; parent: string; current: string }) {
  return (
    <nav aria-label="Breadcrumb" className="tc-orders-crumb">
      <Icon name="chevronLeft" size={16} />
      <Link href={href}>{parent}</Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page" className="tc-orders-crumb-here">{current}</span>
    </nav>
  );
}

/* NewOrderDialog with the S2 pre-fill props (initOrderFor / initStaffId / initSupplier). Typed here so
 * this file compiles whether or not the shared dialog has picked the props up yet. */
type NewOrderProps = Parameters<typeof NewOrderDialog>[0] & { initOrderFor?: "Stock" | "Staff Member"; initStaffId?: string; initSupplier?: string };
export const NewOrder = NewOrderDialog as unknown as (p: NewOrderProps) => React.ReactElement;

export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/* "11 Sep": the short date the boards print. */
export function shortDate(iso: string): string {
  if (!iso || iso.length < 10) return "";
  const d = new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

/* Layout for the Orders screens. The page grid needs a media query for the phone order
 * (On the way, To order, This month), which an inline style cannot carry. */
export function OrdersStyles() {
  return null; // the rules are in app/globals.css under portal redesign
}
