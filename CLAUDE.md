# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm run dev       # Start Vite dev server
npm run build     # Production build (output: dist/)
npm run preview   # Preview production build
```

No test runner is configured. No linter is configured.

## Project Overview

This is a **research probe application** for studying collaborative video editing between blind/low-vision creators and sighted helpers. It's a Vite + React 19 (JavaScript, no TypeScript) single-page app styled with Tailwind CSS v4.

The study has **three conditions** in fixed order:

- **Probe 1 (AI Description)** — AI-generated scene descriptions at 3 granularity levels, visual Q&A (Gemini VLM + WoZ override), flagging
- **Probe 2 (Smart Handover)** — creator/helper role switching with voice notes, task handover, and WoZ suggestions
- **Probe 3 (Local Mirroring)** — dual-device WebSocket sync between creator and helper devices

**Target devices:** Participant-facing UI (all probes) runs on mobile phones. Researcher dashboard runs on desktop.

## Architecture

### Routing (`App.jsx`)
Five routes: `/` (session setup), `/probe1`, `/probe2`, `/probe3`, `/researcher`. Each condition route wraps its page in `StudyLayout` which provides the `ConditionNav` footer. The researcher route is a standalone dashboard.

### State Management (Contexts)
- **EventLoggerContext** — Central event bus. Reducer-based (`LOG_EVENT`, `SET_CONDITION`, `CLEAR_EVENTS`, `RESET_SESSION`). Every user/system action is logged with timestamp, actor, event type, video time, and condition. This data drives the researcher dashboard and ZIP export.
- **AccessibilityContext** — Text size (small/medium/large), high contrast mode, audio toggle.

### Component Organization
```
src/components/
  shared/       # Reusable: VideoPlayer, TransportControls, OnboardingBrief, ConditionNav, MockEditor, etc.
  probe1/       # DescriptionPanel, GranularityController, FlagButton, VQAPanel, ResearcherVQAPanel, ExplorationMode
  probe2/       # CreatorMode, HelperMode, HandoverModeSelector, HandoverTransition, HandoverSuggestion, ResearcherHandoverPanel
  probe3/       # CreatorDevice, HelperDevice, WorkspaceAwareness
```

### Services (singletons)
- **geminiService.js** — Gemini 2.0 Flash VLM for live visual Q&A. Captures video frames and sends to Gemini API with BLV-focused system prompt. API key via `VITE_GEMINI_API_KEY` env variable.
- **wsRelayService.js** — WebSocket relay for Probe 3 dual-device sync.
- **ttsService.js** — Web Speech API wrapper for reading descriptions aloud.
- **dataExport.js** — Creates ZIP with per-condition event logs (uses `jszip` + `file-saver`).

### Key Patterns
- **VideoPlayer** uses `forwardRef` to expose `.play()`, `.pause()`, `.seek()`, `.getCurrentTime()` imperatively.
- **WoZ (Wizard of Oz)**: Researcher controls are activated via `?mode=researcher` query param on condition routes. Researchers can inject AI answers (Probe 1), trigger handover suggestions (Probe 2), or force sync (Probe 3). VQA uses Gemini by default with researcher override capability.
- **OnboardingBrief**: Each condition shows a dismissible onboarding overlay explaining the condition and key interactions before starting.
- **Session config** is stored in `localStorage` (sessionId, dyadId, conditionOrder, completedConditions).
- **Event types and actor enums** are defined in `src/utils/eventTypes.js`.
- **Description data** loads from `/data/descriptions.json` via `src/data/sampleDescriptions.js` — structured as video segments with 3 granularity levels each.
- **Mobile-first layout**: All probe pages use single-column stacked layouts (`max-w-lg`) optimized for phone screens with large touch targets (min 44-48px).

### Accessibility
Built with accessibility as a core concern (BLV users). Screen reader live region (`#sr-announcer`) with `announce()` utility. Skip-to-content link. ARIA attributes throughout. Keyboard shortcuts: Space (play/pause), Arrow keys (±5s seek), E (exploration mode in Probe 1), H (handover in Probe 2), M (mark segment). Voice input for VQA questions. TTS for descriptions.
