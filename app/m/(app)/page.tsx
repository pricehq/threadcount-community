"use client";
/* Today: what is waiting, what this counter has done today, and what just happened. */
import { Suspense } from "react";
import { MBody, MDay, MEmpty, MKick, MRow, MRule, MSection, MTabs, MTodo, MTop, MTopAction } from "@/components/m";
import TodayBanner from "@/components/m/today/TodayBanner";
import { useToday } from "@/components/m/today/useToday";

export default function MToday() {
  const t = useToday();
  return (
    <>
      <MTop title="Today" right={<MTopAction icon="gear" label="Settings" ariaLabel="Settings" href="/m/settings" />} />
      <MRule />
      <MBody pad>
        <Suspense fallback={null}><TodayBanner /></Suspense>
        <MKick>{t.kicker}</MKick>

        <MSection label="To do" />
        {t.todo.length === 0
          ? <MEmpty title="Nothing waiting" />
          : t.todo.map((r) => <MTodo key={r.key} n={r.n} accent={r.accent} title={r.title} sub={r.sub} href={r.href} />)}

        <MSection label="Your day" />
        <MDay figs={[{ n: t.day.issued, label: "Issued" }, { n: t.day.back, label: "Handed back" }, { n: t.day.counted, label: "Shelves counted" }]} />

        <MSection label="Recent" />
        {t.recent.length === 0
          ? <MEmpty title="Nothing yet today" />
          : t.recent.map((r) => <MRow key={r.key} mark="mute" title={r.title} sub={r.sub} right={r.right} href={r.href} />)}
      </MBody>
      <MTabs active="today" />
    </>
  );
}
