# Study Plan: Collaborative Video Editing Between Blind/Low-Vision Creators and Sighted Helpers

## Research Context

This study investigates how blind and low-vision (BLV) creators can collaborate with sighted helpers during video editing. We use a technology probe methodology with three conditions, each exploring a different collaboration model. The prototype is a mobile-first web application (Vite + React) that participants interact with on their phones, while a researcher monitors and controls aspects of the experience from a desktop dashboard.

The study uses a **Wizard of Oz (WoZ)** approach: some "AI" features (visual Q&A, AI edit suggestions) are actually mediated by the researcher in real time, though participants experience them as AI-powered. The Gemini VLM provides baseline answers that the researcher can override.

---

## Participant Setup

### Dyad Composition
Each session involves a **dyad**: one blind/low-vision creator and one sighted helper. They collaborate on editing a short video that the creator has "filmed."

### Session Configuration
The researcher opens the session setup page (`/`) and enters:
- **Session ID** (auto-generated UUID, editable)
- **Dyad ID** (e.g., "D01")
- **Accessibility preferences**: text size (small/medium/large), high contrast mode, audio descriptions toggle, speech rate (0.5x--2.0x, default 1.2x)

Session config persists in localStorage. The session always proceeds through all three probes in fixed order: Probe 1, Probe 2, Probe 3.

---

## Condition 1: AI Scene Explorer (Probe 1)

**Research question:** How do BLV creators use AI-generated scene descriptions at varying detail levels to understand and make editing decisions about their video content?

