import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    // Google profile photos. The image optimizer only fetches hosts listed here, so it can't be
    // used as an open proxy for arbitrary URLs.
    remotePatterns: [new URL("https://lh3.googleusercontent.com/**")],
  },
  partialPrefetching: true,
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
