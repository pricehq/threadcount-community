import { redirect } from "next/navigation";

/* The pickup call list is Work › Pickups. */
export default function Pickups() {
  redirect("/m/work?seg=pickups");
}
