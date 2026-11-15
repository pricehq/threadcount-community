import type { Metadata } from "next";

/* Link previews for a page.
 *
 * Next merges metadata one top-level key at a time, so a page that sets only `title` and
 * `description` inherits the root layout's whole `openGraph` and `twitter` blocks untouched: every
 * page on the site announced itself, when pasted into a chat or an email, as the home page, with the
 * home page's address. `share()` takes a page's ordinary metadata and adds the two blocks from the
 * title, description and canonical path it already states, so the preview names the page it is. */

export const SITE_DESC = "Free, open-source uniform management for any organisation that hands out uniforms — hotels, security firms, shops, cleaners, schools, depots, factories and clinics. Who holds what, what is on the shelf by size, what to order and what it cost each team. Free on threadcount.tech, or on your own server.";

export const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "ThreadCount — every uniform out the door, accounted for." };

type PageMeta = Metadata & { title: string | { absolute: string } };

/* Generic, so a page that reads its own `metadata.title` back (the guides hand it to their layout)
   still sees the string it wrote rather than Metadata's wider union. */
export function share<T extends PageMeta>(meta: T): T & Pick<Metadata, "openGraph" | "twitter"> {
  const title = typeof meta.title === "string" ? `${meta.title} — ThreadCount` : meta.title.absolute;
  const description = meta.description || SITE_DESC;
  const canonical = meta.alternates?.canonical;
  const url = typeof canonical === "string" ? canonical : "/";
  return {
    ...meta,
    openGraph: { type: "website", siteName: "ThreadCount", locale: "en_AU", url, title, description, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
  };
}
