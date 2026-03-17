# UI Card Grouping & Refinement Design

## Problem

Buttons across all three probes float in flat stacked layouts without clear visual association to the content they control. The three rows of buttons in ExplorationMode, the helper mode bars, and the stacked video/editor sections all lack visual grouping.

## Approach

**Card containers** — wrap related content and its buttons in bordered, labeled cards. Each card has a colored header identifying its purpose. Primary cards use the probe's accent color; secondary cards use gray. Cards double as screen reader landmarks via their labeled headers.

## Card System

### Card Anatomy

Every card follows this structure:

```
┌─────────────────────────────── 2px border (color by role) ─┐
│ HEADER — uppercase label, colored background                │
├─────────────────────────────────────────────────────────────┤
│ Content area (text, inputs, lists)                          │
├─────────────────────────────────────────────────────────────┤
│ Button row(s) — actions that belong to this card            │
└─────────────────────────────────────────────────────────────┘
```

- **Primary cards**: border and header use probe accent color (blue/green/purple)
- **Secondary cards**: border `#64748b`, header `#f1f5f9`
- **Contextual cards**: border matches content role (amber for marks/voice notes, orange for helper tasks)
- Border radius: `12px` on all cards
- Header text: `11px`, uppercase, `letter-spacing: 0.5px`, `font-weight: 700`

### Probe Accent Colors

| Probe | Accent | Usage |
|-------|--------|-------|
| Probe 1 | `#2B579A` (blue) | Scene description card, primary buttons, Play |
| Probe 2 | `#5CB85C` / `#2B579A` (creator) `#E67E22` (helper) | Mode bars, task cards |
| Probe 3 | `#9B59B6` (purple, creator) `#E67E22` (helper) | Scene description, mode bars |

---

## Probe 1: ExplorationMode

### Layout (top to bottom)

1. **Video Player** — rounded corners (`12px`), no transport control bar
2. **Scene Description Card** (primary, blue border)
   - Header: "SCENE DESCRIPTION" + "Scene X of Y" badge
   - Body: description text
   - Detail row: `− Less Detail` | `+ More Detail` buttons
   - Nav row (gray background strip): `◀ Previous` | `▶ Play` | `Next ▶`
3. **Actions Card** (secondary, gray border)
   - Header: "ACTIONS"
   - Button row: `⚑ Mark` (amber) | `✎ Edit` (dark) | `💬 Ask AI` (blue)

### Changes from Current

- Transport control bar removed — Play button moves into Scene Description nav row
- Less/More Detail buttons merged into Scene Description card (they modify its content)
- Ask AI moved from standalone Detail Level row into Actions card
- Marked Segments panel removed from UI (marks still logged to event system for researcher)
- 3 button rows consolidated into 2 cards

---

## Probe 2: Creator Mode

### Layout

1. **Mode Bar Card** (blue border)
   - Header bar: "Creator Mode" label + orange `Handover` button
2. **Voice Note Card** (amber border, conditional — appears when marking)
   - Header: "VOICE NOTE"
   - Body: segment name + `⏺ Record` | `Skip` | `Cancel` buttons
3. **Video Player** — same as Probe 1 (no transport bar)
4. **Scene Description Card** — same as Probe 1
5. **Actions Card** — same as Probe 1

### Changes from Current

- Mode indicator bar wrapped in a card
- Voice note recording overlay wrapped in a card with labeled header
- Marked Segments panel removed (same as Probe 1)

---

## Probe 2: Helper Mode

### Layout

1. **Mode Bar Card** (orange border)
   - Header bar: "🔧 Helper Mode — Tasks/Live" label
   - Button row: `↩ Return Device` (full width, blue)
   - Notify Creator button removed
2. **Task Queue Card** (orange border, conditional — tasks mode)
   - Header: "CREATOR'S TASKS (N)"
   - Task items with checkbox, label, voice note play button
   - Completed tasks: green background, strikethrough, checkmark
