import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ManualShell from "@/components/ManualShell";
import { ManualArticle } from "@/components/ManualView";
import { findPage, neighbours } from "@/lib/manual";

/* One manual page inside the app: the same Markdown the website renders at /docs, framed by the
 * app's own shell. The help mark on each screen links straight here. */

type Params = { params: Promise<{ section: string; slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { section, slug } = await params;
  const p = findPage(section, slug);
  return { title: p ? `${p.title} · Help` : "Help", robots: { index: false, follow: false } };
}

export default async function HelpPage({ params }: Params) {
  const { section, slug } = await params;
  const p = findPage(section, slug);
  if (!p) notFound();
  const { prev, next } = neighbours(p);
  return (
    <ManualShell base="/app/help" current={{ section, slug }} headings={p.headings}>
      <ManualArticle page={p} base="/app/help" prev={prev} next={next} />
    </ManualShell>
  );
}
