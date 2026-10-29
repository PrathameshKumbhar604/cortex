# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers, productivity-focused professionals, and undergraduates who spread their work across Gmail, Google Calendar, Google Drive, Notion, Slack and GitHub. The typical situation is coming back to their work and needing to know what changed, what is at risk, and what to do next, without opening six tabs. They can be non-technical: they will never paste an API token or edit a config file.

## Product Purpose

Cortex is an agentic research assistant over the user's *live* tools. It breaks a question into sub-questions, searches the connected sources in parallel, recalls what the user has said matters, and returns an answer where every claim is cited to a source. When asked, it acts on the user's behalf (send, create, update), but only after explicit confirmation of each action. Success means the user trusts the answer without re-checking every source, and can act on it immediately.

## Positioning

- Every claim is grounded in connector data and cited. When data is missing, Cortex says so instead of guessing.
- Contradictions between sources (e.g. two different deadlines) are surfaced as risks, not silently resolved.
- Memory is explainable and user-governed: each memory shows why it was kept and where it came from, and can be pinned, edited or forgotten.
- The agent's plan and current step are visible but unobtrusive.
- Runs entirely on free-tier LLMs and services.

## Operating Context

- Main surfaces: Ask (chat with a live trace), Brief (proactive "what changed" timeline), Memory (inspector), Connections (one-click OAuth).
- Two depths: Deep mode (plan → parallel tools → synthesis → verification) and Fast Mode (single pass, quickest answer).
- Actions are proposed as confirmation cards; nothing is sent, created or updated without an explicit approve.
- If a connector is down, the user is told which one, why it matters for the current question, and the answer continues with the remaining sources.

## Capabilities and Constraints

- Connectors: Composio managed OAuth (Gmail, Calendar, Drive, Notion, Slack, GitHub), Firecrawl (web), generic MCP servers; the connector layer is a registry, so new MCP connectors are added without refactoring.
- LLMs: free tiers only (Gemini, Groq, Cerebras, OpenRouter), with Puter.js as the fallback; responses are cached, and prompts kept lean.
- Memory: Oracle Agent Memory via a Python sidecar, with a local fallback.
- Hard step and retry limits on every agent loop.
- Capstone project: polish, reliability and the demo matter most.

## Brand Commitments

- Name: **Cortex**.
- Look: clean, premium, in the style of a YC-backed startup.
- User steer (binding): "it should have intelligent colors and futuristic. it's a product and not a project."
- User steer (binding): "minimalistic, thoughtful, have broad vision, insightful, cleaner, mature yet modern."
- Must not feel like: a generic AI-chat clone, a dense dashboard, noisy reasoning, or toy-like visuals. Motion and sound may be playful (springs, a soft chime when an answer lands, a stamp when an action is done) as long as the visual world stays calm (decision D3).
- First screen is ask-first. Laptop first; mobile fully usable.

## Evidence on Hand

- No real users, testimonials, metrics or customers exist. Do not fabricate any. The demo workspace uses clearly fictional sample data.

## Product Principles

1. Show the evidence, not just the answer.
2. Never act without consent.
3. Say "I don't know" before guessing.
4. Zero setup: the user never sees a token.
5. Quiet by default. Reasoning is available, never in the way.
