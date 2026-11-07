# Cortex for Android: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A native Android app of Cortex in `experimental/`, at feature parity with the web app (except admin), plus a later phase that adds admin sign-up approval to both web and app.

**Architecture:** An Expo (React Native, TypeScript) app with Expo Router. It talks to the existing, unchanged Next.js `/api/*` routes over HTTP, authenticating with a Clerk session token as `Authorization: Bearer`. Pure logic (shared types, the agent event reducer, versions, chat merge) is imported from `packages/shared` through Metro `watchFolders`, or copied from `apps/web/src/lib` with a source comment. Everything browser-only is rebuilt natively.

**Tech Stack:** Expo SDK (latest stable that targets API 36), Expo Router (drawer), `@clerk/clerk-expo`, `expo/fetch` (streaming), `react-native-reanimated`, `react-native-gesture-handler`, `react-native-keyboard-controller`, `@shopify/flash-list`, `react-native-markdown-display` (or a lighter equivalent), `expo-haptics`, `expo-secure-store`, `expo-web-browser`, `expo-document-picker`, `expo-audio`, `expo-speech`, `expo-font` with `@expo-google-fonts/{fraunces,geist,geist-mono}`, `jest-expo`. Builds run on EAS.

**Spec:** `experimental/docs/2026-11-07-cortex-android-design.md`. Read it first. Its Brand table and Feature map are the source of truth.

## Global Constraints

