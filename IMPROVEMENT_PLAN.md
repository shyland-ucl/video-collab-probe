# Video Collab Probe — Improvement Plan

Based on step-by-step walkthrough of the study flow (2026-02-26).

---

## 1. Mock Video Editor (All Phases)

**Problem:** The app is currently a video viewer, not an editor. Participants need to perform editing tasks for the study to be realistic.

**Change:** Replace the current video player UI with a simplified iMovie/CapCut-style mock editor across all conditions.

### Edit actions to implement (mocked — no real video processing):
- [ ] **Timeline with trim handles** — drag to trim start/end of clips
- [ ] **Split/cut at playhead** — split a clip into two at the current position
- [ ] **Clip reorder** — drag or keyboard-reorder clips on the timeline
- [ ] **Undo/redo** — standard stack for all edit actions
- [ ] **Text/caption overlay** — add text at specific timestamps

### Event logging:
- [ ] Add new event types in `eventTypes.js`: `TRIM`, `SPLIT`, `CUT`, `REORDER`, `UNDO`, `REDO`, `ADD_CAPTION`, `REMOVE_CAPTION`, `EDIT_CAPTION`
- [ ] All mock edit actions fire through `EventLoggerContext` with timestamp, action type, clip ID, and parameters

### Accessibility:
- [ ] Every edit action must have proper ARIA announcements
- [ ] Full keyboard navigation for timeline (focus management, arrow keys to move between clips)
- [ ] VoiceOver-friendly on iOS — all controls reachable via swipe

---

## 2. Accessibility Settings on Launch Page

**Problem:** Accessibility options (text size, high contrast, audio) are currently only in the toolbar. Users should configure them before entering any condition.

### Changes to Session Setup page (`SessionSetupPage.jsx`):
- [ ] Move text size (small/medium/large) selector to setup page
- [ ] Move high contrast toggle to setup page
- [ ] Move audio on/off toggle to setup page
- [ ] **Add speech rate control** (slow / normal / fast / custom WPM) — new setting in `AccessibilityContext`
- [ ] Settings persist in `localStorage` alongside session config
- [ ] Accessibility toolbar in-study still available for mid-session adjustments

---

## 3. Probe 1 — Visual Exploration Mode

**Problem:**
1. TTS descriptions get cut off when video advances to next segment
2. Video audio and TTS conflict when playing simultaneously

**Solution:** Introduce a dedicated Visual Exploration Mode that pauses video and gives the user full control over description browsing.

### New mode: Visual Exploration Mode
- [ ] **Entry:** Dedicated button in transport controls + keyboard shortcut (E key)
- [ ] **On entry:** Video pauses, mode banner appears ("Exploring scene 3/8 — 0:32"), screen reader announces mode change
- [ ] **Video summary:** On first entry, system announces a whole-video summary before segment navigation
- [ ] **Frozen frame + banner:** Sighted users see paused frame with visible mode indicator

### Mobile gesture navigation (primary — study runs on phone):
- [ ] **Swipe left/right** — navigate between video segments
- [ ] **Swipe up/down** — change granularity level (1=brief → 5=detailed)
- [ ] **Position announcement** after each swipe: "Segment 3 of 8, detail level 3" then reads description
- [ ] **Audio cues** — subtle chime/tick at segment boundaries

### Actions within exploration mode:
- [ ] **VQA access** — double-tap to ask a question about current segment
- [ ] **Flag/mark** — long press to mark current segment (feeds into Probe 2)
- [ ] **Exit** — dedicated gesture/button to resume playback from current segment

### Refactor existing Probe 1 components:
- [ ] `DescriptionPanel.jsx` — adapt to work within exploration mode (no auto-advance)
- [ ] `GranularityController.jsx` — connect to swipe up/down gestures
- [ ] `VQAPanel.jsx` — triggered by double-tap in exploration mode
- [ ] Remove auto-playing TTS during video playback (descriptions only in exploration mode)

### Event logging:
- [ ] New event types: `ENTER_EXPLORATION`, `EXIT_EXPLORATION`, `NAVIGATE_SEGMENT`, `CHANGE_GRANULARITY`, `PLAY_SUMMARY`

---

## 4. Probe 2 — Dual Handover Modes with Voice Notes

**Problem:** Current single handover button gives no context to the helper. The creator has to remember everything verbally.

### Two handover modes:

#### Mode A: Mark-then-Handover (async)
- [ ] Creator explores video using exploration mode
- [ ] At any segment, **long-press / button** to record a **voice note** annotation
- [ ] Voice note saved with: timestamp, segment ID, duration, audio blob
- [ ] Creator can review/delete marks before handing over
- [ ] On handover: helper receives an **ordered task queue** of marked items
- [ ] Helper navigates item-by-item: plays voice note, sees timestamp, performs edit, marks done

#### Mode B: Live Handover (sync)
- [ ] Creator hits "Work together" button
- [ ] Both enter a **shared session** — synchronized video position
- [ ] Creator guides verbally, helper has edit controls
- [ ] Either can navigate, but edit actions are helper-side
- [ ] Session ends when creator or helper explicitly exits

### Voice note recording:
- [ ] Use MediaRecorder API for voice note capture
- [ ] Playback via standard audio element
- [ ] Store as blobs in memory (include in data export as audio files)

### UI components needed:
- [ ] `VoiceNoteRecorder` — record/stop/playback mini-widget
- [ ] `MarkList` — creator's view of all marks before handover
- [ ] `TaskQueue` — helper's view of received marks to work through
- [ ] `HandoverModeSelector` — choose between "Hand over tasks" / "Work together"

### Connection to Probe 1:
- [ ] Flag/mark from exploration mode uses same mark system
- [ ] Consistent interaction pattern across probes

### Event logging:
- [ ] New event types: `RECORD_VOICE_NOTE`, `DELETE_MARK`, `HANDOVER_TASKS`, `HANDOVER_LIVE`, `COMPLETE_TASK`, `PLAY_VOICE_NOTE`

---

## 5. Cross-Cutting Concerns

### Screen reader / VoiceOver overhaul:
- [ ] Audit all components for ARIA roles and labels
- [ ] Ensure focus management on mode switches (exploration mode, handover)
- [ ] Test full flow with VoiceOver on iOS
- [ ] All state changes announced via live region (`#sr-announcer`)

### Mobile-first design:
- [ ] Study runs primarily on phone — all interactions must be touch/swipe friendly
- [ ] Gesture handling library needed for swipe detection (consider Hammer.js or custom)
- [ ] Test on both iOS Safari + VoiceOver and Android Chrome + TalkBack

### Data export updates:
- [ ] Include voice note audio files in ZIP export
- [ ] Include mark/annotation data per condition
- [ ] New edit action events in CSV logs

---

## Implementation Priority

1. **Accessibility settings on launch page** (small, unblocks everything)
2. **Visual Exploration Mode for Probe 1** (core interaction redesign)
3. **Mock video editor** (needed across all phases)
4. **Dual handover modes + voice notes for Probe 2** (builds on exploration mode)
5. **Screen reader / mobile audit** (throughout, but formal pass at end)

---

*Note: Probe 3 (Local Mirroring) walkthrough still pending — will add changes after review.*
