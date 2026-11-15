"use client";
/* Issuing rules: the ceiling, the starting kit and the count-reason threshold, then the staff groups
 * on their three routes. capCheck() and allowance() in lib/compute.ts still decide; this screen
 * only edits the figures and lists they read. */
import { useSnap } from "@/lib/client";
import { allowance, setsOnStart } from "@/lib/compute";
import { InlineNumber, Msg, SectionHead, useSaver, useSettingsFields } from "./common";
import RouteBoard from "./RouteBoard";

export default function IssuingRules() {
  const { s, isAdmin } = useSnap();
  const saver = useSaver();
  const { val, setField } = useSettingsFields(saver);

  /* Read off the boxes, so the route lines describe what leaving now would put in force. An empty box
     saves nothing, so the stored figure stands for it. */
  const typed = (k: "initialSets" | "capSets") => { const t = val(k).trim(); return t === "" ? s.settings[k] : Number(t); };
  const shape = allowance({ held: 0, kit: true, startingSets: typed("initialSets"), capSets: typed("capSets") });
  const ceiling = shape.max, kitStart = shape.start ?? 0;
  const kitOverCeiling = setsOnStart(typed("initialSets")) > ceiling;

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
        <InlineNumber label="Most anyone holds" unit="sets, every group" value={val("capSets")} onChange={(v) => setField("capSets", v)} disabled={!isAdmin} />
        <InlineNumber label="Starting kit" unit="sets on day one" value={val("initialSets")} onChange={(v) => setField("initialSets", v)} disabled={!isAdmin} />
        <InlineNumber label="A count gap needs a reason at" unit="garments" value={val("varianceReason")} onChange={(v) => setField("varianceReason", v)} disabled={!isAdmin} />
      </div>
      {kitOverCeiling && <div className="tc-meta-line">Nobody is handed more than the ceiling, so the starting kit stops at {kitStart} sets.</div>}
      <Msg text={saver.msg.fields} />

      <SectionHead meta={isAdmin ? "drag a group to change its route · rename in place" : undefined}>Staff groups and how they get uniform</SectionHead>
      <RouteBoard ceiling={ceiling} kitStart={kitStart} />
    </>
  );
}
