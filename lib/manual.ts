import fs from "node:fs";
import path from "node:path";
import { SECTIONS, sectionTitle, type SectionId } from "@/lib/manual-links";

/* The manual: Markdown files under docs/manual/<section>/<slug>.md, read once per server process.
 *
 * One file serves the website (/docs/...), the app (/app/help/...) and the Community edition,
 * which ships the folder. The Markdown is a deliberate subset (docs/manual/AUTHORING.md), parsed
 * here into blocks rather than turned into HTML, so the renderer controls every element and no
 * page can inject markup. No dependency: the subset is small enough that a parser is shorter than
 * the configuration a general one would need. */

export type Inline = string | { t: "code"; v: string } | { t: "b"; c: Inline[] } | { t: "a"; href: string; c: Inline[] };
export type Block =
  | { t: "h2"; id: string; n: string; text: string }
  | { t: "p"; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] }
  | { t: "table"; head: Inline[][]; rows: Inline[][][] }
  | { t: "code"; v: string }
  | { t: "callout"; tone: "plain" | "careful"; label: string; c: Inline[] };

export type Heading = { id: string; n: string; text: string };
export type ManualPage = {
  section: SectionId;
  slug: string;
  title: string;
  order: number;
  summary: string;
  screen?: string;
  role?: string;
  keywords: string[];
  blocks: Block[];
  headings: Heading[];
  words: number;
};

/** The date the manual as a whole was last checked against the code. */
export const MANUAL_REVIEWED = "15 Sep 2026";

const ROOT = path.join(process.cwd(), "docs", "manual");

export const slugify = (s: string) =>
  s.toLowerCase().replace(/[’'`]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";

const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
export function inline(s: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of s.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(s.slice(last, at));
    if (m[1] !== undefined) out.push({ t: "code", v: m[1] });
    else if (m[2] !== undefined) out.push({ t: "b", c: inline(m[2]) });
    else out.push({ t: "a", href: m[4], c: inline(m[3]) });
    last = at + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export const plain = (c: Inline[]): string =>
  c.map((x) => (typeof x === "string" ? x : x.t === "code" ? x.v : plain(x.c))).join("");

/** Split a table row on pipes that are not inside backticks. */
function cells(row: string): string[] {
  const r = row.trim().replace(/^\|/, "").replace(/\|$/, "");
  const out: string[] = [];
  let cur = "", code = false;
  for (const ch of r) {
    if (ch === "`") code = !code;
    if (ch === "|" && !code) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const BULLET = /^\s*[-*] /;
const NUMBER = /^\s*\d+[.)] /;
const starts = (l: string) => l.startsWith("```") || l.startsWith("#") || l.startsWith(">") || l.trim().startsWith("|") || BULLET.test(l) || NUMBER.test(l);

export function parseBody(src: string): Block[] {
  const lines = src.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  const used = new Set<string>();
  let n = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      blocks.push({ t: "code", v: buf.join("\n") });
      continue;
    }
    if (/^#{1,6} /.test(line)) {
      const text = line.replace(/^#{1,6} /, "").trim();
      if (line.startsWith("## ")) {
        n++;
        let id = slugify(text);
        while (used.has(id)) id += "-2";
        used.add(id);
        blocks.push({ t: "h2", id, n: String(n).padStart(2, "0"), text });
      } else {
        // The subset has one heading level. Anything else is kept as a bold line rather than dropped.
        blocks.push({ t: "p", c: [{ t: "b", c: inline(text) }] });
      }
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) buf.push(lines[i++].replace(/^>\s?/, ""));
      const text = buf.join(" ").trim();
      const m = /^\*\*(.+?)\*\*[:.]?\s*(.*)$/.exec(text);
      const label = m ? m[1] : "Note";
      blocks.push({ t: "callout", tone: /careful|warning|caution|important|before you/i.test(label) ? "careful" : "plain", label, c: inline(m ? m[2] : text) });
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const r = lines[i++].trim();
        if (/^\|[\s:|-]+\|?$/.test(r)) continue;
        rows.push(cells(r));
      }
      const [head = [], ...body] = rows;
      blocks.push({ t: "table", head: head.map(inline), rows: body.map((r) => r.map(inline)) });
      continue;
    }
    if (BULLET.test(line) || NUMBER.test(line)) {
      const ordered = NUMBER.test(line);
      const marker = ordered ? NUMBER : BULLET;
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (marker.test(l)) items.push(l.replace(marker, ""));
        else if (items.length && /^\s{2,}\S/.test(l)) items[items.length - 1] += " " + l.trim();
        else break;
        i++;
      }
      blocks.push({ t: ordered ? "ol" : "ul", items: items.map(inline) });
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !starts(lines[i])) buf.push(lines[i++].trim());
    if (buf.length) blocks.push({ t: "p", c: inline(buf.join(" ")) });
    else i++;
  }
  return blocks;
}

