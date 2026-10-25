# Cortex: Architecture

## High level

```
┌─────────────────────────── apps/web (Next.js 16, TypeScript) ───────────────────────────┐
│  Ask (answer + live trace)  ·  Brief  ·  Memory inspector  ·  Connections               │
│  POST /api/ask streams AgentEvents (SSE) · /api/actions/:id is the only execute path   │
└──────────────┬──────────────────────────────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────── packages/agent ──────────────────────────────────────────┐
│ understand → recall → plan → search (parallel) → synthesize (streamed) → verify →       │
│ propose actions → remember          hard limits: steps, tool calls, LLM calls, timeout  │
└──────┬───────────────────────┬────────────────────────────┬─────────────────────────────┘
       │                       │                            │
┌──────▼───────────┐  ┌────────▼──────────────────┐  ┌──────▼──────────────┐
│ services/memory  │  │ packages/connectors       │  │ packages/llm        │
│ FastAPI          │  │ Registry: Composio (6     │  │ Free-tier router:   │
│ Oracle Agent     │  │ apps), Firecrawl (web),   │  │ Gemini → Groq →     │
│ Memory + SQLite  │  │ any MCP server, sample    │  │ Cerebras → Open-    │
│ ledger/fallback  │  │ workspace                 │  │ Router → Puter      │
└──────────────────┘  └───────────────────────────┘  └─────────────────────┘
        LangSmith tracing (optional): cortex.run → llm.* / connector.search spans
```

## The agent loop (`packages/agent/src/run.ts`)

The orchestrator is hand-written rather than built on a graph framework. Every branch is explicit, every loop is bounded, and the number of LLM calls is predictable, which is what keeps it inside free-tier quotas.

| Step | Deep mode | Fast Mode | LLM calls |
|------|-----------|-----------|-----------|
| understand | Check which connectors are live; report the ones that are down | same | 0 |
| recall | Search memory (pinned memories always included) | same | 0 |
| plan | Strong model writes 2–5 sub-questions, sources, keyword queries, time window | One sub-question over every source, window parsed locally | 1 / 0 |
| search | All (sub-question × source) pairs in parallel, deduplicated, cached 90 s; one broadened retry for empty sub-questions | Same, no retry | 0 |
| synthesize | Strong model, streamed; answer plus `CONFLICTS / MISSING / ACTIONS / MEMORY` sections | Fast model, shorter | 1 |
| verify | Lexical claim check (citations exist, content overlap, numbers match); LLM re-check only for doubtful claims | Lexical only | 0–1 / 0 |
| actions | Proposals validated against connector schemas, stored server-side, **never executed** | same | 0 |
| remember | Explicit "remember…" requests + model candidates with salience ≥ 0.6 | same | 0 |

**Limits** (`LIMITS`): ≤5 sub-questions, ≤18 tool calls, ≤4 LLM calls deep / 2 fast, 90 s run timeout, a 12 s timeout per connector with one retry.

**Grounding rules.** The synthesizer may only use numbered evidence and must cite every factual sentence. If nothing is found, Cortex says so **without an LLM call**. Unsupported claims are flagged in the UI, and the groundedness score is shown.

**Errors.** Connector failures become `source_error` events that name the source, the reason (expired, rate-limited, unreachable, timed out) and the *impact* ("Blockers discussed in chat may be missing"). The run then continues. If every LLM fails, the user gets a plain message and a hint to try Fast Mode.

## Connector layer (`packages/connectors`)

```ts
interface Connector {
  id; name; kind; describes; impact; actions: ActionDef[];
  status(ctx); search(input, ctx); execute(actionId, args, ctx); connect?(ctx);
}
```

- **ComposioConnector**: one class, six toolkit specs (`composio/toolkits.ts`). Tool slugs are data, so a rename is a one-line change. OAuth uses `toolkits.authorize()`, which returns a redirect URL, so users never see a token.
- **McpConnector**: any MCP server (streamable HTTP or stdio), declared in `mcp.config.json`. Adding one needs no code. See `mcp.config.example.json`.
- **FirecrawlConnector**: web search, or scraping when the query contains a URL.
- **DemoConnector**: a fictional sample workspace with the same interface and actions. Its dates are relative to today, and it contains deliberate cross-source conflicts.
- **extractEvidence()**: tolerant mapping from any tool output shape to `{title, quote, url, author, timestamp}`.

## Actions and consent

1. The model proposes `{connector, action, args}`.
2. `ActionStore.propose` validates the connector, the action and the required params, then builds an exact human-readable preview.
3. The UI shows a confirmation card (Edit / Approve / Decline).
4. `POST /api/actions/:id` with `approve` is the **only** code path that calls `connector.execute`. It is single-use, scoped to the user, and expires after 30 minutes.

## Memory (`services/memory`)

| Layer | Store | Notes |
|-------|-------|-------|
| Working | in-run state | plan, evidence, tool outputs |
| Short-term | Oracle thread (`add_messages`, `get_summary`) + SQLite messages | per conversation |
| Long-term | Oracle `add_memory` / `search` (vector) + SQLite ledger | provenance, pin, edit, forget |

Oracle's automatic extraction is **off**. Cortex's policy decides what is kept: explicit requests at 0.95 salience, and model-proposed facts only at ≥0.6, at most two per run. Each kind has a TTL (priority 45 d, fact 90 d; preferences and people never expire). Salience decays with a 30-day half-life unless the memory is pinned, and near-duplicates reinforce an existing memory instead of being stored again. Without Oracle configured, the same API runs on SQLite FTS5, and `/health` reports which backend is active.

## LLM router (`packages/llm`)

- Every provider is OpenAI-compatible, so one client covers them all.
- Failover order: Gemini → Groq → Cerebras → OpenRouter `:free` → Puter (fallback).
- Cooldowns: 429 → `retry-after` or 60 s; bad key → 10 min; out of credit → 1 h.
- Two tiers: `strong` for planning and synthesis, `fast` for verification and Fast Mode.
- An LRU response cache (6 h by default, persisted to `.cache/`) means identical prompts cost nothing.
- JSON mode, with tolerant parsing of fenced or embedded JSON.
- Streaming fails over only before the first token; a stream that breaks mid-answer is reported honestly.
