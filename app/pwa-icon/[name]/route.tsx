import { ImageResponse } from "next/og";

// Home-screen icons, drawn on the server so there are no image files to keep:
// /pwa-icon/192, /pwa-icon/512, /pwa-icon/maskable (Android crops it round, so
// the art sits inside a safe zone) and /pwa-icon/apple (iPhone / iPad).
const SIZES: Record<string, { size: number; pad: number }> = {
  "192": { size: 192, pad: 0 },
  "512": { size: 512, pad: 0 },
  maskable: { size: 512, pad: 64 },
  apple: { size: 180, pad: 0 },
};

const NAVY = "#0c2140";
const RED = "#c31f2c";

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const spec = SIZES[name];
  if (!spec) return new Response("Not found", { status: 404 });

  const { size: s, pad } = spec;
  const inner = s - pad * 2;
  const bx = pad + inner * 0.14;
  const by = pad + inner * 0.2;
  const bw = inner * 0.72;
  const bh = inner * 0.56;
  const bar = (top: number, widthFrac: number) => (
    <div style={{ position: "absolute", left: bx + bw * 0.22, top: by + bh * top, width: bw * widthFrac, height: bh * 0.085, borderRadius: bh * 0.0425, background: NAVY }} />
  );

  return new ImageResponse(
    (
      <div style={{ width: s, height: s, background: NAVY, display: "flex", position: "relative" }}>
        <div style={{ position: "absolute", left: bx, top: by, width: bw, height: bh, borderRadius: inner * 0.045, background: "#ffffff" }} />
        <div style={{ position: "absolute", left: bx + bw * 0.115 - bh * 0.065, top: by + bh * 0.25 - bh * 0.065, width: bh * 0.13, height: bh * 0.13, borderRadius: bh, background: RED }} />
        {bar(0.205, 0.66)}
        {bar(0.425, 0.5)}
        {bar(0.645, 0.58)}
        <div style={{ position: "absolute", left: bx + bw * 0.08, top: by + bh + inner * 0.035, width: bw * 0.84, height: inner * 0.03, borderRadius: inner * 0.015, background: "#9fb0c8" }} />
      </div>
    ),
    { width: s, height: s, headers: { "Cache-Control": "public, max-age=604800, immutable" } }
  );
}
