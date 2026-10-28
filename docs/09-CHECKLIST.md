# Cortex: Internal Checklist (round 2)

Status key: `[ ]` todo · `[~]` in progress · `[x]` done · `?` needs a decision first.
Every task is closed only when its tests pass. Design tasks use the Emil Kowalski skills (`emil-design-eng`, `animate`, `review-animations`, `break-ui`, `mobile-native`) and are checked against `apps/web/DESIGN.md`.

## Decisions needed before building

- ? **D1 Auth provider (#7).** Options: email magic link + Google sign-in with Better Auth (free, self-hosted, data in Oracle), or Clerk free tier (hosted). Recommendation: Better Auth.
- ? **D2 Admin panel scope (#11).** Minimum: user list, roles (admin/member), disable user, usage per user (LLM calls, searches, actions), connector status, memory counts. Is there one admin (you), or an org with several?
- ? **D3 "Playful" vs the brand (#8).** PRODUCT.md currently says "must not feel playful". Proposal: playful *motion and micro-interactions* (springs, tactile presses, sounds) while keeping the calm visual world. Update PRODUCT.md once agreed.
- ? **D4 Composio mode (#4).** The consumer `ck_` key ties every connected account to *your* Composio account. With real multi-user auth (D1) we need a Composio *project* key so each Cortex user connects their own accounts.
- ? **D5 Router model (#3).** "jev" is unclear: confirm the name/link. Meanwhile research free-tier small models for intent routing.

## 1. Dark mode (#1)

- [ ] Dark tokens for every colour in `globals.css` (shell, surface, ink, lines, accent, source marks, state colours), meeting WCAG AA.
- [ ] Theme switch in the sidebar footer: System / Light / Dark; remembered per user; no flash on load (theme set before paint).
- [ ] Claim-weight states, conflict band, action card, citations and focus ring re-checked in dark.
- Tests: [ ] screenshot all 4 pages × light/dark × desktop/mobile; [ ] contrast check on every text token; [ ] no flash on hard reload.

## 2. Chat management in the sidebar (#2)

- [ ] Persist chats server-side (thread id, title, turns, created/updated) per user, not just a localStorage list.
- [ ] Sidebar: rename (inline), delete (with undo toast), pin; auto-title from the first question.
- [ ] Open a past chat restores the full conversation, not a re-run.
- Tests: [ ] rename/delete/pin persist across reload and devices; [ ] deleting a chat removes its stored turns; [ ] undo restores it; [ ] user A cannot see or delete user B's chats.

## 3. Intent routing: when to search, which model (#3)

Root cause today: only Deep mode can classify "chat" intent, and only after spending the planner call; Fast mode always searches every connector.
- [ ] Add a cheap router step before planning (fast model or rules + small model) that returns one of: `general` (answer directly, no connectors), `research` (search connectors), `action` (research then propose), `web` (Firecrawl), `memory` (about the user).
- [ ] Router also picks the model tier and the connectors to touch (e.g. "my emails" → Gmail only).
- [ ] General questions: answered directly, labelled "General knowledge, not from your sources", no "couldn't find" message.
- [ ] Research free-tier routing models (D5) and record the choice in docs.
- Tests: [ ] 20-question routing set (general / personal / mixed / action) with ≥90% correct route; [ ] general questions make 0 connector calls; [ ] add router accuracy to `npm run eval`.

## 4. Live connectors that actually work at scale (#4)

- [ ] Reproduce the Gmail and Calendar read and write failures with the live account; log the exact Composio request/response.
- [ ] Fix argument mapping per tool (verified against `COMPOSIO_GET_TOOL_SCHEMAS`); unit tests with recorded responses.
- [ ] Retrieval strategy for large mailboxes and other high-volume sources:
  - [ ] Push filtering to the source: Gmail query syntax (`from:`, `after:`, `label:`, `is:unread`, `has:attachment`), Calendar time windows, GitHub `involves:`/`updated:`, Slack `in:`/`after:`.
  - [ ] Fetch metadata first (subject, sender, date, snippet), rank, then fetch full bodies only for the top N (default 5).
  - [ ] Hard caps per source per question; time window defaults to the last 30 days unless the question says otherwise.
  - [ ] Thread de-duplication (one item per email thread).
- [ ] Write actions (send email, create event, post message) end to end with the consent card.
- Tests: [ ] read: "emails from X this week", "my meetings tomorrow" return correct items; [ ] write: draft email, create event, each only after Approve, and visible in Gmail/Calendar; [ ] a 1,000+ email mailbox answers in < 10 s with ≤ 2 body fetches per hit; [ ] expired connection shows a friendly reconnect prompt.

## 5. Automatic, optimised memory (#5)

- [ ] Remove "Teach Cortex" as the primary path (keep as an optional "add" behind a menu).
- [ ] Automatic extraction after each chat, using the fast model: candidates classified as priority, preference, fact, person or decision, each with salience and TTL.
- [ ] Write policy: skip small talk, one-off facts, secrets/credentials, and anything already known (semantic de-dup via Oracle vector search); merge or supersede contradicting memories (Oracle memory links `supersedes`/`contradicts`).
- [ ] Storage optimisation: decay plus periodic consolidation (merge near-duplicates, drop expired, cap per user), summaries for old threads instead of raw turns.
- [ ] Memory page stays the place to review, pin, edit and forget, and gains "why it was saved".
- Tests: [ ] 30-message scripted conversation: expected memories saved, small talk and secrets not; [ ] repeating a fact reinforces instead of duplicating; [ ] a contradicting fact supersedes the old one; [ ] memory count stays bounded after 500 messages.

## 6. Context window and cross-chat reference (#6)

- [ ] (Compulsory) Full current-chat context: rolling window of recent turns plus Oracle thread summary for older turns, within a token budget.
- [ ] (Opt-in) "Use my other chats" setting: when on, retrieve relevant snippets from past chats via vector search and cite them as "From your chat on …". Off by default, togglable per user and per chat.
- Tests: [ ] follow-ups resolve pronouns from 10+ turns back; [ ] with the opt-in off, no other chat is ever read (asserted in trace); [ ] with it on, the answer cites the past chat.

## 7. Authentication (#7)

- [ ] Sign-in before the app (D1): email magic link + Google; sessions; sign out.
- [ ] Every API route requires a session; the anonymous cookie becomes the real user id; memory, chats, connectors and actions scoped to it.
- [ ] Rate limiting per user on `/api/ask` and actions.
- Tests: [ ] every API route returns 401 without a session; [ ] user A cannot read B's memories, chats, actions or connections (automated IDOR tests); [ ] Strix API security scan has no high findings.

## 8. Motion, sound and delight (#8)

Use `emil-design-eng`, `animate`, `find-animation-opportunities`, `review-animations`.
- [ ] Motion audit and plan (`improve-animations`) before coding.
- [ ] Signature moments: claim weight settle, evidence arriving, action stamp (approve → "Done"), sidebar chat enter/exit, page transitions, composer send.
- [ ] Tactile controls: press scale on buttons, spring on toggles, smooth trace expand.
- [ ] Subtle sounds (send, answer verified, action done, error), quiet by default, with a Sound on/off setting; respect `prefers-reduced-motion`.
- [ ] Playful but restrained components per D3 (e.g. empty states, first answer celebration).
- Tests: [ ] `review-animations` pass with no blocking issues; [ ] all motion ≤ 300 ms for UI feedback, runs at 60 fps (animation-performance check); [ ] reduced motion disables non-essential motion; [ ] sounds off means zero audio.

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

## Cross-cutting checks (every release)

- [ ] `npm test` and the typechecks pass; new tests added for each item above.
- [ ] `npm run eval` (paced) with no regressions in groundedness, citation recall and zero unconsented actions.
- [ ] `npm run check-services` (scripts/check-services.ts) passes for all configured keys.
- [ ] Impeccable `audit` + finish review on changed screens; DESIGN.md updated.
- [ ] Strix scan (`find-security-vulnerabilities-in-code`) before any deploy.
- [ ] Report and paper updated if architecture or results change.
