import { redirect } from "next/navigation";

/* A Community instance is the product, not a website: the front door is the sign-in. */
export default function Home() {
  redirect("/auth");
}
