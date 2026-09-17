"use client";
/* Settings: six sections in a side list, each a ?tab= of its own so deep links and the help mark
 * land on the right one. Old tab names (general, account, locations, activity…) still resolve. */
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHead } from "@/components/ui";
import { CSV_TEMPLATES } from "@/lib/csv";
import { SECTIONS, SettingsStyles, resolveSection, type SectionId } from "@/components/settings/common";
import FacilitySection from "@/components/settings/FacilitySection";
import IssuingRules from "@/components/settings/IssuingRules";
import CatalogueSection from "@/components/settings/CatalogueSection";
import PlacesSection from "@/components/settings/PlacesSection";
import PeopleSignIn from "@/components/settings/PeopleSignIn";
import DataAudit from "@/components/settings/DataAudit";

// useSearchParams needs a Suspense boundary for static rendering.
export default function SettingsPage() {
  return <Suspense fallback={null}><SettingsInner /></Suspense>;
}

function SettingsInner() {
  const sp = useSearchParams();
  // #hash forms from old links (/app/settings#account).
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () => setHash(window.location.hash.replace("#", ""));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const tabParam = sp.get("tab");
  const importParam = sp.get("import") || "";
  const importKind = CSV_TEMPLATES[importParam] ? importParam : undefined;
  const resolved = resolveSection(tabParam || hash || (importKind ? "data" : ""));
  const section: SectionId = resolved.section;
  const sections = SECTIONS;

  return (
    <section>
      <SettingsStyles />
      <PageHead title="Settings" />
      <div className="tc-set">
        <nav aria-label="Settings sections" className="tc-set-nav">
          {sections.map((x) => (
            <Link key={x.id} href={`/app/settings?tab=${x.id}`} scroll={false} aria-current={x.id === section ? "page" : undefined}>{x.label}</Link>
          ))}
        </nav>
        <div className="tc-set-body" key={section}>
          {section === "facility" && <FacilitySection />}
          {section === "issuing" && <IssuingRules />}
          {section === "catalogue" && <CatalogueSection />}
          {section === "places" && <PlacesSection />}
          {section === "people" && <PeopleSignIn />}
          {section === "data" && <DataAudit importKind={importKind} scrollAudit={resolved.audit} />}
        </div>
      </div>
    </section>
  );
}
