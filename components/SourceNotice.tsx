import { COMMUNITY } from "@/lib/edition";
import { SOURCE_URL, editionVersion } from "@/lib/source";

/* The licence's offer of source, on the screen rather than in a file nobody opens.
 *
 * The Community edition is AGPL-3.0-only. Section 13 asks that anyone who modifies it and then
 * lets other people use their version over a network gives those users a way to get that modified
 * source — so the offer belongs where those users are, which is the product itself, not the
 * repository. It names the build so a report of a bug can name it too.
 *
 * A facility running its own build points SOURCE_URL at wherever it keeps that build; unset, this
 * names the release the code came from. Renders nothing on the hosted service, which is not
 * licensed under the AGPL and makes no such offer.
 *
 * Server component: EDITION is server-side only (lib/edition.ts). */
export default function SourceNotice({ align = "center" }: { align?: "center" | "left" }) {
  if (!COMMUNITY) return null;
  return (
    <p style={{ textAlign: align, fontSize: 12, lineHeight: 1.5, color: "var(--color-neutral-700)", margin: "18px 0 0", padding: "0 16px" }}>
      {`ThreadCount Community · ${editionVersion()} · `}
      <a href={SOURCE_URL} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>Source code</a>
      {", under the "}
      <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noreferrer" style={{ color: "inherit" }}>GNU AGPL v3</a>.
    </p>
  );
}
