import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/staffsession";
import { catalogueData } from "@/lib/staffdata";
import ShelfScreen from "@/components/screens/Shelf";

export const dynamic = "force-dynamic";

export default async function MyShelf() {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");
  const { items } = await catalogueData(sess);
  return <ShelfScreen items={items} />;
}
