"use client";
import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";

/* The right-hand rail of a manual page: the headings with the one on screen marked, whether the
 * page helped, and print and copy-link. The answer to "was this useful" goes to the product's own
 * usage statistics as a counted event naming the page and nothing about the reader. */

export default function ManualToc({ headings, page }: { headings: { id: string; n: string; text: string }[]; page: string }) {
  const [cur, setCur] = useState(headings[0]?.id ?? "");
  const [voted, setVoted] = useState<"" | "yes" | "no">("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set((e.target as HTMLElement).id, e.isIntersecting);
      const first = headings.find((h) => seen.get(h.id));
      if (first) setCur(first.id);
    }, { rootMargin: "-80px 0px -60% 0px" });
    for (const h of headings) { const el = document.getElementById(h.id); if (el) io.observe(el); }
    return () => io.disconnect();
  }, [headings]);

  return (
    <aside className="mn-toc" aria-label="On this page">
      {headings.length > 0 && (
        <>
          <div className="mn-kick">On this page</div>
          <ol>
            {headings.map((h) => (
              <li key={h.id}><a href={`#${h.id}`} className={h.id === cur ? "cur" : undefined} aria-current={h.id === cur ? "location" : undefined}>{h.text}</a></li>
            ))}
          </ol>
        </>
      )}
      <div className="mn-fb">
        <b>Did this page answer it?</b>
        {voted ? (
          <p>{voted === "yes" ? "Thanks. Noted against this page." : "Thanks. Noted against this page. If you tell support what was missing, the page gains the answer."}</p>
        ) : (
          <div className="row">
            <button type="button" onClick={() => { setVoted("yes"); track("docs-feedback", { page, useful: true }); }}>Yes</button>
            <button type="button" onClick={() => { setVoted("no"); track("docs-feedback", { page, useful: false }); }}>Not quite</button>
          </div>
        )}
      </div>
      <div className="mn-tools">
        <button type="button" onClick={() => window.print()}>Print</button>
        <button type="button" onClick={() => { navigator.clipboard?.writeText(window.location.href.split("#")[0]).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {}); }}>{copied ? "Copied" : "Copy link"}</button>
      </div>
    </aside>
  );
}
