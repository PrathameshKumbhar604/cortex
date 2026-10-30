import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// One .env at the repo root serves the web app, the agent and the memory service.
const repoRoot = path.resolve(__dirname, "../..");
loadEnvConfig(repoRoot);

const nextConfig: NextConfig = {
  devIndicators: false,
  cacheComponents: true,
  // Uploads (up to 10 MB plus form overhead) pass through the proxy, whose body limit defaults to 10 MB.
  experimental: { proxyClientMaxBodySize: "11mb" },
  partialPrefetching: true,
  transpilePackages: ["@cortex/shared", "@cortex/llm", "@cortex/connectors", "@cortex/agent"],
  serverExternalPackages: ["@composio/core", "@modelcontextprotocol/sdk", "@mendable/firecrawl-js", "langsmith", "openai"],
  env: { CORTEX_ROOT: repoRoot },
  turbopack: {
    root: repoRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
