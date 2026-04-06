# Implementation Spec: Refactoring video-collab-probe for Revised Study Plan

## Context for Claude Code

This spec describes changes needed to the `video-collab-probe` prototype to match the revised study plan. The prototype is a Vite + React 19 (JavaScript, no TypeScript) app styled with Tailwind CSS v4. Read `CLAUDE.md` in the repo root for full architecture details before starting.

### Current state
- 5 routes: `/` (setup), `/probe1`, `/probe2`, `/probe3`, `/researcher`
- WebSocket relay built into Vite via `vite-ws-relay-plugin.js` — used for Probe 3 dual-device sync and WoZ communication
- EventLoggerContext provides central event logging
- WoZ panels activated via `?mode=researcher` query param
- Description data in `/public/data/descriptions.json`

### Target state
The study now has four phases in fixed order: Probe 1 → Probe 2a → Probe 2b → Probe 3. The key structural change is splitting the old Probe 2 into Phase 2a (co-located, shared device) and Phase 2b (decoupled, two devices, reactive AI only), then making Probe 3 the proactive AI condition (same decoupled setup as 2b, plus researcher-pushed suggestions).

---

## Change Summary

| What | Current | Target |
|------|---------|--------|
| `/probe2` | Shared-device handover (complete) | Phase 2a: same, but state must persist for 2b |
| `/probe2b` | Does not exist | NEW: Decoupled coordination (two devices, reactive AI, loads state from 2a) |
| `/probe3` | Dual-device with task routing | Refactored: same as 2b PLUS proactive AI suggestion system |
| `/researcher` | Tabs for Probe 1, 2, 3 | Tabs for Probe 1, 2a, 2b, 3 with new suggestion panel |
| Data files | `descriptions.json` | Add suggestion bank for Video C |
| Event types | Current set | Add suggestion-related and phase-transition events |

---

## Task 1: State Persistence for Phase 2a → 2b Handoff

### Goal
When the researcher transitions the session from Phase 2a to Phase 2b, the full project state must carry over: same video, same edits, same marks, same task history.

### Implementation

**1.1 Add a state serialisation function** in a new utility file `src/utils/projectState.js`:
```
export function serialiseProjectState() — reads current edits, marks, voice notes metadata, 
  description level preferences from whatever state stores they live in, returns a JSON-serialisable object
export function loadProjectState(state) — applies a serialised state object to the current session
```

**1.2 Add a "Transition to 2b" button** on the researcher dashboard (visible only during Probe 2a). When clicked:
- Calls `serialiseProjectState()` and stores the result
- Broadcasts a `PROJECT_STATE_EXPORT` message via WebSocket so Phase 2b devices can pick it up
- Logs a `PHASE_TRANSITION_2A_TO_2B` event with timestamp
- On the participant-facing side, shows a brief transition screen: "Setting up separate devices..."

**1.3 Phase 2b loads the state on connection.** When both devices connect to `/probe2b`, the system loads the serialised state from 2a. The video should show the same project with prior edits visible.

### Files to modify
- `src/utils/projectState.js` (new)
- `src/components/probe2/` (add export trigger)
- Researcher dashboard component (add transition button)
- Event types (`src/utils/eventTypes.js`)

---

## Task 2: Create Phase 2b Route and Refactor Shared Decoupled Components

### Goal
Phase 2b is functionally the current Probe 3's **reactive features only** — two devices, WebSocket-synced playback, task routing to helper and AI, activity feed — but without any proactive AI suggestions. Phase 2b and Probe 3 must share a common component base so that fixes and changes propagate to both.

### Architectural decision: Extract, don't duplicate
**Do not copy-paste the current Probe 3 components to create Phase 2b.** Instead, extract the shared dual-device logic into `src/components/decoupled/` and have both Phase 2b and Probe 3 compose from those shared pieces. Probe 3 then adds the suggestion system on top.

### Implementation

**2.1 Create route `/probe2b`** in `App.jsx`.

