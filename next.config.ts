import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Exposes Cloudflare bindings (D1, queue, vars) to `next dev` through getCloudflareContext().
initOpenNextCloudflareForDev();

export default nextConfig;
