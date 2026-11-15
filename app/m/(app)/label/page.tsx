import { redirect } from "next/navigation";

/* Reprinting a label is Print a label on the stock line's own page. */
export default function Label() {
  redirect("/m/stock?seg=all");
}
