import { notFound, redirect } from "next/navigation";
import { currentStaff } from "@/lib/staffsession";
import { deskCatalogue, teamPeople } from "@/lib/deskdata";
import { ordersData } from "@/lib/staffdata";
import { REQUEST_MAX_LINES, REQUEST_MAX_QTY } from "@/lib/ops";
import DeskScreen from "@/components/screens/Desk";

export const dynamic = "force-dynamic";

/* A manager raising for one of their own reports — the only way one person types a request in
 * somebody else's name in this app. A ward clerk on the desk used to have a screen of its own for
 * anyone on their ward; that is gone, and the person who would have asked the clerk asks the
 * manager who approves it anyway.
 *
 * The scope here is the same relationship the server enforces on `request.create`: the people who
 * name this person as their manager. Nothing on this page decides who may be raised for — it asks
 * teamPeople() for exactly the set the op would accept, and a request for anybody else is refused
 * there.
 */
export default async function MyRaise() {
  const sess = await currentStaff();
  if (!sess) redirect("/my/signin");

  const [people, items, orders] = await Promise.all([
    teamPeople(sess),
    deskCatalogue(sess),
    ordersData(sess),
  ]);
  // Nobody reporting to them means no screen, the same way the approvals queue works: an empty one
  // implies they might one day have a team, which is a question for the linen room.
  if (!people.length) notFound();

  return (
    <DeskScreen
      // Every one of them names this manager, which is exactly why the request cannot stay with
      // them: the screen says whose name is on it, and the server sends it up a level.
      people={people}
      items={items}
      raised={orders.raised.open}
      maxLines={REQUEST_MAX_LINES}
      maxQty={REQUEST_MAX_QTY}
    />
  );
}
