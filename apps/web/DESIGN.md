---
name: Cortex
description: Cited, verified answers from your work tools, set as a type specimen for evidence.
colors:
  shell: "#f7f8fa"
  surface: "#ffffff"
  ink: "#0e1116"
  ink-2: "#2b303a"
  muted: "#5e6573"
  hair: "#646b79"
  line: "#e6e8ee"
  line-strong: "#d9dce3"
  accent: "#4353ff"
  accent-soft: "#eef0ff"
  accent-ink: "#2f3ce0"
  risk: "#d93a3f"
  risk-soft: "#fdf2f2"
  warn: "#b35a00"
  warn-soft: "#fff6ea"
  warn-ink: "#7a3d00"
  ok: "#0f8a63"
  nav-active: "#eceef3"
  nav-hover: "#f0f1f5"
  cite-lift: "#f4f5ff"
  src-gmail: "#e5484d"
  src-calendar: "#12a594"
  src-drive: "#e5a000"
  src-notion: "#646b78"
  src-slack: "#8e4ec6"
  src-github: "#0e1116"
  src-web: "#3e63dd"
  src-memory: "#4353ff"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "52px"
    fontWeight: 250
    lineHeight: 1.1
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "38px"
    fontWeight: 300
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  page-title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 300
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  answer:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 460
    lineHeight: 1.7
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  item:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15.5px"
    fontWeight: 500
    lineHeight: 1.375
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.625
  small:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  note:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
  readout:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    letterSpacing: "0.01em"
    fontFeature: "tnum"
  cite:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "11.5px"
    fontWeight: 500
    lineHeight: 1
rounded:
  cite: "4px"
  sm: "6px"
  md: "8px"
  card: "10px"
  field: "12px"
  composer: "14px"
  pill: "9999px"
spacing:
  rail: "208px"
  column-ask: "720px"
  column-list: "760px"
  column-brief: "860px"
  gutter: "16px"
  gutter-sm: "24px"
  row: "16px"
  section: "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
    typography: "{typography.small}"
  button-primary-hover:
    backgroundColor: "{colors.ink-2}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-ghost:
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "6px 8px"
  button-ask:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    size: "32px"
  button-ask-hover:
    backgroundColor: "{colors.accent-ink}"
  button-ask-disabled:
    backgroundColor: "{colors.line-strong}"
    textColor: "{colors.muted}"
  composer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.composer}"
  chip-followup:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  action-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "16px"
  action-card-settled:
    backgroundColor: "{colors.shell}"
  nav-item:
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "7px 10px"
  nav-item-active:
    backgroundColor: "{colors.nav-active}"
    textColor: "{colors.ink}"
  notice-warn:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn-ink}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
---

# Design System: Cortex

## Overview

**Creative North Star: "The Evidence Specimen"**

Cortex is set like a type specimen for evidence. Hierarchy comes from scale contrast inside one variable family, not from boxes, colour fields or shadows. The single most important typographic fact on any screen is a claim's weight: an answer arrives hairline-light and settles to full weight claim by claim as it is verified, so confidence is something you read rather than something you are told.

The ground is cool and quiet: a near-white shell carrying the left rail, a pure white work surface holding one centred column, ink text, and hairline rules doing all the structural work. One electric indigo carries citations, focus and the primary state; colour beyond that is information only, at mark scale. The agent narrates itself in a single line of small mono readouts that never competes with the answer.

Density is calm rather than sparse: one answer owns the column, earlier turns collapse to a single ruled line, and lists are ruled rows rather than cards. The system rejects the chat-bubble column with sparkle accents and the grey-sidebar-plus-rounded-card default.

**Key Characteristics:**
- One variable sans (Geist) across a wide weight range (200 to 650); mono only for readouts and numerals.
- Claim weight equals verification state, with a slow interpolating transition.
- Cool near-white shell, white surface, ink, one indigo accent.
- Source colour appears only as small round marks.
- Hairline 1px rules for structure; an ink rule opens a section.
- Flat, with one soft lift under the ask bar.

## Colors

A cool, nearly colourless field where a single indigo and seven small source marks are the only chroma.

