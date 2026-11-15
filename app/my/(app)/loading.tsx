/* What a tap looks like before the server answers.
 *
 * Every screen under /my is `force-dynamic` and rendered from its own database query, and App
 * Router keeps the previous screen fully painted until that query comes back. On ward wifi that is
 * two or three seconds in which nothing at all acknowledges the tap — so people tap again, and the
 * app reads as frozen. This is the route-level fallback the framework wants for exactly that: it
 * replaces the body the moment a navigation starts, keeping the app's own chrome so the change
 * reads as "loading" rather than "gone".
 *
 * Deliberately not the tab bar: the nav belongs to the four screens that draw it, and painting one
 * here would make it flash into existence on the way to a detail screen that has none. The top bar
 * has no title for the same reason — this fallback covers every route in the group, and inventing a
 * title would mean printing the wrong one somewhere.
 */
const INK = "#201e1d";
const GROUND = "#f3f2f2";

/** A grey block standing in for a line of text. Sized in the same 2px system as everything else. */
function Bar({ w, h = 16 }: { w: string; h?: number }) {
  return <div style={{ width: w, height: h, background: "var(--color-neutral-200)" }} />;
}

export default function StaffLoading() {
  return (
    <>
      <header className="tcx-topbar" style={{
        height: 56, flex: "0 0 56px", background: INK, color: GROUND, display: "flex", alignItems: "center",
        paddingLeft: 16, paddingRight: 16,
        backgroundImage: "linear-gradient(to bottom, rgba(243,242,242,0.16) 0 1px, transparent 1px)",
        backgroundPosition: "0 env(safe-area-inset-top, 0px)", backgroundRepeat: "no-repeat", backgroundSize: "100% 1px",
      }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 15, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          One moment
        </span>
      </header>
      <div style={{ height: 4, flex: "0 0 4px", background: "var(--color-accent)" }} />
      <div style={{ flex: 1, overflow: "hidden", background: GROUND }} aria-busy="true">
        {/* Announced once, quietly. The blocks below are decoration and say nothing. */}
        <div role="status" style={{ padding: "20px 16px 0", fontSize: 13, color: "var(--color-neutral-600)" }}>Loading…</div>
        <div style={{ padding: "16px 16px 0", display: "grid", gap: 10 }} aria-hidden="true">
          <Bar w="60%" h={22} />
          <Bar w="40%" />
        </div>
        <div style={{ marginTop: 24, display: "grid", gap: 2 }} aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ background: "#fff", padding: "18px 16px", display: "grid", gap: 8 }}>
              <Bar w="55%" h={18} />
              <Bar w="35%" h={12} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
