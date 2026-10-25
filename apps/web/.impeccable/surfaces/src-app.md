---
version: 1
slug: "src-app"
primary_target: "src/app"
related_targets: []
---

# Surface brief: Cortex app shell (Ask, Brief, Memory, Connections)

Scope: the whole web app; mode **Operate**. Ask-first. Laptop first, mobile fully usable.
Audience job: get a cited, verified answer about live work across six tools, then act with consent.
Constraints: must not read as a generic AI chat, a dense dashboard, noisy reasoning, or playful. User steers: "intelligent colors, futuristic, a product not a project"; "minimalistic, thoughtful, broad vision, insightful, cleaner, mature yet modern."
Memorable moment: watching claims settle from hairline to full weight as Cortex verifies them.
Unresolved: none.

## Direction contract

THESIS: Confidence you can read. Cortex is a type specimen for evidence: hierarchy by scale contrast alone, and each claim's weight is its verification state. It refuses the chat-bubble column with sparkle accents and the grey-sidebar-plus-rounded-card default.

OWN-WORLD: Cool near-white ground (#F7F8FA shell, #FFFFFF work surface), ink #0E1116, one electric-indigo accent #4353FF for citations, focus and the primary state. Source colours appear only as 6px marks (Gmail red, Calendar teal, Drive amber, Notion graphite, Slack violet, GitHub ink, Web blue). Geist variable at a wide weight range (200–650) for everything; Geist Mono only for readouts and numerals. Hairline 1px rules, no shadows except one soft lift under the ask bar, 10px radii on inputs and cards.

STORY: The visitor asks; a single line of mono readouts narrates the agent (plan, searches, verifying n/m) without competing; the answer arrives light and settles to full weight claim by claim; conflicts and missing data are stated plainly; proposed actions wait for an explicit approve.

FIRST VIEWPORT: Left rail 208px (wordmark, Ask/Brief/Memory/Connections, recent questions). Work surface centred at 720px: the previous turn collapsed to one line; the current question at 38px weight 300; the readout line in 12px mono; the answer at 17px; conflict as a ruled band; sources as a three-column hairline grid; the action card; the ask bar pinned at the foot with Fast/Deep and next-step suggestions. Empty state: a large light question prompt with four suggested questions.

FORM: Variable Specimen (challenger variable-font-specimen, dealt lead of the bolder round 2 re-roll), position 1 in the dealt hand. seed: b04a60077b9d1407. Signature interaction: claim weight interpolates 200→460 on verification (font-variation via CSS transition); reduced motion snaps. Raises: follow-ups show only the next decisions (wayfinding); one answer owns the column, earlier turns collapse (feed); Fast/Deep is a visible honest state on every answer (bitmap).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