**2.2 Extract shared components into `src/components/decoupled/`.** Read the current `src/components/probe3/CreatorDevice.jsx` and `HelperDevice.jsx` carefully. Identify which logic is generic dual-device collaboration (shared) vs. Probe 3-specific (suggestion handling). Then extract:

- `DecoupledCreatorDevice.jsx` — scene exploration, playback control broadcast, task routing ("Ask Helper" + "Ask AI"), recent tasks panel. Accepts optional props or children for probe-specific extensions (e.g., suggestion UI in Probe 3).
- `DecoupledHelperDevice.jsx` — passive synced playback, activity feed, task responses, text overlay, independent editing. Accepts optional props for probe-specific task types (e.g., routed suggestions in Probe 3).
- `DecoupledRoleSelector.jsx` — role selection screen (creator/helper buttons).
- `DecoupledWaitingScreen.jsx` — "waiting for peer" loading screen.

**Key design pattern:** The shared components should accept an `extensions` or `renderExtra` prop (or use children) so that Probe 3 can inject the suggestion notification area into the creator device without modifying the shared component. For example:

```jsx
// In Probe2bPage — no extensions
<DecoupledCreatorDevice condition="probe2b" />

// In Probe3Page — with suggestion UI
<DecoupledCreatorDevice condition="probe3">
  <SuggestionCard ... />
  <SuggestionHistory ... />
</DecoupledCreatorDevice>
```

Or use a render prop pattern if children don't fit the layout.

**2.3 Refactor current Probe 3 components.** The files in `src/components/probe3/` should become thin wrappers that compose the shared decoupled components with Probe 3-specific additions (suggestion system). After refactoring, `src/components/probe3/` should contain only suggestion-related components (`SuggestionCard`, `SuggestionHistory`, `ResearcherSuggestionPanel`) and possibly a `Probe3CreatorDevice.jsx` that wraps `DecoupledCreatorDevice` with suggestion listeners.

