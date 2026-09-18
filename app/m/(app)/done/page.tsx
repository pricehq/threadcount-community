"use client";
/* The Done screen as its own history entry. A finished hand-over or delivery router.replace()s its
   form here (components/SignFlow showDone), so Back skips the spent form, a router refresh re-renders
   this screen rather than the form's parent, and a reload still shows what was just recorded. */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DoneScreen, readDone, type DoneProps } from "@/components/SignFlow";
import { MBody, MKick, MRule, MTop } from "@/components/m";

export default function DonePage() {
  const router = useRouter();
  const [done, setDone] = useState<DoneProps | null>(null);
  useEffect(() => {
    const d = readDone();
    if (d) setDone(d);
    else router.replace("/m");
  }, [router]);

  if (done) return <DoneScreen {...done} />;
  return (
    <>
      <MTop title="Done" />
      <MRule />
      <MBody pad><MKick>Loading</MKick></MBody>
    </>
  );
}
