# Cortex — Interfaces

## Design principles

- **Minimalist.** Lots of whitespace, one accent colour, monochrome icons. The interface stays quiet so the evidence stands out.
- **Reasoning is visible but collapsible.** The trace is always available but never forced on the user.
- **Zero-config.** Sign in once, click a connector and go. No tokens, no settings pages.

## MVP interfaces (chosen)

### 1. Chat + Live Trace (main screen)

```
┌──────────────────────────────────────────────┬──────────────────────────────┐
│  What changed in Atlas this quarter? Risks?  │  TRACE                     ▾ │
│                                              │  ✓ Rewrite  Q3: Jul 1–Sep 30 │
│  Atlas shifted from … [1] The beta launch    │  ✓ Memory   "Atlas = top     │
│  slipped from Sep 15 to Oct 2 [2][3] …       │             priority" (pin)  │
│                                              │  ✓ Plan     5 sub-questions ✎│
│  ⚠ Conflict: Slack says Nov 3, GitHub        │  ● Tools    github.issues …  │
│    milestone says Nov 10 [4][5]              │             slack.search …   │
│                                              │  ○ Evidence 14 items         │
│  Grounded 93% · 5 sources · memory +1        │  ○ Verify                    │
│  ─────────────────────────────────────────── │                              │
│  [ Ask anything about your work…        ⏎ ]  │                              │
└──────────────────────────────────────────────┴──────────────────────────────┘
```

- Citation chips open a side sheet with the quote, the source icon and a deep link.
- The ✎ on Plan lets the user edit sub-questions before tools run.
- A memory diff chip ("memory +1") shows what Cortex learned from the run.

### 2. Daily Brief / Timeline

- A proactive card stack: **Changed**, **At risk**, **Conflicts**, **Upcoming**, ranked by the user's remembered priorities.
- A timeline view filters by project and source, with a date scrubber for time travel.
- Each card has an "Ask about this" button that opens a chat seeded with that card.

### 3. Memory Inspector

- A list of long-term memories, each showing its source, reason, confidence and age/decay bar.
- Actions: **Pin**, **Edit**, **Forget**, plus a "Why do you remember this?" link to the run that created it.
- A separate tab shows short-term memory (the current thread's context card and summary).

### Supporting screen: Connections

- One grid of six app tiles. Each tile shows **Connect** (opens the Composio OAuth popup) or **Connected ✓ · last synced 2m ago**.
- A **"Try demo workspace"** button connects the seeded Northwind Labs data, so a recruiter needs no accounts at all.

## Interface brainstorm (roadmap)

| Interface | Idea | Effort |
|-----------|------|--------|
| **CLI** `cortex ask "…" --trace` | For developers; streams the trace as an Ink TUI | S |
| **Cortex MCP server** | Exposes `cortex.research`, `cortex.memory.search` and `cortex.brief` to Claude Desktop, Cursor and Codex | M (high resume value) |
| **Slack bot** | `@cortex what's blocking Atlas?` answers in the thread, with citations | M |
| **Email digest** | The Daily Brief sent each morning via Gmail (Composio) | S |
| **Browser extension** | Highlight text in Notion/Jira/GitHub → "Ask Cortex about this" | M |
| **Evidence board (canvas)** | A graph of sub-questions → evidence → claims, with conflicts as red edges | M |
| **Voice** | Ask aloud; Puter has TTS/STT | S |
| **Command palette (⌘K)** | Global quick-ask over the web UI | S |
| **Raycast / desktop tray** | Quick ask from anywhere | M |
