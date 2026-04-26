# Probe TalkBack Information-Structure Findings — 2026-04-25

Companion analysis to the raw structured dump in
`docs/probe_a11y_report_2026-04-25.md`. The raw report records, per state,
exactly what TalkBack would announce in DOM order plus every `announce()`
that fired during the transition. This document interprets that data and
recommends actionable changes.

Severity:
- **B (Blocker)** — meaningfully degrades comprehension or breaks the study task for BLV users.
- **M (Major)** — measurable redundancy / friction worth fixing before pilot.
- **m (minor)** — polish; defer to taste.

Tag legend used per finding:
- **REDUNDANT** — same content surfaced more than once, TalkBack reads it twice.
- **CONFUSING** — order or semantics likely to disorient a TalkBack user.
- **TRADE-OFF** — sighted vs. BLV users get different content; there is a defensible reason but it's worth confirming.

---

## 1. Cross-cutting issues (apply to every probe)

### B1. **CONFUSING** — Heading hierarchy is inverted: `h2` appears before `h1`

Every probe page renders the order:

```
[link] Skip to main content
[status] aria-live=polite
[main]
  [region] "Page instructions"
    [h2] "Probe 1: Solo Creator — Video Library"   ← OnboardingBrief
    [banner]                                       ← ConditionHeader
  [h1] "Probe 1: AI Description"                   ← ConditionHeader real heading
  ...
```

TalkBack heading-navigation jumps land on the `h2` *before* the `h1`. The user
hears the section subtitle before the page title, which is the opposite of
what BLV users learn to expect.

**Layer:** structural (DOM order in `App.jsx`, `OnboardingBrief.jsx`, `ConditionHeader.jsx`).
**Why it matters:** participants relying on heading navigation to orient at the
start of each condition will repeatedly be confused.
**Fix:** Either (a) move `<ConditionHeader>` (with the `<h1>`) above
`<OnboardingBrief>` in the page tree, or (b) demote `OnboardingBrief`'s `<h2>`
to a non-heading element (it's a page-instructions region, the explicit aria
label is enough).

### B2. **REDUNDANT** — `[banner]` content duplicates the following `<h1>`

The `[banner]` (ConditionHeader) carries the page title text *as part of its
contents*, then the very next stop is an `<h1>` with the same text:

```
[banner] "Probe 1: AI Description AI-generated video descriptions at multiple levels of detail"
[h1]     "Probe 1: AI Description"
```

A TalkBack user moving forward hears the title twice.

**Layer:** `src/components/shared/ConditionHeader.jsx` — the wrapping
`<header>` (banner) contains the same `<h1>` it's meant to wrap, and Lan's M4
walkthrough fix exposed the h1 to AT — but both the banner *and* the inner h1
now announce.
**Fix:** Drop the explicit `role="banner"` (or remove the wrapping `<header>`
landmark) so the `<h1>` is the single naming element. Alternatively keep the
banner but remove the inner `<h1>`'s text from the banner's accessible-name
calculation (use `aria-labelledby` to point to the h1 only).

### M1. **CONFUSING** — `[region] "Page instructions"` wraps the page banner

The `<OnboardingBrief>`'s `[region]` contains both the `h2` (the brief itself)
and the `[banner]` (ConditionHeader). Semantically the page banner should be a
sibling of the instructions region, not a child of it. TalkBack region-jump
navigation lands inside "Page instructions" and *also* announces a banner
landmark — the user can't tell whether the banner is project-wide chrome or
part of the instructions.
**Fix:** Same as B1 — separate ConditionHeader from OnboardingBrief at the
DOM level.

### M2. **REDUNDANT** — Live-region `[status]` retains stale announcement text across states

The `#sr-announcer` element is `role=status aria-live=polite` and the `announce()`
queue (per the M8 walkthrough fix) writes new text into it without clearing.
TalkBack only re-fires on change so this isn't usually heard a second time —
but when the user navigates *to* the status region, they hear the last
announcement, which can be many actions stale (e.g. "Project created with 1
video. Explore scenes below." is still in the node when the user has long
since opened scene 1).
**Fix:** Inside `announceQueue` in `src/utils/announcer.js`, clear the node
after a 1.5–2 s delay following each message, so the live region returns to
empty between announcements and stale content can't be re-read on re-focus.

### M3. **TRADE-OFF** — Scene-block visible text contains the description; `aria-label` does not

The walkthrough M11/B6 fix dropped the description from the collapsed
SceneBlock's `aria-label` to keep the granularity controls skimmable
("Scene 1 of 5: Walking to Kitchen. 3 seconds. Tap to open actions."). The
description is rendered *inside* the same `<button>` but marked
`aria-hidden="true"`, so sighted users see it under the title and TalkBack
users do not until they expand the block.

