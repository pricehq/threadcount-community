import { redirect } from "next/navigation";

/* More's rows moved: Settings is the gear on Today, the rest live in Stock and Work. */
export default function More() {
  redirect("/m");
}
