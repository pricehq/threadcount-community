import { redirect } from "next/navigation";

/* Deliveries to receive are Work › In; each opens /m/receive/[id]. */
export default function Receive() {
  redirect("/m/work?seg=in");
}
