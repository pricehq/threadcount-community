import Link from "next/link";
import type { Block, Inline, ManualPage } from "@/lib/manual";
import { MANUAL_REVIEWED, readMinutes } from "@/lib/manual";
import { SITE_ORIGIN, sectionTitle } from "@/lib/manual-links";

/* Renders one manual page. `base` is where the manual lives on this surface: "/docs" on the
 * website, "/app/help" inside the app. Manual links are rewritten to it; inside the app, links to
 * website-only pages go to the public site, because the Community edition has no website. */

export type ManualBase = "/docs" | "/app/help";

function Href({ href, base, children }: { href: string; base: ManualBase; children: React.ReactNode }) {
  if (/^(https?:|mailto:)/.test(href)) return <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener">{children}</a>;
  if (href.startsWith("#")) return <a href={href}>{children}</a>;
  if (href === "/docs" || href.startsWith("/docs/") || href.startsWith("/docs#")) return <Link href={base + href.slice(5)}>{children}</Link>;
  if (base === "/app/help") return <a href={SITE_ORIGIN + href} target="_blank" rel="noopener">{children}</a>;
  return <Link href={href}>{children}</Link>;
}

export function Inl({ c, base }: { c: Inline[]; base: ManualBase }) {
  return (
    <>
      {c.map((x, i) =>
        typeof x === "string" ? <span key={i}>{x}</span>
          : x.t === "code" ? <code key={i} className="mn-code">{x.v}</code>
            : x.t === "b" ? <b key={i}><Inl c={x.c} base={base} /></b>
              : <Href key={i} href={x.href} base={base}><Inl c={x.c} base={base} /></Href>,
      )}
    </>
  );
}

function BlockView({ b, base }: { b: Block; base: ManualBase }) {
  switch (b.t) {
    case "p": return <p className="mn-p"><Inl c={b.c} base={base} /></p>;
    case "ul": return <ul className="mn-ul">{b.items.map((it, i) => <li key={i}><Inl c={it} base={base} /></li>)}</ul>;
    case "ol": return <ol className="mn-ol">{b.items.map((it, i) => <li key={i}><Inl c={it} base={base} /></li>)}</ol>;
    case "code": return <pre className="mn-pre"><code>{b.v}</code></pre>;
    case "callout": return <div className={"mn-callout " + b.tone}><b>{b.label}</b><span><Inl c={b.c} base={base} /></span></div>;
    case "table":
      return (
        <div className="mn-tablewrap">
          <table className="mn-table">
            <thead><tr>{b.head.map((h, i) => <th key={i} scope="col"><Inl c={h} base={base} /></th>)}</tr></thead>
            <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}><Inl c={c} base={base} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    case "h2": return null;
  }
}

/** The page body, grouped into one <section> per heading so the rail can follow along. */
export function ManualBody({ blocks, base }: { blocks: Block[]; base: ManualBase }) {
  const groups: { h?: Extract<Block, { t: "h2" }>; body: Block[] }[] = [{ body: [] }];
  for (const b of blocks) {
    if (b.t === "h2") groups.push({ h: b, body: [] });
    else groups[groups.length - 1].body.push(b);
  }
  return (
    <>
      {groups.map((g, i) =>
        g.h ? (
          <section key={g.h.id} id={g.h.id} className="mn-section">
            <h2 className="mn-h2"><span className="n">{g.h.n}</span><span>{g.h.text}</span></h2>
            {g.body.map((b, j) => <BlockView key={j} b={b} base={base} />)}
          </section>
        ) : g.body.length ? <div key={"intro" + i} className="mn-intro">{g.body.map((b, j) => <BlockView key={j} b={b} base={base} />)}</div> : null,
      )}
    </>
  );
}

/** A whole article: breadcrumb, title, summary, the facts strip, the body, and previous and next. */
export function ManualArticle({ page, base, prev, next }: { page: ManualPage; base: ManualBase; prev?: ManualPage; next?: ManualPage }) {
  const release = process.env.NEXT_PUBLIC_RELEASE;
  return (
    <article className="mn-article">
      <div className="mn-crumbs"><Link href={base}>Docs</Link><span aria-hidden>›</span><Link href={`${base}#${page.section}`}>{sectionTitle(page.section)}</Link></div>
      <h1 className="mn-h1">{page.title}</h1>
      {page.summary && <p className="mn-lede">{page.summary}</p>}
      <div className="mn-facts">
        {page.screen && <div><b>Screen</b><code className="mn-code">{page.screen}</code></div>}
        {page.role && <div><b>Who</b><span>{page.role}</span></div>}
        <div><b>Read time</b><span className="mn-mono">{readMinutes(page.words)} min</span></div>
        <div><b>Checked against</b><span className="mn-mono">{release ? `release ${release}` : MANUAL_REVIEWED}</span></div>
      </div>
      <ManualBody blocks={page.blocks} base={base} />
      <nav className="mn-prevnext" aria-label="Previous and next page">
        {prev ? <Link href={`${base}/${prev.section}/${prev.slug}`}><span className="k">Previous</span><b>{prev.title}</b></Link> : <span />}
        {next ? <Link className="r" href={`${base}/${next.section}/${next.slug}`}><span className="k">Next</span><b>{next.title}</b></Link> : <span />}
      </nav>
    </article>
  );
}
