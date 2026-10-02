import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@kodit/common"],
  webpack(config) {
    config.module.rules.push({ test: /\.md$/i, type: "asset/source" });
    return config;
  },
};

export default nextConfig;
