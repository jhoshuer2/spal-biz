---
name: spal-design-system
description: The SPAL Biz design system. Use before designing or building any SPAL Biz screen, component, colour, type, icon, motion, or empty state, and when reviewing UI for quality. Defines tokens, components, the Spal orb, light/dark/auto theming, and the rules that keep the UI simple and free of generic AI-looking design.
---

# SPAL Biz design system

Read `PRODUCT.md` first. This file says how Spal looks and moves. It never overrides what Spal is.

**The bar:** Apple and Airbnb level. Few things, each one exact. If a screen needs explaining, it is wrong. If something can be removed without losing meaning, remove it.

**Joshua art directs.** Do not invent a new look. Tokens and components below are a starting point; when Joshua corrects one, update this file so the correction sticks.

References live in `design/references/` (numbered, with what to take from each in the table at the end). Look at them before building. Take the principle, never copy a screen.

## 1. Who the UI is for

A shop owner who is busy, standing, often in bright light, on a mid-range Android, on a patchy connection, who may not be comfortable with technology. So:

- One purpose per screen. One primary action, always the most obvious thing.
- Big, forgiving touch targets: minimum 48px, primary actions 56px+. Thumb zone for actions.
- Visuals and numbers over sentences. Spal speaks in short lines; the UI itself says almost nothing.
- Readable in sunlight: text contrast AA minimum (4.5:1), numerals and primary text aim for AAA (7:1).
- Light on the device. No video, no photos, no heavy blur. Draw it in code.

## 2. Principles

1. **Quiet by default.** Space, one headline, one number, one action. Colour is the exception that carries meaning.
2. **Numbers are the hero.** Money is shown big, light and tabular. It is the one thing she checks.
3. **Spal is a presence, not a chat window.** The orb is its face. Conversation shows as short lines near the orb, not as a wall of bubbles.
4. **Colour tells the mood of the day.** The screen field shifts with how the day is going (see 4). Meaning, not decoration.
5. **Calm never means vague.** Every element has a job. If you cannot name it, delete it.
6. **Kind, never guilty.** No streaks, no levels, no red warnings about her performance, no "you missed". Slow days use warm, soft colour, never alarm.

## 3. What "no AI slop" means here (hard rules)

Do not ship any of these:

- Gradient text. Purple-to-blue gradients on everything. Rainbow mesh backgrounds behind content.
- Glassmorphism cards stacked on gradients. Blur used to hide weak layout.
- Emoji as icons or as decoration. Sparkle "AI" icons. Robot or chat-bubble mascots.
- The same icon-in-a-coloured-circle repeated down a list.
- Cards inside cards inside cards. A border AND a shadow AND a gradient on one element.
- Decorative charts, fake stats, filler numbers, lorem ipsum, "Welcome to your dashboard".
- Centre-aligning everything. Using three accent colours on one screen.
- More than two type weights on a screen. Letter-spaced uppercase labels everywhere.
- Heavy drop shadows, neon glows in light mode, bouncy spring animation on everything.
- Stock illustration people. Generic hero blobs.
- Copy that sounds like software: "Customer retention down 12%", "Unlock insights".

If a design choice appears in this list, stop and find the simpler honest option.

## 4. Foundations

### Colour

Define every colour as a CSS variable. Components use only semantic tokens, never raw hex. Values below are starting values with checked contrast (AA body text 4.5:1 or better on their surfaces); tune in the design page, re-check contrast when you change one, then lock.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#F4F6FA` | `#0B0C10` | App background |
| `--surface` | `#FFFFFF` | `#15171D` | Cards, sheets |
| `--surface-2` | `#ECEFF5` | `#1E2129` | Chips, inputs, pressed states |
| `--ink` | `#0E1116` | `#F4F5F7` | Primary text, numerals |
| `--ink-2` | `#4A5160` | `#B4BAC6` | Secondary text |
| `--ink-3` | `#636A78` | `#8A92A0` | Tertiary only, never for essential info |
| `--line` | `ink @ 8%` | `ink @ 10%` | Hairlines, used sparingly |
| `--action` | `#C9F23C` | `#C9F23C` | Primary action fill (lime) |
| `--on-action` | `#0E1116` | `#0E1116` | Text on lime. Lime is never used as text colour on light. |
| `--good` | `#2FBF71` | `#3DD68C` | Fills, dots, icons for money in. In light mode never as text (2.4:1 on white). |
| `--good-text` | `#14724A` | `#3DD68C` | Text on positive delta pills (pill fill `#E3F6EC` light, `good @ 16%` dark) |
| `--care` | `#E8743B` | `#F08A57` | Fills, dots, icons for needs attention (debt due). In light mode never as text (3.0:1). Never alarm red for her own performance. |
| `--care-text` | `#B5470F` | `#F08A57` | Text on attention pills (pill fill `#FDEBDF` light, `care @ 16%` dark) |

