# UI Card Grouping & Refinement Design

## Problem

Buttons across all three probes float in flat stacked layouts without clear visual association to the content they control. The three rows of buttons in ExplorationMode, the helper mode bars, and the stacked video/editor sections all lack visual grouping.

## Approach

**Card containers** — wrap related content and its buttons in bordered, labeled cards. Each card has a colored header identifying its purpose. Primary cards use the probe's accent color; secondary cards use gray. Cards double as screen reader landmarks via their labeled headers.

## Implementation Scope

### Shared Component: ExplorationMode

`ExplorationMode.jsx` is the core shared component used by Probe 1, Probe 2 Creator (`CreatorMode.jsx`), and Probe 3 Creator (`CreatorDevice.jsx`). All three render `<ExplorationMode>` directly. The card refactoring happens inside this single component — the changes propagate to all three probes automatically.

### What Stays Unchanged

- **Edit panel modal** (ExplorationMode slide-up portal) — remains as-is, no card conversion needed
- **VQA panel modal** (Ask AI bottom-sheet) — remains as-is, triggered from the new Actions card button
- **Researcher WoZ panels** (`ResearcherVQAPanel`, `ResearcherHandoverPanel`, `?mode=researcher`) — out of scope, no changes
- **Return Device / Done summary modal** (Probe 2 & 3 helper) — modal remains as-is
- **Live mode info banner** (Probe 2 & 3 helper, `handoverMode === 'live'`) — wrap in a card with blue border, same content

### Behavioral Changes

- **Independent/Sync mode (Probe 3)**: UI toggle removed AND underlying sync behavior removed. Helper always controls own playback independently. Remove `independentMode`, `onToggleIndependentMode`, and `creatorState` props from `HelperDevice`. The WebSocket sync for auto-following creator playback is removed.
- **Keyboard shortcut H (Probe 3 Creator)**: Keep the `H` keyboard shortcut for handover — it triggers `onInitiateHandover` which is still valid for study flow even without a visible button.

### Voice Note Workflow After Marks Panel Removal

When the Marked Segments panel is removed, voice note confirmation feedback changes:
- After recording or skipping, the screen reader announcement (`announce()`) still fires: "Voice note saved for [segment]" or "Marked [segment] without voice note"
- Marks are still stored in state and logged to the event system
- The voice note recording card (amber) dismisses after save/skip, returning to the exploration view
- No visible list is needed — the announcements provide confirmation

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

- ExplorationMode's 3 inline button rows (nav, detail, actions) consolidated into 2 cards
- Less/More Detail buttons merged into Scene Description card (they modify its content)
- Ask AI moved from the middle detail row into Actions card
- Play button moved into the Scene Description nav row (between Previous/Next)
- Marked Segments panel removed from UI (marks still logged to event system for researcher; voice note confirmation via screen reader announcements)
- Note: ExplorationMode already has no TransportControls component — the Play button was always inline

---

## Probe 2: Creator Mode

`CreatorMode.jsx` renders `<ExplorationMode>` as a child — the Scene Description and Actions cards come from the shared component automatically.

### Layout

1. **Mode Bar Card** (blue border)
   - Header bar: "Creator Mode" label + orange `Handover` button
2. **Voice Note Card** (amber border, conditional — appears when marking)
   - Header: "VOICE NOTE"
   - Body: segment name + `⏺ Record` | `Skip` | `Cancel` buttons
3. **Video Player** — same as Probe 1 (no transport bar)
4. **Scene Description Card** — from shared `ExplorationMode`
5. **Actions Card** — from shared `ExplorationMode`

### Changes from Current

- Mode indicator bar wrapped in a card
- Voice note recording overlay wrapped in a card with labeled header
- Marked Segments panel removed (same as Probe 1; voice note confirmation via announcements)

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

### Additional Cards (conditional)

5. **Live Mode Banner Card** (blue border, conditional — `handoverMode === 'live'`)
   - Same content as current live mode info banner, wrapped in a card
   - Green pulse indicator + "Live collaboration — Creator is guiding you" text

### Changes from Current

- Notify Creator button removed
- Video + Transport + Editor + Timeline unified into single "Video Editor" card
- New text overlay tool added (toolbar button + settings card + draggable frame element)
- Return Device is the only mode action
- Return Device summary modal preserved as-is (no changes)
- Live mode info banner wrapped in card

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

**Event logging** (add to `eventTypes.js`):
- `ADD_TEXT_OVERLAY` — logged when Apply Text is tapped, with `{ content, size, color, x, y }`
- `MOVE_TEXT_OVERLAY` — logged on drag end, with `{ overlayId, x, y }`
- `REMOVE_TEXT_OVERLAY` — logged when Remove is tapped, with `{ overlayId }`
- `EDIT_TEXT_OVERLAY` — logged when text content, size, or color is changed, with `{ overlayId, field, value }`

---

## Probe 3: Creator Device

`CreatorDevice.jsx` renders `<ExplorationMode>` as a child — same as Probe 2 Creator.

### Layout

Same as Probe 2 Creator Mode, with purple (`#9B59B6`) accent color instead of blue (color change from current `#2B579A`):

1. **Mode Bar Card** (purple) — "Creator Device" label only (no handover button — Probe 3 uses separate devices; `H` keyboard shortcut kept)
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
   - When `handoverMode !== 'tasks'` or no tasks: card still renders with just the Creator Activity section (no task items), so the activity feed is always visible
3. **Live Mode Banner Card** (blue border, conditional — same as Probe 2)
4. **Video Editor Card** (gray) — same as Probe 2 helper, including text overlay tool

### Changes from Current

- Notify Creator button removed
- Independent/Sync toggle removed — both UI and underlying sync behavior. Remove `independentMode`, `onToggleIndependentMode`, `creatorState` props. Helper always controls own playback.
- Creator Activity feed (`WorkspaceAwareness`) folded into bottom of Task Queue card instead of separate component
- Video editor unified into single card (same as Probe 2)
- Text overlay tool added (same as Probe 2)
- Done summary modal preserved as-is

---

## Removals Summary

| Feature | Reason |
|---------|--------|
| Marked Segments panel (all creator views) | Marks still logged; list removed from UI to reduce clutter; voice note confirmation via screen reader announcements |
| Notify Creator button (Probe 2 & 3 helper) | Low study value; verbal communication sufficient |
| Independent/Sync mode toggle (Probe 3 helper) | UI and behavior removed; activity feed provides awareness |
| Separate Detail Level row (ExplorationMode) | Less/More merged into Scene Description card; Ask AI moved to Actions |

## Accessibility Considerations

- Card headers serve as screen reader landmarks (labeled regions)
- All cards use `role="region"` or `role="group"` with `aria-label` matching the header text
- Button minimum touch targets maintained at 44-48px
- High contrast mode (`.high-contrast` class from `AccessibilityContext`):
  - Card borders: `#FFFFFF` (white), `2px solid`
  - Card header backgrounds: `#1a1a1a`
  - Card body backgrounds: `#000000`
  - Card header text: `#FFFFFF`
  - Active/accent elements: `#00FFFF` (cyan)
- Voice Note and Text Overlay cards announced via live region when they appear/disappear
- Text overlay drag handles: minimum 44px touch target, announced position changes via live region