### Primary
- **Electric Indigo** (#4353ff): citation numerals (via its deeper ink), the focus ring, the text caret, the streaming caret block, the round Ask button, the live "Verified n/m" readout, the selected workspace border, the salience bar and the wordmark dot. Never a large fill.
- **Indigo Ink** (#2f3ce0): the text-safe form of the accent, for citation numerals, links, the Verified readout and hover states on accent elements.
- **Indigo Wash** (#eef0ff): citation hover and selected-state tint; a lighter lift (#f4f5ff) marks the source row tied to the hovered citation.

### Neutral
- **Cool Shell** (#f7f8fa): the page ground and left rail; also inset wells (code, action summary, segmented control track, skeletons).
- **Work Surface** (#ffffff): the main column, composer and pending action card.
- **Ink** (#0e1116): text, primary buttons, and the opening rule of a section.
- **Ink Two** (#2b303a): secondary reading text, source quotes, partial claims, follow-up chips.
- **Slate** (#5e6573): supporting copy, readouts at rest, ghost controls.
- **Hairline Grey** (#646b79): pending and unsupported claims, placeholders, list markers, quiet readouts.
- **Rule** (#e6e8ee) and **Strong Rule** (#d9dce3): 1px dividers, and borders on controls and fields respectively.
- **Rail Tints** (#eceef3 active, #f0f1f5 hover): left-rail navigation states only.

### Status
- **Risk Red** (#d93a3f) with wash (#fdf2f2): the "Conflict" label, errors, failed actions, destructive confirm.
- **Amber** (#b35a00), wash (#fff6ea) and ink (#7a3d00): unavailable-source notices and warnings, set as text on the wash.
- **Verified Green** (#0f8a63): "Done" stamps and connected status only.

### Source marks
Gmail red (#e5484d), Calendar teal (#12a594), Drive amber (#e5a000), Notion graphite (#646b78), Slack violet (#8e4ec6), GitHub ink (#0e1116), Web blue (#3e63dd), Memory indigo (#4353ff).

### Dark theme
Every token in `globals.css` is one `light-dark(light, dark)` value, so the two palettes cannot drift apart; never hard-code a colour in a component, add a token instead. Dark is a near-black shell (#0d0f12) and surface (#14161a) with ink #e9ebf0; Indigo lifts to #7c88ff (ink #a9b0ff) and source marks lighten one step. Text on an ink or indigo fill uses On Ink, which flips with the theme. Every text/background pair stays at 4.5:1 or more in both themes. The user picks System, Light or Dark in the sidebar footer; the choice is applied before first paint.

### Named Rules
**The One Voice Rule.** Indigo is the only accent. It marks what is cited, focused or primary, and nothing else; it never fills a panel or a heading.

**The Mark-Scale Rule.** Source colours exist only as small round dots (6px by default, 5px inside a citation, 8px beside a connector name). Never as text colour, fills, borders or icons.

## Typography

**Display / Body Font:** Geist variable (with ui-sans-serif, system-ui), stylistic sets ss01 and cv11 on.
**Label/Mono Font:** Geist Mono (with ui-monospace), for readouts, citation numerals, code and query strings.

**Character:** One family carries all hierarchy through scale and weight; light large questions over a mid-weight reading measure. The mono is instrumentation, small and uppercase, never prose.

### Hierarchy
- **Display** (250, 52px / 38px mobile, 1.1, -0.04em): the empty-state question prompt only.
- **Headline** (300, 38px / 30px mobile, 1.15, -0.035em): the current question atop an answer.
- **Page Title** (300, 40px / 32px mobile, 1.15, -0.035em): Brief, Memory and Connections titles.
- **Answer** (17px, 1.7): the answer column; weight is set by claim state (below), never by hand.
- **Title** (600, 15px, -0.01em): section heads and in-answer subheads, sitting on a rule.
- **Item** (500, 15.5px): row titles in lists (brief items, memories, connectors).
- **Body** (400, 15px, 1.625, max 52 to 60ch): intros and empty-state copy.
- **Small** (13 to 14px): source titles (550), quotes, action summaries, buttons.
- **Note** (12.5px, Slate): hints and helper lines.
- **Readout** (mono 12px, uppercase, 0.01em, tabular numerals): agent narration, counts, durations, dates, source meta.
- **Cite** (mono 11.5px, 500): raised citation numerals preceded by a source mark.

### Named Rules
**The Weight-Is-Truth Rule.** A claim's weight is its verification state: pending 200 in Hairline Grey; partial 330 in Ink Two with a dotted indigo underline (40% accent, 1.5px, 5px offset); supported and plain 460 in Ink; unsupported looks the same as supported (no strikethrough: it confused people), it simply carries no citation. Weight interpolates over 900ms (cubic-bezier(0.16, 1, 0.3, 1)), colour over 600ms ease-out; reduced motion snaps. Do not use these weights or treatments for anything else.

**The Instrument Rule.** Geist Mono appears only for measurements: readouts, numerals, citations, code and queries. Headings, labels on controls and prose stay in Geist.

## Layout

A 208px left rail on the shell (wordmark, four destinations, recent questions, workspace readout at the foot) separated from the work surface by a 1px rule; below 768px the rail becomes a top bar with a toggled menu. The work surface centres one column: 720px for Ask, 760px for Memory and Connections, 860px for Brief, with 16px gutters (24px from 640px) and 40px top padding (64px from 768px).

On Ask the composer is pinned at the foot in a ruled, translucent band (90% surface with a light backdrop blur) sharing the column width; follow-up suggestions sit directly above it. Only the latest turn is shown in full; earlier turns collapse to one ruled line with a mode and groundedness readout and expand in place.

Rhythm: list rows are 16px vertical, sections open 40 to 48px apart, the readout line leaves 28px before the answer. Sources form a hairline grid: one column, two from 640px, three from 1024px, with filler cells keeping the grid square.

## Elevation & Depth

Flat. Depth comes from the shell/surface tonal step and from rules, not shadows. The one lift is under the composer, which also gains an indigo halo while focused; the segmented Fast/Deep thumb carries a 1px contact shadow inside it.

### Shadow Vocabulary
- **Ask-bar lift** (`box-shadow: 0 8px 24px -12px rgba(14,17,22,0.14)`): the composer at rest.
- **Ask-bar focus** (`box-shadow: 0 0 0 3px rgba(67,83,255,0.10), 0 8px 24px -12px rgba(14,17,22,0.14)`): composer focus-within, with border at 60% accent.
- **Thumb contact** (`box-shadow: 0 1px 2px rgba(14,17,22,0.08)`): the selected segment of the Fast/Deep control.

### Named Rules
**The Single Lift Rule.** Only the ask bar floats. Cards, rows, menus and notices sit flat on rules or washes.

**The Ink Rule.** A section opens on a 1px ink rule and divides on 1px Rule grey: Brief and Memory section heads, the Connections list, and the conflict band all start with an ink line.

## Shapes

Rectilinear and quiet. Small controls and notices take gently rounded 6px corners; the action card and selects 10px; larger fields and workspace choices 12px; the composer 14px. Pills are reserved for follow-up chips and the round 32px Ask/Stop buttons. Dots are perfect circles. Structure is drawn with 1px rules rather than enclosed boxes; lists are ruled rows, never card stacks.

## Components

### Buttons
Restrained and inky; the accent is held back for the single Ask action.
- **Shape:** gently rounded (6px); 13px medium label, 6px by 12px padding.
- **Primary:** ink fill, white text, hover to Ink Two (Approve, Connect; the memory Add button uses 10px corners).
- **Secondary:** Strong Rule border on surface, ink text, hover to shell (Decline). A quieter bordered variant (Rule border, Slate text) serves utility actions such as Refresh.
- **Ghost:** Slate text with optional 14px line icon, hover to ink (Edit, New thread, Collapse).
- **Ask:** a 32px indigo circle with an up arrow, hover to Indigo Ink; disabled turns Strong Rule grey. While running it becomes an ink circle with a stop square.
- **Focus:** global 2px indigo outline, 2px offset, 6px radius.

### Chips
- **Follow-ups:** pill, 1px Rule border, Ink Two 13px, 4px by 12px; hover shifts border to 50% indigo and text to Indigo Ink. They sit in one horizontally scrolling row directly above the composer, fading out at the right edge, and appear only when the latest turn is done.

### Cards / Containers
- **Action card:** 10px corners, 16px padding, Strong Rule border on surface while it waits for consent; once decided it settles to Rule border on shell. Title 14px/550, source mark and source name with "Needs your approval" in Small Slate, the proposal summary in an inset shell well, then Edit (ghost, left), Decline (secondary) and Approve or "Approve & send" (primary) on the right. Decisions stamp on as a readout (Done in green, Declined in Slate, Failed in red) and stay visible.
- **Notices:** washes rather than boxes: amber wash with amber-ink text for unavailable sources, indigo wash for informational switches.

### Inputs / Fields
- **Composer:** 14px corners, Strong Rule border, the Ask-bar lift, 15.5px text with Hairline Grey placeholder; an inset Fast/Deep segmented control on the shell track.
- **Fields:** 6px corners, Strong Rule border, indigo border on focus with the outline suppressed. Caret is indigo.
- **The no-ring opt-out:** a field inside a container that already shows focus (composer, memory add field) opts out of the global outline; the container's indigo border carries focus instead.

### Navigation
Left rail items: 14px Geist with a 16px line icon (1.75 stroke), 6px corners, Slate at rest, rail-hover tint on hover, rail-active tint with weight 550 and ink when current. "Recent" questions follow as a readout label and 13px truncated links; a "Sample/Live · n sources" readout sits at the foot.

### Readout line
One wrapping line of uppercase mono under the question: mode, plan count, searches with duration, found, "Verified n/m" in Indigo Ink, total time, and a Trace disclosure. While working, a pulsing 6px indigo dot and the current step lead in Indigo Ink. Trace expands (280ms) into a step list and tool-call table set off by a left rule.

### Claims and citations
Answer text renders claim by claim under the Weight-Is-Truth Rule. Citations are raised mono numerals in Indigo Ink, each preceded by its source's 5px mark; hovering or focusing one tints it Indigo Wash, lifts its source row and dims the others to 40%. While streaming, an indigo block caret blinks at the end of the text. Answers are full markdown (numbered and nested lists, tables in a hairline frame that scrolls sideways, quotes, rules).

### Terminal panel
Code always renders in a terminal panel, dark in both themes (#0f1115, text #d5d8df, 13px Geist Mono, 1.65 line height). A header carries the language in mono ("terminal" for shell code) and a Copy button that becomes "Copied" with a green check for 1.5s. Long lines scroll sideways; code never wraps. The panel ignores the answer's verification weight.

### Sign-in page
Two halves on desktop. The left is the product story, centred as one 540px column and following the theme (shadows and glow have their own light/dark values): two slow drifting glows (indigo and teal), a dot grid fading out from the middle, and a headline whose last word rotates (inbox, calendar, docs, team chat, files) on its own line with a 450ms blur-and-rise, so the headline never reflows. Below it, a demo card loops Ask → Cite → Act every 3.6s with story-style progress bars that double as tabs; hovering or focusing the card pauses it. Ask types its question and lights up the app chips being searched; Cite settles its claims and draws the tick; Act presses its own Approve button and springs in "Done". Six app chips bob around the card, and the stage tilts toward the pointer (spring, at most 5–6°; chips shift by depth). Fine pointers only; reduced motion keeps the scenes and drops typing, drifting and tilting. The right half is the sign-in card on the page's own theme: Google and GitHub buttons, then email + password with Sign in / Create account tabs; new accounts, new devices and password resets continue on the same card with a 6-digit code field (mono, spaced). It is our own UI on Clerk, with no Clerk widgets or badge. Phones show only the card with a one-line tagline.

### Motion and sound
Motion confirms, it never decorates something seen dozens of times a day. Easing tokens: `--ease-out` (0.23, 1, 0.32, 1) for anything arriving, `--ease-spring` for things that settle; UI feedback stays under 300ms and animates only opacity, translate and scale. Every button scales to 0.97 on press (160ms). Arriving lists rise 6px and fade, 40ms apart, capped at 8 steps. Selections slide (a spring pill, bounce 0.2); the action stamp springs in through a 3px blur. Reduced motion removes movement and delays but keeps state changes. Sounds are synthesised (send tick, two-note answer chime, three-note done, two low notes for errors) at gain 0.045, never in a hidden tab, and switch off from the sidebar.

### Thread scrolling
The whole thread stays on the page, one ruled section per question. While an answer streams the view follows it; scrolling up stops the follow and shows a "Jump to latest" pill (surface, pill radius, soft shadow) that rises in over 200ms. On desktop a small stacked pair of chevrons moves to the previous or next question (also Alt+↑ / Alt+↓). Scrolling is smooth unless reduced motion is on.

### Conflict band
A full-width ruled band: ink rule on top, Rule grey below and between entries, 12px vertical padding. A fixed 80px "Conflict" label in Risk Red at 600, then the plain statement with its citations. Unsupported counts and missing data follow as plain Slate sentences, the count in red.

### Sources grid
Hairline grid of cited evidence: each cell carries a readout line (mark, Indigo Ink number, source, author, date), a 13px/550 title and a two-line Ink Two quote, with an "Open" link.

## Do's and Don'ts

### Do:
- **Do** let claim weight carry verification: 200 pending, 330 partial with dotted indigo underline, 460 supported; unsupported reads as plain text without a citation.
- **Do** draw structure with 1px rules (#e6e8ee) and open sections on a 1px ink rule.
- **Do** keep indigo (#4353ff) to citations, focus, the Ask button and live verification.
- **Do** set every measurement (counts, durations, dates, step names) as a 12px uppercase Geist Mono readout with tabular numerals.
- **Do** require an explicit approve on every action, and leave the decided state stamped on the card.
- **Do** use .no-ring on a field only when its container shows focus with an indigo border.

### Don't:
- **Don't** show source colour at more than mark scale: no tinted text, fills, borders or logos.
- **Don't** add shadows beyond the ask bar's lift and the segmented thumb.
- **Don't** stack answers or list items in rounded cards; use ruled rows.
- **Don't** use chat bubbles or sparkle accents.
- **Don't** use Geist Mono for prose, headings or control labels.
- **Don't** reuse the claim weights for emphasis or decoration.
