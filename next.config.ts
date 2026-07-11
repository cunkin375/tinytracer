import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config) {
    config.module.rules.push({
      test: /\.wgsl$/,
      type: "asset/source",
    });
    return config;
  },
};

export default nextConfig;
