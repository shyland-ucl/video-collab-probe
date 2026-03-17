# UI Card Grouping Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor all probe UIs to use card containers that visually group buttons with the content they control, remove unused features, and add a text overlay tool for the helper editor.

**Architecture:** The core change is in `ExplorationMode.jsx` (shared by all creator views) — its 3 flat button rows become 2 cards. Each parent component (CreatorMode, HelperMode, CreatorDevice, HelperDevice) wraps its own sections in cards. A new `TextOverlay` component adds draggable text to the video frame in helper modes.

**Tech Stack:** React 19, Tailwind CSS v4, Vite, no TypeScript, no test runner

**Spec:** `docs/superpowers/specs/2026-03-17-ui-card-grouping-design.md`

---

## File Structure

### Files to Create
- `src/components/shared/TextOverlay.jsx` — Draggable text overlay on video frame
- `src/components/shared/TextOverlaySettings.jsx` — Settings card for text tool (input, size, color, apply/remove)
- `src/hooks/useTextOverlay.js` — Shared hook for text overlay state and handlers (used by HelperMode + HelperDevice)

### Files to Modify
- `src/components/probe1/ExplorationMode.jsx` — Refactor 3 button rows → 2 cards, add `accentColor` prop
- `src/components/probe2/CreatorMode.jsx` — Wrap mode bar + voice note in cards, remove marks list + MarkList import
- `src/components/probe2/HelperMode.jsx` — Remove Notify Creator, wrap sections in cards, add text tool
- `src/components/probe3/CreatorDevice.jsx` — Change accent to purple, wrap in cards, remove marks list + MarkList import, label "Creator Device"
- `src/components/probe3/HelperDevice.jsx` — Remove Notify Creator + sync toggle (UI + behavior), wrap in cards, fold in WorkspaceAwareness, add text tool
- `src/components/shared/MockEditorVisual.jsx` — Add "T Text" button to toolbar
- `src/utils/eventTypes.js` — Add text overlay event types, remove `INDEPENDENT_MODE_TOGGLE`
- `src/pages/Probe1Page.jsx` — Remove marks list rendering
- `src/pages/Probe2Page.jsx` — Remove `onNotifyCreator` prop passing (if present)
- `src/pages/Probe3.jsx` — Remove `independentMode`, `onToggleIndependentMode`, `creatorState` state/props, remove `onNotifyCreator`

### Files Unchanged
- `src/components/shared/VideoPlayer.jsx`
- `src/components/shared/TransportControls.jsx`
- `src/components/probe3/WorkspaceAwareness.jsx` (still used, just rendered inside task card)
- All researcher panels, modals, context providers

### Cross-Cutting Rules (apply to ALL tasks that create cards)
- Every card wrapper must have `role="region"` and `aria-label` matching the header text
- Example: `<div role="region" aria-label="Scene description" className="border-2 ...">`
- This is required by the spec for accessibility (screen reader landmarks)

---

## Chunk 1: Core Card Refactoring

### Task 1: Add text overlay event types

**Files:**
- Modify: `src/utils/eventTypes.js`

- [ ] **Step 1: Add new event type constants and remove obsolete one**

Add after the existing `PLAY_VOICE_NOTE` line (around line 54):

```javascript
// Text overlay (Probe 2 & 3 helper)
ADD_TEXT_OVERLAY: 'ADD_TEXT_OVERLAY',
MOVE_TEXT_OVERLAY: 'MOVE_TEXT_OVERLAY',
REMOVE_TEXT_OVERLAY: 'REMOVE_TEXT_OVERLAY',
EDIT_TEXT_OVERLAY: 'EDIT_TEXT_OVERLAY',
```

Also remove `INDEPENDENT_MODE_TOGGLE` (around line 60) — this feature is being removed.

- [ ] **Step 2: Verify the dev server still runs**

Run: `npm run dev`
Expected: No errors, app loads

- [ ] **Step 3: Commit**

```bash
git add src/utils/eventTypes.js
git commit -m "feat: add text overlay event types"
```

---

### Task 2: Refactor ExplorationMode — Scene Description Card

This is the highest-impact change. The 3 flat button rows (lines ~448-534) become 2 cards.

**Files:**
- Modify: `src/components/probe1/ExplorationMode.jsx:448-534`

- [ ] **Step 1: Replace the 3 button rows with Scene Description Card + Actions Card**

