import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Receipt photos are downscaled on the phone, but leave room for a 4MB original plus multipart overhead.
    serverActions: { bodySizeLimit: "5mb" },
  },
  // The daily summary image reads its fonts and logo from disk at runtime.
  outputFileTracingIncludes: {
    "/t/[tripId]/resumen-del-dia": ["./assets/fonts/*.woff", "./src/app/icon.svg"],
  },
  async headers() {
    return [
      {
        // The service worker must never be cached, so a deploy reaches phones right away.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