**2.4 Phase 2b page** (`src/pages/Probe2bPage.jsx`):
- Uses the shared decoupled components directly (no probe-specific extensions)
- On mount, loads project state from Phase 2a (see Task 1)
- No proactive AI suggestion system — this is the key difference from Probe 3
- Colour theme: Green (#5CB85C), same as Phase 2a to signal continuity
- Condition identifier in events: `"probe2b"`

**2.5 Probe 3 page** (`src/pages/Probe3Page.jsx`):
- Uses the same shared decoupled components
- ADDS the proactive AI suggestion system via composition (Task 4)
- Colour theme: Purple (#9B59B6)
- Condition identifier in events: `"probe3"`

**2.6 WebSocket namespacing.** The current WebSocket relay probably uses a flat message space. Phase 2b and Probe 3 both need WebSocket sync but should not interfere with each other. Ensure messages include a `condition` field (`probe2b` or `probe3`) or use separate WebSocket channels/rooms. Check `vite-ws-relay-plugin.js` and `wsRelayService.js` to understand the current message routing before adding namespacing.

### Files to create
- `src/components/decoupled/DecoupledCreatorDevice.jsx`
- `src/components/decoupled/DecoupledHelperDevice.jsx`
- `src/components/decoupled/DecoupledRoleSelector.jsx`
- `src/components/decoupled/DecoupledWaitingScreen.jsx`
- `src/pages/Probe2bPage.jsx`

### Files to modify
- `App.jsx` (add `/probe2b` route)
- `src/components/probe3/CreatorDevice.jsx` (extract shared logic, keep as thin wrapper)
- `src/components/probe3/HelperDevice.jsx` (extract shared logic, keep as thin wrapper)
- `src/pages/Probe3Page.jsx` (refactor to use shared base + add suggestion system)
- Possibly `wsRelayService.js` and `vite-ws-relay-plugin.js` (add condition namespacing)

---

## Task 3: Add Suggestion Data Format

### Goal
Probe 3 needs a pre-authored suggestion bank for each video. The researcher selects and deploys suggestions from this bank during the session.

### Implementation

**3.1 Extend the description data format.** In `/public/data/descriptions.json` (or a separate file), add a `suggestions` array for each video:

```json
{
  "videoId": "video-c",
  "title": "Video C Title",
  "segments": [ ... ],
  "suggestions": [
    {
      "id": "sug-c-01",
      "category": "issue",
      "text": "Scene 4 appears slightly out of focus compared to other scenes.",
      "relatedScene": 4,
      "actionable": false
    },
    {
      "id": "sug-c-02",
      "category": "structural",
      "text": "Scenes 2 and 5 show similar framing — you might consider varying the pacing between them.",
      "relatedScene": [2, 5],
      "actionable": false
    },
    {
      "id": "sug-c-03",
      "category": "creative",
      "text": "The lighting shifts noticeably from warm to cool between Scenes 3 and 4, creating an unintentional mood change.",
      "relatedScene": [3, 4],
      "actionable": false
    }
  ]
}
```

Fields:
- `id`: unique identifier for logging
- `category`: `"issue"` | `"structural"` | `"creative"` (for analysis)
- `text`: the suggestion text displayed to the creator and read via TTS
- `relatedScene`: scene number(s) the suggestion refers to
- `actionable`: whether the suggestion implies a specific edit action (future extension; `false` for now)

**3.2 Author 6–8 suggestions for Video C.** Content should be plausible observations a capable AI might make about the video footage.

### Files to modify
- `/public/data/descriptions.json` (add `suggestions` field to Video C)
- `src/data/sampleDescriptions.js` (ensure the loader handles the new field)

---

## Task 4: Build the AI Suggestion System (Probe 3)

This is the largest new feature. It has three parts: researcher deployment panel, creator notification UI, and helper routing.

### 4.1 Researcher Suggestion Panel

**Location:** Within the `/researcher` dashboard, visible only when Probe 3 is active.

**UI elements:**
- Dropdown/list showing all suggestions for the current video, grouped by category (issue / structural / creative)
- Each suggestion shows: category tag, text preview, related scene number(s)
- "Deploy" button next to each undeployed suggestion
- Deployed suggestions show a checkmark with timestamp and the creator's response (pending / dismissed / noted / routed)
- Counter: "X of Y suggestions deployed this session"

**Behaviour:**
- When the researcher clicks "Deploy", the system:
  1. Sends a `SUGGESTION_PUSH` WebSocket message to the creator's device with the suggestion data
  2. Logs a `SUGGESTION_DEPLOYED` event (suggestionId, category, timestamp, current scene on creator's device)
  3. Marks the suggestion as deployed in the panel UI

**Component:** `src/components/probe3/ResearcherSuggestionPanel.jsx`

### 4.2 Creator Suggestion Notification

**Location:** On the creator's device during Probe 3. Appears as a non-modal notification card, positioned so it doesn't block the main scene navigation.

**UI elements:**
- Card with: AI icon/label, suggestion text, related scene reference
- Three response buttons:
  - "Ask Helper to Check" (routes to helper)
  - "Note for Later" (saves to suggestion history)
  - "Dismiss" (removes the card)
- Suggestion history panel accessible via a button (e.g., "Saved suggestions (X)")

**Accessibility:**
- Suggestion card is announced via the ARIA live region (`#sr-announcer`) when it appears
- Suggestion text is read aloud via `ttsService` at the creator's configured speech rate
- Response buttons have minimum 44px touch targets
- Card is non-modal — creator can continue navigating scenes while a suggestion is visible
- Keyboard shortcut: consider `S` for "show/dismiss current suggestion"

**Behaviour:**
- When a `SUGGESTION_PUSH` message arrives via WebSocket:
  1. Display the suggestion card with animation (slide in from top or bottom)
  2. Read the suggestion text aloud via TTS
  3. Wait for creator response (no timeout — suggestion persists until acted on)
  4. On response:
     - **Dismiss**: remove card, log `SUGGESTION_DISMISSED`
     - **Note**: save to local suggestion history, remove card, log `SUGGESTION_NOTED`
     - **Route to helper**: send `SUGGESTION_ROUTED_TO_HELPER` WebSocket message, remove card, log `SUGGESTION_ROUTED`

**Components:**
- `src/components/probe3/SuggestionCard.jsx` (the notification card)
- `src/components/probe3/SuggestionHistory.jsx` (list of noted suggestions)

### 4.3 Helper Suggestion Routing

**Location:** On the helper's device during Probe 3.

**Behaviour:**
- When a `SUGGESTION_ROUTED_TO_HELPER` message arrives:
  1. Show a task card in the helper's activity feed, clearly labelled as AI-originated:
     "🤖 AI observation (via Creator): [suggestion text]. Related scene: [X]."
  2. Helper can respond: "Confirmed" / "Not an issue" / "Needs discussion"
  3. Response is sent back to the creator's device via WebSocket and logged as `HELPER_SUGGESTION_RESPONSE`

**The creator sees the helper's response** as an update in their Recent Tasks panel or as a toast notification.

### 4.4 Suggestion Chain Logging

Every suggestion generates a chain of events that must be fully logged for analysis:

| Event | Actor | Data |
|-------|-------|------|
| `SUGGESTION_DEPLOYED` | RESEARCHER | suggestionId, category, text, relatedScene, creatorCurrentScene, timestamp |
| `SUGGESTION_DISMISSED` | CREATOR | suggestionId, timeToRespond, timestamp |
| `SUGGESTION_NOTED` | CREATOR | suggestionId, timeToRespond, timestamp |
| `SUGGESTION_ROUTED` | CREATOR | suggestionId, timeToRespond, timestamp |
| `HELPER_SUGGESTION_RESPONSE` | HELPER | suggestionId, response (confirmed/not-issue/needs-discussion), timestamp |
| `SUGGESTION_CHAIN_COMPLETE` | SYSTEM | suggestionId, fullChain (deployed→response→helperResponse), totalDuration |

Add these to `src/utils/eventTypes.js`.

### Files to create
- `src/components/probe3/ResearcherSuggestionPanel.jsx`
- `src/components/probe3/SuggestionCard.jsx`
- `src/components/probe3/SuggestionHistory.jsx`

### Files to modify
- `src/components/probe3/CreatorDevice.jsx` (or the refactored `DecoupledCreatorDevice` — add suggestion listener and UI)
- `src/components/probe3/HelperDevice.jsx` (or the refactored `DecoupledHelperDevice` — add routed suggestion handler)
- `src/utils/eventTypes.js` (add suggestion event types)
- `wsRelayService.js` (add suggestion message types to the relay)

---

## Task 5: Update Researcher Dashboard

### Goal
The researcher dashboard needs to support four phases (Probe 1, 2a, 2b, 3) and include the new suggestion panel.

### Implementation

**5.1 Update condition tabs.** Currently three tabs (Probe 1, 2, 3). Change to four: Probe 1 | Probe 2a | Probe 2b | Probe 3.

**5.2 Add Phase 2a → 2b transition controls.** Within the Probe 2a tab:
- "Transition to Phase 2b" button (triggers state serialisation and broadcast)
- Status indicator showing whether the transition has been initiated

**5.3 Add Probe 3 suggestion panel.** Within the Probe 3 tab:
- The `ResearcherSuggestionPanel` component (Task 4.1)
- Positioned alongside existing VQA and AI Edit panels

**5.4 Update event log filtering.** The live event log should support filtering by all four phases. The condition field in events should distinguish `probe1`, `probe2a`, `probe2b`, `probe3`.

**5.5 Update data export.** The ZIP export should include per-phase folders:
- `probe1/` — description interactions, VQA log
- `probe2a/` — handover log, voice notes, task completion log
- `probe2b/` — task routing log, sync log, AI edit log
- `probe3/` — suggestion chain log, task routing log, sync log, AI edit log
- `session_metadata.json` — includes phase transition timestamps

### Files to modify
- Researcher dashboard page component
- `src/services/dataExport.js` (update export structure)
- `src/utils/eventTypes.js` (ensure condition values include `probe2a` and `probe2b`)

---

## Task 6: Add Helper Fallback Logging in Probe 1

### Goal
When the creator spontaneously turns to the helper during Probe 1, the researcher needs a way to log this as a helper-fallback event.

### Implementation

**6.1 Add a "Log Helper Fallback" button** to the Probe 1 researcher panel. When clicked:
- Logs a `HELPER_FALLBACK` event with the current scene, timestamp, and an optional text note field where the researcher can briefly describe what happened (e.g., "Creator asked helper about colour of shirt")

**6.2 This is a researcher-initiated log entry**, not an automated detection. The researcher observes the fallback and clicks to record it.

### Files to modify
- Probe 1 researcher panel component
- `src/utils/eventTypes.js` (add `HELPER_FALLBACK`)

---

## Task 7: Update Session Setup and Navigation

### Goal
The session setup page and navigation should reflect the four-phase flow.

### Implementation

**7.1 Update session setup (`/`).** The condition order is fixed: Probe 1 → Probe 2a → Probe 2b → Probe 3. The setup page should display this order. If the current setup page allows reordering conditions, remove that — the order is not configurable in this study.

**7.2 Update `ConditionNav` footer.** The navigation footer should show four phases and indicate the current one. Visual design: four dots or labels, with the active phase highlighted.

**7.3 Update `localStorage` session state.** The `completedConditions` field should track all four phases. Add `phaseTransitionTimestamp` for the 2a→2b transition.

### Files to modify
- Session setup page component
- `src/components/shared/ConditionNav.jsx`
- Session state management in localStorage

---

## Task Priority and Dependencies

Recommended implementation order:

| Priority | Task | Dependency | Estimated effort |
|----------|------|------------|-----------------|
| 1 | Task 7: Session setup and navigation | None | Small |
| 2 | Task 6: Helper fallback logging | None | Small |
| 3 | Task 2: Create Phase 2b + extract shared decoupled components | None | **Large** |
| 4 | Task 1: State persistence for 2a → 2b | Task 2 | Medium |
| 5 | Task 3: Suggestion data format | None | Small |
| 6 | Task 4: AI suggestion system | Tasks 2, 3 | Large |
| 7 | Task 5: Researcher dashboard updates | Tasks 1, 4, 6 | Medium |

Tasks 7, 6, and 3 can be done in parallel as quick wins. Task 2 is the largest refactoring effort. Task 4 is the largest new feature.

---

## Testing Checklist

After implementation, verify:

- [ ] Probe 1 works unchanged (no regressions)
- [ ] Probe 1 researcher panel has "Log Helper Fallback" button that creates events
- [ ] Probe 2a works unchanged (no regressions to current Probe 2)
- [ ] Probe 2a → 2b transition button serialises state and broadcasts via WebSocket
- [ ] Phase 2b loads on two devices with role selection
- [ ] Phase 2b loads project state from Phase 2a (same video, edits visible)
- [ ] Phase 2b has "Ask Helper" and "Ask AI" task routing (reactive only)
- [ ] Phase 2b does NOT show any proactive AI suggestions
- [ ] Probe 3 loads on two devices with role selection (fresh Video C)
- [ ] Probe 3 has all Phase 2b features (task routing, sync, activity feed)
- [ ] Researcher can deploy suggestions from the pre-authored bank
- [ ] Deployed suggestions appear on creator's device as non-modal notifications
- [ ] Suggestions are read aloud via TTS
- [ ] Creator can dismiss, note, or route each suggestion
- [ ] Routed suggestions appear on helper's device with AI-originated label
- [ ] Helper can respond to routed suggestions
- [ ] Creator sees helper's response
- [ ] Full suggestion chain is logged (deployed → creator response → helper response)
- [ ] Researcher dashboard has four phase tabs
- [ ] Event log filters by all four phases
- [ ] Data export ZIP includes per-phase folders with correct event subsets
- [ ] All interfaces maintain accessibility: ARIA labels, keyboard nav, TTS, large touch targets
- [ ] WebSocket messages for Phase 2b and Probe 3 don't interfere with each other
