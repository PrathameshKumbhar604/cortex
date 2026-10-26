# Cortex — Tech Stack

Everything is TypeScript except the memory sidecar, which uses Python because Oracle Agent Memory has only a Python SDK. Every service runs on a free tier.

| Layer | Choice | Why |
|-------|--------|-----|
| Monorepo | **npm workspaces** | One repo for web, agent, connectors, llm and the Python sidecar |
| Web | **Next.js 16 (App Router) + React 19 + TypeScript** | SSR, route handlers, SSE streaming, free Vercel hosting |
| Styling/UI | **Tailwind CSS v4** + hand-built components, **lucide-react** icons | Minimal; design system in apps/web/DESIGN.md |
| Animation | **Motion** (`motion/react`, formerly Framer Motion) | Trace-step reveals, layout animations, micro-interactions |
| Agent orchestration | **Hand-written orchestrator** (TypeScript async generator) | Explicit, bounded steps (LLM-call, tool-call and time budgets), parallel fan-out, streamed events; traced with LangSmith `traceable` |
| LLMs | Free-tier pool (Groq, Gemini, Cerebras, OpenRouter) with **Puter** as last-resort fallback, all via OpenAI-compatible APIs | $0; see the router in the architecture doc |
| Connectors | **Composio** (managed OAuth): hosted MCP for consumer keys, TS SDK for project keys; any MCP server via config | One-click connect for Gmail, Calendar, Drive, Notion, Slack, GitHub |
| Web data | **Firecrawl** (`@mendable/firecrawl-js` / MCP) | Scrape/search/crawl/extract for web evidence |
| Memory | **Oracle Agent Memory** (`oracleagentmemory` 26.x) in **FastAPI**, SQLite ledger/fallback | Long-term memory with Cortex's salience policy (automatic extraction off), short-term threads |
| Database | **Oracle AI Database Free** (local Docker) or **Autonomous AI Database Always Free** (cloud) | Memory storage and vector search |
| Embeddings | **Gemini `gemini-embedding-001`** (free tier) | Supported by Oracle Agent Memory |
| Identity | Anonymous per-browser cookie set in `proxy.ts` (MVP) | No sign-up needed; Composio links accounts to this id |
| Validation | **Zod** | Typed tool I/O and structured LLM outputs |
| Observability | **LangSmith** (free) + in-app trace store | Required for the "show the whole flow" demo |
| Tests/evals | **Vitest** + custom eval runner on the seeded dataset | Resume metrics: groundedness, citation precision, latency |

## Repo layout

```
cortex/
├─ apps/
│  └─ web/                 # Next.js UI + API routes (agent runs server-side)
├─ packages/
│  ├─ agent/               # Orchestrator, prompts, verification, actions, memory client
│  ├─ connectors/          # Composio + Firecrawl tool wrappers → Evidence
│  ├─ llm/                 # Free-LLM router (Puter + failover pool)
│  └─ shared/              # Zod schemas, types
├─ services/
│  └─ memory/              # Python FastAPI + Oracle Agent Memory
├─ evals/                  # 12-question eval over the sample workspace + runner
└─ docs/
```

## Accounts you'll need (all free)

1. Puter account (developer token for the server fallback)
2. Google AI Studio API key (Gemini)
3. Groq, Cerebras and OpenRouter keys (failover pool)
4. Composio account + API key
5. Firecrawl (keyless to start; free key for crawl/extract)
6. Oracle Cloud Free Tier (Autonomous DB + an ARM VM)
7. LangSmith (Developer plan)
