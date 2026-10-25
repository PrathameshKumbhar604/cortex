# Design Tooling Setup (Claude Code)

Cortex is built only with Claude-compatible tooling. The target look is a clean, premium, YC-startup aesthetic.

## 1. UI UX Pro Max (Claude skill: typography, colour, spacing and UX rules)

```bash
npx ui-ux-pro-max-cli init --ai claude      # installs to .claude/skills/ui-ux-pro-max/
# or, inside Claude Code:
# /plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
# /plugin install ui-ux-pro-max@ui-ux-pro-max-skill
```

It activates automatically on UI work in Claude Code. To generate a design system:

```bash
python .claude/skills/ui-ux-pro-max/scripts/search.py "AI SaaS dashboard minimal premium" --design-system --persist -p "Cortex"
```

Repo: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

## 2. Impeccable (Claude skill: anti-generic design review)

```bash
npx impeccable install           # from the repo root
# or, inside Claude Code: /plugin marketplace add pbakaus/impeccable
```

Inside Claude Code, run `/impeccable init` once (it writes `PRODUCT.md`), then use `/impeccable critique`, `/impeccable audit`, `/impeccable polish`, `/impeccable animate`, `/impeccable typeset`, etc. Repo: https://github.com/pbakaus/impeccable

## 3. Motion (React animation)

```bash
npm install motion -w apps/web
```

```tsx
import { motion, AnimatePresence } from "motion/react";
```

Docs: https://motion.dev/docs/react-installation

## 4. Visual reference

MotionSites is paid, so Cortex uses free references instead: Linear (density, restraint), Vercel (typography, monochrome), Raycast (command bar) and Attio (calm data surfaces).
