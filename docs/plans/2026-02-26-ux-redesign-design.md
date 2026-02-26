# UX Redesign: Mock Editor, Exploration Mode, Dual Handover

**Date:** 2026-02-26
**Status:** Approved

---

## 1. Accessibility Settings on Launch Page

Move accessibility controls into `SessionSetupPage.jsx` as a collapsible "Accessibility Preferences" section before "Start Session".

**Settings:**
- Text size: small / medium / large (radio)
- High contrast: toggle
- Audio descriptions: toggle
- Speech rate: slider 0.5x–2.0x (visible when audio enabled)

All persisted via `AccessibilityContext` + `localStorage`. The in-study `AccessibilityToolbar` remains for mid-session changes.

**Files changed:** `SessionSetupPage.jsx`, `AccessibilityContext.jsx` (add localStorage persistence on mount).

---

## 2. Visual Exploration Mode (Probe 1)

### Problem
- TTS cut off by segment transitions during playback
- Video audio conflicts with TTS
- Passive description overlay doesn't match how BLV users explore

### Solution
A dedicated mode where the video pauses and the user navigates descriptions at their own pace.

### Entry/Exit
- Button in transport controls + keyboard shortcut (E key)
- On entry: video pauses, banner appears, whole-video summary announced
- On exit: playback resumes from current segment timestamp

### Navigation (mobile-first, mirrors VoiceOver rotor)
- **Swipe left/right** (or Left/Right arrow): browse segments
- **Swipe up/down** (or Up/Down arrow): change granularity (1–5)
- Position announced after each navigation: "Segment 3 of 8, detail level 3"
- Subtle audio chime at segment boundaries

### Actions in exploration mode
- **Double-tap** (or Enter): open VQA for current segment
- **Long-press** (or M key): mark/flag current segment
- Marks carry forward into Probe 2's handover system

### Granularity expansion
Expand from 3 levels to 5 to match `descriptions.json` structure (already has `level_1` through `level_5` capability — need to update data).

### Visual state
Frozen video frame + banner: "Exploring scene 3/8 — 0:32"

### New components
- `ExplorationMode.jsx` — orchestrates the exploration UI
- `SwipeHandler.jsx` — touch gesture detection (swipe direction + double-tap + long-press)

### Refactored components
- `DescriptionPanel.jsx` — works in exploration context, no auto-advance
- `GranularityController.jsx` — connects to swipe up/down
- `VQAPanel.jsx` — triggered by double-tap

### New event types
`ENTER_EXPLORATION`, `EXIT_EXPLORATION`, `NAVIGATE_SEGMENT`, `CHANGE_GRANULARITY`, `PLAY_SUMMARY`

---

## 3. Mock Video Editor (All Phases)

### Problem
App is a viewer, not an editor. Study needs editing tasks for ecological validity.

### Solution
iMovie/CapCut-style mock editor. Actions manipulate UI state and are logged — no real video processing.

### Editor UI
- **MockTimeline**: horizontal strip of clip blocks with colored backgrounds
  - Each clip shows thumbnail placeholder, name, duration
  - Trim handles (draggable bars) on left/right edges
  - Playhead indicator (vertical line)
  - Keyboard: arrow keys move between clips, Enter selects
- **EditToolbar**: action buttons above timeline
  - Split at Playhead, Delete Clip, Undo, Redo
  - All keyboard-accessible with shortcuts displayed
- **CaptionEditor**: panel to add/edit text overlays
  - Timestamp, text input, duration
  - List of existing captions

### Mock state model
```javascript
{
  clips: [{ id, name, startTime, endTime, color }],
  captions: [{ id, text, startTime, endTime }],
  undoStack: [],
  redoStack: [],
  selectedClipId: null
}
```

### Accessibility
- Full keyboard navigation of timeline clips
- ARIA: clips are listbox items, selected clip announced
- Trim handles announced ("Trim start of clip 2, currently at 3.5 seconds")
- All actions announce results via live region

### New components
- `MockTimeline.jsx` — clip layout, trim handles, playhead
- `ClipBlock.jsx` — individual clip with trim affordances
- `EditToolbar.jsx` — split, delete, undo, redo buttons
- `CaptionEditor.jsx` — caption add/edit panel

### Replaces
`EditActionBar.jsx` (current logging-only buttons)

### New event types
`TRIM`, `SPLIT`, `REORDER`, `DELETE_CLIP`, `ADD_CAPTION`, `REMOVE_CAPTION`, `EDIT_CAPTION`, `UNDO`, `REDO`

---

## 4. Probe 2: Dual Handover with Voice Notes

### Problem
Single handover button provides no context. Helper doesn't know what or where to act.

### Solution
Two handover modes with voice note annotations.

### Mode A: Mark-then-Handover (async)
1. Creator explores video (exploration mode)
2. Long-press or button → records voice note (MediaRecorder API)
3. Mark saved: `{ id, segmentId, timestamp, audioBlob, duration }`
4. Creator reviews marks in MarkList, can delete
5. "Hand over tasks" → helper receives TaskQueue
6. Helper works through items: plays voice note, performs edit, marks done

### Mode B: Live Handover (sync)
1. Creator hits "Work together"
2. Both in shared session — synchronized position
3. Creator guides, helper has edit controls
4. Either navigates, edits are helper-side

### Voice note recording
- MediaRecorder API with `audio/webm` codec
- Stored as Blobs in React state
- Included in data export as `.webm` files
- Playback via `<audio>` element

### New components
- `VoiceNoteRecorder.jsx` — record/stop/playback widget
- `MarkList.jsx` — creator's mark review list
- `TaskQueue.jsx` — helper's task list with voice note playback
- `HandoverModeSelector.jsx` — "Hand over tasks" / "Work together" choice

### Refactored components
- `CreatorMode.jsx` — add marking flow, mode selector
- `HelperMode.jsx` — render TaskQueue instead of static intent banner
- `IntentLocker.jsx` — replaced by voice note flow

### New event types
`RECORD_VOICE_NOTE`, `DELETE_MARK`, `HANDOVER_TASKS`, `HANDOVER_LIVE`, `COMPLETE_TASK`, `PLAY_VOICE_NOTE`

### Connection to Probe 1
Flag/mark from exploration mode uses the same mark data structure. Consistent pattern across probes.

---

## 5. Cross-Cutting

### Screen reader audit
- All new components: proper ARIA roles, labels, live region announcements
- Focus management on mode switches
- Test with VoiceOver on iOS Safari

### Mobile-first
- Study runs on phone — all interactions touch/swipe friendly
- Custom gesture handler for swipe detection
- Test iOS Safari + VoiceOver, Android Chrome + TalkBack

### Data export updates
- Voice note `.webm` files in `probe2/voice_notes/`
- Mark/annotation data in `probe2/marks.json`
- New edit event types in all condition CSVs

---

## Implementation Priority

1. Accessibility settings on launch page
2. New event types in `eventTypes.js`
3. Visual Exploration Mode (Probe 1)
4. Mock video editor (all phases)
5. Dual handover modes + voice notes (Probe 2)
6. Screen reader / mobile audit pass