**Colour theme:** Blue (#2B579A)

### Concept
The creator works independently with AI-generated descriptions of their video. They can adjust how much detail they receive, ask questions about what's in a scene, and make editing decisions -- all without the sighted helper present. This probe establishes a baseline for how BLV creators engage with video content through non-visual means.

### User Flow

1. **Onboarding overlay** appears on first entry, explaining the four key interactions (select videos, browse scenes, adjust detail, mark/edit/play). Dismissible with "Got it, let's start."

2. **Video Library phase**: The creator selects one or more videos from a library showing title, summary, duration, and date. They tap "Create Project" to import. (Currently 3 sample videos are available: Morning Coffee Routine, Park Visit, Cooking Session.)

3. **Exploration phase**: The main interaction screen. The creator navigates scene-by-scene through their video:

#### Navigation
- **Previous / Next buttons** (top row, largest touch targets)
- **Keyboard arrows** (left/right)
- Scene counter shows "Scene X of Y"
- Each scene has a name and time range (e.g., "Walking to Kitchen -- 0:00--0:03")

#### Description Levels
- Three granularity levels per scene (pre-authored in `descriptions.json`):
  - **Level 1**: Brief (1 sentence, key action only)
  - **Level 2**: Standard (2--3 sentences, spatial details)
  - **Level 3**: Detailed (full paragraph, lighting, colours, spatial relationships)
- **Less Detail / More Detail buttons** (middle row) cycle between levels
- Descriptions are read aloud via TTS when audio is enabled
- Description text is focused for screen reader announcement on scene change

#### Interactions (bottom row)
- **Mark**: Flags the current scene for review (logs `DESCRIPTION_FLAGGED`)
- **Edit**: Opens a slide-up editor panel with: Split, Move Earlier, Move Later, Delete, Undo, Redo, Add Caption
- **Play/Pause**: Controls video playback (video player is hidden from screen readers, serves as visual reference only)

#### Visual Q&A (Ask button)
- Opens a modal with text input and voice input (speech-to-text)
- Questions go to Gemini 2.0 Flash VLM, which analyses the current video frame
- Researcher can override any AI answer via the WoZ panel
- Answers are read aloud via TTS
- Pre-prepared Q&A pairs exist in the data for common questions per scene

### Researcher Controls (WoZ)
- Access via `?mode=researcher` query parameter on `/probe1`
- Sees current segment context and any pending questions
- Can inject answers that override the AI via `window.__vqaReceiveAnswer()`
- Answers logged with `RESEARCHER` actor (vs `AI` for Gemini responses)

### Data Captured
- Description level changes (which level, which scene, timestamp)
- Scene navigation patterns (sequence, dwell time)
- VQA questions asked and answers received (source: AI vs researcher)
- Flagged scenes
- Edit actions (trim, split, reorder, caption, delete, undo/redo)
- Playback events (play, pause, seek)

---

## Condition 2: Smart Handover (Probe 2)

**Research question:** How do BLV creators and sighted helpers coordinate when using structured task handover with voice notes on a shared device?

**Colour theme:** Green (#5CB85C)

### Concept
Creator and helper share a single device, passing it back and forth. The creator first explores the video (same exploration interface as Probe 1), marks scenes that need the helper's visual input, optionally records voice notes explaining what they need, then physically hands the device to the helper. The helper completes tasks and returns the device with a summary.

### User Flow

#### Creator Phase
1. **Onboarding overlay**: Explains the mark-and-handover workflow.

2. **Exploration mode**: Same scene-by-scene navigation as Probe 1 (Previous/Next, Less/More Detail, Ask, Edit).

3. **Marking scenes**: When the creator taps "Mark," a voice note recorder modal appears:
   - **Record**: Captures audio via microphone, stores blob with scene metadata
   - **Skip**: Marks scene without voice note
   - **Cancel**: Aborts marking
   - Logs `RECORD_VOICE_NOTE` with duration

4. **Initiating handover**: Creator presses `H` key or a handover button. A **Handover Mode Selector** modal appears with two options:
   - **Task Mode**: Sends a structured to-do list of marked scenes with voice notes
   - **Live Mode**: Hands off for real-time side-by-side collaboration
   - Shows count of marked scenes ("X scenes marked")
   - Logs `HANDOVER_INITIATED`

5. **Transition animation**: Full-screen slide animation indicating device handoff direction. The creator physically passes the phone to the helper.

#### Helper Phase (Task Mode)
- **Task Queue**: Shows each marked scene as a task card with:
  - Scene name and time range
  - Voice note playback button (if recorded)
  - Progress bar ("Task X of Y")
- **Per-task actions**: Three status buttons:
  - **Done** (green) -- task completed
  - **Needs Discussion** (amber) -- helper has questions
  - **Cannot Do** (red) -- task not feasible
- **Text Overlay tool**: Helper can add draggable text labels to the video frame (e.g., pointing out what's in frame). Labels can be repositioned or removed.
- **Return Device**: Opens a modal where helper can add a summary before handing back. Reverse transition animation plays.

#### Helper Phase (Live Mode)
- Lighter interface with activity feed
- Helper can edit, communicate, and request control
- More free-form collaboration

#### Researcher Controls (WoZ)
- Can trigger **Handover Suggestions** that slide in as a toast: "Would you like to hand over to your helper now?"
- Creator can Accept or Dismiss the suggestion
- Logs suggestion shown/accepted/dismissed events
- Can inject VQA answers (same as Probe 1)

### Data Captured
- All Probe 1 data (descriptions, navigation, VQA, edits)
- Voice note recordings and durations
- Handover timing (when initiated, mode selected, when completed)
- Task completion statuses (done/needs discussion/cannot do)
- Text overlay actions (add, move, edit, remove)
- Handover suggestion interactions (shown, accepted, dismissed)
- Helper action summaries

---

## Condition 3: Dual Device Mode (Probe 3)

**Research question:** How do BLV creators and sighted helpers collaborate when each has their own device with synchronised playback?

**Colour theme:** Purple (#9B59B6)

### Concept
Creator and helper each use their own phone simultaneously. Playback is synchronised via WebSocket -- when the creator plays, pauses, or seeks, the helper's device follows. The creator can route tasks to the helper or to "AI" (researcher-mediated). This probe explores remote/parallel collaboration without device sharing.

### User Flow

1. **Role selection**: Each participant opens `/probe3` on their own phone and selects their role:
   - **Creator** (blue button, audio/text-optimised interface)
   - **Helper** (purple button, visual-optimised interface)

2. **Waiting for peer**: After role selection, each device shows a loading screen until the other participant connects via WebSocket.

3. **Synced Video Library**: Creator selects videos with checkboxes; selections appear in real time on helper's screen. Creator taps "Create Project" to begin.

4. **Active session**:

#### Creator Device
- **Scene exploration**: Same Previous/Next, Less/More Detail, Mark, Edit interface
- **Playback control**: Creator is the primary controller. Play/pause/seek commands broadcast to helper's device
- **Task routing** (Layer 3): When the creator needs help with a scene, a Task Request Modal offers:
  - **Ask Helper**: Sends task to helper's device with scene context
  - **Ask AI**: Sends request to WoZ panel for researcher to respond as "AI"
- **Recent Tasks panel**: Shows status updates from helper (pending/done/needs discussion)

#### Helper Device
- **Passive playback**: Video auto-syncs to creator's position and play state
- **Activity Feed**: Real-time log of creator's actions (playback, edits, task requests)
- **Peer edit notifications**: Toast notifications when creator makes edits (split, reorder, caption)
- **Text Overlay**: Can add text labels independently
- **Independent editing**: Can trim, split, reorder clips -- edits sync back to creator via WebSocket
- **Task responses**: When creator sends a task, helper sees it and can respond with status

#### WebSocket Communication
- **Playback sync**: PLAY, PAUSE, SEEK messages + periodic STATE_UPDATE every 2 seconds
- **Edit sync**: EDIT_STATE_UPDATE messages with action descriptions
- **Task routing**: TASK_TO_HELPER and TASK_STATUS_UPDATE messages
- **AI responses**: AI_EDIT_NOTIFY broadcasts
- **Library sync**: VIDEO_SELECT and PROJECT_CREATED messages

### Researcher Controls (WoZ)
- **VQA panel**: Same as Probe 1 (inject answers to creator questions)
- **AI Edit panel**: When creator selects "Ask AI" for a task:
  - Researcher sees the pending request with scene context
  - Types a response (or selects from presets like trim/split/caption)
  - Response broadcasts to creator as an AI edit notification
  - Can directly apply edits to the shared edit state
- **Sync fallback controls**: Force Play, Force Pause, Sync Time buttons in case WebSocket drops
- **Connection status indicator**

### Data Captured
- All Probe 1 data per device
- Task routing decisions (self/helper/AI) and responses
- AI edit requests, responses, and whether applied/undone
- WebSocket sync events (connect, disconnect, sync)
- Activity feed entries
- Text overlay actions
- Edit state synchronisation events
- Per-device playback events

---

## Researcher Dashboard

**Route:** `/researcher` (desktop browser)

### Features
1. **Session timer**: Elapsed time in h:m:s
2. **Condition tabs**: Switch between Probe 1, 2, 3 views
3. **WoZ panels**: Condition-specific panels for injecting answers, triggering suggestions, and responding to AI edit requests
4. **Live event log**: Auto-scrolling table of all logged events with filters by condition and event type. Shows timestamp, event type, actor, and data payload.
5. **Data export**: ZIP download containing:
   - `session_metadata.json`: Session/dyad IDs, condition order, timestamps
   - `all_events.json`: Complete event log
   - Per-condition folders with filtered event logs and specialised extracts (description interactions, VQA log, handover log, sync log)

---

## Accessibility Design

The prototype is built with BLV users as primary users:

- **Screen reader support**: ARIA roles/labels on all interactive elements, live announcer region for dynamic updates, focus management in modals (portal to body + inert on root)
- **Keyboard navigation**: Arrow keys (scene nav), Space (play/pause), H (handover), E (exploration), M (mark segment), Tab through all controls
- **Text-to-speech**: Scene descriptions and VQA answers read aloud via Web Speech API at configurable speech rate
- **Large touch targets**: Minimum 44--48px for all interactive elements
- **Skip link**: "Skip to main content" at page top
- **Configurable text size**: Small, medium, large
- **High contrast mode**: Enhanced colour contrast ratios
- **No gesture-only interactions**: Swipe navigation removed in favour of explicit buttons for VoiceOver compatibility
- **Video player hidden from screen readers**: `aria-hidden="true"` since it's a visual reference only
- **Navigation bar hidden from screen readers**: `aria-hidden` with `tabIndex={-1}` to prevent focus trapping

---

## Technical Setup

### Running the Prototype
```bash
npm install
npm run dev       # Starts Vite dev server (default: localhost:5173)
```

### Environment Variables
- `VITE_GEMINI_API_KEY`: API key for Gemini 2.0 Flash VLM (required for live VQA; without it, VQA falls back to pre-prepared answers and WoZ)

### Device Requirements
- **Participant phones**: Modern mobile browser (Chrome/Safari), microphone access (for voice input and voice notes)
- **Researcher laptop**: Desktop browser, same network as participants for WebSocket sync (Probe 3)
- **Probe 3 specifically**: Both phones and researcher laptop need WebSocket connectivity

### Sample Data
- 3 sample videos with pre-authored descriptions at 3 levels, prepared VQA pairs, and prepared AI edit responses
- All data in `/public/data/descriptions.json`

### Key Routes
| Route | Purpose | Device |
|-------|---------|--------|
| `/` | Session setup | Researcher laptop |
| `/probe1` | AI Scene Explorer | Participant phone |
| `/probe2` | Smart Handover | Shared phone |
| `/probe3` | Dual Device Mode | Both phones |
| `/researcher` | WoZ dashboard | Researcher laptop |
| Any route + `?mode=researcher` | Inline WoZ controls | Researcher laptop |

---

## Study Procedure (Suggested)

1. **Pre-session**: Researcher configures session (dyad ID, accessibility prefs). Ensure devices are charged, on same network (for Probe 3).

2. **Probe 1 (~15--20 min)**:
   - Creator uses phone alone
   - Researcher monitors via dashboard, ready to override VQA answers
   - Creator explores video, adjusts description levels, asks questions, marks scenes, makes edits

3. **Probe 2 (~15--20 min)**:
   - Creator starts on phone, explores and marks scenes with voice notes
   - Creator hands device to helper (Task or Live mode)
   - Helper completes tasks, adds text overlays if useful, returns device
   - Researcher may trigger handover suggestions at strategic moments

4. **Probe 3 (~15--20 min)**:
   - Creator and helper each have a phone
   - Creator controls playback (synced), routes tasks to helper or AI
   - Helper responds to tasks, adds overlays, makes independent edits
   - Researcher responds to AI edit requests via dashboard

5. **Post-session**: Export data ZIP from researcher dashboard. Conduct debrief interview.