That's the deliberate design — but it means **a TalkBack creator does not
know what is in any scene until they expand each one in turn**. For Probe 1
(scene exploration is the *whole point* of the condition) this is the central
trade-off; flag for explicit re-confirmation with Lan whether the current
balance is right or whether at least Detail-Level-1 should be in the collapsed
aria-label.

---

## 2. Probe 1 — AI Scene Explorer

### TalkBack reading order, exploring (scene 1 expanded)

```
[link] Skip to main content
[status] live: "Opened scene 1. Walking to Kitchen. Showing actions."
[main] / [region: Page instructions] / [h2] / [banner] / [h1]
"1 clip imported, 5 scenes, total length 15s"
[list: 5 scenes]
  [listitem] [button aria-expanded=true] "Scene 1 of 5: Walking to Kitchen. 3 seconds. Tap to close actions."
  [region: Actions for scene 1]
    [button] "Play scene 1"
    [button aria-expanded=false] "Ask AI"
    [button] "Close scene actions"
  [listitem] [button aria-expanded=false] "Scene 2 of 5: ..."
  ... scenes 3, 4, 5 follow
```

### m1. **TRADE-OFF** — visible "Play from here" vs. aria "Play scene 1"

Lan's confirmed preference (memory: `feedback_scene_block_a11y.md`). Keep as
is; not a defect. Mentioned only because the auditor will see it in every
state.

### m2. **REDUNDANT** — Live region announce "Opened scene 1. Walking to Kitchen. Showing actions." plus focus moves to the actions region, which TalkBack also announces ("Actions for scene 1, region")

Both messages reach the user during one expand. Slight overlap. Could trim
the announce to just `"Opened scene 1."` and let the focus-change cover the
"Showing actions" part.

### m3. **CONFUSING** — When the Ask AI sub-panel is open, the dyad of "Close Ask AI" + "Voice input" + text input + "Send question" + "Close scene actions" appears between the two scene-list rows

The user's mental model is "I'm in scene 1's actions". The Ask AI sub-panel
sits inline; on collapse, the cursor stays at "Close scene actions". This is
fine — but make sure the order is exactly *Voice input → text input → Send →
Close*, which it is. No change needed.

---

## 3. Probe 2a — Co-located Handover (Creator)

### TalkBack reading order, exploring (scene 1 expanded, Edit by Myself open)

```
[link] Skip to main content
[status] "Opened scene 1. Walking to Kitchen. Showing actions."
[main] / [region: Page instructions] / [h2] / [banner] / [h1]
"Mode: Creator Mode"
"1 clip imported, 5 scenes, total length 15s"
[list: 5 scenes]
  [listitem] [button aria-expanded=true] "Scene 1 of 5 ... Tap to close actions."
  [region: Actions for scene 1]
    [button] "Play scene 1"
    [button aria-expanded=false] "Ask AI about Scene"
    [button aria-expanded=true]  "Hide Edit Options"
    [button]                     "Scene 1: kept. Tap to discard"
    [button aria-expanded=false] "Trim scene 1, expand controls"
    [button aria-expanded=false] "Split scene 1, expand controls"
    [button aria-expanded=false] "Move scene 1, expand controls"
    [button aria-expanded=false] "Add caption to scene 1, expand controls"
    [button aria-expanded=false] "Add note to scene 1, expand controls"
    [button aria-expanded=false] "Ask AI to Edit"
    [button aria-expanded=false] "Ask Helper"
    [button] "Close scene actions"
  [listitem] [button] "Scene 2 of 5 ..."
  ...
```

### M4. **CONFUSING** — Long flat action list before "Close scene actions"

With Edit by Myself opened the user must swipe past **11 buttons** before
reaching the next scene or the close button. The order also mixes verbs
across two semantic groups: communication (Play, Ask AI, Edit by Myself,
Ask AI to Edit, Ask Helper) and edit-operations (Keep/discard, Trim, Split,
Move, Add caption, Add note).
**Fix:** Wrap the edit-ops in their own nested `[group]` with
`aria-label="Edit operations for scene 1"`. TalkBack treats it as one block
and the user can swipe past it as a unit. Same trick the design system
already uses for the video library (`[group: Available videos]`).

### M5. **REDUNDANT** — "Mode: Creator Mode" surfaces twice the word *Mode*

The text "Mode: Creator Mode" reads aloud literally and is awkward.
**Fix:** Change to "Creator mode" or "Currently Creator Mode" in
`Probe2Page.jsx` near the role-banner block.

### m4. **TRADE-OFF** — "Keep (tap to discard)" visible / "Scene 1: kept. Tap to discard" aria

Already noted in walkthrough findings as visible-vs-aria mismatch. The aria
form is more informative. Defensible; flag and move on.

### m5. **REDUNDANT** — every Edit-ops button repeats "scene 1"

