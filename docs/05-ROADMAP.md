# Cortex — MVP Plan

Each milestone produces something you can demo.

## M0 — Spikes (de-risk first)

| ID | Question | Pass condition |
|----|----------|----------------|
| S1 | Can the **server** call Puter with the **user's** token (OpenAI-compatible endpoint), including tool calling and streaming? | A Node script gets a streamed answer plus a tool call, billed to a test user |
| S2 | Does Oracle Agent Memory run against Autonomous DB Always Free with Gemini LLM + embeddings? | `add_messages` → `search` returns extracted memories |
| S3 | Composio managed OAuth for all 6 toolkits on the free plan | Each toolkit connects via popup and one read tool returns data |
| S4 | Free-tier pool failover | A forced 429 on provider A moves the call to B transparently |

**If S1 fails:** run the agent loop in the browser with Puter.js (still user-pays), with the backend serving only connectors and memory.

## M1 — Skeleton

- pnpm + Turborepo monorepo, Next.js app, shared Zod types
- `packages/llm` router with Puter + Gemini + Groq
- FastAPI memory sidecar with `/threads`, `/memories`, `/search`
- Puter sign-in in the web app
- LangSmith tracing on

## M2 — Agent core

- LangGraph: `rewrite → recall → plan → act (fan-out) → synthesize → verify → memorize`
- GitHub + Notion connectors first (the easiest demo data)
- SSE `AgentEvent` stream → basic chat + trace panel
- Citations mapped to evidence

## M3 — Connections + all sources

- Connections grid with Composio OAuth popups
- Add Gmail, Calendar, Drive and Slack, plus Firecrawl web evidence
- **Seed the Northwind Labs demo workspace** (GitHub org, Notion pages, Slack workspace, Gmail/Calendar on a demo account)

## M4 — X-factors

- Claim verification + groundedness badge
- Contradiction detector
- Evidence snapshots + temporal diff ("what changed between …")
- HITL plan editing (`interrupt()`)

## M5 — Memory Inspector + Daily Brief

- Memory policy (salience × durability × novelty), provenance, pin/edit/forget
- Memory diff chip per answer
- Daily Brief cards + timeline

## M6 — Polish, evals, launch

- Design pass (Impeccable audit/polish, Motion transitions)
- Eval runner over 50 seeded questions → groundedness, citation precision, p50 latency in the README
- Reasoning-receipt permalinks
- 2-minute demo video, deploy, README with architecture GIF

## Stretch

- Cortex MCP server, CLI, Slack bot, email digest
