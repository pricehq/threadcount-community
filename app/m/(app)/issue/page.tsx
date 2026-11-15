import { redirect } from "next/navigation";

/* Issuing starts from a person now: the People tab, or a scanned badge. */
export default function IssuePicker() {
  redirect("/m/people");
}
