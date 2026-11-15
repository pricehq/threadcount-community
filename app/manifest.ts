import type { MetadataRoute } from "next";

/* What a phone uses when someone adds the site to their home screen: the name and the mark, the
 * same one the Android app's launcher icon carries. The icons are drawn by
 * scripts/make-web-icons.py; the maskable one keeps the bars inside the safe zone a launcher
 * may crop to a circle. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ThreadCount",
    short_name: "ThreadCount",
    start_url: "/",
    display: "browser",
    background_color: "#f3f2f2",
    theme_color: "#201e1d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
