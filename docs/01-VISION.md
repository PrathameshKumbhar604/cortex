# Cortex — Vision

> **An agentic RAG system over your *live* work data, with memory that knows what matters and evidence you can audit.**

## The problem

Ordinary RAG answers questions from a static PDF. Real work changes all the time and is spread across Gmail, Calendar, Drive, Notion, Slack and GitHub. Ask a basic RAG bot this:

> *"Summarize what changed in Project Atlas this quarter and identify the major risks."*

It does one similarity search and returns some chunks that look relevant. That isn't analysis.

## What Cortex does instead

1. **Decomposes** the question into a plan of sub-questions:
   - What were Atlas's original goals? (Notion spec)
   - Which tasks were due this quarter? (GitHub issues/milestones)
   - Which deadlines moved? (Calendar + Slack + issue history)
   - Which blockers were reported? (Slack threads, PR comments, emails)
2. **Recalls memory**, e.g. *"Yesterday you told me Atlas is the top-priority project"*, and uses it to weight the answer.
3. **Executes tool calls in parallel** through MCP/Composio connectors, plus Firecrawl for the open web.
4. **Collects evidence**: each fact is stored as a quote, a source URL and a timestamp.
5. **Synthesizes** a cited answer, then **verifies** every claim against the evidence. Unsupported claims are dropped or flagged.
6. **Writes memory selectively**. Most of what it sees is discarded. Only salient, durable facts are promoted to long-term memory.
7. **Shows its work.** A live trace shows the question, plan, tool calls, evidence, memory used and the cited answer.

## X-factors: what makes Cortex different

| # | Idea | Why it matters |
|---|------|----------------|
| 1 | **Temporal diff engine ("time-travel queries")** | Cortex snapshots source state, so it can answer *"what changed between Sept 1 and today"* with real before/after diffs. Similarity search alone cannot do this. |
| 2 | **Cross-source contradiction detector** | *"Slack says the launch is Nov 3; the GitHub milestone says Nov 10."* Conflicts are shown as risks with both citations. Inconsistencies like these are early project-risk signals. |
| 3 | **Claim-level verification + groundedness score** | A critic node checks each sentence against the evidence quotes, and the UI shows a % grounded badge. This guards against hallucination in a measurable way. |
| 4 | **Explainable, governed memory** | Every memory records *why* it was saved, *where* it came from, a salience score and a decay/TTL. Users can pin, edit or forget a memory, and each answer shows a **memory diff** (what it learned or updated). |
| 5 | **Editable plan (human-in-the-loop)** | Before execution, the user can tweak, add or remove the planner's sub-questions. This shows control over the agent. |
| 6 | **Proactive Daily Brief + Risk Radar** | Cortex reports what changed since you last looked, ranked by your remembered priorities, without waiting for a question. |
| 7 | **Free-LLM router** | One interface over Puter.js (user-pays) and free tiers (Gemini, Groq, Cerebras, OpenRouter), with automatic failover on 429s and per-task model routing (planner = strong model, extraction = fast model). |
| 8 | **Reasoning receipts** | Every answer gets a shareable permalink to its full trace. This is useful for demos, debugging and trust. |
| 9 | **Seeded demo workspace + eval harness** | A fictional company ("Northwind Labs") lives in a real GitHub org, Notion and Slack, with ground-truth Q&A. Recruiters can try it in one click, and you get resume metrics (e.g. "92% claim groundedness on 50-question eval"). |
| 10 | **Cortex as an MCP server** *(roadmap)* | Exposes Cortex's memory and research agent to Claude Desktop, Cursor and Codex, so it is a platform rather than only an app. |

## Competitive landscape

| Product | What it is | Gap Cortex fills |
|---------|-----------|------------------|
| **Supermemory** | Memory infrastructure/API (vector-graph, learner model), plugins for ChatGPT, Claude and Hermes | A memory backend with no planning agent or cited multi-hop research over live sources. Cortex is the end-to-end research agent and makes memory *explainable* to end users. |
| **MemoryFirst** | "Company brain": graph memory, citations, contradiction handling (latest wins), Telegram morning brief | Closest competitor. It resolves contradictions silently (latest wins). Cortex **surfaces** them as risks, adds temporal diffs, an editable plan, a visible trace and claim verification. MemoryFirst is paid beyond 1 project and 30-day retention. |
| **Augmas** | Enterprise search/chat across 50+ tools with citations, $25/seat | No cross-session memory, no visible reasoning, enterprise-priced. |
| **OpenAI Dots** | Always-on agents with their own cloud computer, ChatGPT memory, Pro/Business plans | Closed, expensive, opaque memory (disconnecting a source does not clearly delete data). Cortex is free, open and transparent. |
| **Hermes Agent** (Nous) | Personal agent; memory = capped `MEMORY.md`/`USER.md` files plus an optional external provider | Flat-file memory with no evidence graph or source connectors focused on project analysis. |

**Positioning:** *Cortex is the open, free, explainable alternative. It shows its plan, evidence, memory and doubts.*
