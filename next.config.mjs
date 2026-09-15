/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Default is 1mb, which rejects real plan/spec PDFs. Vercel's own
      // serverless function payload cap (4.5mb) is the real ceiling here.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
