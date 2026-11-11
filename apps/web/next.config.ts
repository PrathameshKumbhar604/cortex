import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// One .env at the repo root serves the web app, the agent and the memory service.
const repoRoot = path.resolve(__dirname, "../..");
// forceReload: Next has already loaded (and cached) env from apps/web, which would make this call a no-op.
loadEnvConfig(repoRoot, process.env.NODE_ENV !== "production", console, true);

const nextConfig: NextConfig = {
  devIndicators: false,
  cacheComponents: true,
  // Uploads (up to 10 MB plus form overhead) pass through the proxy, whose body limit defaults to 10 MB.
  experimental: { proxyClientMaxBodySize: "11mb" },
  partialPrefetching: true,
  transpilePackages: ["@cortex/shared", "@cortex/llm", "@cortex/connectors", "@cortex/agent"],
  serverExternalPackages: ["onnxruntime-node", "@composio/core", "@modelcontextprotocol/sdk", "@mendable/firecrawl-js", "langsmith", "openai"],
  env: { CORTEX_ROOT: repoRoot },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // No other site may frame Cortex: a hidden frame could trick a click onto "Approve" (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // The mic is used by voice mode; nothing here needs the rest.
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=()" },
        ],
      },
      // Uploaded files send their own, stricter policy (see api/files/[id]).
      { source: "/((?!api/files/).*)", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }] },
    ];
  },
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
