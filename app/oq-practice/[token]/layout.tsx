import type { Metadata } from "next";

// Gives this link its own home-screen app (see manifest.webmanifest next to this file).
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  return {
    manifest: `/oq-practice/${token}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: "OQ Practice", statusBarStyle: "default" },
  };
}

export default function TokenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
