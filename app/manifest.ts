import type { MetadataRoute } from "next";

// What makes "Add to Home Screen" install White Board as a full-screen app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "White Board",
    short_name: "White Board",
    description: "Project scheduling, daily logs, JSAs and OQ practice tests",
    start_url: "/board",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0c2140",
    theme_color: "#0c2140",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
