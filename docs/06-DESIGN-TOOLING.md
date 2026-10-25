# Design Tooling Setup (Codex / Claude Code)

> Note: in the original video transcript, "google/gogolee" is a mistranscription of the coding agent (**Claude**/**Codex**).

## 0. Install Codex CLI

```bash
# Requires Node.js LTS (you have v24)
npm install -g @openai/codex      # NOT `npm i -g codex`, which is an unrelated package
codex --version
codex                              # first run → sign in with your ChatGPT account
```

- On Windows, OpenAI and most guides recommend running Codex inside **WSL** for the most reliable sandbox. Native PowerShell works but uses an experimental sandbox.
- Update with `npm install -g @openai/codex@latest`.
- Codex usage limits depend on your ChatGPT plan.

## 1. Impeccable (design skill that makes UIs look less AI-generated)

```bash
# From the project root; auto-detects Claude Code / Codex / Cursor
npx skills add pbakaus/impeccable
# or (per the README)
npx impeccable install
```

Then run `/impeccable init` inside your agent. This saves design context to `.impeccable.md`. In Codex, the commands are invoked as `/prompts:audit`, `/prompts:polish`, etc. Docs: https://impeccable.style · https://github.com/pbakaus/impeccable

## 2. Motion (animations for React)

```bash
pnpm --filter web add motion
```

```tsx
import { motion, AnimatePresence } from "motion/react";
```

Docs: https://motion.dev/docs/react-installation

## 3. UI UX Pro Max (typography, colours, spacing and UX rules)

```bash
npm install -g uipro-cli
uipro init --ai codex     # or: --ai claude
```

In Codex it activates automatically on UI/UX requests. Repo: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

## 4. Visual reference

- **MotionSites** (motionsites.ai) sells hero-section prompts (≈$149/yr). It is **paid**, which conflicts with the all-free rule.
- Free alternatives: browse **Dribbble**, **Mobbin (free tier)**, **Godly.website** or **Linear/Vercel/Raycast's** own sites, then describe the look in a prompt. Suggested reference for Cortex: *"Linear-style dark minimal, Vercel-like typography, Raycast-style command bar."*

## 5. Prompt pattern

```
Build the Cortex chat + trace screen (see docs/04-INTERFACES.md).
Visual reference: <pasted prompt / description>.
Use Motion for step reveals in the trace panel, shadcn/ui primitives,
follow Impeccable + UI UX Pro Max guidance. Minimal, one accent colour.
```
