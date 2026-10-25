# Cortex — Architecture

## High-level

```
┌──────────────────────────── apps/web (Next.js, TypeScript) ────────────────────────────┐
│  Chat + Live Trace   │   Daily Brief / Timeline   │   Memory Inspector   │  Connections │
│  (Motion animations, shadcn/ui, Tailwind)                                               │
└───────────────┬─────────────────────────────────────────────────────────────────────────┘
                │ SSE stream of agent events (plan, tool_call, evidence, memory, token, verdict)
┌───────────────▼──────────────── packages/agent (LangGraph.js) ─────────────────────────┐
│                                                                                         │
│  ┌─────────┐   ┌──────────┐   ┌──────────────┐   ┌────────────┐   ┌──────────┐          │
│  │ Router/ │──▶│ Planner  │──▶│ Tool workers │──▶│ Synthesizer│──▶│  Critic  │──▶ answer│
│  │ Rewrite │   │(subQs)   │   │ (parallel)   │   │ (citations)│   │(verify)  │          │
│  └────┬────┘   └────▲─────┘   └──────┬───────┘   └────────────┘   └────┬─────┘          │
│       │ recall      │ HITL edit      │ evidence                        │ memory write   │
└───────┼─────────────┼────────────────┼─────────────────────────────────┼────────────────┘
        │             │                │                                 │
 ┌──────▼─────────┐   │   ┌────────────▼──────────────┐       ┌──────────▼─────────┐
 │ services/memory│◀──┘   │ packages/connectors       │       │ packages/llm       │
 │ Python FastAPI │       │ Composio (Gmail, Calendar,│       │ Free-LLM router:   │
 │ + Oracle Agent │       │ Drive, Notion, Slack,     │       │ Puter.js (user-pays)│
 │   Memory SDK   │       │ GitHub) + Firecrawl       │       │ Gemini / Groq /    │
 └──────┬─────────┘       └───────────────────────────┘       │ Cerebras / OpenRtr │
        │                                                     └────────────────────┘
 ┌──────▼──────────────────────────────┐        LangSmith (traces, free 5k/mo)
 │ Oracle Autonomous AI Database 26ai  │
 │ (Always Free): memory, threads,     │
 │ evidence snapshots, vector search   │
 └─────────────────────────────────────┘
```

## Agent graph (LangGraph.js)

| Node | Job | Model tier |
|------|-----|-----------|
| `rewrite` | Normalize the query, resolve "it/that project" from short-term memory, detect the time window ("this quarter" → dates) | fast |
| `recall` | `memory.search()` on the Oracle sidecar for user priorities, facts and prior answers | none |
| `plan` | Produce 3–7 typed sub-questions, each with target sources and time ranges. **Interrupt** here for optional user edit (HITL) | strong |
| `act` (fan-out) | One worker per sub-question. Calls Composio/Firecrawl tools, may loop up to N steps, returns `Evidence[]` | fast |
| `diff` | For temporal queries, compares current evidence with stored snapshots and emits `Change[]` | none/fast |
| `conflicts` | Finds contradictory claims across sources (dates, owners, status) | fast |
| `synthesize` | Writes the answer with `[n]` citations that map to evidence IDs | strong |
| `verify` | Checks each claim against the evidence quotes; drops or flags unsupported ones and computes the groundedness % | strong |
| `memorize` | Salience scoring decides what is promoted to long-term memory; writes it with provenance | fast |

### Core types

```ts
type Evidence = { id: string; source: "gmail"|"calendar"|"drive"|"notion"|"slack"|"github"|"web";
  url: string; title: string; quote: string; timestamp: string; subQuestionId: string };
type Claim = { text: string; evidenceIds: string[]; status: "supported"|"partial"|"unsupported" };
type AgentEvent =
  | { type: "plan"; subQuestions: SubQuestion[] }
  | { type: "tool_call"; subQuestionId: string; tool: string; args: unknown }
  | { type: "evidence"; item: Evidence }
  | { type: "memory_used" | "memory_written"; items: MemoryItem[] }
  | { type: "token"; text: string }
  | { type: "verdict"; claims: Claim[]; groundedness: number };
```

