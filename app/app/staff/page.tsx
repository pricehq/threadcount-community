"use client";
import { Suspense } from "react";
import Register from "@/components/people/Register";

// Register reads its filters from the address; useSearchParams needs a Suspense boundary.
export default function StaffPage() {
  return <Suspense fallback={null}><Register /></Suspense>;
}