"Trim scene 1, expand controls", "Split scene 1, expand controls", … TalkBack
users moving across the row hear the scene number five times in a row. Once
the user is inside the expanded scene, they already know which scene they're
in.
**Fix:** Drop "scene 1" from each edit-op aria-label. "Trim, expand controls"
is sufficient because the action is read inside `[region: Actions for scene 1]`.

---

## 4. Probe 2b / Probe 3 — Decoupled coordination, role selector + waiting

### TalkBack reading order, role selector

```
[link] Skip to main content
[status] aria-live=polite (empty)
[main] / [region: Page instructions] / [h2: "Role Selection"] / [banner] / [h1]
[button] "Select creator role"
[button] "Select helper role"
```

### M6. **TRADE-OFF** — Role-button aria-label hides the role description

The visible text on each role button is:
- *"Creator — Audio/text-optimised interface. Primary playback control."*
- *"Helper — Visual-optimised interface. Can request control or work independently."*

…but the aria-label is just `"Select creator role"` / `"Select helper role"`.

A TalkBack user choosing a role is given **none** of the description that a
sighted user gets. Unlike the scene-block trade-off (where the user can
expand to read the full description), here the user has *no path* to the
description before committing.

**Fix:** Change aria-label to include the description, e.g.
`"Select creator role — audio and text-optimised interface, primary playback control"`.
This is the role-decision moment; brevity costs more than verbosity.

### M7. **CONFUSING** — Waiting screen does not announce that pairing is in progress

Snapshot of the *creator-waiting-for-helper* state shows the same elements as
the role selector with the helper button removed and `[status]` empty. There
is no visible "Waiting for helper..." copy in the accessibility tree because
it's rendered inside an `aria-hidden` decorative container, and the page never
fires `announce("Waiting for helper to join.")`.

**Fix:** When the creator selects their role and pairing begins, fire
`announce("Role selected: creator. Waiting for helper to join.")` once. When
the helper actually pairs, fire `announce("Helper joined. Loading shared
session.")`. Without these, a BLV creator selecting their role gets no audible
feedback that anything happened — they must trust the screen-reader's silence.

### m6. **CONFUSING** — `[h2] "Role Selection"` with no `<h1>` for the page itself

The `<h1>` is `"Probe 2b: Decoupled Coordination"` from the ConditionHeader,
and the `<h2>` is `"Role Selection"`. The `<h1>` appears *after* the `<h2>` in
DOM order (same B1 issue as in Probe 1). Same fix.

---

## 5. Recommended fix order (smallest blast radius first)

| # | File / area | Effort | Severity | Description |
|---|---|---|---|---|
| 1 | `Probe2Page.jsx` "Mode: Creator Mode" copy | 5 min | M5 | Drop the duplicate "Mode" word |
| 2 | `Probe2aSceneActions.jsx` Edit-op aria-labels | 10 min | m5 | Drop redundant "scene N" per edit-op label |
| 3 | `src/utils/announcer.js` clear-on-timer | 15 min | M2 | Live region clears 2 s after each announcement |
| 4 | Probes 2b + 3 waiting screens | 15 min | M7 | Announce role-selected + waiting + helper-joined |
| 5 | `DecoupledRoleSelector.jsx` role-button aria-labels | 10 min | M6 | Move the role description into the aria-label |
| 6 | `Probe2aSceneActions.jsx` group around Edit ops | 30 min | M4 | Wrap Trim/Split/Move/Caption/Note in a `<div role="group" aria-label="Edit operations for scene N">` |
| 7 | `App.jsx` / `OnboardingBrief.jsx` / `ConditionHeader.jsx` heading order | 30 min | B1 + M1 | Move ConditionHeader above OnboardingBrief, drop OnboardingBrief's `<h2>` |
| 8 | `ConditionHeader.jsx` banner accessible name | 15 min | B2 | Make the banner not duplicate the `<h1>` |
| 9 | Lan to confirm | — | M3 | Whether to re-add Detail-Level-1 to the collapsed scene-block aria-label |

Items 1–5 are low risk and fix the bulk of the redundancy / confusion. Items
6–8 touch shared chrome and warrant a verification re-run of the
`probe-auto-test` suite afterwards. Item 9 is a research-design call.

---

## 6. How to regenerate this report

```
# Dev server up
npm run dev

# Headless harness
BASE=http://localhost:5173 node .claude/skills/probe-auto-test/scripts/a11y-report.mjs
```

Output:
- `docs/probe_a11y_report_<date>.md` — raw, machine-generated structured dump.
- This file (`docs/probe_a11y_findings_<date>.md`) — human-readable
  interpretation; written by hand or by re-running the analysis from the raw
  report.

After landing any of the fixes above, re-run the script to confirm the
finding disappears from the raw report's "Findings" sections.
