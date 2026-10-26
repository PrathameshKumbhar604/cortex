/**
 * Live check of every configured service. Prints names and status only, never keys.
 * Usage: npx tsx scripts/check-services.ts
 */
import path from "node:path";
import nextEnv from "@next/env";
import OpenAI from "openai";
import { Composio } from "@composio/core";
import Firecrawl from "@mendable/firecrawl-js";
import { loadProviders } from "@cortex/llm";
import { TOOLKITS } from "@cortex/connectors";

nextEnv.loadEnvConfig(path.resolve(import.meta.dirname, ".."));
const env = process.env;
const ok = (s: string) => console.log(`  ✓ ${s}`);
const bad = (s: string) => console.log(`  ✗ ${s}`);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 160);

console.log("\nLLM providers");
for (const p of loadProviders()) {
  const client = new OpenAI({ apiKey: p.apiKey, baseURL: p.baseURL, maxRetries: 0, timeout: 30_000 });
  try {
    const models = await client.models.list();
    const ids = models.data.map((m) => m.id);
    for (const tier of ["strong", "fast"] as const) {
      const id = p.models[tier];
      if (!ids.includes(id)) bad(`${p.label} ${tier}: model "${id}" not in catalog`);
    }
  } catch (e) {
    bad(`${p.label}: cannot list models (${errMsg(e)})`);
  }
  for (const tier of ["strong", "fast"] as const) {
    const t0 = Date.now();
    try {
      const r = await client.chat.completions.create({
        model: p.models[tier],
        messages: [{ role: "user", content: 'Reply with JSON {"ok":true}' }],
        max_tokens: 600,
        ...(p.supportsJsonMode ? { response_format: { type: "json_object" as const } } : {}),
      });
      ok(`${p.label} ${tier} (${p.models[tier]}): ${JSON.stringify(r.choices[0]?.message?.content?.trim()).slice(0, 40)} in ${Date.now() - t0}ms`);
    } catch (e) {
      bad(`${p.label} ${tier} (${p.models[tier]}): ${errMsg(e)}`);
    }
  }
}

console.log("\nComposio");
if (env.COMPOSIO_API_KEY) {
  const c = new Composio({ apiKey: env.COMPOSIO_API_KEY });
  for (const t of TOOLKITS) {
    for (const slug of [t.search.slug, ...t.actions.map((a) => a.slug)]) {
      try {
        const tool = await c.tools.getRawComposioToolBySlug(slug);
        const props = Object.keys((tool.inputParameters as { properties?: object })?.properties ?? {});
        ok(`${t.name}: ${slug} [${props.slice(0, 8).join(", ")}]`);
      } catch (e) {
        bad(`${t.name}: ${slug} (${errMsg(e)})`);
      }
    }
  }
} else bad("COMPOSIO_API_KEY not set");

console.log("\nFirecrawl");
if (env.FIRECRAWL_API_KEY) {
  try {
    const fc = new Firecrawl({ apiKey: env.FIRECRAWL_API_KEY });
    const r = await fc.search("Model Context Protocol specification", { limit: 2 });
    ok(`search returned ${(r.web ?? []).length} results`);
  } catch (e) {
    bad(`search: ${errMsg(e)}`);
  }
} else bad("FIRECRAWL_API_KEY not set");

console.log("\nLangSmith");
if (env.LANGSMITH_API_KEY) {
  try {
    const r = await fetch("https://api.smith.langchain.com/api/v1/sessions?limit=1", { headers: { "x-api-key": env.LANGSMITH_API_KEY } });
    r.ok ? ok(`API key accepted (HTTP ${r.status})`) : bad(`HTTP ${r.status}`);
  } catch (e) {
    bad(errMsg(e));
  }
} else bad("LANGSMITH_API_KEY not set");