**Mood fields** (full-bleed colour behind the Today header; text on them must pass AA):
- Strong day: lime/green field.
- Normal day: calm lilac-blue field.
- Slow day: warm sand/peach field.
- Evening/closing: deep indigo field with soft glow (dark mode default look).

Colour per screen: neutral surfaces + at most one mood field + lime for the single primary action.

### Theme

Three settings: **Light, Dark, Auto**. Changed in **Profile**. Default Auto.
- Auto follows `prefers-color-scheme`. Stored per shop (profile) and mirrored in localStorage so it applies before sign-in.
- Apply with `data-theme` on `<html>` set by an inline script before paint, so there is no flash. Set `color-scheme` to match so native controls follow.
- Every component must be designed and checked in both. A component that looks good in one mode only is not done.

### Type

- **Headlines: Playfair Display ExtraBold (800)**, chosen by Joshua. Used only for headline moments (the greeting, a screen title, a big statement). Never for body, UI labels, or numbers.
- **Text and numerals: Inter**, light (300) for big numerals, regular for text. Inter covers `₦` and all Yoruba/Igbo marks.
- **Playfair has no `₦`, `ṣ` or `Ṣ`.** So money is never set in Playfair (always Inter), and the headline stack falls back to Inter per glyph (`"Playfair Display Variable", "Inter Variable", Georgia, serif`). A Yoruba headline with `ṣ` will show that one letter in Inter; check those headlines by eye before launch in Yoruba.
- Any new font must be checked for `₦` and the Yoruba/Igbo marks (ẹ ọ ṣ ị ụ ń and combining tone marks) before it is added.
- Self-hosted through `@fontsource-variable/*` packages (unicode-range subsets, so phones download only what a screen uses). No runtime requests to Google Fonts.
- Numerals: `font-variant-numeric: tabular-nums`. Money always uses a thin space between `₦` and digits only if the font renders it cleanly; otherwise no space. Pick one and use everywhere.
- Scale (px, mobile): 12 / 14 / 16 / 20 / 28 / 40 / 64 / 88 (hero numeral). Body never under 16.
- Max one headline and one hero number per screen.

### Space, shape, depth

- 4px grid. Common steps: 4, 8, 12, 16, 24, 32, 48. Screen gutter 20.
- Radius: 12 (inputs, chips), 20 (cards), 28 (sheets), 999 (pills, buttons).
- Depth: one soft shadow level for floating things (tab bar, sheet). Flat everywhere else. No borders on cards in light mode; hairline only in dark mode where needed.
- Icons: one family, 24px, 1.75px stroke, rounded. Pick one set and never mix. Icons support a label, they do not replace it.

### Motion

- 150 to 250ms, ease-out for entering, ease-in for leaving. No bounce except the Talk button press.
- Numbers roll when they change (see references 11 and 13). That is the signature motion.
- The orb breathes in idle, reacts to voice when listening (driven by mic level), drifts while thinking. Respect `prefers-reduced-motion`: static orb, no roll, instant transitions.
- Nothing animates just to look busy.

## 5. The Spal orb

Spal's face. Reference 03 (calm pastel orb) and 14 (voice states).

- Drawn in code (SVG or canvas), never an image or video. Under 4KB of logic, 60fps on a mid-range phone.
- Four states: **idle** (slow breathing), **listening** (follows mic amplitude), **thinking** (soft swirl), **speaking** (gentle pulse with output).
- Colour follows the day's mood field and the theme. Reduced-motion and low-power fall back to a static gradient disc.
- Never a face, eyes, or a mascot.

## 6. Components

Only these. Add one only when a real screen needs it, and add it here first.

| Component | Rules |
| --- | --- |
| **Button** | Primary: lime pill, dark text, 56px. Secondary: surface-2 pill. Ghost: text only. One primary per screen. Pressed state scales to 0.98. |
| **Talk button** | The big circle: lime, mic icon, soft ring(s). Always reachable. Sits in the tab bar area, larger than any other control. Listening state shows the ring following the voice. |
| **Orb** | See section 5. |
| **Surface (card)** | Radius 20, `--surface`, padding 20. No nested cards. |
| **Stat** | Hero numeral (light), small unit, optional delta pill (`--good` or neutral). Label above in `--ink-2`. Numbers roll on change. |
| **Delta pill** | "+₦8k vs last Tuesday". Tinted pill with `--good-text` for up, neutral for flat. Never red for down; use neutral plus plain words. |
| **Proposal card** | What Spal wants to do, in her voice, with three actions: Yes, Change, Not now. The draft message is shown in full before she approves. This is the product's key interaction; give it the most polish. |
| **Confirmation line** | One line after she tells Spal something ("11 sales, ₦38,500. Right?") with a one-tap fix. Never a form. |
| **List row** | Label left, value right, optional chevron. 56px min height. Used in My business. |
| **Chip** | Radius 999, surface-2, 14px text. For short facts and filters only. |
| **Segmented control** | Day / Week / Month style switch (reference 10). |
| **Sheet** | Bottom sheet, radius 28, drag handle. Used for proposals, closing, and corrections. |
| **Input** | 56px, radius 12, always with a mic affordance when text is expected. Labels above, not as placeholder only. |
| **Toggle** | 52x32 pill. Labelled on the left. |
| **Tab bar** | Floating dark pill, three places only: **Today, Talk, My business** (references 08). Talk is the centre and biggest. |
| **Chart** | Only inside My business, never on Today. Rounded bars or a smooth single line, one accent colour, tooltip on press, dashed comparison line (references 10 to 13). |