- No existing file in `apps/`, `packages/`, `services/` or the root config is edited in Tasks 1–10. Task 11 (phase 2) is the only one that edits web code.
- Everything new lives in `experimental/`. It has its own `package.json` and is **not** a root workspace.
- All caches and downloads go on D:. `experimental/.npmrc` sets `cache=D:\dev-cache\npm`. Set `EXPO_HOME`/`EAS_LOCAL_BUILD_HOME` and Gradle (if ever needed) under `D:\dev-cache\`. Ask before any install over ~1 GB.
- Android: `targetSdkVersion` 36, `minSdkVersion` 24 (Expo default), edge-to-edge always on, package `app.cortex.android`, scheme `cortex`.
- Brand tokens exactly as in the spec's Brand table (live `globals.css`), in light and dark. Fonts: Fraunces (SOFT 100) for headings and wordmark, Geist for UI, Geist Mono for readouts only. All text is at least 11px.
- Sign-in: email + password + 6-digit code. Google/GitHub buttons exist behind `EXPO_PUBLIC_OAUTH_ENABLED` (default off).
- Connectors: the existing `POST /api/connections/[id]`, opened with `WebBrowser.openBrowserAsync`. Refresh on close and on foreground.
- Backend URL from `EXPO_PUBLIC_API_URL`. Plain HTTP is allowed only in the `development` EAS profile.
- Never `git push` without asking the user. Commit after each task on branch `experimental/android`.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The network drops, or the app is backgrounded mid-answer.** The partial answer stays, an error line says what happened (via `explainError`), and Regenerate works. → Task 5 test `keeps partial answer on stream error`.
2. **Backend unreachable** (laptop off, wrong IP, other Wi-Fi). A clear "Can't reach Cortex at <url>" within 10s, not an endless spinner. → Task 2 test `times out with a readable error`.
3. **Session token expires during long use.** A fresh token is fetched for every request, and a 401 sends you to sign-in, not an error loop. → Task 2 test `retries once with a fresh token on 401`.
4. **Very long threads and answers** (100+ turns, wide tables, long code lines). No jank, tables and code scroll sideways, and token updates are batched once per frame. → Task 6 test `batches tokens per frame`.
5. **Android 16 gesture navigation.** A swipe from the left edge is system Back, so the drawer opens on a swipe over the content (`swipeEdgeWidth` wide) or ☰, and Back closes sheets and the drawer before leaving a screen. → Task 4 device check, step "Back closes drawer first".

---

### Task 1: Scaffold, theme and fonts

**Files:**
- Create: `experimental/` (Expo app root: `package.json`, `app.config.ts`, `eas.json`, `metro.config.js`, `tsconfig.json`, `.npmrc`, `.gitignore`)
- Create: `experimental/src/theme/tokens.ts`, `experimental/src/theme/ThemeProvider.tsx`, `experimental/src/theme/type.ts`
- Test: `experimental/src/theme/tokens.test.ts`

**Interfaces:**
- Produces: `tokens: { light: Palette; dark: Palette }` with keys matching the CSS names (`shell, surface, ink, ink2, muted, hair, line, lineStrong, hover, pressed, onInk, accent, accentSoft, accentWash, accentInk, risk, riskSoft, warn, warnSoft, warnInk, ok, src: Record<SourceId|'files', string>`). `useTheme(): { c: Palette; scheme: 'light'|'dark'; pref: 'system'|'light'|'dark'; setPref }`. `type` text styles `display, headline, pageTitle, answer, title, item, body, small, note, readout, cite` (sizes from the spec, with readout/cite in Geist Mono).

- [ ] Step 1: Create `experimental/.npmrc` with the D: cache, then run `npx create-expo-app@latest experimental --template default` (pin the version you get in `package.json`). Add Expo Router drawer and every library in Tech Stack via `npx expo install`.
- [ ] Step 2: `app.config.ts`: name "Cortex", slug `cortex`, scheme `cortex`, `android.package` `app.cortex.android`, target 36, adaptive icon and splash from `../apps/web/public/brand/cortex-logo.png` (copied into `experimental/assets/`), `userInterfaceStyle: "automatic"`. `eas.json` profiles `development` (dev client, internal APK, cleartext allowed), `preview` (internal APK), `production` (app-bundle).
- [ ] Step 3: `metro.config.js`: `watchFolders: [path.resolve(__dirname, '../packages/shared')]`, and an alias `@cortex/shared` → `../packages/shared/src/index.ts`. Add `zod` as a dependency.
- [ ] Step 4: Write the failing test `tokens match globals.css`. It reads `../apps/web/src/app/globals.css`, parses every `--name: light-dark(#a, #b)`, and asserts `tokens.light[camel(name)] === a` and `tokens.dark[camel(name)] === b` for each key in `tokens` (including `src-*`). This guards against drift.
- [ ] Step 5: Run `npx jest src/theme`. Expected: FAIL.
- [ ] Step 6: Implement `tokens.ts`, `type.ts` and `ThemeProvider` (system scheme, plus a saved preference in SecureStore key `cortex.theme`). Load the fonts in the root layout and hold the splash screen until they're ready.
- [ ] Step 7: Run `npx jest src/theme && npx tsc --noEmit`. Expected: PASS.
- [ ] Step 8: Commit `feat(experimental): Expo app scaffold with Cortex tokens and fonts`.

### Task 2: API client and streaming

**Files:**
- Create: `experimental/src/api/client.ts`, `experimental/src/api/sse.ts`, `experimental/src/config.ts`
- Test: `experimental/src/api/sse.test.ts`, `experimental/src/api/client.test.ts`

**Interfaces:**
- Consumes: `explainError` from `@cortex/shared`.
- Produces: `api<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T>`, which throws `ApiError { status: number; message: string }`. `setTokenGetter(fn: () => Promise<string | null>)`. `streamSSE(path: string, body: unknown, onEvent: (e: AgentEvent) => void, signal: AbortSignal): Promise<void>` using `expo/fetch`. `parseSSE(buffer: string): { events: unknown[]; rest: string }`. `API_URL: string`.

- [ ] Step 1: Write failing tests:
  - `parseSSE splits events across chunk boundaries`: feeding `'data: {"type":"token","text":"a"}\n\ndata: {"ty'` yields 1 event, and rest `'data: {"ty'`.
  - `ignores blank and comment lines`.
  - `times out with a readable error`: a mocked fetch that never resolves with `timeoutMs: 50` rejects with a message containing "Can't reach Cortex".
  - `retries once with a fresh token on 401`: the token getter is called twice and the second request carries the new token.
  - `sends Bearer token`.
- [ ] Step 2: Run `npx jest src/api`. Expected: FAIL.
- [ ] Step 3: Implement. JSON errors use the backend's `{ error }` message. The default timeout is 10s for JSON calls; streams have no total timeout but fail after 30s with no bytes.
- [ ] Step 4: Run `npx jest src/api`. Expected: PASS.
- [ ] Step 5: Commit `feat(experimental): API client with Bearer auth and SSE streaming`.

### Task 3: Sign-in and first run

**Files:**
- Create: `experimental/app/_layout.tsx` (ClerkProvider with SecureStore token cache, ThemeProvider, GestureHandlerRootView, KeyboardProvider), `experimental/app/sign-in.tsx`, `experimental/app/welcome.tsx`, `experimental/app/tour.tsx`, `experimental/src/auth/onboarding.ts`
- Test: `experimental/src/auth/onboarding.test.ts`

**Interfaces:**
- Consumes: `api`, `setTokenGetter` (Task 2), `useTheme` (Task 1).
- Produces: `classifyUser(data: { chats: unknown[]; memory: unknown[]; connections: { connected: boolean }[] }): 'returning' | 'new'`. Route guard: signed out → `/sign-in`, first launch on this device → `/welcome` (returning) or `/tour` (new), then `/(app)`. SecureStore flag `cortex.onboarded`.

- [ ] Step 1: Failing tests: `new when nothing exists`. `returning when any chat`. `returning when any memory`. `returning when any connection connected`.
- [ ] Step 2: Run `npx jest src/auth`. Expected: FAIL.
- [ ] Step 3: Implement `classifyUser`. It reads `GET /api/chats`, `GET /api/memory` and `GET /api/connections` in parallel.
- [ ] Step 4: Build `sign-in.tsx` with Clerk `useSignIn`/`useSignUp`: Sign in / Create account tabs, the email code step (mono, spaced 6-digit field), `POST /api/email-check` before sign-up, and the one-line tagline. Google/GitHub buttons render only when `EXPO_PUBLIC_OAUTH_ENABLED === "1"`. Welcome-back is one swipeable card of phone tips. The tour adapts `apps/web/src/components/tour.tsx` copy to phone screens.
- [ ] Step 5: Run `npx jest && npx tsc --noEmit`. Expected: PASS.
- [ ] Step 6: **Device check (the riskiest assumption in the plan):** with a dev build and the dev server, sign in and confirm `GET /api/chats` returns 200 with the Bearer token. If it returns 401, stop and tell the user (see spec: Auth).
- [ ] Step 7: Commit `feat(experimental): Clerk sign-in and first-run welcome/tour`.

### Task 4: Drawer shell, chats and settings

**Files:**
- Create: `experimental/app/(app)/_layout.tsx` (Drawer), `experimental/src/nav/DrawerContent.tsx`, `experimental/src/nav/AccountSheet.tsx`, `experimental/src/chats/store.ts`, `experimental/src/chats/merge.ts` (copied from `apps/web/src/lib/recent.ts` `mergeThreads`, with a source comment), `experimental/src/settings.ts`
- Test: `experimental/src/chats/merge.test.ts`

**Interfaces:**
- Produces: `useChats(): { threads: SavedThread[]; save(t); update(id, patch); remove(id): SavedThread | undefined; restore(t); sync(): Promise<void> }`, persisted in AsyncStorage under `cortex.chats:<userId>` and synced with `GET/PUT /api/chats` and `DELETE /api/threads/[id]`. `SavedThread` is the same shape the web uses (`{ id, title, updatedAt, turns, pinned? }`). `settings`: `{ theme, sound, haptics, voice: 'en:female'… , useOtherChats }`, plus `workspace` via the existing workspace route/cookie.

- [ ] Step 1: Port the web's `mergeThreads` tests (and add `newest updatedAt wins`, `pinned survives merge`).
- [ ] Step 2: Run `npx jest src/chats`. Expected: FAIL, then copy the implementation, then PASS.
- [ ] Step 3: Drawer content in this order: wordmark "Cortex" (Fraunces) with an accent dot, New chat, Search chats (debounced `POST /api/chats/search`), Brief, Files, the "Pinned" and "Recent" readout labels with rows (long-press menu: Pin, Rename, Delete, with an undo snackbar), then an account row at the bottom opening `AccountSheet` (Memory, Connections, Workspace Sample/Live, Theme, Sound, Haptics, Voice, Sign out). Drawer `swipeEdgeWidth` is about 60% of the screen width.
- [ ] Step 4: Run `npx jest && npx tsc --noEmit`. Expected: PASS.
- [ ] Step 5: Device checks: "Back closes drawer first", the drawer opens on a content swipe, and a workspace switch survives an app restart.
- [ ] Step 6: Commit `feat(experimental): drawer navigation, chat sync and account settings`.

### Task 5: Agent run (native useAgent)

**Files:**
- Create: `experimental/src/agent/reduce.ts` (copied `newTurn`/`reduce`/`Turn` types from `apps/web/src/lib/use-agent.ts`), `experimental/src/agent/versions.ts` (copied from `apps/web/src/lib/versions.ts`), `experimental/src/agent/useAgent.ts`
- Test: `experimental/src/agent/reduce.test.ts`, `experimental/src/agent/useAgent.test.ts`

**Interfaces:**
- Consumes: `streamSSE` (Task 2), `useChats` (Task 4).
- Produces: `useAgent(threadId: string): { turns: Turn[]; ask(q: string, opts: { mode: RunMode; attachments?: Attachment[]; language?: 'en'|'hi'|'mr' }): void; stop(): void; regenerate(turnId: string): void; selectVersion(turnId: string, i: number): void; decide(actionId: string, decision: 'approve'|'decline', edited?: unknown): Promise<void> }`. The request body matches `AskBody` in `apps/web/src/app/api/ask/route.ts`, including `history`, `threadId` and `useOtherChats`.

- [ ] Step 1: Failing tests: `reduce builds answer from tokens then answer event`. `verdict sets claims, followups, groundedness`. `keeps partial answer on stream error` (tokens, then a thrown stream → `turn.answer` keeps its text, `turn.error` is set, `done` is true). `stop aborts and marks Stopped`. `regenerate adds a version and sends regenerate:true`.
- [ ] Step 2: Run `npx jest src/agent`. Expected: FAIL.
- [ ] Step 3: Implement. Save the thread to `useChats` on `done`, and call `POST /api/title` for the first turn, the same way the web does.
- [ ] Step 4: Run `npx jest src/agent`. Expected: PASS.
- [ ] Step 5: Commit `feat(experimental): streaming agent runs with stop, regenerate and versions`.

### Task 6: Ask screen

**Files:**
- Create: `experimental/app/(app)/index.tsx`, `experimental/src/ask/Composer.tsx`, `experimental/src/ask/PlusSheet.tsx`, `experimental/src/ask/TurnView.tsx`, `experimental/src/ask/Answer.tsx`, `experimental/src/ask/Readout.tsx`, `experimental/src/ask/CodePanel.tsx`, `experimental/src/ask/Followups.tsx`, `experimental/src/ask/BriefPill.tsx`, `experimental/src/ask/useFrameBatch.ts`, `experimental/src/brief/seen.ts`
- Test: `experimental/src/ask/useFrameBatch.test.ts`, `experimental/src/brief/seen.test.ts`

**Interfaces:**
- Consumes: `useAgent` (Task 5), `type`/`useTheme` (Task 1).
- Produces: `useFrameBatch<T>(value: T): T` (re-renders at most once per animation frame). `unseenCount(items: { id: string }[], seenIds: string[]): number`, with `markSeen(ids)` persisting `cortex.brief.seen`.

- [ ] Step 1: Failing tests: `batches tokens per frame` (50 updates in one frame cause 1 render). `unseenCount counts ids not seen`. `pill hidden at 0`.
- [ ] Step 2: Run `npx jest src/ask src/brief`. Expected: FAIL, then implement, then PASS.
- [ ] Step 3: Build the screen.
  - Empty state: Fraunces `display` prompt, suggestion chips from `GET /api/suggestions`, `BriefPill` from `GET /api/brief`.
  - Thread: FlashList of `TurnView`s. Each has the question as a Fraunces `headline`, the readout line (mono, with a pulsing accent dot while working and a Trace disclosure), and the answer markdown. Claim weights 200/330/460 animate over 900ms with `cubic-bezier(0.16,1,0.3,1)`. The partial-claim underline is dotted accent. Citations are raised mono numerals with a 5px source dot. Tables and `CodePanel` (dark `#0f1115`, text `#d5d8df`, Copy → "Copied") scroll sideways. Then the conflict band.
  - "Jump to latest" pill when scrolled up. Follow-up chips in a horizontal row above the composer, shown only when the last turn is done.
  - `Composer` sits in `KeyboardStickyView`. Multi-line, 2,000-character limit with a counter near the limit. The accent send circle becomes an ink stop square while running.
  - `PlusSheet`: attach files (`expo-document-picker` → `POST /api/files`, with upload state chips), voice mode, Fast/Deep segmented control, the "Use my other chats" toggle.
  - Mic dictation: record, then `POST /api/transcribe`.
  - Haptics: light on send, success on done, error on fail, all gated by settings.
- [ ] Step 4: Run `npx jest && npx tsc --noEmit`. Expected: PASS.
- [ ] Step 5: Device checks: the keyboard never covers the composer, a 3,000-word answer with a table and a 200-character code line streams without dropped frames, and large system font size still lays out.
- [ ] Step 6: Commit `feat(experimental): Ask screen with streaming answers, composer and follow-ups`.

### Task 7: Sources, actions and answer actions

**Files:**
- Create: `experimental/src/ask/SourcesSheet.tsx`, `experimental/src/ask/ActionCard.tsx`, `experimental/src/ask/AnswerActions.tsx`

**Interfaces:**
- Consumes: `useAgent().decide`, `Turn.evidence/actions/versions` (Task 5).

- [ ] Step 1: Build `SourcesSheet`: a bottom sheet up to 85% height, opened from any citation and scrolled to it. Each source has a readout line (dot, number, source, author, date), a title, a two-line quote and an Open link (`Linking.openURL`).
- [ ] Step 2: Build `ActionCard` to the spec's action-card rules. The proposal sits in an inset shell well, with Edit (ghost), Decline (secondary) and Approve / "Approve & send" (primary) → `POST /api/actions/[id]`. The decided stamp (Done green, Declined slate, Failed red) springs in and stays.
- [ ] Step 3: Build `AnswerActions`: Copy (`expo-clipboard`), Regenerate, a version switcher "‹ 2/3 ›", Share (`POST /api/share`, then the Android share sheet with the link).
- [ ] Step 4: Run `npx tsc --noEmit`. On the device: approve a sample-workspace action and see the stamp. Share opens the system sheet.
- [ ] Step 5: Commit `feat(experimental): sources sheet, action approvals and answer actions`.

### Task 8: Brief, Files, Memory, Connections

**Files:**
- Create: `experimental/app/(app)/brief.tsx`, `files.tsx`, `memory.tsx`, `connections.tsx`
- Test: `experimental/src/connections/refresh.test.ts`

**Interfaces:**
- Consumes: `api`, `markSeen` (Task 6). Response shapes come from the matching `apps/web/src/app/api/*/route.ts` and `apps/web/src/components/*-view.tsx`. Mirror the fields those views read.
- Produces: `useConnections(): { list; connect(id): Promise<void>; disconnect(id): Promise<void>; refresh() }`. `connect` opens `redirectUrl` with `WebBrowser.openBrowserAsync`, then refreshes on close. It also refreshes on `AppState` → active.

- [ ] Step 1: Failing test `refreshes after browser closes and on foreground` (mock WebBrowser and AppState).
- [ ] Step 2: Run, see it FAIL, implement, see it PASS.
- [ ] Step 3: Build the screens as ruled rows (no cards), with Fraunces page titles, pull-to-refresh, empty states, and errors through `explainError`.
  - Brief marks its items seen on open.
  - Files supports upload and delete with an undo snackbar.
  - Memory supports add, edit (`PATCH`) and delete.
  - Connections shows an 8px source dot, connected status in `ok`, and Connect/Disconnect. The workspace notice appears when in Sample.
- [ ] Step 4: Run `npx jest && npx tsc --noEmit`. Expected: PASS. On the device: connect one app end to end in the Live workspace.
- [ ] Step 5: Commit `feat(experimental): Brief, Files, Memory and Connections screens`.

### Task 9: Voice mode

**Files:**
- Create: `experimental/app/(app)/voice.tsx`, `experimental/src/voice/vad.ts`, `experimental/src/voice/engine.ts`, `experimental/src/voice/Orb.tsx`, `experimental/src/voice/personas.ts` (copied from `apps/web/src/lib/voice.ts`)
- Test: `experimental/src/voice/vad.test.ts`

**Interfaces:**
- Consumes: `useAgent().ask` with `language` (Task 5), `/api/voice/status`, `/api/voice/stt` (multipart WAV/M4A, as `apps/web/src/server/stt.ts` accepts), `/api/voice/tts`.
- Produces: `createVad(opts?): { push(levelDb: number, nowMs: number, speaking: boolean): 'start'|'barge'|'end'|'discard'|null }` with the web's constants: `START_MS 140`, `BARGE_MS 300`, `END_SILENCE_MS 1200`, `MIN_SPEECH_MS 250`, `MAX_TURN_MS 28000`, `PREROLL_MS 400` (a ring buffer only where the recorder allows it). `PREFETCH = 2` sentences for TTS.

- [ ] Step 1: Failing tests: `starts after 140ms voiced`. `ends after 1200ms silence`. `discards under 250ms`. `barge needs 300ms while speaking`. `forces end at 28s`.
- [ ] Step 2: Run, see it FAIL, implement, see it PASS.
- [ ] Step 3: Build the engine. `expo-audio` records with metering (~50ms), feeds the VAD, and uploads each turn to `/api/voice/stt`. The answer text is split into sentences, fetched from `/api/voice/tts` two ahead, and played in a queue. Barge-in stops playback. If Sarvam reports exhausted, the session switches to `expo-speech`. Approvals work by voice ("approve" / "decline") and through on-screen buttons.
- [ ] Step 4: `Orb`: a Reanimated circle driven by mic and playback levels, in the accent colour, still under reduced motion. Language and persona come from settings, and the mic permission prompt has a plain explanation.
- [ ] Step 5: Device checks: a Hindi question gets a Hindi spoken answer, barge-in works, and denying mic permission shows a way back.
- [ ] Step 6: Commit `feat(experimental): voice mode with native VAD, Sarvam speech and fallback`.

### Task 10: Polish, release config and size

**Files:**
- Modify: `experimental/app.config.ts`, `experimental/eas.json`
- Create: `experimental/README.md` (setup on D:, LAN dev server, EAS builds, env vars)

- [ ] Step 1: Press scale 0.97 at 160ms on every pressable. Arriving lists rise 6px and fade, 40ms apart, capped at 8. Reduced motion is respected throughout.
- [ ] Step 1b: Sounds are left out in v1 (the spec allows it), and the Sound setting is hidden until they're added.
- [ ] Step 2: Release settings: Hermes, `enableProguardInReleaseBuilds`, `enableShrinkResourcesInReleaseBuilds`. Cleartext only in `development`.
- [ ] Step 3: Run `npx expo-doctor`, `npx jest`, `npx tsc --noEmit`. Expected: all clean.
- [ ] Step 4: Ask the user to run `eas login` once (it's an interactive account step), then `eas build -p android --profile preview`. Report the APK size and the estimated per-device install size from the `production` build. Target: under ~30 MB.
- [ ] Step 5: Commit `chore(experimental): release config, motion polish and README`.

### Task 11 (phase 2): Admin sign-up approval / waitlist (web and app)

Starts only after Tasks 1–10 work on the device. This task **edits existing web code**.

**Files:**
- Modify: `apps/web/src/server/db.ts` (users table: `approved INTEGER NOT NULL DEFAULT 1`, migrated with `ALTER TABLE … ADD COLUMN` if missing, so existing rows stay approved), `apps/web/src/server/cortex.ts` (`session()`), `apps/web/src/server/admin.ts` (setting `signupApproval: 'auto'|'manual'`, default `'auto'`, plus `listUsers` gains `approved`), `apps/web/src/app/api/admin/settings/route.ts`, `apps/web/src/app/api/admin/users/[id]/route.ts` (PATCH `{ approved: boolean }`, reject = disable), `apps/web/src/components/admin-view.tsx` (setting toggle, Pending section with Approve/Reject, a pending count on the Admin link in `shell.tsx`)
- Create: `apps/web/src/app/waitlist/page.tsx`, `apps/web/src/app/api/me/route.ts` (`{ status: 'approved'|'pending' }`, readable while pending), `apps/web/src/lib/approval.ts`, `experimental/app/waitlist.tsx`
- Test: `apps/web/src/lib/approval.test.ts`

**Interfaces:**
- Produces: `needsApproval(user: { role: string; email: string; verified: boolean; approved: boolean }, mode: 'auto'|'manual', isOwner: (e: string, v: boolean) => boolean): boolean`. A pending session makes every API route return 403 `{ error: "You're on the waitlist. The admin will approve your account soon.", waitlist: true }`. Pages redirect to `/waitlist`. The app shows `waitlist.tsx` on that 403 and re-checks `/api/me` on foreground and pull-to-refresh.

- [ ] Step 1: Run `git fetch && git status -sb && git log origin/main..HEAD --oneline`. If anything is unpushed, **stop and ask the user before pushing**.
- [ ] Step 2: Failing tests: `auto mode never waits`. `manual mode waits for unapproved`. `admin never waits`. `owner never waits`. `approved user passes in manual`.
- [ ] Step 3: Run `npm test -- approval`. Expected: FAIL, then implement, then PASS.
- [ ] Step 4: New users created in `upsertUser` while the mode is `manual` get `approved = 0`. Everyone else defaults to 1. Wire `session()` so a pending user returns a distinct pending state, not `null`, so the waitlist screen can tell "waiting" from "signed out".
- [ ] Step 5: Run `npm run typecheck && npm test && npm run build`. Expected: all pass. Then check the web by hand: auto mode behaves as before, manual mode sends a new account to the waitlist, and approve lets them in.
- [ ] Step 6: Build `experimental/app/waitlist.tsx` and handle `waitlist: true` in `api()` (Task 2).
- [ ] Step 7: Commit `feat: admin sign-up approval with waitlist on web and app`. Ask before pushing.