function frontMatter(src: string): [Record<string, string>, string] {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src.replace(/\r/g, ""));
  if (!m) return [{}, src];
  const meta: Record<string, string> = {};
  for (const l of m[1].split("\n")) {
    const k = /^([a-z]+):\s*(.*)$/.exec(l.trim());
    if (k) meta[k[1]] = k[2].replace(/^["']|["']$/g, "").trim();
  }
  return [meta, src.replace(/\r/g, "").slice(m[0].length)];
}

const blockText = (b: Block): string =>
  b.t === "h2" ? b.text : b.t === "code" ? b.v : b.t === "p" || b.t === "callout" ? plain(b.c) : b.t === "table" ? [...b.head, ...b.rows.flat()].map(plain).join(" ") : b.items.map(plain).join(" ");

export function parsePage(section: SectionId, slug: string, src: string): ManualPage {
  const [meta, body] = frontMatter(src);
  const blocks = parseBody(body);
  const words = blocks.map(blockText).join(" ").split(/\s+/).filter(Boolean).length;
  return {
    section,
    slug,
    title: meta.title || slug,
    order: Number(meta.order) || 99,
    summary: meta.summary || "",
    screen: meta.screen || undefined,
    role: meta.role || undefined,
    keywords: (meta.keywords || "").split(",").map((k) => k.trim()).filter(Boolean),
    blocks,
    headings: blocks.filter((b): b is Extract<Block, { t: "h2" }> => b.t === "h2").map(({ id, n, text }) => ({ id, n, text })),
    words,
  };
}

let cache: ManualPage[] | null = null;

/** Every page, in reading order: section by section, then by `order`. */
export function manual(): ManualPage[] {
  if (cache && process.env.NODE_ENV === "production") return cache;
  const pages: ManualPage[] = [];
  for (const s of SECTIONS) {
    const dir = path.join(ROOT, s.id);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
      pages.push(parsePage(s.id, f.slice(0, -3), fs.readFileSync(path.join(dir, f), "utf8")));
    }
  }
  const at = (id: string) => SECTIONS.findIndex((s) => s.id === id);
  pages.sort((a, b) => at(a.section) - at(b.section) || a.order - b.order || a.title.localeCompare(b.title));
  cache = pages;
  return pages;
}

export const findPage = (section: string, slug: string) => manual().find((p) => p.section === section && p.slug === slug);

export function neighbours(p: ManualPage): { prev?: ManualPage; next?: ManualPage } {
  const all = manual();
  const i = all.findIndex((x) => x.section === p.section && x.slug === p.slug);
  return { prev: all[i - 1], next: all[i + 1] };
}

export type TreeSection = { id: SectionId; title: string; blurb: string; pages: { slug: string; title: string; summary: string }[] };
export function tree(): TreeSection[] {
  const all = manual();
  return SECTIONS.map((s) => ({ id: s.id, title: s.title, blurb: s.blurb, pages: all.filter((p) => p.section === s.id).map(({ slug, title, summary }) => ({ slug, title, summary })) }))
    .filter((s) => s.pages.length > 0);
}

/** What the search box knows about each page: small enough to ship inline with every manual page. */
export type SearchEntry = { h: string; t: string; s: string; sec: string; k: string; hd: { id: string; text: string }[] };
export function searchIndex(): SearchEntry[] {
  return manual().map((p) => ({
    h: `${p.section}/${p.slug}`,
    t: p.title,
    s: p.summary,
    sec: sectionTitle(p.section),
    k: [...p.keywords, p.screen ?? ""].join(" ").toLowerCase(),
    hd: p.headings.map(({ id, text }) => ({ id, text })),
  }));
}

export const readMinutes = (words: number) => Math.max(1, Math.ceil(words / 220));
