# Cortex for Android: design

Status: v3. The user said to build the app first, then phase 2 (2026-11-07). No app code exists yet.

## Intent

Cortex is already a web app: cited, verified answers from your work tools (Gmail, Calendar, Drive, Notion, Slack, GitHub, uploaded files, memory), plus actions you approve. This project builds a **native Android app** of the same product.

Why: the user wants to open Cortex on the phone, chat quickly, get tasks done, and have it feel as smooth as the Claude and ChatGPT Android apps. A home-screen web app ("web APK") was considered and rejected because it doesn't feel native enough.

What success looks like: on a normal Android 16 phone, opening the app lands in chat at once, typing and streaming never stutter, the keyboard never hides the composer, and every web feature (except admin) can be reached in a few thumb-friendly taps. Anyone who knows the web app recognises it as Cortex right away.

## Goals

- Native Android app, aimed at **Android 16 (API 36)**, built with **React Native + Expo** in **TypeScript**.
- **Feature parity with the web app, except admin**, rearranged for a phone (see Feature map).
- **Voice mode in v1.**
- **Brand identical to the live web app** (see Brand), with interaction design made for phones.
- A small install, and ready for the **Google Play Store** later.

## Non-goals

- iOS for now. Choosing React Native keeps it possible later, but nothing in v1 is tested on iPhone.
- The admin panel. It stays on the web only.
- Deployment and hosting. The user set that aside for now.
- Offline answering. Answers need the backend. Cached chat history may be readable offline (builder's call).

## Anti-goals (a failure even if it technically works)

- It feels like a website in a wrapper: web-style scrolling, no haptics, a keyboard that covers the input, janky streaming.
- It drifts from the brand: chat bubbles with sparkles, a different accent colour, system fonts in place of Fraunces and Geist, or cards stacked on cards.
- **Any change to existing code.** No existing file in `apps/`, `packages/`, `services/` or the root config is edited. The only addition allowed is new mobile-only files under `apps/web/src/app/api/mobile/`. The web app must behave exactly as before.
- A heavy app: big bundled assets, every native library in the box, or debug weight in release.
- Large downloads on the C: drive.

## Constraints

1. **Location.** Everything except the new mobile API files lives under `experimental/` at the repo root. It is its own project with its own `package.json` and lockfile, and it is **not** added to the root npm workspaces. Adding it would change the root `package.json`, which is existing code.
2. **Reusing existing code without modifying it.** The app may import the `@cortex/shared` types and pure logic, either through a relative path or Metro `watchFolders` config inside `experimental/`, or by copying the files into `experimental/`. Pure browser-free logic from `apps/web/src/lib` (the `use-agent` reducer, `versions.ts`, `chat-search.ts`, `snippet.ts`, `voice.ts` personas) is copied or imported the same way. Builder decides how, but must not edit the source files. Anything that touches `localStorage`, `window` or the DOM is re-implemented natively.
3. **The backend is the existing Next.js app**, unchanged. The phone calls its `/api/*` routes. During development the phone reaches the dev server on the user's laptop over Wi-Fi (LAN IP, configured through an env var in `experimental/`).
4. **Disk.** All downloads, caches and toolchains go on the **D: drive** (it has ~143 GB free). The C: drive fills easily. Set `npm_config_cache`, the Expo/EAS cache and any Gradle or Android paths to D:. Ask before any install over ~1 GB.
5. **Android 16 runs edge-to-edge.** You can't opt out, and the window doesn't resize for the keyboard. Content must respect the system insets, and keyboard handling must be done in-app.
6. **Git.** Commit freely, but always ask before any `git push`.

## Decisions made by the user

| Decision | Choice |
|---|---|
| Platform | Native Android app, not a web APK |
| Framework | React Native (Expo), to reuse the existing TypeScript code and data |
| Folder | `experimental/`, existing codebase untouched |
| Features | All web features, laid out for mobile |
| Brand | The **live** web app as it ships today (`apps/web/src/app/globals.css`, `layout.tsx`), **not** the older `apps/web/DESIGN.md` where they differ |
| Navigation | Chat is home. A left **drawer** (swipe from the edge or tap ☰) holds New chat, Search, Brief, Files, Pinned and Recent chats, and the account menu at the bottom. A **"Brief · N new" pill** sits at the top of the home screen |
| Chat look | The web brand identity, with the UX built for one-handed phone use |
| Voice | In v1 |
| Admin | Web only |
| Downloads | D: drive |
| Store | Play Store later, and the app shouldn't be heavy |
| Sign-in during development | Email + password and the 6-digit code only. Google and GitHub sign-in come at deployment, after the user turns on Clerk's Native API and allows the app's redirect link |
| Connector sign-in | Opens **inside the app** (an in-app browser sheet over Cortex, not the separate browser app) and closes by itself when done, returning to Connections |
| Backend additions | Allowed **only as new, mobile-only files** under `apps/web/src/app/api/mobile/`, and only if needed. v1 needs none. No existing web file is edited, so the website can't break |

## Calls made by Claude (please check)

- **Build path: Expo EAS Build** (cloud). It produces the Play Store `.aab` and handles the upload signing key. Google Play then sends each phone only its own CPU architecture, which keeps installs small. For testing, an "internal" APK profile installs straight from a link. This needs a free Expo account. No Android Studio or SDK on the laptop is needed. A local SDK on D: stays possible later, for an emulator.
- **Chat look: no bubbles**, as on the web. Your question shows as a Fraunces heading over a full-width answer with weighted claims and citations. On the phone, the earlier turns stay in the scroll as compact sections, a "Jump to latest" pill appears when you scroll up, and follow-up chips sit in a swipeable row above the composer.
- **Haptics:** light taps on send, approve and decline, a soft tick when an answer finishes, and an error buzz on failure. They follow a setting, and the system "touch feedback" setting turns them off too.
- **Backend and environments:** v1 talks only to the laptop dev server over Wi-Fi, with the **development** Clerk instance (`pk_test_…`). The backend URL and Clerk key come from EAS build profiles. A `development` profile allows plain-HTTP traffic for the LAN. `preview` and `production` profiles don't, and are ready to point at the Lightsail HTTPS server and the production Clerk keys once deployment resumes.
- **Android version:** Expo's default minimum (Android 7 / API 24) with target API 36. Testing happens on the user's own Android 16 phone. Insets and the keyboard are handled through `react-native-keyboard-controller` and safe-area insets, which cover older versions too.
- **"Brief · N new" pill:** N counts the brief items the phone hasn't seen since Brief was last opened, kept on the device. Nothing changes on the server. The pill hides when N is 0.
- **Sounds:** the web's synthesised sounds (send tick, answer chime) become small bundled audio clips, or are left out in v1 with the setting hidden. Builder's call, as long as it stays light.

## Brand: the live web tokens

Use these values exactly. Light and dark both apply, following the system with a manual System/Light/Dark choice like the web.

| Token | Light | Dark |
|---|---|---|
| shell (page ground) | #f4f3f0 | #0b0c10 |
| surface | #ffffff | #111318 |
| ink | #1a1916 | #e8eaf0 |
| ink-2 | #3b3a36 | #c5c9d3 |
| muted | #625f58 | #9097a6 |
| hair | #6f6b63 | #848b9c |
| line | #e8e6e1 | #1d2028 |
| line-strong | #cdc9c1 | #2c303b |
| hover / pressed | #ebe9e4 / #e3e1db | #1a1d24 / #22252e |
| on-ink | #ffffff | #0b0c10 |
| accent | #5443d6 | #8794ff |
| accent-soft / wash | #eeebfd / #f7f6fe | #1c2142 / #151933 |
| accent-ink | #4434c0 | #b3bbff |
| risk / soft | #d93a3f / #fdf2f2 | #ff6b70 / #2a1519 |
| warn / soft / ink | #b35a00 / #fff6ea / #7a3d00 | #f5a04f / #291e12 / #ffcf9c |
| ok | #0b7a57 | #3dd68c |
| source marks | gmail #e5484d, calendar #12a594, drive #e5a000, notion #646b78, slack #8e4ec6, github #1b1a17, web #3e63dd, memory #5443d6, files #c2410c | gmail #ff6369, calendar #2ebdab, drive #f5b52e, notion #9aa1b0, slack #b07ee6, github #e8eaf0, web #6e8df5, memory #8794ff, files #fb8b4c |

- **Fonts:** **Fraunces** (soft, rounded terminals: `SOFT` 100, optical sizing) for headings, the wordmark and the empty-state prompt. **Geist** for everything you read and tap. **Geist Mono** only for readouts, citation numerals and code. Bundle only the weights actually used, to keep size down.
- **Wordmark:** `apps/web/public/brand/cortex-logo.svg` / `.png` are the source for the app icon (an adaptive icon with a monochrome layer for Android themed icons) and the splash screen. Note: `apps/web/public/brand/` is currently untracked in git.
- **Rules carried over from the web:** indigo is the only accent. Source colours appear only as small round dots. Structure is drawn with 1px hairlines, not boxed cards. A claim's weight shows its verification state (pending light grey, partial with a dotted indigo underline, supported at full weight), with a slow ease when it changes. Readouts are small uppercase mono. Action cards need an explicit Approve, and the decision stays stamped on the card. Code goes in a dark terminal panel with Copy. In light mode, depth comes from tone plus the soft two-part `--raise` shadow. In dark mode, from tone alone.
- **Motion:** strong ease-out for things arriving, a soft spring for things settling. Feedback stays under 300ms. Presses scale to 0.97. Respect the system "remove animations" setting.

## Feature map: web → phone

Everything below exists on the web today and must exist on the phone.

**Ask (home screen)**
- Empty state: Fraunces prompt, suggestion chips (`/api/suggestions`), the Brief pill.
- Composer pinned above the keyboard: multi-line input with a 2,000-character limit, a **+** sheet (attach files, voice mode, Fast/Deep, "use my other chats" toggle), mic dictation (`/api/transcribe`), and a send button that turns into stop while running.
- Streaming answer over SSE from `POST /api/ask`, rendered as markdown with claims, citations, conflicts, missing data and follow-ups, using the same event reducer as `use-agent.ts`.
- Readout line (mode, searches, Verified n/m, time) with a Trace disclosure.
- **Sources** in a bottom sheet. Tapping a citation opens the sheet at that source.
- **Action cards** (approve, decline, edit) → `POST /api/actions/[id]`.
- Answer actions: copy, regenerate (with version switching), share (`/api/share`, through the Android share sheet), and "Jump to latest".
- Attachments: pick files (`expo-document-picker`) → `/api/files`.
- Thread titles (`/api/title`), deleting a thread (`/api/threads/[id]`).

**Drawer**
- New chat, Search chats (`/api/chats/search`), Brief, Files.
- Pinned and Recent chats, synced with `/api/chats`. Long-press for pin, rename and delete, with an undo snackbar.
- Account row at the bottom opening Memory, Connections, workspace switch (Sample/Live), theme, sound, haptics, voice persona, sign out.

**Other screens**
- **Brief** (`/api/brief`), **Files** (`/api/files`), **Memory** (`/api/memory`, add, edit, delete), **Connections** (`/api/connections`, connect through the in-app browser, disconnect).
- **Sign-in:** email + password with the 6-digit code now, using Clerk's Expo SDK on the same Clerk instance. Google and GitHub buttons are built but hidden behind a flag until deployment, when the Clerk dashboard is set up. Disposable emails are refused, the same as the web (`/api/email-check`). Same card UI on the phone as the web's phone layout, one-line tagline.
- **First-run tour**, adapted to the phone.
- **Voice mode** (v1): full screen with the Cortex-native orb visual. Talks through `/api/voice/stt`, `/api/voice/tts` and `/api/voice/status` with Sarvam voices and Hindi/Marathi/English. Uses `voice.ts` personas. Native mic recording with voice-activity detection (start, end of turn, barge-in) and a playback queue that fetches ahead, like `components/voice/engine.ts`. Approvals work in voice. The free fallback voice becomes Android's own text-to-speech (`expo-speech`).
- **Error and empty states** use the shared `explainError`/`explainFailure` text from `@cortex/shared`.

**Who's signing in: first run on the phone**
- **Already uses the web:** after sign-in, the app pulls their chats (`/api/chats`), memory, files, connections and workspace from the server, so everything is already there. A short "Welcome back" with one swipe of tips about the phone (swipe for chats, + for tools, voice) and no full tour.
- **New to Cortex:** sign-up with email and code, then the full phone tour (adapted from `tour.tsx`), then the empty home screen with suggestions and a nudge to connect a first app.
- The app tells these apart by asking the server whether the account has any chats, memory or connections. It doesn't guess from the device.

**Left out:** Admin. The public share page (`/s/[id]`) stays on the web, and shares are just links.

## Backend contract and known risks

- **Auth:** the web routes call Clerk `auth()`. Mobile routes (`/api/mobile/*`) reuse `session()` and the other helpers from `@/server/cortex` by importing them, never by editing them. The phone sends the Clerk session token as `Authorization: Bearer <token>`, which Clerk's Next.js middleware accepts. **Verify early** with one authenticated call. If it fails, stop and tell the user, because fixing it would mean changing the web code.
- **Cookies:** the backend reads `cortex_ws` (workspace) and `cortex_uid` (anonymous id) cookies and sets them through `Set-Cookie`. React Native on Android keeps a cookie jar, so these should just work. Verify the workspace switch survives an app restart. A signed-in user without `cortex_uid` falls back to their user id (`dataIdFor`), which is fine.
- **CORS** doesn't apply to native fetch.
- **SSE streaming:** React Native's built-in `fetch` doesn't stream response bodies. Use `expo/fetch` (it streams) or an SSE library. Test on a real device.
- **Connector sign-in (settled 2026-11-07).** Both existing connectors ignore `callbackUrl`, and the user's `COMPOSIO_API_KEY` is a Connect key (`ck_…`), whose hosted `manage add` offers no callback at all. So the app **calls the existing `POST /api/connections/[id]` unchanged** and opens the returned link with `expo-web-browser` (a Chrome Custom Tab sheet over the app, not the separate browser app). The sheet ends on Composio's "connected" page, the user taps ✕, and the app refreshes Connections when the sheet closes (and whenever the app returns to the foreground). **No new web route in v1.** If the key is ever switched to a project SDK key, add `apps/web/src/app/api/mobile/connections/[id]/route.ts` passing `callbackUrl: "cortex://connections?connected=<id>"` so the sheet closes by itself.
- **Voice audio:** Web Audio doesn't exist in React Native. The mic, voice detection and playback have to be rebuilt natively. This is the biggest piece of work in v1.

## Smoothness requirements (from research into the Claude and ChatGPT apps and current React Native practice)

- `react-native-keyboard-controller` for keyboard-aware layout under edge-to-edge.
- `react-native-reanimated` + `react-native-gesture-handler` for the drawer, sheets and press feedback, running off the JS thread.
- A virtualised list for long threads (FlashList or the keyboard-controller chat list).
- Streaming markdown that doesn't jank: batch token updates (for example once per frame), and avoid HTML-based renderers.
- Expo Router for screens and the drawer. `expo-haptics`, `expo-secure-store` for tokens.
- Test on a real Android phone, not just an emulator.

## Size budget

- Release build only, with Hermes and R8/minify on.
- The Play Store `.aab` gets split per device automatically.
- Bundle only the font weights actually used. No large images. The orb is drawn in code.
- Rough target: under ~30 MB installed (builder's call, but report the real size).

## Left to the builder

The exact libraries within the list above, folder structure inside `experimental/`, how shared code is imported or copied, the state management, the markdown renderer, the sound approach, the test setup, and how the dev backend URL is configured.

## Phase 2 (after the app is built): admin approval / waitlist

Requested 2026-11-07. Built **after** the app works end to end. This is the one phase that **does** edit the existing web code. It applies to both the web and the app.

**Why:** Cortex runs on free-tier limits (LLMs, Composio, Sarvam). Approval stops strangers from signing up and burning through them.

**What:**
- The admin panel (web only) gets a **Sign-up approval** setting with two choices: **Auto-approve** (anyone who signs up can use Cortex, like today) or **Manual approval** (new accounts wait for the admin).
- In manual mode a new account is **pending**. On the web and in the app, a pending user sees a waitlist screen ("You're on the waitlist. The admin will approve your account soon.") and nothing else. Every API route refuses them, the same way the existing `disabled` flag does in `session()`.
- The admin panel lists pending accounts with **Approve** and **Reject**. Approving lets them in on their next request. The phone's waitlist screen re-checks when it comes to the foreground and has a pull-to-refresh.
- Admins and owner emails (`CORTEX_OWNER_EMAILS`) are always approved.

**Before starting:** check that the latest commit is on GitHub (`git status` / `git log origin/main..`). If it isn't, **ask the user before pushing**. They always confirm pushes.

**Claude's calls (check):**
- Accounts that exist when the feature ships are approved automatically. Only accounts created after manual mode is on wait.
- The setting defaults to **Auto-approve**, so nothing changes until the admin flips it.
- The admin learns about new sign-ups from a pending count on the Admin link and panel. No email in v1, since that would need a mail service.
