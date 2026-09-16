"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchEntry } from "@/lib/manual";

/* The manual's search box. The index is small (titles, summaries, keywords and headings of every
 * page) and arrives with the page, so it answers with no request and works offline once loaded.
 * `/` focuses it from anywhere on a manual page, unless the reader is already typing somewhere. */

type Hit = { e: SearchEntry; score: number; anchor?: { id: string; text: string } };

function find(index: SearchEntry[], q: string): Hit[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits: Hit[] = [];
  for (const e of index) {
    const title = e.t.toLowerCase(), summary = e.s.toLowerCase(), heads = e.hd.map((h) => h.text.toLowerCase());
    const hay = [title, summary, e.k, ...heads].join(" ");
    if (!terms.every((t) => hay.includes(t))) continue;
    let score = 0, anchor: Hit["anchor"];
    for (const t of terms) {
      if (title.includes(t)) score += 10;
      if (e.k.includes(t)) score += 6;
      const hi = heads.findIndex((h) => h.includes(t));
      if (hi >= 0) { score += 4; anchor ??= e.hd[hi]; }
      if (summary.includes(t)) score += 2;
    }
    if (title.startsWith(terms[0])) score += 5;
    hits.push({ e, score, anchor: title.includes(terms[0]) ? undefined : anchor });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 8);
}

export default function ManualSearch({ index, base }: { index: SearchEntry[]; base: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const hits = useMemo(() => find(index, q), [index, q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); input.current?.focus(); }
    };
    const onClick = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("click", onClick); };
  }, []);

  const href = (h: Hit) => `${base}/${h.e.h}${h.anchor ? "#" + h.anchor.id : ""}`;
  const go = (h: Hit) => { setOpen(false); setQ(""); input.current?.blur(); router.push(href(h)); };

  return (
    <div className="mn-search" ref={box} role="search">
      <label htmlFor="mn-q" className="mn-sr">Search the manual</label>
      <input
        id="mn-q"
        ref={input}
        type="search"
        value={q}
        placeholder="Search the manual"
        autoComplete="off"
        aria-controls="mn-results"
        aria-expanded={open && q.length > 0}
        onChange={(e) => { setQ(e.target.value); setSel(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          else if (e.key === "Enter" && hits[sel]) { e.preventDefault(); go(hits[sel]); }
          else if (e.key === "Escape") { setOpen(false); input.current?.blur(); }
        }}
      />
      <kbd aria-hidden>/</kbd>
      {open && q.trim() && (
        <div id="mn-results" className="mn-results" role="listbox">
          {hits.length === 0 && <div className="none">Nothing matches &ldquo;{q}&rdquo;. Try another word, or the glossary.</div>}
          {hits.map((h, i) => (
            <a key={h.e.h + (h.anchor?.id ?? "")} href={href(h)} role="option" aria-selected={i === sel} className={i === sel ? "sel" : undefined}
              onMouseEnter={() => setSel(i)} onClick={(e) => { e.preventDefault(); go(h); }}>
              <span><b>{h.e.t}</b>{h.anchor && <small> › {h.anchor.text}</small>}<em>{h.e.s}</em></span>
              <span className="sec">{h.e.sec}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
