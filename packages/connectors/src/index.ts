import { readFileSync } from "node:fs";
import { ComposioConnector } from "./composio/connector";
import { ComposioMcpConnector } from "./composio/mcp-connector";
import { TOOLKITS } from "./composio/toolkits";
import { DemoConnector } from "./demo/connector";
import { FirecrawlConnector } from "./firecrawl";
import { McpConnector, type McpServerConfig } from "./mcp";
import { ConnectorRegistry } from "./registry";

export * from "./types";
export { ConnectorRegistry, describeError, type SafeSearchResult } from "./registry";
export { ComposioConnector } from "./composio/connector";
export { ComposioMcpConnector, aliasFor, claimUntaggedAccounts, ownAccount } from "./composio/mcp-connector";
export { TOOLKITS, type ComposioToolkitSpec } from "./composio/toolkits";
export { DemoConnector, demoOutbox } from "./demo/connector";
export { DEMO_ITEMS } from "./demo/data";
export { FirecrawlConnector } from "./firecrawl";
export { McpConnector, type McpServerConfig } from "./mcp";
export { extractEvidence } from "./extract";

export type Workspace = "demo" | "live";

function loadMcpConfig(path: string | undefined): McpServerConfig[] {
  if (!path) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { servers?: McpServerConfig[] };
    return raw.servers ?? [];
  } catch {
    return [];
  }
}

/**
 * Builds the registry for a workspace. Demo uses sample data; live uses
 * Composio for the six apps plus any MCP servers from mcp.config.json.
 * Firecrawl (web) is shared by both when a key is present.
 */
export function buildRegistry(workspace: Workspace, env: Record<string, string | undefined> = process.env): ConnectorRegistry {
  const reg = new ConnectorRegistry();
  if (workspace === "demo") {
    for (const spec of TOOLKITS) reg.register(new DemoConnector(spec));
  } else {
    // ck_ = consumer key for Composio Connect (one account, connections tagged per user); otherwise a project SDK key.
    const key = env.COMPOSIO_API_KEY;
    if (key) for (const spec of TOOLKITS) reg.register(key.startsWith("ck_") ? new ComposioMcpConnector(spec, key) : new ComposioConnector(spec, key));
    for (const cfg of loadMcpConfig(env.CORTEX_MCP_CONFIG)) reg.register(new McpConnector(cfg));
  }
  if (env.FIRECRAWL_API_KEY) reg.register(new FirecrawlConnector(env.FIRECRAWL_API_KEY));
  return reg;
}