Replace the existing button rows (the 3 `div` blocks with `border-t border-gray-200`) with:

**Scene Description Card** — wraps the description text (currently above the buttons around lines 400-445) and includes:
- Header: "SCENE DESCRIPTION" label + "Scene X of Y" badge
- Body: existing description text
- Detail row: `− Less Detail` | `+ More Detail` (moved from row 2)
- Nav row: `◀ Previous` | `▶ Play` | `Next ▶` (Previous/Next from row 1, Play from row 3)

**Actions Card** — secondary gray card:
- Header: "ACTIONS"
- Button row: `⚑ Mark` (from row 3) | `✎ Edit` (from row 3) | `💬 Ask AI` (from row 2)

Card styling:
- Primary card: `border-2 border-[#2B579A] rounded-xl overflow-hidden bg-white`
- Header: `bg-[#eff6ff] px-3 py-2.5 border-b border-[#bfdbfe]` with uppercase `text-xs font-bold tracking-wide text-[#2B579A]`
- Secondary card: `border-2 border-[#64748b] rounded-xl overflow-hidden bg-white`
- Secondary header: `bg-[#f1f5f9] px-3 py-2.5 border-b border-[#cbd5e1]` with `text-[#475569]`
- Nav row background: `bg-[#f8fafc] border-t border-[#e2e8f0]`
- All buttons keep existing min-height 44px touch targets and aria-labels

- [ ] **Step 2: Add `role="region"` and `aria-label` to each card wrapper**

Scene Description Card: `role="region" aria-label="Scene description"`
Actions Card: `role="region" aria-label="Actions"`

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`, open `/probe1`, import a video, start exploring.
Expected: Two cards visible below video player. Previous/Play/Next in bottom of description card. Mark/Edit/Ask AI in actions card. All buttons functional.

- [ ] **Step 4: Commit**

```bash
git add src/components/probe1/ExplorationMode.jsx
git commit -m "feat: refactor ExplorationMode to card layout with Scene Description and Actions cards"
```

---

### Task 3: Remove Marked Segments panel from Probe 1

**Files:**
- Modify: `src/pages/Probe1Page.jsx:212-235`

- [ ] **Step 1: Remove the marks list rendering block**

Delete the entire block that renders the "Marked Segments" list (lines ~212-235). Keep the marks state and event logging — only remove the visible list.

- [ ] **Step 2: Verify marks still log events**

Open `/probe1`, explore a video, tap Mark. Check browser console — the event should still be logged via `EventLoggerContext`. The mark just doesn't appear in a visible list anymore.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Probe1Page.jsx
git commit -m "feat: remove Marked Segments panel from Probe 1 UI (marks still logged)"
```

---

### Task 4: Wrap CreatorMode sections in cards

**Files:**
- Modify: `src/components/probe2/CreatorMode.jsx:116-204`

- [ ] **Step 1: Wrap mode bar in a card**

Replace the mode bar div (lines 116-129) with a card:
```
border-2 border-[#2B579A] rounded-xl overflow-hidden
```
Header becomes the full-width blue bar with "Creator Mode" label + Handover button inside.

- [ ] **Step 2: Wrap voice note recording section in a card**

Replace the voice note overlay div (lines 132-160) with a card:
```
border-2 border-[#f59e0b] rounded-xl overflow-hidden bg-white
```
Add header: "VOICE NOTE" in amber style.

- [ ] **Step 3: Remove marks list from CreatorMode**

Delete lines 193-204 (the marks list rendering). Also remove the `MarkList` import at line 9. Keep `marks`, `onAddMark`, `onDeleteMark` props — they still feed into the event system. The voice note recording workflow still works; the `announce()` call confirms save.

- [ ] **Step 4: Verify in browser**

Open `/probe2`, enter Creator Mode. Mode bar should be in a card. Tap Mark on a segment — voice note card should appear with amber border and "VOICE NOTE" header. After recording/skipping, card dismisses. No marks list visible.

- [ ] **Step 5: Commit**

```bash
git add src/components/probe2/CreatorMode.jsx
git commit -m "feat: wrap CreatorMode sections in cards, remove marks panel"
```

---

### Task 5: Refactor HelperMode — cards, remove Notify Creator

**Files:**
- Modify: `src/components/probe2/HelperMode.jsx:94-192`

- [ ] **Step 1: Refactor mode bar card — remove Notify Creator**

