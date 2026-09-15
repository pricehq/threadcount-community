import { redirect } from "next/navigation";

/* Delivery rounds are Work › Rounds; each ward signs at /m/round/[ward]. */
export default function Rounds() {
  redirect("/m/work?seg=rounds");
}
