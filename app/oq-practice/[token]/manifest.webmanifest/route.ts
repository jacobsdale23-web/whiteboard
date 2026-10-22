import { findActiveInvite } from "@/lib/oq-invites";

// A separate home-screen app for people with a practice link: it opens straight
// to their tests and is limited to that link's pages.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await findActiveInvite(token))) return new Response("Not found", { status: 404 });
  const manifest = {
    id: `/oq-practice/${token}`,
    name: "OQ Practice Tests",
    short_name: "OQ Practice",
    start_url: `/oq-practice/${token}`,
    scope: `/oq-practice/${token}`,
    display: "standalone",
    background_color: "#0c2140",
    theme_color: "#0c2140",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" } });
}