Not included until a real screen needs them: avatars, badges, banners, modals, dropdowns, accordions, carousels, toasts. Prefer a sheet or an inline line over any of these.

## 7. Screen rules

- **Today:** a greeting in the headline face, at most three things (one hero number, up to two things to approve or know), the orb. Mood field behind the top.
- **Talk:** orb, one line of what Spal heard, the big button. Text input is secondary and tucked below.
- **My business:** calm lists and a chart on request. Customers, money, history. This is the only place that looks like records.
- **Closing:** evening look (dark field, soft glow), the orb, one summary number, one question.
- **Empty states:** the orb plus one human line and one action ("Nothing yet. Tell me about your first sale."). No illustrations.
- **Errors:** say what happened and what to do, in one short line, in Spal's voice. Never show codes.
- **Copy:** speak like a shop assistant. Short. Concrete. Names and naira, not metrics. No exclamation marks unless celebrating a good day. English and Pidgin must both fit; leave room for longer strings.

## 8. How to build and check (every time)

1. Read `PRODUCT.md` and the relevant references.
2. State the one purpose of the screen and its one primary action before writing code.
3. Build with tokens and the components above only. Mobile first at 360x740, then 390x844.
4. Check light and dark. Check text contrast numerically (AA 4.5:1 body, 3:1 large text and UI parts).
5. Check with CPU throttled 4x and the orb animating. Drop frames means simplify.
6. Check with `prefers-reduced-motion` on.
7. Take screenshots (Playwright is installed, use device scale factor 2 for ones Joshua will see) of light and dark and look at them. Compare against the references for feel, not for pixels.
8. Run the slop list in section 3 against the result. Delete anything that fails or has no job.
9. Touch targets 48px or more, thumb-reachable actions.

Done means: it works in both themes, passes contrast, holds frame rate on a slow phone, and a first-time user could use it without reading anything.

## 9. Reference map

| File in `design/references/` | Take | Leave |
| --- | --- | --- |
| 01 ambient pastel gradient | Calm gradient light, huge light numerals, big pill button, generous space | Blur-heavy 3D product render |
| 02 ai buddy black lime | Lime talk button with rings, the live orb on black, tile shortcuts | Chat-history list, "Bot" wording |
| 03 pastel agent orb | The pastel orb as Spal's face, simple Continue pill | Fake onboarding terms text |
| 04 monotime editorial | Restraint, whitespace, one quiet action | Photography |
| 05 wallet green black | Chunky headline face, black and lime punch, bold round buttons | Crypto cards, dense nav |
| 06 moonie dark glow | Evening/closing mode, soft glow tiles, handwritten feel for rare headline moments | Illustrated scenery |
| 07 moodi mood colour | Mood field colour per state, white sheet over colour, chips, chunky headlines | Product photography, cart UI |
| 08 health planner cards | Floating dark tab bar, light stat cards, settings list rows | Food/health content |
| 09 health blue clean | Big numerals, segmented switch, clean list rows | Health data, profile cards |
| 10 sleep dashboard | Segmented Day/Week/Month, delta pill, small mono labels, stacked bars | The sleep data |
| 11 sleep tracking | Number roll when date changes, tooltip on press | Purple palette as-is |
| 12 baller onboarding | Sign in with Google / Apple pills at the save-account moment | Streaks, XP, levels, quests (conflicts with PRODUCT.md) |
| 13 revenue chart | Smooth single line, dashed comparison, tooltip, range switch | Dollar figures, desktop width |
| 14 voice orb states | Orb states for listening and speaking | Dark browser chrome |
| 15 bento cards intro | Playful bento arrangement for one-time intro motion, if ever used | Dense dashboards |

Contact sheets (10 to 15) are stills pulled from video references; the motion itself is described in section 4.

## 10. Keeping this file true

When Joshua changes a token, a component, or a rule, edit this file in the same change. When a real screen reveals a missing component, add it here with its rules before using it twice.
