# Cortex — Tech Stack

Everything is TypeScript except the memory sidecar, which uses Python because Oracle Agent Memory has only a Python SDK. Every service runs on a free tier.

| Layer | Choice | Why |
|-------|--------|-----|
| Monorepo | **pnpm workspaces + Turborepo** | One repo for web, agent, connectors, llm and the Python sidecar |
| Web | **Next.js (App Router) + React + TypeScript** | SSR, API routes, streaming, free Vercel hosting |
| Styling/UI | **Tailwind CSS v4 + shadcn/ui** | Minimal, accessible primitives that you own |
| Animation | **Motion** (`motion/react`, formerly Framer Motion) | Trace-step reveals, layout animations, micro-interactions |
| Agent orchestration | **Hand-written orchestrator** (TypeScript async generator) | Explicit, bounded steps (LLM-call, tool-call and time budgets), parallel fan-out, streamed events; traced with LangSmith `traceable` |
| LLMs | **Puter.js** (user-pays) + free-tier pool (Gemini, Groq, Cerebras, OpenRouter) | $0 to the developer; see the router in the architecture doc |
| Connectors | **Composio TS SDK** (managed OAuth) | One-click connect for Gmail, Calendar, Drive, Notion, Slack, GitHub |
| Web data | **Firecrawl** (`@mendable/firecrawl-js` / MCP) | Scrape/search/crawl/extract for web evidence |
| Memory | **Oracle Agent Memory** (`oracleagentmemory==26.4.0`) in **FastAPI** | Short- and long-term memory with automatic extraction |
| Database | **Oracle Autonomous AI Database 26ai — Always Free** | Memory, evidence snapshots and vector search in one DB |
| Embeddings | **Gemini `gemini-embedding-001`** (free tier) | Supported by Oracle Agent Memory |
| Auth | **Puter sign-in** as identity (MVP) | One sign-in gives both identity and an LLM budget; swappable later |
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
├─ evals/                  # Seeded "Northwind Labs" dataset + runner
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