Replace lines 100-130. New card structure:
```
border-2 border-[#E67E22] rounded-xl overflow-hidden
```
- Orange header bar: "🔧 Helper Mode — Tasks/Live" label (keep dynamic text)
- Body row: only `↩ Return Device` button (full width, blue `#2B579A`)
- Remove `handleNotify` function and the Notify Creator button entirely
- Remove `playNotifyChime` function (lines 12-30) if no longer used elsewhere

- [ ] **Step 2: Wrap task queue in a card**

Replace lines 133-148. New card:
```
border-2 border-[#E67E22] rounded-xl overflow-hidden
```
- Header: "CREATOR'S TASKS (N)" in orange style
- Body: existing TaskQueue component

- [ ] **Step 3: Wrap live mode banner in a card**

Replace lines 151-164. New card:
```
border-2 border-[#2B579A] rounded-xl overflow-hidden
```
- Header: "LIVE COLLABORATION" in blue style
- Body: green pulse + guidance text

- [ ] **Step 4: Wrap video + editor section in a card**

Replace lines 167-191. New card:
```
border-2 border-[#64748b] rounded-xl overflow-hidden
```
- Header: "VIDEO EDITOR"
- Body: VideoPlayer → TransportControls → MockEditorVisual → SegmentMarkerPanel (all inside one card)

- [ ] **Step 5: Verify in browser**

Open `/probe2` with `?mode=researcher` to trigger helper mode. Check: mode bar card (no Notify button), task queue card, video editor card all render correctly. Return Device modal still works.

- [ ] **Step 6: Commit**

```bash
git add src/components/probe2/HelperMode.jsx
git commit -m "feat: wrap HelperMode in cards, remove Notify Creator"
```

---

### Task 6: Refactor CreatorDevice — purple accent, cards

**Files:**
- Modify: `src/components/probe3/CreatorDevice.jsx:154-245`

- [ ] **Step 1: Change mode bar color to purple, update label, and wrap in card**

Change mode bar (lines 160-165):
- Background: `#9B59B6` (purple, was `#2B579A`)
- Label text: "Creator Device" (was "Creator Mode")
- Wrap in card: `border-2 border-[#9B59B6] rounded-xl overflow-hidden`

- [ ] **Step 2: Wrap voice note recording in a card**

Same pattern as CreatorMode Task 4 Step 2 — amber card with "VOICE NOTE" header.

- [ ] **Step 3: Remove marks list and unused imports**

Delete lines 234-245 (marks list rendering). Also remove `MarkList` import at line 9.

- [ ] **Step 4: Verify ExplorationMode cards render with purple accent**

Note: ExplorationMode uses `#2B579A` (blue) internally. For Probe 3 creator, the Scene Description card should use purple. ExplorationMode needs to accept an optional `accentColor` prop that defaults to `#2B579A`. Pass `accentColor="#9B59B6"` from CreatorDevice.

Update ExplorationMode.jsx to accept `accentColor` prop and use it for:
- Scene Description card border color
- Scene Description card header background/text color
- Play button background color
- Ask AI button background color in Actions card

- [ ] **Step 5: Verify in browser**

Open `/probe3` as creator device. Purple mode bar, purple scene description card, amber voice note card when marking. No marks list.

- [ ] **Step 6: Commit**

```bash
git add src/components/probe3/CreatorDevice.jsx src/components/probe1/ExplorationMode.jsx
git commit -m "feat: refactor CreatorDevice to purple accent cards, add accentColor prop to ExplorationMode"
```

---

### Task 7: Refactor HelperDevice — remove sync toggle, fold in activity, cards

**Files:**
- Modify: `src/components/probe3/HelperDevice.jsx:149-350`

- [ ] **Step 1: Remove sync/independent toggle UI and behavior**

- Delete lines 238-255 (sync toggle + status badge)
- Remove `handleToggleIndependent` function
- Remove `independentMode`, `onToggleIndependentMode`, `creatorState` from destructured props
- Remove `independentMode` references in `handleSeek`
- Simplify `handleSeek` to just call `onSeek(time)` + `sendActivity('Seeked', ...)`

- [ ] **Step 2: Remove Notify Creator from mode bar**

Same as HelperMode Task 5 Step 1 — remove `handleNotify`, `playNotifyChime`, and the Notify Creator button. Keep "Done" button (renamed from "Return Device"). Wrap in orange card.

- [ ] **Step 3: Wrap task queue in card, fold in WorkspaceAwareness**

