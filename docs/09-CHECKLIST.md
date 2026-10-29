# Cortex: Internal Checklist (round 2)

Status key: `[ ]` todo · `[~]` in progress · `[x]` done · `?` needs a decision first.
Every task is closed only when its tests pass. Design tasks use the Emil Kowalski skills (`emil-design-eng`, `animate`, `review-animations`, `break-ui`, `mobile-native`) and are checked against `apps/web/DESIGN.md`.

## Decisions needed before building

- [x] **D1 Auth provider (#7): approved, Better Auth.** Options: email magic link + Google sign-in with Better Auth (free, self-hosted, data in Oracle), or Clerk free tier (hosted). Recommendation: Better Auth.
- [x] **D2 Admin panel scope (#11): approved minimum scope.** Minimum: user list, roles (admin/member), disable user, usage per user (LLM calls, searches, actions), connector status, memory counts. Is there one admin (you), or an org with several?
- [x] **D3 "Playful" vs the brand (#8): approved, playful motion on a calm visual world.** PRODUCT.md currently says "must not feel playful". Proposal: playful *motion and micro-interactions* (springs, tactile presses, sounds) while keeping the calm visual world. Update PRODUCT.md once agreed.
- [x] **D4 Composio mode (#4): approved, project key for multi-user.** The consumer `ck_` key ties every connected account to *your* Composio account. With real multi-user auth (D1) we need a Composio *project* key so each Cortex user connects their own accounts.
- [x] **D5 Router model (#3).** Jev (TypeSafe's decision model) is available only as OpenRouter's `typesafe/jev-router`, which bills the model it picks; a test restricted to free models still routed to a paid one ($0.000082). Not free-tier safe, so the same idea is built on free models: rules first, then Groq gpt-oss-20b with low reasoning.

## 1. Dark mode (#1)

- [x] Dark tokens for every colour in `globals.css` (2026-10-29): each token is one `light-dark(light, dark)` value, so the palettes can't drift apart; the hard-coded colours in components became tokens (`hover`, `pressed`, `on-ink`, `accent-wash`, `warn-ink`). Light "ok" green darkened to #0b7a57 (it was 4.34:1).
- [x] Theme switch in the sidebar footer and the phone menu: System / Light / Dark; remembered in this browser (per user once #7 lands); an inline script applies the choice before paint, so there is no flash. `theme-color` follows the system theme.
- [x] Claim weights, citations, sources, action card, terminal panels and focus ring checked in dark.
- Tests: [x] screenshots of all 4 pages in light and dark at desktop, plus Ask on a phone; [x] contrast script over 16 text/background pairs in both themes: all ≥ 4.5:1; [x] saved dark with a light system: the page is dark at DOMContentLoaded; picking Light, then System, updates the page and storage; 0 console errors.

## 2. Chat management in the sidebar (#2)

- [~] Persist chats server-side (thread id, title, turns, created/updated) per user, not just a localStorage list. Interim (2026-10-29): whole threads (title, turns, server thread id) saved in localStorage, 20 newest; server-side waits for auth (#7).
- [x] Sidebar: rename (inline), delete (with undo), pin (own "Pinned" group); auto-title: the fast model names a new chat from its first message (2–5 words, once, alongside the answer; the message stays the title if that fails); a rename survives later questions. Also in the phone menu.
- [x] Open a past chat restores the full conversation, not a re-run (`/?t=<id>`; sidebar shows one entry per thread).
- Tests: [~] rename/delete/pin persist across reload (browser check 2026-10-29); across devices waits for server storage; [x] deleting a chat removes its stored turns; [x] undo restores it; [x] opening a saved chat makes 0 `/api/ask` calls and no console errors; [ ] user A cannot see or delete user B's chats (needs #7).

## 3. Intent routing: when to search, which model (#3)

Root cause today: only Deep mode can classify "chat" intent, and only after spending the planner call; Fast mode always searches every connector.
- [x] Add a cheap router step before planning (fast model or rules + small model) that returns one of: `general` (answer directly, no connectors), `research` (search connectors), `action` (research then propose), `web` (Firecrawl), `memory` (about the user).
- [x] Router also picks the model tier and the connectors to touch (e.g. "my emails" → Gmail only).
- [x] General questions: answered directly, labelled "General knowledge, not from your sources", no "couldn't find" message.
- [x] Research free-tier routing models (D5) and record the choice in docs.
- Tests: [x] 20-question routing set: 20/20 (`npm run eval:routing`); [x] general questions make 0 connector calls (unit test); [x] router accuracy is its own eval script. Main eval after #3: actions 2/2, citation recall 0.92, groundedness 0.75 (stricter checker), median 4.6 s.

## 4. Live connectors that actually work at scale (#4)

- [x] Reproduce the Gmail and Calendar read and write failures with the live account. Found (2026-10-29): action requests with no matching evidence stopped at "couldn't find anything"; events were created in UTC; vague requests ("create an event") produced nothing. The hosted MCP (`ck_` key) cuts every string to ~200 chars, so full bodies need the project key (D4).
- [x] Fix argument mapping per tool, verified against `COMPOSIO_GET_TOOL_SCHEMAS` for all 15 tools (Calendar `q` → `query`, Drive `page_size` → `pageSize`). Unit tests use synthetic responses shaped like the live ones.
- [x] Actions have their own path: no research answer, claims or citations; the model drafts the action for the approval card, or asks one plain-words question for missing details (no field names or IDs). The reply goes back to drafting (flagged `needsDetails`, not by text), and drafting hands anything that is not an action ("latest files from drive?") back to normal answering.
- [x] Drive understands "latest" (newest first) and file types ("pdf", "sheet", "slides"); evidence dates include the year so "latest" is judged correctly.
- [x] Retrieval strategy for large mailboxes and other high-volume sources:
  - [x] Push filtering to the source: Gmail operators kept and keywords ORed, minus promotions/social/spam; Calendar time windows; Drive any-keyword full text + modified time; GitHub `involves:@me` + `updated:`; Slack `after:`/`before:`. Words naming the app ("emails", "meetings", "issues") are dropped.
  - [x] Fetch metadata first, rank, then fetch full bodies only for the top 2 (SDK/project-key mode; the hosted MCP truncates bodies anyway).
  - [x] Hard caps: at most 10 results per source call; Gmail and Slack default to the last 30 days.
  - [x] Thread de-duplication (one item per email thread).
- [~] Write actions end to end with the consent card: create event and Gmail draft executed live; email send and Slack post drafted live but not approved (they would reach real people).
- [x] Expired sign-ins are reported ("reconnect it on the Connections page", with a Reconnect link and button); failed actions explain why in plain words.
- Tests: [x] read: Gmail "internships this month" answered in 4.6 s with citations; all six apps searched live without errors (GitHub account ChatGPT2324 has no issues/PRs; Calendar has few events). [x] write: create event + draft email, each only after approve, visible in Calendar/Gmail. [~] large mailbox: filtering is server-side, so mailbox size does not change cost (≤ 10 results, ≤ 2 body fetches); not measured on a 1,000+ mailbox. [ ] expired connection: built, but not unit-tested and not seen live (no expired account to test). Eval after #4: actions 2/2, citation recall 0.96, groundedness 0.88, 0 unconsented, median 4.0 s.

## 5. Automatic, optimised memory (#5)

- [x] Remove "Teach Cortex" as the primary path: now "Add a memory yourself" behind a link; the page says memory is automatic.
- [x] Automatic extraction after each answer (`packages/agent/src/remember.ts`): a rules gate first (questions, commands, small talk and secrets never reach the model), then one fast-model call that classifies into priority, preference, fact, person or decision with salience; TTL per kind as before. Replaces the old MEMORY section in the answer prompt, which saved chit-chat.
- [x] Write policy: skip small talk, one-off requests, secrets (gate + output filter); skip what is known (extraction sees related memories; service merges near-identical text and Oracle distance <= 0.15); updates replace the old memory in one service call (`replaces`), never a pinned one.
- [~] Storage optimisation: decay (existing), expired dropped and at most 200 unpinned memories per user (least salient first). Not done: consolidation of near-duplicates already stored, thread summaries (moves to #6).
- [x] Recall only relevant memories: Oracle results beyond distance 0.35 are dropped (unrelated questions were pulling in every memory, "Used 2 memories" on "hello").
- [x] Memory page stays the place to review, pin, edit and forget, and shows why each memory was saved.
- Tests: [x] 30-message scripted conversation (`npm run eval:memory`, 2026-10-29): 12/12 expected memories, 0 from small talk/questions, 0 secrets, 12 model calls; [x] repeating a fact reinforces instead of duplicating; [x] a contradicting fact supersedes the old one; [~] bounded count: cap tested on the ledger directly, not over 500 live messages. Unit tests cover gate, secrets, replace and pinned.

## 6. Context window and cross-chat reference (#6)

- [x] (Compulsory) Full current-chat context (2026-10-29): the browser sends the whole chat (40 turns); `historyBlock` fits it in ~8k chars: last 2 exchanges in full, older messages cut to their opening lines, the first message always kept, the rest dropped with a count. No model call per turn, so no Oracle summary (it needs an LLM call each time); revisit if long chats lose detail.
- [x] (Opt-in) "Use my other chats" switch on the Memory page, off by default. When on, the 3 most related past turns (keyword match; shortcut: not vectors yet) join the evidence as "Your chat on Oct 20, 2026" and are cited like any source; general answers say "from your chat on …". Every answered turn is now saved server-side (the general path didn't before). Deleting a chat deletes its server copy once the undo window closes. Not done: per-chat toggle; setting is per browser until auth (#7). Deciding when other chats matter (researched ChatGPT "Reference chat history", Claude chat search, BM25-vs-agentic retrieval studies): once opted in, every question runs the free keyword match, so the user never has to ask; questions about past chats with no topic ("what were my previous chats about?") get the latest 5 chats; with the switch off, Cortex says where to turn it on. The recall line shows "N from other chats" or "no related chats". A failing chat search no longer marks memory as down.
- Tests: [x] a fact 12 exchanges back stays in context, within budget (unit); [x] with the opt-in off, other chats are never searched on either path (unit, counts calls); [x] with it on, the past chat becomes citable evidence (unit); [x] service: search skips the current chat and other users, delete only removes the owner's rows; [ ] live: not yet tried in the browser.

## 7. Authentication (#7)

- [ ] Sign-in before the app (D1): email magic link + Google; sessions; sign out.
- [ ] Every API route requires a session; the anonymous cookie becomes the real user id; memory, chats, connectors and actions scoped to it.
- [ ] Rate limiting per user on `/api/ask` and actions.
- Tests: [ ] every API route returns 401 without a session; [ ] user A cannot read B's memories, chats, actions or connections (automated IDOR tests); [ ] Strix API security scan has no high findings.

## 8. Motion, sound and delight (#8)

Use `emil-design-eng`, `animate`, `find-animation-opportunities`, `review-animations`.
- [x] Motion audit and plan before coding (2026-10-29): existing motion was turn fade-in, trace expand, action card entry and the claim-weight settle; missing were press feedback, arriving evidence, sliding selections, page and list entry, the action stamp, and sound. Plan reviewed against `emil-design-eng` (custom ease-out, ≤ 300 ms for UI feedback, transform/opacity only, springs only where things settle).
- [x] Signature moments: evidence rises in staggered 40 ms apart (280 ms, ease-out); "Done"/"Declined"/"Failed" stamps in with a spring and a blur that clears; "Verified n/m" draws its tick once; "Learned: …" pops in with a spring; pages ease in on navigation (220 ms); new sidebar chats and the undo notice ease in (`@starting-style`); the claim-weight settle stays.
- [x] Tactile controls: every button scales to 0.97 on press (160 ms, uses `scale` so it composes with translate utilities); Fast/Deep and the theme switch have a sliding pill (spring, bounce 0.2); the "Use my other chats" knob springs; the trace expand already eases.
- [x] Subtle sounds, synthesised with Web Audio (no files): send (one soft tick), answer (two-note chime), action done (three-note pluck), error (two low notes). Gain 0.045, silent in hidden tabs and when Stop was pressed. Sound switch next to the theme switch (on by default, quiet); turning it on plays a sample.
- [x] Playful but restrained (D3, PRODUCT.md updated): suggestion rows stagger in on the empty Ask page, the drawn tick, the stamp and the memory pop. No confetti or mascots.
- Tests: [x] browser check with a canned answer stream: sound on = 3 oscillators (send + answer), sound off = 0; [x] reduced motion: animation duration and stagger delay both 0, press scale off, Motion springs follow it (`MotionConfig reducedMotion="user"`); [x] every button carries the press transition; 0 page errors. [~] 60 fps: all new motion uses opacity, translate and scale only (plus a 3 px blur on one small stamp); not profiled with a trace. [ ] `review-animations` pass.

## 9. Onboarding and a clearer Brief (#9)

- [ ] Optional first-run walkthrough (skippable, replayable from settings): Ask → citations and verification → actions with approval → memory → connect an app.
- [ ] Brief: explain itself on first visit, show an empty state that points to connecting apps, and let users pick which sources and projects it covers.
- Tests: [ ] first visit shows the tour offer once; skip is remembered; [ ] a new user with no connections sees a helpful Brief, not an empty page; [ ] a 5-person hallway test: each completes "connect an app and ask a question" unaided.

## 10. Friendlier errors (#10)

- [ ] Rewrite every user-facing error in plain, calm language with a next step ("Gmail needs you to sign in again → Reconnect"); no stack traces, codes or provider names.
- [ ] Inline retry buttons; toasts for transient failures; technical detail behind "Details".
- Tests: [ ] simulated failures (LLM busy, connector expired, network down, memory offline) each show the calm message plus an action; [ ] `slopmonster` review of all error copy.

## 11. Admin panel (#11)

Depends on D1 and D2.
- [ ] `/admin`, visible only to admins: users (search, role, disable/enable), usage per user, connector health, memory size, recent errors.
- [ ] Global settings: allowed connectors, per-user daily limits, model order.
- [ ] Audit log of admin actions and every executed user action.
- Tests: [ ] non-admins get 403 on all admin routes; [ ] disabling a user ends their sessions; [ ] audit log records each change.

## 12. Answer rendering and thread scrolling (#12)

- [x] Answers render as full markdown with `react-markdown` + `remark-gfm` (already installed), replacing the hand-written parser: numbered and nested lists, tables (scroll sideways on narrow screens), italics, links, headings, rules, quotes. Citations `[n]` still become source marks; code is left untouched.
- [x] Code renders in a terminal panel: dark, language label ("terminal" for shell), Copy with "Copied" feedback, scrolls sideways instead of wrapping. Its colours stay fixed whatever the answer's verification weight. Not done: syntax colouring (needs a new dependency).
- [x] The whole thread is shown and scrolls, instead of earlier turns collapsing into one-line rows. While an answer streams the view follows it, but scrolling up stops the follow (160 px to stop, 40 px to resume) and shows "Jump to latest". Previous/next question buttons (desktop) and Alt+↑/Alt+↓ (skipped while typing in a non-empty field); smooth scrolling unless reduced motion is on.
- Tests: [x] browser check (2026-10-29, Playwright on a saved 3-question thread): opens at the end; previous moves up twice; Alt+↓ moves down; "Jump to latest" shows when reading history; 2 terminal panels labelled terminal/python; nested list, 3 table rows, 2 citation marks and no literal "[1]"; long code line scrolls; Copy puts the code on the clipboard; 0 console errors. [ ] check during a live streaming answer; [ ] phone widths.

## Cross-cutting checks (every release)

- [ ] `npm test` and the typechecks pass; new tests added for each item above.
- [ ] `npm run eval` (paced) with no regressions in groundedness, citation recall and zero unconsented actions.
- [ ] `npm run check-services` (scripts/check-services.ts) passes for all configured keys.
- [ ] Impeccable `audit` + finish review on changed screens; DESIGN.md updated.
- [ ] Strix scan (`find-security-vulnerabilities-in-code`) before any deploy.
- [ ] Report and paper updated if architecture or results change.
