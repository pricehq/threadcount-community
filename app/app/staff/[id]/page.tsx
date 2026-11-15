"use client";
import { Suspense } from "react";
import StaffRecord from "@/components/people/Record";

// The record's tab and edit mode live in the address; useSearchParams needs a Suspense boundary.
export default function StaffProfile() {
  return <Suspense fallback={null}><StaffRecord /></Suspense>;
}