## Memory design (Oracle Agent Memory)

Oracle Agent Memory provides **short-term** memory (thread context cards + conversation summaries) and **long-term** memory (`add` / `search`, scoped by `user_id`). It also extracts memories automatically from `thread.add_messages()`. Cortex adds a policy layer on top:

| Layer | What goes there | Lifetime |
|-------|----------------|----------|
| Working (in-graph state) | Current plan, evidence, tool outputs | One run |
| Short-term (Oracle thread) | Conversation turns, context card, rolling summary | One session / thread |
| Long-term (Oracle `add_memory`) | User priorities ("Atlas is top priority"), preferences, durable project facts, resolved conflicts | Across sessions, with decay |
| Evidence snapshots (Oracle tables + vectors) | Normalized source items with timestamps, for diffs | Rolling window |

**Write policy.** The `memorize` node gives each candidate fact a score of salience × durability × novelty. Only facts above a threshold are written. Each memory carries `{source, reason, confidence, createdAt, expiresAt?, pinned}`. Cortex never stores raw transcripts in long-term memory.

**Sidecar API** (FastAPI, `services/memory`):
`POST /threads` · `POST /threads/{id}/messages` · `POST /memories` · `POST /search` · `GET /memories?user_id=` · `PATCH /memories/{id}` (pin/edit) · `DELETE /memories/{id}` (forget).

**LLM/embeddings for the sidecar.** Oracle's SDK supports Gemini models and `gemini-embedding-001`, so a free Gemini API key covers extraction and embeddings.

## Connectors (Composio, zero-token UX)

- The user clicks **Connect Gmail**, completes the OAuth popup and is sent back. They never handle tokens.
- The backend calls Composio's TS SDK with `userId` = the Cortex user ID. Composio stores and refreshes the tokens.
- Toolkits used: Gmail, Google Calendar, Google Drive, Notion, Slack, GitHub.
- Read-only scopes are the default. Write actions (send email, create event) are off in the MVP.
- **Firecrawl** adds the web as a source: scrape URLs found inside Slack/Notion/email so they can be cited, `search` for external risk context (vendor outages, CVEs in dependencies), and watch changelogs and competitor pages. The keyless tier covers scrape/search, and a free key unlocks crawl/extract.

## Free-LLM router (`packages/llm`)

There is no high-quality LLM that is both free and uncapped. Cortex combines several sources:

1. **Puter.js (primary, user-pays).** Each user signs in with a free Puter account, and their usage counts against *their* monthly Puter credit, so the developer pays $0 at any scale. Access to Claude/GPT/Gemini-class models. Server-side use goes through Puter's OpenAI-compatible endpoint (`https://api.puter.com/puterai/openai/v1/`) with the user's token. *Spike S1 verifies this.*
2. **Free-tier failover pool.** Google AI Studio (Gemini Flash), Groq, Cerebras and OpenRouter `:free` models. Calls are tried in order, and a provider that returns 429/402 is skipped for a cooldown period.
3. **Task routing.** Planner/synthesizer/critic go to the strongest available model; rewrite/extraction/salience go to the fastest.

All providers are wrapped behind one OpenAI-compatible interface, so LangGraph doesn't depend on any one vendor.

## Observability

- **LangSmith** (free Developer plan, 5k traces/mo) via `LANGSMITH_TRACING=true`. LangGraph.js traces automatically.
- **In-app trace**: the same `AgentEvent` stream is stored per run, which powers the live trace panel and the "reasoning receipt" permalinks.

## Deployment (all free)

| Piece | Where |
|-------|-------|
| Web + agent (Next.js) | Vercel Hobby, or an Oracle Cloud Always Free ARM VM |
| Memory sidecar (FastAPI) | Oracle Cloud Always Free ARM VM (Docker) |
| Database | Oracle Autonomous AI Database, Always Free |
| Traces | LangSmith Developer |
