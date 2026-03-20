# Probe 3 Layer 3 Redesign: Task Routing (AI vs. Helper)

**Date:** 2026-03-20
**Status:** Draft
**Scope:** Modify Probe 3 to cover Layer 3 (Co-Creation) of the three-layer framework by adding AI edit capabilities alongside human helper collaboration, enabling creators to route tasks to either AI or helper.

---

## 1. Motivation

The current study covers Layer 1 (Information Access via Probe 1) and Layer 2 (Coordination via Probe 2). Probe 3 (Local Mirroring) addresses Layer 2 workspace awareness but does not explore Layer 3 (Co-Creation), where AI contributes as a bounded creative partner.

This redesign adds AI editing capability to Probe 3 so the creator can choose whether to do an edit themselves, ask AI to do it, or ask the helper to do it. The routing decision is the primary data point: it directly answers which tasks creators delegate to AI vs. human helpers, and why.

## 2. Design Overview

### 2.1 Core Interaction: Three-Way Action Row

The existing Actions card in ExplorationMode (currently `Mark` / `Edit` / `Ask AI`) is replaced in Probe 3 with:

```
[ Edit Myself ]  [ Ask AI ]  [ Ask Helper ]
```

- **Edit Myself** -- opens the existing Edit panel (Split, Move Earlier/Later, Delete, Add Caption, Undo/Redo). Creator executes the edit directly. Logs `TASK_ROUTE_SELF`.
- **Ask AI** -- opens a slide-up modal (TaskRequestModal) where the creator describes the edit via voice or text. The request goes to the researcher WoZ panel. After a 2-3 second artificial delay, the creator receives a text response describing what AI did. The edit state may also update on both devices.
- **Ask Helper** -- opens the same TaskRequestModal. The request is sent via WebSocket to the helper device's activity feed. The helper executes the edit on their visual editor.

The routing choice happens at the button press, not inside the modal. This keeps the decision moment clean and loggable.

### 2.2 Mark Button Removed

The Mark button and voice note recording flow are removed from Probe 3. The "Ask Helper" flow replaces them -- the creator describes tasks directly rather than flagging segments for later handover.

### 2.3 VQA in Probe 3

VQA (asking questions about visual content) is still available in Probe 3 via the description card's detail level controls and the existing VQA flow. However, VQA is NOT triggered from the action row. The action row is exclusively for edit task routing.

To ask a question, the creator uses a **separate "Ask Question" button inside the description card** (added to the detail level controls area). This keeps VQA (information access, Layer 1) clearly separated from edit task routing (co-creation, Layer 3).

### 2.4 Deployment Model

The researcher opens `/probe3?mode=researcher` on the **same device/browser tab as the creator** (not a separate device). This is the same deployment model as VQA in Probes 1 and 2. The researcher sits beside the creator and operates the WoZ panels on the creator's device screen (scrolling down past the participant UI to the researcher panels).

This means:
- `window.__aiEditReceive` (same-page callback) works for creator <-> researcher communication
- The creator's page relays AI edit notifications to the helper via WebSocket
- The helper is on a separate device connected via WebSocket

## 3. Creator Device

### 3.1 TaskRequestModal

A shared slide-up modal used by both "Ask AI" and "Ask Helper" routes. Portalled to `document.body` with `inert` on `#root` (same pattern as existing VQA and Edit modals).

**Contents:**
- Segment context line: clip name and time range
- Text input field with voice input button (reuses existing Web Speech API pattern)
- Single "Send" button (routing already determined by which action button opened the modal)
- Send button is disabled when text input is empty

**After sending (AI route):**
- Modal stays open
- Shows "AI is working on this..." spinner for 2-3 seconds (artificial WoZ delay)
- Displays AI's text response when received
- Screen reader announces the result via live region
- Creator can send another task or close
- If a previous AI request is still pending, the Send button is disabled until the response arrives (no queuing)

**After sending (Helper route):**
- Modal closes immediately
- Toast notification: "Sent to Helper"
- Task appears on helper device's activity feed
- If helper is disconnected, toast shows "Helper not connected -- task will be sent when reconnected"

### 3.2 Recent Tasks Display