New card structure:
```
border-2 border-[#E67E22] rounded-xl overflow-hidden
```
- Header: "CREATOR'S TASKS (N)"
- Body: TaskQueue items
- Bottom section: purple background, "CREATOR ACTIVITY" sub-header, `<WorkspaceAwareness>` content
- When no tasks (`handoverMode !== 'tasks'` or empty): render card with just the Creator Activity section

- [ ] **Step 4: Wrap live mode banner in a card**

Same pattern as HelperMode Task 5 Step 3.

- [ ] **Step 5: Wrap video + editor in a card**

Same pattern as HelperMode Task 5 Step 4.

- [ ] **Step 6: Verify in browser**

Open `/probe3` as helper device. No sync toggle. Mode bar card with just Done. Task queue card with activity feed at bottom. Video editor card.

- [ ] **Step 7: Commit**

```bash
git add src/components/probe3/HelperDevice.jsx
git commit -m "feat: refactor HelperDevice — remove sync toggle, fold activity into task card, card layout"
```

---

### Task 7b: Clean up parent components (Probe2Page, Probe3)

**Files:**
- Modify: `src/pages/Probe2Page.jsx`
- Modify: `src/pages/Probe3.jsx`

- [ ] **Step 1: Clean up Probe2Page**

Remove any `onNotifyCreator` prop passing to `HelperMode`. Remove the `playNotifyChime` function if defined here.

- [ ] **Step 2: Clean up Probe3 page**

Remove `independentMode` state, `onToggleIndependentMode` handler, `creatorState` state/refs, and stop passing these as props to `HelperDevice`. Remove any `onNotifyCreator` prop passing. Remove any WebSocket listener code that sets `creatorState` or `independentMode`.

- [ ] **Step 3: Verify no build warnings**

