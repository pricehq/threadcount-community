"use client";
import { Suspense } from "react";
import Counter from "@/components/counter/Counter";

// useSearchParams (?staff=, ?mode=) needs a Suspense boundary for static rendering.
export default function CounterPage() {
  return <Suspense fallback={null}><Counter /></Suspense>;
}