Below the Actions card, a collapsible "Recent Tasks" section shows a history of routed tasks:
- AI tasks prefixed with robot icon, showing the response text
- Helper tasks prefixed with person icon, showing status (pending / done / needs discussion / can't do)

**TASK_STATUS_UPDATE handler:** When the helper updates a task status via WebSocket, the creator device:
1. Updates the corresponding task's status in the Recent Tasks list
2. Announces via `announce()`: "Helper marked [task summary] as [status]"
3. Logs a `HELPER_TASK_STATUS` event

### 3.3 Removed from CreatorDevice

- Voice note recording flow (VoiceNoteRecorder, recordingForSegment state)
- Mark-related state and callbacks (marks, onAddMark, onDeleteMark)
- Handover button

## 4. Helper Device

### 4.1 ActivityFeed (replaces TaskQueue + WorkspaceAwareness)

A unified inbox showing both helper-routed tasks and AI edit notifications, in chronological order.

**Helper task items (from "Ask Helper"):**
- Shows creator's request text
- Action buttons: `Mark Done`, `Needs Discussion`, `Can't Do`
- Status updates sent back to creator via WebSocket (`TASK_STATUS_UPDATE` message)

**AI edit notification items (from "Ask AI"):**
- Shows what AI did and that the creator requested it
- Action buttons: `Review` (scrolls to relevant segment), `Undo` (reverts the edit)
- Gives the helper oversight of AI actions, maintaining the triadic dynamic

**Creator Activity** feed remains at the bottom, showing real-time playback actions.

### 4.2 Unchanged

- Video Editor card (VideoPlayer + TransportControls + MockEditorVisual) -- helper still makes edits visually
- Edit state sync via WebSocket -- both devices stay in sync
- Peer edit toast notifications

## 5. Researcher WoZ Dashboard

### 5.1 New Panel: ResearcherAIEditPanel

Sits between the existing ResearcherVQAPanel and Sync Controls. Follows the same visual pattern (amber border, WoZ label).

**Sections:**

1. **Pending Request** -- shows the creator's AI edit request text and segment context. Highlighted when a new request arrives.

2. **Prepared Responses** -- pre-scripted responses per segment, loaded from description data. One-click to send. Includes both "success" and "partial success" variants.

3. **Custom Response** -- text input for unanticipated requests.

4. **Edit State Actions** -- buttons to actually modify the mock editor state (Trim Start, Split, Delete, Reorder, Add Caption). These are separate from the text response so the researcher can respond without changing state, or respond AND apply an edit.

### 5.2 Built-in Delay

Same as VQA: 2-3 second artificial delay between researcher clicking Send and creator receiving the response. Creator sees a spinner during this time.

### 5.3 Communication Flow

1. Creator taps "Ask AI", describes task, taps Send
2. Request stored in component state and displayed in ResearcherAIEditPanel's Pending Request box (via `window.__aiEditReceive`, same-page callback -- researcher is on the same device/tab as creator)
3. Researcher clicks a prepared response or types custom
4. Researcher optionally clicks an Edit State Action to apply the actual change
5. After artificial delay, creator receives text response via `window.__aiEditResponse` callback
6. Creator's page automatically sends `AI_EDIT_NOTIFY` to the helper via WebSocket, including the response text and any edit state changes
7. Helper receives AI edit notification in their activity feed

### 5.4 Removed from Probe 3 Researcher View

- ResearcherHandoverPanel (no handover suggestions when there's no handover flow)

### 5.5 Unchanged

- ResearcherVQAPanel (still needed for VQA questions from the description card)
- Sync Controls (still needed as fallback)

## 6. Data Model

### 6.1 New Event Types

```
TASK_ROUTE_SELF      -- creator chose to edit themselves ("Edit Myself")
TASK_ROUTE_AI        -- creator sent a task to AI
TASK_ROUTE_HELPER    -- creator sent a task to helper
AI_EDIT_RESPONSE     -- AI (WoZ) responded to an edit request
AI_EDIT_APPLIED      -- researcher applied an actual edit state change
HELPER_TASK_RECEIVED -- helper device received a task
HELPER_TASK_STATUS   -- helper marked a task done/needs discussion/can't do
AI_EDIT_REVIEWED     -- helper tapped Review on an AI edit notification
AI_EDIT_UNDONE       -- helper undid an AI edit
```

### 6.2 Key Logged Event: Task Routing

Primary data point for the Layer 3 research question. The three-way routing distribution (self / AI / helper) is the key analysis target:

```json
{
  "timestamp": "2026-05-15T10:23:45.123Z",
  "event_type": "TASK_ROUTE_AI",
  "actor": "CREATOR",
  "details": {
    "task_id": "task-1747301025123",
    "task_text": "Trim the market scene to start at second stall",
    "current_segment": "seg1",
    "video_time": 12.3
  },
  "condition": "probe3"
}
```

AI response event:

```json
{
  "event_type": "AI_EDIT_RESPONSE",
  "actor": "AI",
  "details": {
    "task_id": "task-1747301025123",
    "response_text": "Trimmed Market Scene -- now starts at 0:08",
    "response_type": "success",
    "response_delay_ms": 2450
  }
}
```

Self-edit event (logged when creator taps "Edit Myself"):

```json
{
  "event_type": "TASK_ROUTE_SELF",
  "actor": "CREATOR",
  "details": {
    "current_segment": "seg1",
    "video_time": 12.3
  }
}
```

### 6.3 WebSocket Message Types

All messages flow through the existing two-peer WebSocket relay (creator <-> helper). The researcher is on the same device as the creator and communicates via same-page callbacks.

| Message Type | Direction | Purpose |
|---|---|---|
| `TASK_TO_HELPER` | Creator -> Helper | Creator's task request text, segment context |
| `TASK_STATUS_UPDATE` | Helper -> Creator | Helper's done/needs discussion/can't do + task ID |
| `AI_EDIT_NOTIFY` | Creator -> Helper | Relayed after researcher responds; includes response text and optional edit state changes |

Note: `AI_EDIT_REQUEST` and `AI_EDIT_RESULT` do NOT go through WebSocket. They use same-page callbacks (`window.__aiEditReceive` / `window.__aiEditResponse`) because the researcher panel runs on the same page as the creator.

### 6.4 WebSocket Handlers in Probe3.jsx

New cases in the existing `wsRelayService.onData` handler:

**Creator device receives:**
- `TASK_STATUS_UPDATE`: Update task status in state. Announce via `announce()`. Log `HELPER_TASK_STATUS` event.

**Helper device receives:**
- `TASK_TO_HELPER`: Add to activity feed. Log `HELPER_TASK_RECEIVED` event. Announce "Creator sent you a task."
- `AI_EDIT_NOTIFY`: Add to activity feed as AI edit notification. If `editState` is included, apply it. Announce "AI [action description], requested by Creator."

### 6.5 Description Data Extension

New `ai_edits_prepared` field per segment in `descriptions.json`. Both `response` and `partial` variants are provided for all edit types where partial success is plausible:

```json
{
  "id": "seg1",
  "start_time": 0,
  "end_time": 15,
  "name": "Market Scene",
  "descriptions": { "..." : "..." },
  "vqa_prepared": { "..." : "..." },
  "ai_edits_prepared": {
    "trim_start": {
      "response": "Trimmed Market Scene -- now starts at 0:08 (second stall visible)",
      "partial": "Trimmed, but unsure about exact start point -- verify with helper"
    },
    "split": {
      "response": "Split into two clips: Market Arrival (0:00-0:08) and Stall Browse (0:08-0:15)",
      "partial": "Split the clip, but the split point may not be exactly where you wanted"
    },
    "delete": {
      "response": "Removed Market Scene from the timeline"
    },
    "add_caption": {
      "response": "Added caption to Market Scene",
      "partial": "Added caption, but placed it at the default position -- you may want helper to adjust"
    }
  }
}
```

### 6.6 New Behavioral Codes

| Code | Definition |
|---|---|
| Task Routing -- Self (TR-S) | Creator chose to edit themselves |
| Task Routing -- AI (TR-AI) | Creator routes an edit task to the AI agent |
| Task Routing -- Helper (TR-H) | Creator routes an edit task to the human helper |
| AI Edit Review (AER) | Helper reviews an AI-made edit |
| AI Edit Undo (AEU) | Helper undoes an AI-made edit |

## 7. Component Inventory

### 7.1 New Components

| Component | Location | Purpose |
|---|---|---|
| `TaskRequestModal` | `src/components/probe3/TaskRequestModal.jsx` | Shared slide-up modal for "Ask AI" and "Ask Helper" with voice/text input |
| `ResearcherAIEditPanel` | `src/components/probe3/ResearcherAIEditPanel.jsx` | WoZ panel for AI edit requests with prepared/custom responses and edit state actions |
| `ActivityFeed` | `src/components/probe3/ActivityFeed.jsx` | Unified inbox on helper device for helper tasks and AI edit notifications |

### 7.2 Modified Components

| Component | Changes |
|---|---|
| `ExplorationMode.jsx` | New prop `actionMode`. When `'probe3'`: (1) Actions card renders `Edit Myself` / `Ask AI` / `Ask Helper` instead of `Mark` / `Edit` / `Ask AI`. (2) "Edit Myself" opens the same edit slide-up panel and logs `TASK_ROUTE_SELF`. (3) "Ask AI" opens TaskRequestModal with `route='ai'` (NOT the VQA modal). (4) "Ask Helper" opens TaskRequestModal with `route='helper'`. New props: `onAskAI(taskText, segment)`, `onAskHelper(taskText, segment)`. |
| `CreatorDevice.jsx` | Remove voice note recording flow and mark state. Pass `actionMode="probe3"` to ExplorationMode. Add "Ask Question" button to description area for VQA access. Handle AI edit responses via `window.__aiEditResponse`. Relay `AI_EDIT_NOTIFY` to helper via WebSocket after receiving AI response. Remove handover button. |
| `HelperDevice.jsx` | Replace TaskQueue + WorkspaceAwareness with ActivityFeed. Add handlers for AI edit undo/review. |
| `Probe3.jsx` | Remove HandoverModeSelector, HandoverTransition, HandoverSuggestion imports and state. Add AI edit request/response state and WebSocket handlers for `TASK_TO_HELPER`, `TASK_STATUS_UPDATE`, `AI_EDIT_NOTIFY`. Add ResearcherAIEditPanel to researcher view. Remove ResearcherHandoverPanel from Probe 3. |
| `eventTypes.js` | Add: TASK_ROUTE_SELF, TASK_ROUTE_AI, TASK_ROUTE_HELPER, AI_EDIT_RESPONSE, AI_EDIT_APPLIED, HELPER_TASK_RECEIVED, HELPER_TASK_STATUS, AI_EDIT_REVIEWED, AI_EDIT_UNDONE. |
| `sampleDescriptions.js` / `descriptions.json` | Add `ai_edits_prepared` field per segment. |

### 7.3 Action Button Mapping

| `actionMode` | Button 1 | Button 2 | Button 3 |
|---|---|---|---|
| default (Probes 1 & 2) | Mark -> `onMark()` | Edit -> opens edit panel | Ask AI -> opens VQA modal |
| `'probe3'` | Edit Myself -> opens edit panel, logs `TASK_ROUTE_SELF` | Ask AI -> opens TaskRequestModal (route=ai) | Ask Helper -> opens TaskRequestModal (route=helper) |

### 7.4 Removed from Probe 3 (still used in Probe 2)

| Component/Feature | Reason |
|---|---|
| HandoverModeSelector | Replaced by direct "Ask Helper" button |
| HandoverTransition | No mode switching animation needed |
| HandoverSuggestion | No WoZ handover suggestions |
| ResearcherHandoverPanel | Replaced by ResearcherAIEditPanel |
| VoiceNoteRecorder (in CreatorDevice) | Tasks described directly via TaskRequestModal |
| Mark state | No longer needed |

## 8. Accessibility

- All touch targets minimum 48px height
- Voice input via Web Speech API (same pattern as existing VQA)
- AI edit responses announced via screen reader live region (`announce()`)
- TaskRequestModal uses portal + inert pattern for VoiceOver focus trap
- Activity feed items on helper device are screen-reader accessible with status updates via `aria-live`
- No keyboard shortcuts (study conducted on phones)
- Task status updates from helper announced to creator via screen reader

## 9. Research Alignment

This design maps directly to the three-layer framework paper:

| Layer | Probe Feature | What It Tests |
|---|---|---|
| Layer 1: Information Access | AI descriptions + VQA (existing) | Creator's independent access to visual information |
| Layer 2: Coordination | Ask Helper + Activity Feed | Structured task delegation and status tracking |
| Layer 3: Co-Creation | Ask AI + AI edit responses | AI as bounded creative contributor; creator manages both AI and human labor |

The three-way task routing decision (self / AI / helper) is the primary behavioral measure for Layer 3. Analysis targets:
- Distribution of tasks by route (self vs. AI vs. helper)
- Task categorization by edit type per route
- Qualitative coding of routing rationale from think-aloud and interview data
- Helper's response to AI edits (review, undo, accept)
- Whether certain edit types consistently go to one route (e.g., mechanical edits to AI, judgment calls to helper)
