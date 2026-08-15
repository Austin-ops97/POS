import type { NextConfig } from "next";
import { applyLocalEnvOverrides } from "./scripts/apply-env-local.mjs";

applyLocalEnvOverrides();

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
