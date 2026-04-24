# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm run dev         # Start Vite dev server (also mounts pipeline API + WS relay)
npm run dev:tunnel  # Expose dev server via cloudflared tunnel
npm run build       # Production build (output: dist/)
npm run preview     # Preview production build
npm run pipeline    # Standalone pipeline Express server on port 3001 (alternative to Vite plugin)
```

No test runner is configured. No linter is configured.

### Footage Pipeline (pre-session video processing)

In dev, the pipeline API is mounted directly on the Vite server by `vite-pipeline-plugin.js` under `/api/pipeline/*` — no separate port needed. The standalone `npm run pipeline` server is an alternative that exposes the same routes under `/api/*` on port 3001.

```bash
# Prerequisites: FFmpeg installed and on PATH, GEMINI_API_KEY set in .env

# CLI usage (independent of any server):
node scripts/import_footage.js --file <path.mp4> --project-id <id> --segment-length 3
node scripts/generate_descriptions.js --project-id <id>
```

**Environment variables:**
- `GEMINI_API_KEY` — Required for description generation (server-side). Loaded from `.env` automatically.
- `VITE_GEMINI_API_KEY` — Required for in-browser VQA (Probe 1) and live video analysis.
- `GEMINI_MODEL` — Optional (default: `gemini-2.5-pro`)
- `FOOTAGE_WORKSPACE` — Optional (default: `./footage_workspace`)
- `MAX_UPLOAD_SIZE_MB` — Optional (default: `500`)
- `PIPELINE_PORT` — Optional (default: `3001`, only for standalone server)

## Project Overview

This is a **research probe application** for studying collaborative video editing between blind/low-vision creators and sighted helpers. It's a Vite + React 19 (JavaScript, no TypeScript) single-page app styled with Tailwind CSS v4.

The study has **four conditions** in fixed order: `probe1 → probe2a → probe2b → probe3`.

- **Probe 1 (AI Description)** — AI-generated scene descriptions at 3 granularity levels, visual Q&A (Gemini VLM + WoZ override), flagging, scene-block exploration
- **Probe 2a (Co-located Handover)** — creator/helper roles on one device with intent locking, voice notes, task handover, and WoZ suggestions
- **Probe 2b (Decoupled Coordination)** — two-device collaboration with reactive task routing (self/AI/helper). Carries project state forward from Probe 2a via localStorage.
- **Probe 3 (Proactive AI)** — decoupled creator/helper devices with proactive AI suggestion deployment, suggestion routing, and helper response chain

**Target devices:** Participant-facing UI (all probes) runs on mobile phones. Researcher dashboard runs on desktop.

## Architecture

### Routing (`App.jsx`)
Routes: `/` (session setup), `/probe1`, `/probe2` (= 2a), `/probe2b`, `/probe3`, `/researcher`, `/pipeline`, `/pipeline/review/:projectId`. There is no `StudyLayout`/`ConditionNav` wrapper — each probe page renders its own `ConditionHeader`.

`AppShell` subscribes to `wsRelayService` and reacts to `{ type: 'NAVIGATE', path }` messages so a researcher device can drive participant routing remotely.

### State Management (Contexts)
- **EventLoggerContext** — Central event bus. Reducer-based (`LOG_EVENT`, `SET_CONDITION`, `CLEAR_EVENTS`, `RESET_SESSION`). Every event is logged with `{ timestamp, eventType, actor, data, videoTimestamp, condition }`. Drives the researcher dashboard and ZIP export.
- **AccessibilityContext** — `textSize` (small/medium/large), `highContrast`, `audioEnabled`, `speechRate`. Persisted to `localStorage` under `accessibilitySettings` (debounced 500ms).

### Component Organization
```
src/components/
  shared/       # ConditionHeader, VideoPlayer, TransportControls, OnboardingBrief,
                # SceneBlock, SceneBlockList, SegmentMarkerPanel, MockEditor,
                # MockEditorVisual, MockColourControls, MockFramingControls,
                # TextOverlay, TextOverlaySettings, InlineVQAComposer,
                # GlobalControlsBar, ResearcherMaterialsPanel, TaskRouterPanel,
                # DataExportButton, VideoUpload, DetailLevelSelector, SwipeHandler
  probe1/       # VideoLibrary, ExplorationMode, DescriptionPanel, GranularityController,
                # FlagButton, VQAPanel, ResearcherVQAPanel, Probe1SceneActions
  probe2/       # CreatorMode, HelperMode, HandoverModeSelector, HandoverTransition,
                # HandoverSuggestion, ResearcherHandoverPanel, MarkList, TaskQueue,
                # VoiceNoteRecorder, Probe2aSceneActions, Probe2bSceneActions
  probe3/       # CreatorDevice, HelperDevice, WorkspaceAwareness, SuggestionCard,
                # SuggestionHistory, ResearcherSuggestionPanel, ResearcherAIEditPanel,
                # TaskRequestModal, ActivityFeed, Probe3SceneActions
  decoupled/    # DecoupledRoleSelector, DecoupledWaitingScreen,
                # DecoupledCreatorDevice, DecoupledHelperDevice (used by Probe 2b)
  pipeline/     # SegmentCard, DescriptionEditor (review UI)
```

### Pages (`src/pages/`)
- `SessionSetupPage.jsx` — entry; writes `sessionConfig` to `localStorage`
- `Probe1Page.jsx` — two-phase: `library` → `exploring`
- `Probe2Page.jsx` — Probe 2a (co-located)
- `Probe2bPage.jsx` — Probe 2b (decoupled, role-aware: `roleSelect` → `waiting` → role UI)
- `Probe3Page.jsx` — Probe 3 (decoupled, role-aware)
- `ResearcherPage.jsx` — desktop dashboard
- `pipeline/PipelineUploadPage.jsx`, `pipeline/PipelineReviewPage.jsx`

### Hooks (`src/hooks/`)
- **usePlaybackEngine** — Non-destructive EDL playback engine. Steps through a clip list, switches between multiple video element refs at clip boundaries (multi-source), surfaces active caption.
- **useSpeechRecognition** — Web Speech API wrapper for voice input (used in VQA, voice notes).
- **useTextOverlay** — Manages text overlays (add/move/edit/remove) with event logging.

### Utils (`src/utils/`)
- **eventTypes.js** — `EventTypes` and `Actors` enums (CREATOR/HELPER/AI/RESEARCHER/SYSTEM). Includes scene-block, suggestion, AI-edit, task-routing, and Phase 2a→2b transition events.
- **buildInitialSources.js** — `buildInitialSources`, `buildAllSegments`, `getTotalDuration` — derives clip lists and segment metadata from descriptions data.
- **projectState.js** — Serialises Probe 2a state to `localStorage['probe2a_project_state']` so Probe 2b can pick up edits, marks, selected video IDs, and description level.
- **projectOverview.js** — Builds project stats and edit-state change summaries.
- **announcer.js** — `announce()` utility writes to `#sr-announcer` live region for screen readers.
- **earcon.js** — Short audio cues for state changes.

### Services (`src/services/`)
- **geminiService.js** — `gemini-2.5-flash` for live VQA. `captureFrame(videoElement)` + `askGemini(base64, question, options)`. Uses `VITE_GEMINI_API_KEY`.
- **videoAnalysisService.js** — `gemini-2.5-flash` for ad-hoc client-side analysis (currently unwired).
- **wsRelayService.js** — Client wrapper around the WebSocket relay (`/ws-relay`). See plugin notes below.
- **ttsService.js** — Web Speech API wrapper for reading descriptions aloud.
- **dataExport.js** — Creates ZIP with per-condition event logs (`jszip` + `file-saver`).
- **pipelineApi.js** — Fetches the pipeline API at `/api/pipeline/*` (same-origin via Vite plugin).

### Vite Plugins
- **vite-pipeline-plugin.js** — Mounts the full pipeline API onto the Vite dev server under `/api/pipeline/*`. Loads `.env` so `GEMINI_API_KEY` works without the `VITE_` prefix.
- **vite-ws-relay-plugin.js** — Runs a `WebSocketServer` on the dev server. Roles: `creator`, `helper`, `researcher`, `participant`. Server pairs creator ↔ helper, broadcasts researcher messages to all, and relays peer-to-peer after pairing. Messages: `JOIN`, `PAIRED`, `PEER_DISCONNECTED`.

### Pipeline Backend (`pipeline/`)
Standalone Express app (alternative to the Vite plugin). Routes are reused by both.
- **server.js** — Express app on port 3001
- **routes/upload.js** — `POST /api/upload` (multipart, triggers FFmpeg segmentation; auto-generates project_id from filename)
- **routes/projects.js** — `GET/PUT/DELETE` project and segment CRUD
- **routes/descriptions.js** — `POST` Gemini description generation, `PUT` manual edits
- **routes/export.js** — `GET` export in probe app format
- **services/segmentation.js** — FFmpeg video splitting + keyframe extraction
- **services/geminiDescriptions.js** — Gemini API integration for 3-level descriptions and video meta
- **services/projectStore.js** — `project.json` read/write
- **prompts/description_generation.txt** — VideoA11y-adapted prompt (26 guidelines)

### Key Patterns
- **VideoPlayer** uses `forwardRef` to expose `.play()`, `.pause()`, `.seek()`, `.getCurrentTime()` imperatively.
- **WoZ (Wizard of Oz)**: Researcher controls activated via `?mode=researcher` query param. Researchers can inject AI answers (Probe 1), trigger handover suggestions (Probe 2), deploy AI suggestions or push AI edits (Probe 3), and route tasks (Probe 2b/3).
- **Role parameter**: Probe 2b and 3 accept `?role=creator|helper`. Without it, the page shows `DecoupledRoleSelector`.
- **OnboardingBrief**: Each condition shows a dismissible onboarding overlay before starting.
- **VideoLibrary phase**: Probe 1 / 2a / 2b open in a `library` phase where the participant selects sample or pipeline-uploaded videos before entering `exploring`.
- **Pipeline assignments**: Researchers assign pipeline projects to dyads via `localStorage['pipelineAssignments']` (keyed by `dyadId`). Probe pages filter the visible library to assigned projects.
- **2a → 2b handoff**: Probe 2a writes serialised state (edits, marks, selected videos, level) to `localStorage['probe2a_project_state']`; Probe 2b reads it on load.
- **Session config** in `localStorage['sessionConfig']` (sessionId, dyadId, conditionOrder, completedConditions). Default order: `['probe1', 'probe2a', 'probe2b', 'probe3']`.
- **Description data** loads from `/data/descriptions.json` via `src/data/sampleDescriptions.js`. Pipeline-generated videos are loaded via `loadPipelineVideos()` from `pipelineApi.js`.
- **Mobile-first layout**: Probe pages use single-column stacked layouts (`max-w-lg`) with large touch targets (min 44–48px).

### Accessibility
Built with accessibility as a core concern (BLV users). Screen reader live region (`#sr-announcer`) with `announce()` utility. Skip-to-content link. ARIA throughout. Keyboard shortcuts (where applicable): Space (play/pause), Arrow keys (±5s seek), E (exploration mode in Probe 1), H (handover in Probe 2), M (mark segment). Voice input for VQA / voice notes via `useSpeechRecognition`. TTS for descriptions via `ttsService`. Decorative chrome (`ConditionHeader`, video element) is hidden from screen readers via `aria-hidden`.
