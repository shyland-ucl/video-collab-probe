# Prototype Documentation

## AI-Mediated Ability-Diverse Collaboration in Video Content Creation

A research probe application for studying how AI can mediate collaboration between blind/low-vision (BLV) video content creators and their sighted helpers during video editing. Built as a within-subjects technology probe study with 10 creator-helper dyads in Nairobi, Kenya.

**Study reference:** UCL REC 16149/001 + Strathmore University SU-ISERC

---

## Table of Contents

1. [Theoretical Foundation](#1-theoretical-foundation)
2. [Application Architecture](#2-application-architecture)
3. [Interaction Model](#3-interaction-model)
4. [Probe Conditions](#4-probe-conditions)
5. [Footage Pipeline](#5-footage-pipeline)
6. [Researcher Dashboard](#6-researcher-dashboard)
7. [Services and Infrastructure](#7-services-and-infrastructure)
8. [Accessibility Design](#8-accessibility-design)
9. [Data Collection](#9-data-collection)

---

## 1. Theoretical Foundation

### Three-Layer Framework

The prototype is structured around a three-layer framework mapped to Ability-Diverse Collaboration theory (Xiao et al., CHI 2024):

| Layer | AI Role | Model | Probe |
|-------|---------|-------|-------|
| **Information Access** | Ability supporter | Ability Sharing | Probe 1 |
| **Coordination** | Communication supporter + responsive agent | Ability Sharing (optimised) | Probe 2a, 2b |
| **Co-creation** | Ability provider/combiner | Ability Combining | Probe 3 |

The progression tests: **who has information** (Layer 1) -> **who can act** (Layer 2) -> **who initiates** (Layer 3).

### Central Hypothesis

AI-mediated information parity can transform collaboration from **delegation** (surrender of agency) to **management of labour** (maintained creative control). The system is triadic throughout: creator + helper + AI.

### Why a Technology Probe

This is not a finished product. It is a research instrument designed to provoke interactions that reveal how BLV creators and sighted helpers negotiate creative control when AI mediates their collaboration. Features are intentionally structured to surface specific behaviours and decision patterns.

---

## 2. Application Architecture

### Tech Stack

- **Framework:** React 19 (JavaScript, no TypeScript) + Vite 7
- **Styling:** Tailwind CSS v4
- **Routing:** react-router-dom v7
- **Target devices:** Mobile phones (Android, TalkBack-optimised) for participants; desktop for researcher

### Route Structure

```
/              -> SessionSetupPage        (session config: dyad ID, condition order)
/probe1        -> Probe1Page              (solo creator + reactive AI)
/probe2        -> Probe2Page              (shared device, responsive AI)
/probe2b       -> Probe2bPage             (two devices, responsive AI)
/probe3        -> Probe3Page              (two devices, proactive AI)
/researcher    -> ResearcherPage          (WoZ dashboard)
/pipeline      -> PipelineUploadPage      (footage upload)
/pipeline/review/:id -> PipelineReviewPage (segment review)
```

### Directory Structure

```
src/
  pages/                    # Route-level page components
    Probe1Page.jsx          # Solo creator condition
    Probe2Page.jsx          # Shared device condition
    Probe2bPage.jsx         # Decoupled device condition
    Probe3Page.jsx          # Proactive AI condition
    ResearcherPage.jsx      # WoZ researcher dashboard
    SessionSetupPage.jsx    # Session configuration
    pipeline/               # Footage processing UI

  components/
    shared/                 # Cross-probe reusable components
      SceneBlock.jsx        # Individual scene block (core interaction unit)
      SceneBlockList.jsx    # Scrollable scene block list
      GlobalControlsBar.jsx # Persistent top bar (granularity, play all)
      DetailLevelSelector.jsx # Granularity toggle (L1/L2/L3)
      VideoPlayer.jsx       # Video playback (forwardRef, imperative API)
      TransportControls.jsx # Play/pause/seek controls
      InlineVQAComposer.jsx # Voice/text question input
      TaskRouterPanel.jsx   # Self/AI/Helper routing UI
      MockEditor.jsx        # Simulated editing interface
      OnboardingBrief.jsx   # Per-condition onboarding overlay

    probe1/                 # Probe 1 specific
      DescriptionPanel.jsx  # Description display
      GranularityController.jsx
      VQAPanel.jsx          # Visual Q&A interface
      FlagButton.jsx        # Uncertainty flagging
      ExplorationMode.jsx   # Free exploration
      ResearcherVQAPanel.jsx # WoZ VQA override
      VideoLibrary.jsx      # Video selection (sample + pipeline)
      Probe1SceneActions.jsx # Scene-level actions for Probe 1

    probe2/                 # Probe 2a/2b specific
      CreatorMode.jsx       # TalkBack-optimised creator interface
      HelperMode.jsx        # Visual helper interface
      HandoverModeSelector.jsx # Creator/helper mode switch
      HandoverTransition.jsx   # Handover animation + earcon
      HandoverSuggestion.jsx
      VoiceNoteRecorder.jsx # Voice memo attachment
      MarkList.jsx          # Edit decision tracking
      TaskQueue.jsx         # Async task management
      Probe2aSceneActions.jsx # Scene actions for shared device
      Probe2bSceneActions.jsx # Scene actions for decoupled

    probe3/                 # Probe 3 specific
      CreatorDevice.jsx     # Creator phone (proactive AI)
      HelperDevice.jsx      # Helper phone
      SuggestionCard.jsx    # AI suggestion display
      SuggestionHistory.jsx # Suggestion response log
      ActivityFeed.jsx      # Triadic activity stream
      WorkspaceAwareness.jsx # Who-is-doing-what indicator
      TaskRequestModal.jsx  # Task routing modal
      ResearcherSuggestionPanel.jsx # WoZ suggestion deployment
      ResearcherAIEditPanel.jsx
      Probe3SceneActions.jsx

    decoupled/              # Two-device shared components
      DecoupledCreatorDevice.jsx
      DecoupledHelperDevice.jsx
      DecoupledRoleSelector.jsx
      DecoupledWaitingScreen.jsx

    pipeline/               # Footage pipeline UI
      SegmentCard.jsx       # Segment review card
      DescriptionEditor.jsx # 3-level description editor

  contexts/
    EventLoggerContext.jsx  # Central event bus (all interaction logging)
    AccessibilityContext.jsx # Text size, high contrast, audio toggle

  services/
    geminiService.js        # Gemini VLM for live VQA
    wsRelayService.js       # WebSocket relay for device sync
    ttsService.js           # Web Speech API wrapper
    dataExport.js           # ZIP export (jszip + file-saver)
    pipelineApi.js          # Pipeline backend API client

  hooks/
    usePlaybackEngine.js    # Video playback state management
    useSpeechRecognition.js # Voice input
    useTextOverlay.js       # Text overlay management

  utils/
    eventTypes.js           # Event type + actor enums
    announcer.js            # Screen reader live region utility
    earcon.js               # Audio cues for mode transitions
    projectState.js         # Project state serialisation
    projectOverview.js      # Project summary generation
    buildInitialSources.js  # Initial data source construction
```

### State Management

| Concern | Implementation | Rationale |
|---------|---------------|-----------|
| **Event logging** | `EventLoggerContext` (useReducer) | Central bus for all interaction events; drives researcher dashboard and data export |
| **Accessibility** | `AccessibilityContext` | Global text size, contrast, audio preferences |
| **Session config** | localStorage | Persists across page reloads; stores dyad ID, session ID, condition order |
| **Pipeline assignments** | localStorage | Researcher assigns footage projects to dyads |
| **Device sync** | WebSocket relay | Real-time state sync between creator and helper devices (Probe 2b, 3) |

---

## 3. Interaction Model

### Linear Scene Block Navigation

The core interaction model is a **linear scene block list** designed for TalkBack screen reader navigation. This was chosen based on pilot testing with a BLV user who found multi-panel layouts (video player + description panel + VQA panel + controls) created excessive cognitive load.

**Design rationale:** Aligns with how TalkBack users already navigate content on their phones -- scrolling through lists, swiping between items. One axis of navigation, one mental model.

#### Two-Level Navigation

**Top Level -- Scene List** (`SceneBlockList.jsx`)

A scrollable list of scene blocks, ordered chronologically. The creator swipes left/right (TalkBack default) to scan the video structure.

- TalkBack announcement: *"Scene 3 of 8: Market stall. 4 seconds."*
- Maps to the first editing phase observed in fieldwork: "first watch the whole thing to understand it"

**Second Level -- Inside a Scene Block** (`SceneBlock.jsx`)

Double-tap to enter a block. Content is navigated sequentially by swiping:

1. **Description** -- read aloud at the selected granularity level
2. **Play segment** -- play/pause this segment's audio and video
3. **Ask AI** -- voice input, scoped to this segment
4. **Probe-specific actions** -- vary by condition (flag, edit, handover, etc.)
5. **VQA history** -- conversation grows within the block like a scoped chat thread

### Global Controls Bar (`GlobalControlsBar.jsx`)

Persistent top bar accessible as the first item before the scene list:

- **Granularity selector** (`DetailLevelSelector.jsx`) -- three toggle buttons
- **Play All** -- continuous playback with descriptions at segment boundaries
- **Session info** -- probe name, video title, timer

### Granularity Levels

Three levels adapted from VideoA11y's 42 AD guidelines, reframed for content creators making editing decisions:

| Level | Label | Length | Question Answered | Guidelines Applied |
|-------|-------|--------|-------------------|--------------------|
| **L1** | What's happening | 1-2 sentences (~15-30 words) | "What is this scene about?" | Narrative flow only (1-13) |
| **L2** | What's visible | 2-4 sentences (~40-70 words) | "What can I see?" | Visual detail (1-18) |
| **L3** | How it looks | 3-5 sentences (~60-100 words) | "How is this shot?" | Technical + editing (all 1-26) |

**Why three levels, not one:** Creators need different information at different stages. When scanning, they want quick summaries (L1). When evaluating content, they need visual detail (L2). When making technical editing decisions, they need framing, lighting, and focus information (L3).

**Why editing-specific at L3:** Standard audio description is designed for passive viewers. BLV content creators editing their own footage need information about camera angle, shakiness, exposure, colour balance -- details irrelevant to viewers but critical for editing decisions. This is the key distinction from VideoA11y.

---

## 4. Probe Conditions

### 4.1 Probe 1: Solo Creator with Reactive AI

**Route:** `/probe1` | **Layer:** Information Access | **RQ:** RQ1

**Purpose:** Establish the floor and ceiling of AI-mediated information access. Can AI descriptions and VQA alone enable meaningful creative engagement?

**Setup:** Creator works alone on one phone. Helper is physically present but uninstructed -- natural interventions are data.

**Scene block actions** (`Probe1SceneActions.jsx`):
- **Ask AI** -- voice question scoped to current segment, answered by Gemini VLM with researcher override buffer
- **Flag** (`FlagButton.jsx`) -- mark a description as uncertain or needing clarification
- **Play segment** -- hear the audio for this scene

**Why the helper is present but uninstructed:** The study observes when creators naturally turn to the helper despite having AI support. These "helper fallback" events reveal where AI information access is insufficient -- building the empirical case for what the creator-oriented visual description vocabulary needs to include.

**Why flagging exists:** Flags generate data about which AI descriptions creators distrust or find inadequate. Combined with VQA questions, they inductively build the taxonomy of visual information categories that matter for creative editing.

**Key components:**
- `VideoLibrary.jsx` -- select from sample videos or researcher-assigned pipeline footage
- `VQAPanel.jsx` -- voice/text Q&A interface using Gemini
- `ResearcherVQAPanel.jsx` -- WoZ override panel for researcher to intercept/modify AI answers

### 4.2 Probe 2a: Shared Device, Responsive AI

**Route:** `/probe2` | **Layer:** Coordination | **RQ:** RQ2

**Purpose:** Test three-way task allocation (self / AI / helper) when creator and helper share one phone with structured handover.

**Setup:** One phone, switches between Creator Mode (TalkBack-optimised, linear scene blocks) and Helper Mode (visual interface) via handover.

**Scene block actions** (`Probe2aSceneActions.jsx`):
- **Edit by myself** -- keep/discard, trim, split, move, add caption, add note
- **Ask AI to edit** -- voice instruction interpreted by Gemini, executed as parameterised operation with confirmation
- **Ask helper** -- initiates handover with intent, task category, and priority

**Handover mechanism** (`HandoverTransition.jsx`):
1. Creator locks intent (what they want done)
2. Audio earcon signals mode change
3. Phone switches to Helper Mode (`HelperMode.jsx`)
4. Helper sees: visual player + timeline + creator's intent banner + editing tools
5. Helper marks tasks: Done / Needs Discussion / Cannot Do
6. Helper taps "Return to Creator" -> earcon -> Creator Mode resumes
7. TalkBack reads summary: *"[Helper] completed: trimmed Scene 4. Needs discussion: lighting in Scene 6."*

**Why structured handover:** Current practice involves unstructured device passing with no record of intent or outcome. Structured handover forces the creator to articulate what they want (building agency) and creates a logged chain: creator intent -> helper actions -> summary -> creator response.

**Why three channels (self/AI/helper):** Every editing decision becomes an observable choice about who should do the work. The distribution across channels is the primary quantitative indicator of how AI changes task allocation.

### 4.3 Probe 2b: Decoupled, Two Devices, Responsive AI

**Route:** `/probe2b` | **Layer:** Coordination | **RQ:** RQ2

**Purpose:** Same task allocation as 2a, but with parallel modality-adapted interfaces instead of sequential handover. Tests whether decoupling enables more parallel work.

**Setup:** Creator and helper each have their own phone, connected via WebSocket. Same video as 2a with project state carried over.

**Scene block actions** (`Probe2bSceneActions.jsx`):
- Same editing and AI actions as 2a
- **Ask helper** -- sends task to helper's phone (no handover needed). Creator continues working.

**Awareness layer** (critical addition for 2b):
- **Activity indicator** (`WorkspaceAwareness.jsx`) -- "Helper is working on this scene"
- **Action log** (`ActivityFeed.jsx`) -- triadic attribution: *"[AI, requested by Creator] trimmed this scene to 3s"*
- **Task status** -- Sent -> Seen -> In Progress -> Done
- **Synced state** -- changes appear on both devices via WebSocket

**Why 2b follows 2a with the same video:** The comparison is the analytical point. Same dyad, same video, same AI capabilities -- only device topology changes. Project carryover is informative data about how familiarity interacts with configuration.

**Device sync** (`wsRelayService.js`):
- WebSocket via local relay server (Vite plugin)
- Connection via QR code or session code
- Fallback: researcher manually synchronises

### 4.4 Probe 3: Proactive AI

**Route:** `/probe3` | **Layer:** Co-creation | **RQ:** RQ3 (exploratory)

**Purpose:** Test what happens when AI shifts from responding to initiating. Same two-device setup as 2b, but with proactive AI suggestions.

**Setup:** Two phones, fresh video (not the same as 2a/2b).

**Proactive suggestion system:**
- **Suggestion bank:** 6-8 pre-authored suggestions per video (`SuggestionCard.jsx`)
- **Researcher-timed deployment:** Researcher triggers suggestions from `ResearcherSuggestionPanel.jsx` based on dyad progress
- **Appearance:** New item surfaces in the relevant scene block. TalkBack: *"AI suggestion on Scene 4."*
- **Routing options** (`TaskRouterPanel.jsx`): Each suggestion forces a routing decision -- handle yourself, ask AI to fix, or send to helper. Cannot directly apply; must route through a channel.

**Suggestion categories:**
| Category | Tests | Example |
|----------|-------|---------|
| Issue flags | Trust in AI problem identification | "The lighting is inconsistent between scenes 3 and 4" |
| Structural observations | Want for AI input on pacing | "This scene is significantly longer than the others" |
| Creative observations | Want for AI aesthetic participation | "The colour palette shifts from warm to cool at this transition" |

**Why suggestions require routing:** Forcing the triadic interaction loop means every suggestion generates observable data about who the creator trusts with what kind of creative decision.

**Why researcher-timed, not automatic:** Maintains experimental control over when suggestions appear relative to the dyad's progress. The "proactive" experience is real for participants; the timing is controlled for research validity.

**2b -> 3 comparison (analytical centrepiece):** Identical collaboration context. Only variable is AI proactivity. In 2b, creator decides what needs attention. In 3, AI identifies what needs attention and creator decides how to route it.

---

## 5. Footage Pipeline

### Purpose

Processes participant videos before study sessions: participants send their own footage for ecological validity. The pipeline segments videos, generates AI descriptions at three granularity levels, and exports data in the probe app's format.

### Architecture

The pipeline runs as a Vite plugin (`vite-pipeline-plugin.js`) -- no separate server process needed. Express API is embedded into the Vite dev server's Connect middleware stack.

```
Pipeline Flow:
Upload (.mp4) -> FFmpeg segmentation -> Keyframe extraction -> Gemini description generation -> Export for probe

API Routes (mounted at /api/pipeline):
POST   /upload                              Upload + segment
GET    /projects                            List all projects
GET    /projects/:id                        Get project details
DELETE /projects/:id                        Delete project + files
PUT    /projects/:id/segments               Update segment boundaries
POST   /projects/:id/mark-reviewed          Mark as reviewed
POST   /projects/:id/generate_descriptions  Generate 3-level descriptions
PUT    /projects/:id/segments/:segId/descriptions  Edit descriptions
GET    /projects/:id/export                 Export for probe app
```

### Backend Services

| Service | File | Purpose |
|---------|------|---------|
| **Segmentation** | `pipeline/services/segmentation.js` | FFmpeg video splitting + keyframe extraction. Uses bundled `ffmpeg-static` and `ffprobe-static` |
| **Description generation** | `pipeline/services/geminiDescriptions.js` | Gemini API (default: `gemini-2.5-flash`) with 26-guideline prompt adapted from VideoA11y |
| **Project store** | `pipeline/services/projectStore.js` | CRUD for `project.json` metadata per project |

### Description Generation Prompt

Located at `pipeline/prompts/description_generation.txt`. Structured around the three granularity levels with 26 guidelines:

- **Guidelines 1-13:** Objectivity, accuracy, clarity, structure
- **Guidelines 14-18:** People, objects, environment description
- **Guidelines 19-26:** Editing-specific (lighting, framing, camera angle/movement, focus, colour balance, technical issues) -- applied at Level 3 only

Key distinction from standard audio description: the prompt is written for a **creator editing their own footage**, not a passive viewer. Technical qualities (framing, exposure, shakiness) matter as much as narrative content.

### Pipeline UI

- **Upload page** (`/pipeline`) -- drag-and-drop upload with project ID, segment length selection
- **Review page** (`/pipeline/review/:id`) -- segment cards with inline 3-level descriptions, keyboard navigation (j/k), editing, regeneration

### Integration with Probe 1

Pipeline videos appear in Probe 1's `VideoLibrary.jsx` alongside sample videos. Researcher assigns projects to dyads via the Materials panel (see below). Pipeline video data is transformed to the probe's segment format by `pipelineApi.js:loadPipelineVideos()`.

---

## 6. Researcher Dashboard

**Route:** `/researcher`

The researcher dashboard provides Wizard of Oz (WoZ) controls activated via `?mode=researcher` query parameter. It is the researcher's primary interface during study sessions.

### Tabs

| Tab | Purpose |
|-----|---------|
| **Materials** | Manage footage pipeline projects. Upload, review, generate descriptions, assign to dyads, delete |
| **Probe 1** | VQA override (intercept/modify AI answers), segment tracking, helper fallback logger |
| **Probe 2a** | Mode tracking, handover suggestion triggers, phase transition to 2b |
| **Probe 2b** | Manual sync controls for device connection issues |
| **Probe 3** | Suggestion deployment panel, manual sync |

### Materials Panel (`ResearcherMaterialsPanel.jsx`)

Pre-session and live footage management:
- List all pipeline projects with status badges (uploaded, segmented, reviewed, descriptions generated, ready)
- Generate descriptions for projects
- Assign projects to specific dyads (stored in localStorage)
- Delete projects
- Links to pipeline review and upload pages

### WoZ Controls

**VQA Override (Probe 1):** Gemini answers VQA questions by default, but a 2-3 second buffer allows the researcher to intercept and modify responses before they reach the creator. Override decisions are logged.

**Helper Fallback Logger (Probe 1):** One-click logging when the creator spontaneously turns to the helper. Captures the moment and optional researcher note.

**Suggestion Deployment (Probe 3):** Researcher triggers pre-authored suggestions based on the dyad's progress. Controls timing while participants experience "proactive" AI.

**Phase Transition (Probe 2a -> 2b):** Serialises project state and broadcasts to Probe 2b devices.

### Session Controls

- Start/end session with timestamped events
- Start/end individual conditions
- Navigate participant phones (broadcast route changes via WebSocket)
- Live event log with filters by condition and event type
- Data export (ZIP with per-condition event logs)

---

## 7. Services and Infrastructure

### Gemini VLM Service (`geminiService.js`)

- **Model:** Gemini 2.0 Flash for live VQA
- **Usage:** Captures video frame + creator's question -> sends to Gemini with BLV-focused system prompt
- **API key:** `VITE_GEMINI_API_KEY` environment variable
- **WoZ buffer:** 2-3 second delay before response delivery, allowing researcher override

### WebSocket Relay (`wsRelayService.js`)

- **Purpose:** Device sync for Probe 2b and Probe 3
- **Implementation:** Vite plugin (`vite-ws-relay-plugin.js`) runs WebSocket server alongside dev server
- **Connection:** Session code or QR code
- **Data:** Syncs project state, playback position, editing actions, task messages, suggestions
- **Fallback:** Researcher can manually synchronise from dashboard

### TTS Service (`ttsService.js`)

- **API:** Web Speech API
- **Usage:** Reads descriptions aloud on scene block entry and granularity change
- **Stop control:** Creator can interrupt TTS

### Data Export (`dataExport.js`)

- **Format:** ZIP file containing per-condition JSON event logs
- **Libraries:** jszip + file-saver
- **Content:** All logged events with timestamps, actors, event types, video time, condition, and arbitrary data payloads

### Event Logger (`EventLoggerContext.jsx`)

Central event bus using useReducer. Actions:
- `LOG_EVENT` -- timestamped event with actor, type, condition, data
- `SET_CONDITION` -- track active probe condition
- `CLEAR_EVENTS` -- reset log
- `RESET_SESSION` -- full session reset

Actor enums: `CREATOR`, `HELPER`, `AI`, `RESEARCHER`, `SYSTEM`

---

## 8. Accessibility Design

### Core Principles

The prototype is built for BLV users as a primary audience, not as an afterthought:

- **Screen reader live region** (`#sr-announcer`) with `announce()` utility for dynamic content updates
- **Skip-to-content link** for keyboard navigation
- **ARIA attributes** throughout all interactive components
- **Minimum touch targets:** 44-48px on all interactive elements
- **Mobile-first layout:** Single-column stacked (`max-w-lg`), optimised for phone screens

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play/pause current segment |
| Arrow Left/Right | Seek +/- 5 seconds |
| E | Toggle exploration mode (Probe 1) |
| H | Initiate handover (Probe 2a) |
| M | Mark/flag segment |

### TalkBack Optimisation

- Linear navigation model eliminates multi-panel cognitive load
- Scene blocks announced with index, label, and duration
- Mode transitions signalled with audio earcons before TalkBack announcements
- Granularity changes announced globally
- Task status updates announced on scene block entry

### Accessibility Settings (`AccessibilityContext.jsx`)

- **Text size:** Small / Medium / Large
- **High contrast mode**
- **Audio toggle** for descriptions and earcons

---

## 9. Data Collection

### Event Types (`eventTypes.js`)

Every user and system action is logged with:
- Timestamp (ms since session start)
- Event type (from standardised enum)
- Actor (CREATOR / HELPER / AI / RESEARCHER / SYSTEM)
- Condition (probe1 / probe2a / probe2b / probe3)
- Video time (current playback position)
- Data payload (arbitrary JSON)

### Key Event Categories

| Category | Examples | Analysis Purpose |
|----------|----------|-----------------|
| **Navigation** | Scene enter/exit, granularity change | How creators scan and explore |
| **VQA** | Question asked, answer received, override | Visual information needs taxonomy |
| **Editing** | Keep/discard, trim, split, move | Task allocation patterns |
| **Channel routing** | Self-edit, AI-edit, helper-edit | Triadic collaboration analysis |
| **Handover** | Intent locked, mode switch, summary | Coordination patterns |
| **Suggestions** | Deployed, dismissed, routed | AI proactivity response |
| **Flags** | Description flagged | AI description quality |
| **Awareness** | Activity checked, status viewed | Workspace awareness usage |

### Export Format

ZIP file with per-condition CSV/JSON containing all logged events. Designed for:
- Thematic analysis (Braun & Clarke reflexive approach)
- Conversation analysis of verbal interactions
- Behavioural coding using the study's coding scheme
- Descriptive statistics to triangulate qualitative findings

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_GEMINI_API_KEY` | Yes (for VQA) | Gemini API key for live visual Q&A |
| `GEMINI_API_KEY` | Yes (for pipeline) | Gemini API key for description generation |
| `GEMINI_MODEL` | No | Override Gemini model (default: `gemini-2.5-flash`) |
| `FOOTAGE_WORKSPACE` | No | Pipeline workspace directory (default: `./footage_workspace`) |
| `MAX_UPLOAD_SIZE_MB` | No | Max upload size (default: 500) |

## Running the Prototype

```bash
npm install           # Install dependencies
npm run dev           # Start dev server (includes pipeline API)
npm run build         # Production build
```

No separate pipeline server process is needed -- it runs as a Vite plugin.
