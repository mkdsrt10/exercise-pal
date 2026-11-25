import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  transpilePackages: ["@exercise-pal/core"],
  // Keyframes are small, but a set can carry a handful of them.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default config;
