# TRAIL MANAGER - UI Improvements (v1)

# TRAIL GAME — UI Improvements (v1)

## Implementation contract

### Project status
M0, M1 and M2 are accepted. M2 is closed. This task is a UI/UX improvement pass, not a new gameplay milestone.

### Source of truth
Before making changes, inspect the actual repository, current domain models, profile definitions, attribute values, save schema, routes and existing UI components. The source code takes precedence over examples in this document.

### Protected behavior
Do not change game logic, formulas, XP rewards, Fitness/Fatigue effects, level thresholds, attribute allocation, training progression, or existing save semantics.

The only permitted domain-model change is the addition of the `sex` field (`female` or `male`) and the minimum persistence changes required to save and restore it. Preserve existing careers and progression wherever technically possible. Do not reset, migrate destructively, or overwrite existing saves without explicit approval.

Sex is cosmetic only and must never affect attributes, progression, training outcomes or any gameplay value.

### Implementation workflow
- Work on a dedicated branch; do not commit directly to `main`.
- Make one screen-focused commit at a time, in this order:
  1. Runner creation.
  2. Dashboard.
  3. Training.
- Shared UI primitives may be introduced in the first commit when needed.
- Run relevant checks after each commit and the full test/build suite at the end.
- Do not merge into `main` without owner authorization.

### Mobile-first and accessibility
Test portrait layouts at 360×640 and 412×915 CSS pixels.

Aim to fit the main screens within the available viewport, including safe areas. Do not achieve a no-scroll layout by clipping content, hiding required controls, or making text unreadable. If a screen cannot fit without compromising usability, stop and propose a specific alternative before implementing that layout.

All interactive controls must be keyboard-accessible where applicable, have visible focus states, and use touch targets of at least 48×48 CSS pixels where practical.

All in-game UI text must remain in English.

### Asset strategy
Use clearly identifiable placeholders until final illustrations are available. Implement the asset paths and layered-rendering interface so final assets can replace placeholders without changes to gameplay logic.

Do not block the UI work on final artwork. Do not generate or commission additional assets unless explicitly requested.

## Rules for the implementer (Claude Code)

- Change the **interface only**. Do not touch game logic, formulas or save data (other than adding the new `sex` field described below).
- Work **one screen per commit**, in this order: 1) Runner creation, 2) Dashboard, 3) Training.
- Before starting, read the existing code: the real list of profiles, attributes, equipment and screen structure. Where this document gives examples, the real game data wins.
- Mobile-first. Test at 360x640 and 412x915 px (small and regular phone), portrait orientation.
- Keep all UI text in English.

## Global principles

