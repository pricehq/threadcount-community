import ManualHome from "@/components/ManualHome";
import ManualShell from "@/components/ManualShell";
import FacilityRules from "@/components/FacilityRules";

export const metadata = { title: "Help", robots: { index: false, follow: false } };

/* Help inside the app: the manual's front page, with this facility's own rules above it. The rules
 * panel reads the facility's settings, so a figure a coordinator has changed is the figure shown;
 * the manual pages quote the defaults and say where each one is changed. */
export default function Help() {
  return (
    <ManualShell base="/app/help">
      <ManualHome
        base="/app/help"
        title="Help"
        lede="The ThreadCount manual, and this facility's own rules. Every screen also has a help mark beside its title that opens the page about that screen."
      >
        <section className="mn-section" id="rules">
          <h2 className="mn-h2"><span className="n">00</span><span>This facility&rsquo;s rules</span></h2>
          <p className="mn-p">Read from your settings, so these are the figures the counter applies today.</p>
          <FacilityRules />
        </section>
      </ManualHome>
    </ManualShell>
  );
}
