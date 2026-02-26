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

The study has **four conditions** participants rotate through in configurable order:

- **Baseline** — control condition, standard video player
- **Probe 1 (AI Description)** — AI-generated scene descriptions at 5 granularity levels, visual Q&A, flagging
- **Probe 2 (Smart Handover)** — creator/helper role switching with intent locking and WoZ suggestions
- **Probe 3 (Local Mirroring)** — dual-device WebRTC sync between creator and helper devices

## Architecture

### Routing (`App.jsx`)
Six routes: `/` (session setup), `/baseline`, `/probe1`, `/probe2`, `/probe3`, `/researcher`. Each condition route wraps its page in `StudyLayout` which provides the `ConditionNav` footer. The researcher route is a standalone dashboard.

### State Management (Contexts)
- **EventLoggerContext** — Central event bus. Reducer-based (`LOG_EVENT`, `SET_CONDITION`, `CLEAR_EVENTS`, `RESET_SESSION`). Every user/system action is logged with timestamp, actor, event type, video time, and condition. This data drives the researcher dashboard and ZIP export.
- **AccessibilityContext** — Text size (small/medium/large), high contrast mode, audio toggle.

### Component Organization
```
src/components/
  shared/       # Reusable: VideoPlayer, Timeline, TransportControls, AccessibilityToolbar, ConditionNav, etc.
  probe1/       # DescriptionPanel, GranularityController, FlagButton, VQAPanel, ResearcherVQAPanel
  probe2/       # CreatorMode, HelperMode, IntentLocker, HandoverTransition, HandoverSuggestion, ResearcherHandoverPanel
  probe3/       # ConnectionSetup, CreatorDevice, HelperDevice, WorkspaceAwareness
```

### Services (singletons)
- **webrtcService.js** — WebRTC via `simple-peer`. Signal exchange: `createSession()` → offer → `acceptOffer()` → `completeConnection(answer)`.
- **ttsService.js** — Web Speech API wrapper for reading descriptions aloud.
- **dataExport.js** — Creates ZIP with per-condition event logs (uses `jszip` + `file-saver`).

### Key Patterns
- **VideoPlayer** uses `forwardRef` to expose `.play()`, `.pause()`, `.seek()`, `.getCurrentTime()` imperatively.
- **WoZ (Wizard of Oz)**: Researcher controls are activated via `?mode=researcher` query param on condition routes. Researchers can inject AI answers (Probe 1), trigger handover suggestions (Probe 2), or force sync (Probe 3).
- **Session config** is stored in `localStorage` (sessionId, dyadId, conditionOrder, completedConditions).
- **Event types and actor enums** are defined in `src/utils/eventTypes.js`.
- **Description data** loads from `/data/descriptions.json` via `src/data/sampleDescriptions.js` — structured as video segments with 5 granularity levels each.

### Accessibility
Built with accessibility as a core concern (BLV users). High-contrast mode uses CSS variables. Screen reader live region (`#sr-announcer`) with `announce()` utility. Skip-to-content link. ARIA attributes throughout. Keyboard shortcuts: Space (play/pause), Arrow keys (±5s seek), H (handover in Probe 2).

### Build Note
`vite.config.js` defines `global: 'globalThis'` to polyfill Node.js `global` for the `simple-peer` library.