```bash
npm run build
```
Expected: No unused variable warnings for removed props/state.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Probe2Page.jsx src/pages/Probe3.jsx
git commit -m "feat: clean up parent components — remove dead props for sync toggle and notify"
```

---

## Chunk 2: Text Overlay Feature

### Task 8: Create TextOverlay component

**Files:**
- Create: `src/components/shared/TextOverlay.jsx`

- [ ] **Step 1: Create the draggable text overlay component**

This component renders an absolutely-positioned div on the video frame that can be dragged via pointer events. Props:

```javascript
{
  overlay: { id, content, size, color, x, y }, // x/y as percentages 0-100
  isEditing: boolean, // true = dashed border, draggable
  onMove: (id, x, y) => void,
}
```

Implementation:
- Position: `absolute`, `left: ${x}%`, `top: ${y}%`, `transform: translate(-50%, -50%)`
- When `isEditing`: dashed yellow border (`border-2 border-dashed border-[#fbbf24]`), cursor move
- Font size map: `{ S: '0.75rem', M: '1rem', L: '1.25rem' }`
- Drag: `onPointerDown` captures offset, `onPointerMove` updates position as % of parent, `onPointerUp` fires `onMove`
- Min touch target: 44px via padding
- Text shadow for readability: `1px 1px 2px rgba(0,0,0,0.8)`
- Semi-transparent background when editing: `bg-black/50`

- [ ] **Step 2: Commit**

```bash
git add src/components/shared/TextOverlay.jsx
git commit -m "feat: create TextOverlay draggable component"
```

---

### Task 9: Create TextOverlaySettings component

**Files:**
- Create: `src/components/shared/TextOverlaySettings.jsx`

- [ ] **Step 1: Create the settings card component**

Props:
```javascript
{
  overlay: { id, content, size, color, x, y },
  onChange: (field, value) => void,
  onApply: () => void,
  onRemove: () => void,
}
```

Card structure (yellow border):
```
border-2 border-[#fbbf24] rounded-xl overflow-hidden
```
- Header: "TEXT OVERLAY" + "Active" badge
- Text input: standard input field, `aria-label="Text content"`
- Size selector: 3 buttons (S/M/L), selected one uses `bg-[#2B579A] text-white`
- Color swatches: 4 buttons (white, `#fbbf24`, `#ef4444`, `#22c55e`), selected has `border-2 border-[#2B579A]`
- Actions: `✓ Apply Text` (yellow) | `✕ Remove` (gray outline)
- All buttons: `min-height: 44px`

- [ ] **Step 2: Commit**

```bash
git add src/components/shared/TextOverlaySettings.jsx
git commit -m "feat: create TextOverlaySettings card component"
```

---

### Task 10: Add Text button to MockEditorVisual toolbar

**Files:**
- Modify: `src/components/shared/MockEditorVisual.jsx:562-568`

- [ ] **Step 1: Add `onTextTool` prop and Text button**

Add an optional `onTextTool` prop and `textToolActive` prop. Insert a "T Text" button after the Captions toggle (around line 567), before the divider:

```jsx
{onTextTool && (
  <>
    <div className="border-l border-white/30 h-6 mx-1" aria-hidden="true" />
    <button
      onClick={onTextTool}
      className={`px-2 py-1 rounded text-xs font-bold transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-white ${
        textToolActive
          ? 'bg-[#fbbf24] text-[#1a1a2e]'
          : 'bg-white/10 text-white/70 hover:bg-white/20'
      }`}
      style={{ minHeight: '44px', minWidth: '44px' }}
      aria-label="Text overlay tool"
      aria-pressed={textToolActive}
    >
      T Text
    </button>
  </>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/shared/MockEditorVisual.jsx
git commit -m "feat: add Text tool button to MockEditorVisual toolbar"
```

---

### Task 11: Create useTextOverlay shared hook

**Files:**
- Create: `src/hooks/useTextOverlay.js`

- [ ] **Step 1: Create the shared hook**

This hook encapsulates all text overlay state and handlers, avoiding duplication between HelperMode and HelperDevice.

```javascript
import { useState, useCallback } from 'react';
import { useEventLogger } from '../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../utils/eventTypes.js';
import { announce } from '../utils/announcer.js';

export default function useTextOverlay() {
  const { logEvent } = useEventLogger();
  const [textOverlays, setTextOverlays] = useState([]);
  const [activeOverlayId, setActiveOverlayId] = useState(null);
  const [textToolActive, setTextToolActive] = useState(false);

  const handleTextTool = useCallback(() => {
    if (textToolActive) {
      setTextToolActive(false);
      setActiveOverlayId(null);
      return;
    }
    const newOverlay = {
      id: `text-${Date.now()}`,
      content: 'Text',
      size: 'M',
      color: '#FFFFFF',
      x: 50,
      y: 50,
    };
    setTextOverlays(prev => [...prev, newOverlay]);
    setActiveOverlayId(newOverlay.id);
    setTextToolActive(true);
    announce('Text overlay tool activated. Type your text and drag to position.');
  }, [textToolActive]);

  const handleTextMove = useCallback((id, x, y) => {
    setTextOverlays(prev => prev.map(o => o.id === id ? { ...o, x, y } : o));
    logEvent(EventTypes.MOVE_TEXT_OVERLAY, Actors.HELPER, { overlayId: id, x, y });
  }, [logEvent]);

  const handleTextChange = useCallback((field, value) => {
    if (!activeOverlayId) return;
    setTextOverlays(prev => prev.map(o =>
      o.id === activeOverlayId ? { ...o, [field]: value } : o
    ));
    logEvent(EventTypes.EDIT_TEXT_OVERLAY, Actors.HELPER, { overlayId: activeOverlayId, field, value });
  }, [activeOverlayId, logEvent]);

  const handleTextApply = useCallback(() => {
    const overlay = textOverlays.find(o => o.id === activeOverlayId);
    if (overlay) {
      logEvent(EventTypes.ADD_TEXT_OVERLAY, Actors.HELPER, {
        content: overlay.content, size: overlay.size, color: overlay.color, x: overlay.x, y: overlay.y,
      });
    }
    setActiveOverlayId(null);
    setTextToolActive(false);
    announce('Text overlay applied');
  }, [activeOverlayId, textOverlays, logEvent]);

  const handleTextRemove = useCallback(() => {
    logEvent(EventTypes.REMOVE_TEXT_OVERLAY, Actors.HELPER, { overlayId: activeOverlayId });
    setTextOverlays(prev => prev.filter(o => o.id !== activeOverlayId));
    setActiveOverlayId(null);
    setTextToolActive(false);
    announce('Text overlay removed');
  }, [activeOverlayId, logEvent]);

  const activeOverlay = textOverlays.find(o => o.id === activeOverlayId) || null;

  return {
    textOverlays, activeOverlay, textToolActive,
    handleTextTool, handleTextMove, handleTextChange, handleTextApply, handleTextRemove,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useTextOverlay.js
git commit -m "feat: create useTextOverlay shared hook"
```

---

### Task 12: Integrate text overlay into HelperMode

**Files:**
- Modify: `src/components/probe2/HelperMode.jsx`

- [ ] **Step 1: Use the shared hook**

Add import and call the hook:
```javascript
import useTextOverlay from '../../hooks/useTextOverlay.js';
// ... inside component:
const {
  textOverlays, activeOverlay, textToolActive,
  handleTextTool, handleTextMove, handleTextChange, handleTextApply, handleTextRemove,
} = useTextOverlay();
```

- [ ] **Step 2: Render TextOverlay components on the video container**

Wrap the VideoPlayer inside the Video Editor card in a `relative` container. Render TextOverlay for each overlay:

```jsx
<div className="relative">
  <VideoPlayer ... />
  {textOverlays.map(overlay => (
    <TextOverlay
      key={overlay.id}
      overlay={overlay}
      isEditing={overlay.id === activeOverlayId}
      onMove={handleTextMove}
    />
  ))}
</div>
```

- [ ] **Step 3: Pass text tool props to MockEditorVisual**

```jsx
<MockEditorVisual
  ...existing props
  onTextTool={handleTextTool}
  textToolActive={textToolActive}
/>
```

- [ ] **Step 4: Render TextOverlaySettings card when active**

After the Video Editor card, conditionally render:
```jsx
{activeOverlayId && (
  <TextOverlaySettings
    overlay={textOverlays.find(o => o.id === activeOverlayId)}
    onChange={handleTextChange}
    onApply={handleTextApply}
    onRemove={handleTextRemove}
  />
)}
```

- [ ] **Step 5: Import new components and event types**

Add imports at top of file:
```javascript
import TextOverlay from '../shared/TextOverlay.jsx';
import TextOverlaySettings from '../shared/TextOverlaySettings.jsx';
```

- [ ] **Step 6: Verify in browser**

Open `/probe2` as helper. Tap "T Text" in toolbar — button highlights yellow, text appears on video, settings card appears below. Type text, pick size/color, drag on video. Apply locks it. Remove deletes it.

- [ ] **Step 7: Commit**

```bash
git add src/components/probe2/HelperMode.jsx
git commit -m "feat: integrate text overlay tool into HelperMode"
```

---

### Task 13: Integrate text overlay into HelperDevice

**Files:**
- Modify: `src/components/probe3/HelperDevice.jsx`

- [ ] **Step 1: Use the shared hook**

Same as Task 12 Step 1 — import and call `useTextOverlay()`.

- [ ] **Step 2: Render TextOverlay on video, pass props to MockEditorVisual, render TextOverlaySettings**

Same integration pattern as Task 12 Steps 2-5.

- [ ] **Step 3: Verify in browser**

Open `/probe3` as helper device. Text tool works same as Probe 2.

- [ ] **Step 4: Commit**

```bash
git add src/components/probe3/HelperDevice.jsx
git commit -m "feat: integrate text overlay tool into HelperDevice"
```

---

### Task 14: Final verification and cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run production build**

```bash
npm run build
```
Expected: No errors

- [ ] **Step 2: Test all routes in browser**

- `/` — Session setup loads
- `/probe1` — Video library → exploration mode with 2 cards, no marks list
- `/probe2` — Creator mode: cards, voice note card on mark, no marks list. Helper mode: cards, no Notify Creator, text tool works
- `/probe3` — Creator device: purple accent cards. Helper device: no sync toggle, activity in task card, text tool works
- `/researcher` — Dashboard still works (untouched)

- [ ] **Step 3: Test accessibility**

- Tab through all cards — focus order logical
- Screen reader: card headers announced as landmarks
- High contrast mode: verify cards are visible (may need CSS additions in `index.css`)

- [ ] **Step 4: Add high contrast card styles if needed**

If high contrast mode doesn't automatically style the cards, add to `src/index.css`:
```css
.high-contrast [role="region"],
.high-contrast [role="group"] {
  border-color: #FFFFFF !important;
  background-color: #000000 !important;
}
.high-contrast [role="region"] > :first-child,
.high-contrast [role="group"] > :first-child {
  background-color: #1a1a1a !important;
  color: #FFFFFF !important;
}
.high-contrast [role="region"] button:focus,
.high-contrast [role="group"] button:focus {
  outline-color: #00FFFF !important;
}
```

- [ ] **Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: final cleanup and high contrast card styles"
```
