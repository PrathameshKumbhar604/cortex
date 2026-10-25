# Cortex

**Cited, verified answers from your Gmail, Calendar, Drive, Notion, Slack and GitHub, plus actions that wait for your approval.**

Ask *"What changed in Orbit this week, and what's at risk?"*. Cortex:

1. **plans** 2–5 sub-questions;
2. **searches** every connected source in parallel;
3. **recalls** what you told it matters;
4. writes an answer where **every claim is cited**;
5. **verifies each claim** against its source. Unsupported claims are struck through, and contradictions between sources are flagged.

If you ask it to *do* something, it drafts the action and waits for **Approve**.

Everything runs on **free tiers**: Gemini, Groq, Cerebras or OpenRouter, with Puter.js as the fallback; Composio, Firecrawl, Oracle Always Free and LangSmith.

## What makes it different

| | Cortex | Typical RAG chat |
|---|---|---|
| Confidence | Each claim's type weight is its verification state, settling from hairline to full weight once checked | Everything looks equally certain |
| Contradictions | Surfaced as conflicts with both citations | Silently picks one |
| Missing data | States what it couldn't find, and spends no LLM call doing so | Fills the gap |
| Failures | "Slack is unavailable: its connection expired. Blockers discussed in chat may be missing." Then continues | Errors out |
| Actions | Proposed with an exact preview; executes only through the approve endpoint, once | Read-only, or acts unasked |
| Memory | Explainable: why it was kept, its source and decay; pin, edit or forget | Opaque, or stores everything |
| Cost | Free-tier router with cooldowns and a response cache; Fast Mode makes one LLM call | Paid API |

## Quick start

```bash
npm install
cp .env.example .env              # add at least GEMINI_API_KEY (see docs/08-SETUP-KEYS.md)
npm run memory:setup              # once: Python venv for the memory service
npm run memory                    # terminal 1: memory service on :8000
npm run dev                       # terminal 2: http://localhost:3000
```

The **sample workspace** (a fictional student team) works with no connector keys. Add `COMPOSIO_API_KEY` to connect your own accounts with one-click OAuth.

No keys at all? `npm run mock-llm`, then start the app with `CORTEX_MOCK_LLM_URL=http://localhost:4010/v1`. This is a dev-only mock that quotes the evidence verbatim.

## Repo

```
apps/web            Next.js 16 UI + API (SSE agent stream, consent-gated actions)
packages/agent      Orchestrator: plan → parallel search → stream → verify → act → remember
packages/connectors Registry: Composio toolkits, Firecrawl, any MCP server, sample workspace
packages/llm        Free-tier router: failover, cooldowns, cache, JSON mode
packages/shared     Types shared by server and client
services/memory     FastAPI + Oracle Agent Memory (SQLite fallback)
evals/              12-question eval over the sample workspace
```

Add an MCP server with no code changes: copy `mcp.config.example.json` to `mcp.config.json`, edit it, and set `CORTEX_MCP_CONFIG=./mcp.config.json`.

## Quality

- `npm test`: 18 tests covering router failover and cache, connector errors, the agent end to end, verification, and consent.
- `npm run eval`: groundedness, citation recall, conflict detection, honest "not found" answers, action proposals, and a check that no action ran without consent.
- Optional LangSmith traces: `LANGSMITH_TRACING=true`.

## Docs

[Vision](docs/01-VISION.md) · [Architecture](docs/02-ARCHITECTURE.md) · [Stack](docs/03-TECH-STACK.md) · [Interfaces](docs/04-INTERFACES.md) · [Roadmap](docs/05-ROADMAP.md) · [Design tooling](docs/06-DESIGN-TOOLING.md) · [Research](docs/07-RESEARCH-SOURCES.md) · [Keys](docs/08-SETUP-KEYS.md)