3. **Video Editor Card** (gray border)
   - Header: "VIDEO EDITOR"
   - Contains (unified in one card): Video player → Transport controls → Editor toolbar → Timeline
   - Editor toolbar includes new `T Text` button (yellow highlight when active)
   - Text overlays appear as draggable elements on the video frame (dashed border, drag hint)
4. **Text Overlay Settings Card** (yellow border, conditional — appears when text tool active)
   - Header: "TEXT OVERLAY" + "Active" badge
   - Text input field
   - Size selector: S | M | L
   - Color swatches: white, yellow, red, green
   - Action buttons: `✓ Apply Text` | `✕ Remove`

### Changes from Current

- Notify Creator button removed
- Video + Transport + Editor + Timeline unified into single "Video Editor" card
- New text overlay tool added (toolbar button + settings card + draggable frame element)
- Return Device is the only mode action

### Text Overlay Feature (New)

**Interaction flow:**
1. Tap `T Text` in editor toolbar (button highlights yellow)
2. Text Overlay Settings card appears below the editor
3. Type text content, pick size (S/M/L) and color (4 swatches)
4. Text appears on video frame with dashed border indicating it's draggable
5. Drag text element on the video frame to reposition
6. Tap `Apply Text` to lock in place or `Remove` to delete
7. Applied text overlays persist on the video frame (no dashed border)

**Implementation notes:**
- Drag uses pointer events (touch + mouse) with position stored as percentage of frame dimensions
- Text state: `{ content, size, color, x%, y% }` per overlay
- Multiple overlays supported — each independently draggable before applying
- Overlays are visual only (rendered as absolute-positioned divs on the video container)

---

## Probe 3: Creator Device

### Layout

Same as Probe 2 Creator Mode, with purple (`#9B59B6`) accent color instead of blue:

1. **Mode Bar Card** (purple) — "Creator Device" label only (no handover button — Probe 3 uses separate devices)
2. **Voice Note Card** (amber, conditional)
3. **Video Player**
4. **Scene Description Card** (purple accent)
5. **Actions Card** (gray)

---

## Probe 3: Helper Device

### Layout

1. **Mode Bar Card** (orange border)
   - Header: "🔧 Helper Device — Tasks"
   - Button row: `↩ Done` (full width, blue)
   - No Notify Creator, no Independent Mode toggle
2. **Task Queue + Creator Activity Card** (orange border)
   - Header: "CREATOR'S TASKS (N)"
   - Task items (same as Probe 2)
   - Bottom section (purple background): "CREATOR ACTIVITY" — real-time feed of creator actions with timestamps
3. **Video Editor Card** (gray) — same as Probe 2 helper, including text overlay tool

### Changes from Current

- Notify Creator button removed
- Independent/Sync toggle removed entirely (helper always controls own playback, activity feed provides awareness)
- Creator Activity feed folded into bottom of Task Queue card instead of separate component
- Video editor unified into single card (same as Probe 2)
- Text overlay tool added (same as Probe 2)

---

## Removals Summary

| Feature | Reason |
|---------|--------|
| Transport control bar (Probe 1 creator views) | Play button moved into Scene Description card nav row |
| Marked Segments panel | Marks still logged; list removed from UI to reduce clutter |
| Notify Creator button (Probe 2 & 3 helper) | Low study value; verbal communication sufficient when co-located |
| Independent/Sync mode toggle (Probe 3 helper) | Adds UI complexity without study value; activity feed provides awareness |
| Separate Detail Level row | Less/More merged into Scene Description card; Ask AI moved to Actions |

## Accessibility Considerations

- Card headers serve as screen reader landmarks (labeled regions)
- All cards use `role="region"` or `role="group"` with `aria-label` matching the header text
- Button minimum touch targets maintained at 44-48px
- High contrast mode: card borders become white, card backgrounds become dark
- Voice Note and Text Overlay cards announced via live region when they appear/disappear
