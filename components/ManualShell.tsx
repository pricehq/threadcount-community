import Link from "next/link";
import ManualSearch from "@/components/ManualSearch";
import ManualToc from "@/components/ManualToc";
import type { ManualBase } from "@/components/ManualView";
import { searchIndex, tree, type Heading } from "@/lib/manual";

/* The manual's frame, the same on the website and inside the app: the search box and the section
 * tree on the left, the article, and the on-this-page rail on the right. The tree is plain
 * <details>, so it opens and closes with no script; the section being read starts open. */

export const GUIDES: [string, string][] = [
  ["How to run a uniform stocktake", "/guides/uniform-stocktake"],
  ["Where the uniforms actually go", "/guides/uniform-loss"],
  ["Charging uniforms to the right cost centre", "/guides/cost-centre-reporting"],
  ["Entitlements and manager approvals", "/guides/manager-approvals"],
];

export default function ManualShell({ base, current, headings, children }: {
  base: ManualBase;
  current?: { section: string; slug: string };
  headings?: Heading[];
  children: React.ReactNode;
}) {
  const sections = tree();
  const app = base === "/app/help";
  return (
    <div className={"mn-shell" + (app ? " mn-app" : " mn-site")}>
      <nav className="mn-tree" aria-label="Manual">
        <ManualSearch index={searchIndex()} base={base} />
        <Link href={base} className={"mn-home" + (current ? "" : " cur")}>Manual home</Link>
        {sections.map((s) => (
          <details key={s.id} open={!current || current.section === s.id}>
            <summary>{s.title}</summary>
            <ol>
              {s.pages.map((p, i) => {
                const on = current?.section === s.id && current.slug === p.slug;
                return (
                  <li key={p.slug}>
                    <Link href={`${base}/${s.id}/${p.slug}`} className={on ? "cur" : undefined} aria-current={on ? "page" : undefined}>
                      <span className="n">{String(i + 1).padStart(2, "0")}</span><span>{p.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </details>
        ))}
        <details open={!current}>
          <summary>Guides</summary>
          <ol>
            {GUIDES.map(([t, h], i) => (
              <li key={h}>
                {app
                  ? <a href={`https://threadcount.tech${h}`} target="_blank" rel="noopener"><span className="n">{String(i + 1).padStart(2, "0")}</span><span>{t}</span></a>
                  : <Link href={h}><span className="n">{String(i + 1).padStart(2, "0")}</span><span>{t}</span></Link>}
              </li>
            ))}
          </ol>
        </details>
      </nav>
      <div className="mn-main">{children}</div>
      {current && headings && <ManualToc headings={headings} page={`${current.section}/${current.slug}`} />}
    </div>
  );
}
