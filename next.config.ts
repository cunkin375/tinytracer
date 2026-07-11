import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack (the Next.js 16 default for `dev` and `build`) imports `.wgsl`
  // files as raw source strings via `raw-loader`. NOTE: the built-in
  // `{ type: "raw" }` module type does *not* expose a usable `default` export
  // in this Turbopack build (the import resolves to `undefined`), so we use the
  // documented `raw-loader` + `as: "*.js"` path instead.
  turbopack: {
    rules: {
      "*.wgsl": { loaders: ["raw-loader"], as: "*.js" },
    },
  },
  // Kept for the `next dev/build --webpack` fallback toolchain.
  webpack(config) {
    config.module.rules.push({
      test: /\.wgsl$/,
      type: "asset/source",
    });
    return config;
  },
};

export default nextConfig;