1. **No vertical scrolling** on the main screens: the content must fit the visible height (use `100dvh` and respect the phone's safe areas). Extra detail goes in popups, cards or carousels, never in a long page.
2. **Card system**: information is organized in cards with a shared style (corner radius, inner padding, background color). Cards can be swiped horizontally or opened as a popup.
3. **Touch targets** of at least 48x48 px, with spacing between them.
4. **Visible state**: selected, active and disabled elements must be clearly distinguishable (border, color, check mark).
5. **Illustrated runner**: the game shows a runner image that changes with the profile, the sex and the equipment (see the Assets section).

---

## 1. Runner creation ("Choose your athlete")

### Current problems
- Each profile takes almost a full screen and forces vertical scrolling.
- There is no button to confirm the choice.
- The empty selection circle does not look like a control.
- There is no runner image.
- The bottom navigation bar is visible during creation and lets the player leave the flow halfway.
- The player cannot choose the runner's sex.

### Desired changes
- **Fixed screen, no vertical scroll.** Structure from top to bottom:
  1. Short title ("Choose your athlete") and a single help sentence (shorten the current text).
  2. **Sex selector**: a two-option toggle, **Female / Male**, placed right under the title. Default: Female (or Male, implementer's choice, but one must be preselected). Changing it instantly updates all runner images in the carousel below.
  3. **Horizontal card carousel** (one card per profile) with touch swiping and snap to each card. A slice of the next card must be visible to hint that there is more.
  4. Position dots under the carousel.
  5. **Fixed button at the bottom**: "Choose [profile]" confirms the selection.
- **Each card** contains:
  - Large runner image, **in a pose related to the profile** and matching the selected sex (see table). These are **finished, pre-rendered illustrations with fixed equipment** (backpack, vest, headband, shoes, etc. are part of the image). They are used **only in the creation flow** and are not layered.
  - Profile name and a one-line description.
  - Attributes in a compact format: 6 progress bars with label and value (instead of a text list). Strengths highlighted (gold color + ▲ icon) and weaknesses muted (▼ icon). Remove the redundant "Strengths: ... Weaknesses: ..." text.
  - Total points (96) in small text.
- **Selection**: the centered/visible card is the selected one; the bottom button always shows its name. No empty circle.
- **Hide the bottom navigation bar** during the whole career creation flow.
- Add a final step after confirming the profile: **choose the runner's name** (short text field), also without scroll, showing a preview of the runner (profile + sex). This name is used in the Dashboard.

### Sex selection
- New field `sex` with values `female` | `male`, saved with the career.
- Sex is **cosmetic only**: it changes the runner's appearance (body, hair, clothing fit) and does **not** change attributes, starting points or any gameplay value. If the code suggests otherwise, ask before changing anything.
- The choice must be persisted so the Dashboard and any other screen use the correct runner images.
- Sex cannot be changed after the career is created (unless a later version adds a customization option).

### Poses per profile (examples; adapt to the real profiles in the game)

| Profile | Pose / image |
|---|---|
| Climber | Power hiking: leaning forward, hands on thighs or using poles, uphill terrain |
| Sprinter | Sprinter's stride, explosive posture |
| (other profiles) | A distinctive pose for each profile |

Each pose must exist in a female and a male version.

### Acceptance criteria
- [ ] At 360x640 there is no vertical scroll in any step.
- [ ] The Female / Male toggle is visible on the profile screen and instantly changes the runner images.
- [ ] The player can switch profiles by swiping sideways and with the dots.
- [ ] Each profile shows its own distinct runner image, in the selected sex.
- [ ] The confirm button is always visible and shows the active profile.
- [ ] The chosen name and sex are saved and available in the Dashboard.
- [ ] No bottom navigation bar during creation.

---

## 2. Dashboard

### Desired changes
When opening the Dashboard, the first thing visible is the **centered runner** wearing their current equipment. Everything must fit without scrolling.

Layout:
- **Above the runner's head**: `Name - Profile` and the **current level** (e.g. "Marta - Climber · Lv 3").
- **Center**: the **Dashboard runner**, a different illustration from the creation one. At the start of the career the runner has **no equipment** (base body in the chosen sex, with only minimal base clothing such as plain shorts and top). When the player acquires or equips an item, the matching layer is added to the image. Do not reuse the creation illustrations here, because their equipment is baked into the image.
- **Left side**: current attributes (Endurance, Climbing, Speed, Technical, Recovery, Consistency) in a compact format (short name + value, or a small bar).
- **Right side**: Level, XP (with a progress bar to the next level), Fitness and Fatigue (each with a visual indicator; Fatigue in a warning color when high).
- Below, whatever exists today (actions, summary) is reorganized into compact cards or moved to other screens. Nothing that forces scrolling.

Space note: at 360 px wide, three columns are tight. If it does not fit well, the side columns can be narrow semi-transparent cards with small but readable text (minimum 12 px), and the runner may slightly overlap them. If it still does not fit, propose an alternative before implementing.

### Acceptance criteria
- [ ] The runner is centered, with name, profile and level above.
- [ ] Attributes on the left; level, XP, fitness and fatigue on the right.
- [ ] The runner shows no equipment at the start of a new career, in the chosen sex.
- [ ] The image updates with the correct layer when new gear is equipped.
- [ ] The Dashboard never shows the creation-screen illustration.
- [ ] No vertical scroll at 360x640.

---

## 3. Training

### Desired changes
Structure from top to bottom, without vertical scrolling:
1. **Current planned week** first: a strip of 7 days (Mon-Sun) with today highlighted. Each day shows an icon for the workout type and its status (planned, completed, rest).
2. **Today's activity**: a card with today's session (type, duration/distance, intensity summary).
3. **Tapping the activity** opens a **popup** (bottom sheet or modal) with the full detail and the actions (start, change, etc.). It closes by tapping outside, with an X, or with the phone's back button.
4. Tapping another day in the strip also shows that day's activity in the card.

### Acceptance criteria
- [ ] The planned week is visible at the top on entering.
- [ ] Today's activity is right below it.
- [ ] The detail opens in a popup and closes with the X, by tapping outside, and with the back button.
- [ ] No vertical scroll at 360x640.

---

## Runner assets (needed for sections 1 and 2)

There are **two separate sets of runner images**:

### A) Creation illustrations (section 1)
- One finished illustration per **profile x sex** (for example 6 profiles x 2 sexes). Equipment is **baked into the image** and does not change.
- Style: dark stone-statue look with glowing orange muscle lines, matching the app's orange accent. Pose related to the profile (power hiking for Climber, sprint stride for Sprinter, etc.).
- Technical specs, identical for all images:
  - Same canvas size and aspect ratio: **vertical 2:3** (e.g. 1200x1800 px), same framing and scale, runner facing right.
  - **Transparent background** (PNG or WebP). No grey studio background and no differing pedestals or rock bases.
  - A dark-grey body on the dark app background has low contrast: add a soft light glow or gradient behind the runner in the card (done in CSS, not in the image).
  - Same base equipment style for the male and female versions of the same profile.
- Suggested path: `assets/runner/creation/{sex}/{profile}.png`.

### B) Dashboard runner (section 2)
- A **separate neutral-pose runner without equipment**, one per sex, in the same art style (statue look with orange lines) so both sets feel consistent.
- Equipment is added as **stacked layers** (SVG or transparent PNG/WebP, all with the same canvas size and alignment as the base body): shoes, clothing, vest/backpack, poles, cap, headband, etc. Layers must fit both the female and the male base body, so provide a layer set per sex or design them to work on both.
- Suggested paths: `assets/runner/dashboard/{sex}/body.png` and `assets/runner/dashboard/{sex}/equipment/{item}.png`.
- Optional, later: the orange lines as an independent layer so their brightness can react to Fitness and Fatigue (brighter with good fitness, dimmer with high fatigue).

### Placeholders
Until final illustrations exist, use clearly identifiable **placeholders** (simple silhouettes, per sex and profile for set A, per sex for set B) and leave the folder structure and layering system ready, so they can be replaced later without touching the code.

## Out of scope for this version
- Equipment, Races and Career screens (to be defined in the next round).
- Complex animations, sound and logic changes.
- Any gameplay effect of sex.

## Suggested work order for Code
1. Shared card/styles system and the "no scroll" rule (common base).
2. Runner creation (sex toggle, carousel, button, name step, hide navigation, save `sex`).
3. Layered Dashboard runner component with placeholders (per sex), separate from the creation illustrations.
4. Dashboard.
5. Training with popup.

---

## Implementation status and owner decisions (28 October 2026)

Added after implementation. The sections above are the original request; where they differ from this
section, this section records what was decided and built. Branch `ccr-4899c2c5-ikxanb`, not yet merged
into `main`. Technical details: `DEVELOPMENT.md` §11 ("UI Improvements v1").

### Decisions taken during implementation
- **Profiles:** the game has 4 profiles (Climber, Sprinter, All-rounder, Endurance), so the creation
  set needs 8 illustrations (4 profiles × 2 sexes), not 12.
- **Artwork:** placeholders only for now. The reference photos in `assets/runner/` are style
  references (JPEG, grey studio background, pedestals) and are not used in the app.
- **Sex:** Female is preselected. Careers saved before the field existed load as Male.
- **Name:** required, 1–16 characters, spaces trimmed.
- **Navigation:** hidden on every screen before a career exists, including the incompatible-save
  warning.
- **Dashboard:** no equipment system exists yet, so the runner shows the base body only; the layer
  system is ready. The remaining content (attribute points, today, the week, Reset demo) is placed in
  cards below the first screen, which may scroll; the first screen itself fits without scrolling.
- **Week days:** Monday–Sunday; day 1 of every simulated week is Monday.
- **Training:** shows only existing data (type, description, XP/Fitness/Fatigue effects); there is no
  duration, distance or intensity data. The day detail is shown directly under the week strip when a
  day's tab is tapped — no "Details" button and no popup (this replaces the popup in section 3).

### Visual adjustments after the first review
- Runner creation bars: strengths green with ▲, neutral attributes grey, weaknesses very soft red
  with ▼.
- Dashboard attributes: full names, with the bar and value on the line below each name.

### Gameplay changes requested during this work
These go beyond the "interface only" rule above and were requested explicitly by the owner. They are
recorded in `docs/GAME_DESIGN_BIBLE.md` v1.2 (§4.4 and §4.7):
- Rest: Fatigue −8 (was −12) and Fitness −2 per Rest day (was 0).
- Injury: completing a non-rest session that leaves Fatigue above 95 gives no XP, −15 Fitness and
  5 forced Rest days. The player is warned first; training is never blocked.

### Acceptance criteria — result
- Runner creation: met at 360×640 and 412×915 (no scroll, sex toggle, swipe and dots, distinct
  image per profile and sex, confirm button always visible, name and sex saved, no navigation).
  Images are placeholders until the final artwork is added.
- Dashboard: met (runner centred with name, profile and level; attributes left; level, XP, fitness
  and fatigue right; base body only; never the creation art; first screen without scroll). The
  "image updates with new gear" criterion is ready in code but cannot be shown until equipment exists.
- Training: week first, day detail directly below, no scroll at 360×640 in any state. The popup
  criteria were replaced by the inline detail (owner decision).
