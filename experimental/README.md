# Cortex for Android (experimental)

A native Android app of Cortex, built with Expo (SDK 58, React Native 0.88) and Expo Router. It talks to the existing
web app's `/api/*` routes, unchanged, and signs in with the same Clerk accounts. Design: `docs/2026-11-07-cortex-android-design.md`.

This folder is its own project: it isn't part of the root npm workspaces and changes nothing outside `experimental/`.

## What's in it

Everything the web app does except the admin panel, laid out for a phone:

- **Ask**: streaming answers with verified claims and citations, the sources sheet, action cards to approve, regenerate
  with versions, edit a question, Fast/Deep, attachments, dictation, follow-ups, Copy and Share (Android share sheet).
- **Drawer**: new chat, search (by words, and by meaning when the server has a Gemini key), Brief, Files, pinned and
  recent chats (long-press to pin, rename, delete with Undo), and the account sheet (Sources, Memory, tour, theme,
  haptics, voice, sign out).
- **Brief** (with a "Brief · N new" pill on a new chat), **Files**, **Memory**, **Connections** (Sample/Live, connect in an
  in-app browser sheet, disconnect).
- **Voice mode**: hands-free, English/Hindi/Marathi, Sarvam voices with the server's backups and Android's own voice as
  the last resort, barge-in, hold to talk, approvals by voice.
- **First run**: a short welcome back for people who already use the web, the full tour for new people.

Brand tokens come from the web's live `globals.css`; `src/theme/tokens.test.ts` fails if they drift apart. Fonts are
static cuts of the web's variable fonts (`scripts/make-fonts.py`): Fraunces at SOFT 100, Geist at the exact weights.

## Set up (once)

Everything downloads to D: (`.npmrc` points the npm cache at `D:/dev-cache/npm`).

```bash
cd experimental
npm install
cp .env.example .env.local     # then fill it in
```

## Run it on your phone

1. Start the web app on the laptop so the phone can reach it: `npm run dev` at the repo root, but bound to the network:
   `npx next dev -H 0.0.0.0` inside `apps/web`. Put the laptop's LAN address in `EXPO_PUBLIC_API_URL`.
2. Make a development build once (it has the native modules: keyboard, audio, Clerk):
   ```bash
   npx eas-cli@latest login                                   # free Expo account, once
   npx eas-cli@latest build -p android --profile development  # builds in Expo's cloud, gives an APK link
   ```
   Install the APK on the phone from the link.
3. `npx expo start --dev-client`, then open Cortex on the phone; it finds the laptop on the same Wi-Fi.

## Builds

| Profile | What | Plain HTTP to the laptop |
|---|---|---|
| `development` | dev client APK, for daily work | allowed |
| `preview` | release APK to install from a link | no (needs an HTTPS backend) |
| `production` | Play Store app bundle (`.aab`), auto-incremented version | no |

Release builds use Hermes, R8 minify and resource shrinking. Icons are imported one file each (`src/ui/icons.ts`) so
only the ones used are bundled.

## Checks

```bash
npm test            # jest: tokens vs the web, SSE parsing, the agent store, chat sync, voice turn-taking, …
npm run typecheck
npx expo-doctor
```

## Known limits to check on a device

- Sign-in sends Clerk's session token as `Authorization: Bearer`; the web's Clerk middleware should accept it.
- Connecting an app ends on Composio's "connected" page (the Connect key has no return address): close the sheet and
  Connections refreshes.
- Voice mode listens through `expo-audio`'s live stream; on speakerphone, Cortex's own voice could be heard as you
  talking. Mute or hold-to-talk if that happens.
