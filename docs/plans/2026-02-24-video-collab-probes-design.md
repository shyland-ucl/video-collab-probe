# AI Video Collaboration Probes - Design Document

**Date**: 2026-02-24
**Project**: AI-Supported Ability-Diverse Collaboration in Video Creation
**Author**: Lan Xiao, UCL Global Disability Innovation Hub

## Overview

A set of web-based technology probes for a formative study testing how AI-mediated information access affects collaboration between BLV (blind/low-vision) creators and sighted helpers during video editing. The study involves 10 BPS creator-sighted helper dyads in Nairobi, Kenya.

## Conditions

- **Baseline**: Video editor shell only, no AI support
- **Probe 1**: AI video description with 3-level granularity control + WoZ VQA
- **Probe 2**: Smart Handover (single device, creator/helper mode switching with Intent Locker)
- **Probe 3**: Local Mirroring (two devices, WebRTC sync, modality-adapted interfaces)

## Technology Stack

- **Framework**: React (Create React App or Vite)
- **Styling**: Tailwind CSS with custom color scheme
- **State**: React Context + useReducer
- **Storage**: IndexedDB (via `idb` library) for event logs, localStorage for config
- **TTS**: Web Speech API
- **P2P Sync**: WebRTC via `simple-peer`
- **Build**: Vite

## Color Scheme

- Dark navy headers: `#1F3864`
- White backgrounds: `#FFFFFF`
- Blue accent (interactive): `#2B579A`
- Amber (flags/alerts): `#F0AD4E`
- Green (confirmations): `#5CB85C`
- Condition colors: Baseline=grey, Probe 1=blue, Probe 2=green, Probe 3=purple

## Component Architecture

```
App
├── ConditionRouter
├── Shared Components
│   ├── VideoPlayer (HTML5 video, 16:9, transport controls)
│   ├── Timeline (segmented, clickable, color-coded)
│   ├── SegmentMarkerPanel (metadata display)
│   ├── EditActionBar (Trim Start/End, Caption, AD, Review)
│   ├── AccessibilityToolbar (contrast, text size, audio toggle)
│   └── EventLogger (centralized logging context)
├── Probe 1
│   ├── DescriptionPanel (level-based display + TTS)
│   ├── GranularityController (3-position toggle, keys 1-2-3)
│   ├── VQAPanel (creator chat interface)
│   ├── FlagButton (verification, key F)
│   └── ResearcherVQAPanel (WoZ, ?mode=researcher)
├── Probe 2
│   ├── IntentLocker (modal: text/voice + categories + priority)
│   ├── CreatorMode (Probe 1 features + Handover button H)
│   ├── HelperMode (visual + intent banner + Notify/Return)
│   └── HandoverSuggestion (researcher-triggered)
├── Probe 3
│   ├── CreatorDevice (Probe 1 + send-to-helper)
│   ├── HelperDevice (visual + creator intent feed)
│   ├── WebRTCSync (P2P via simple-peer, QR/session code)
│   └── WorkspaceAwareness (activity feeds)
├── Baseline (video shell only)
└── DataExport (ZIP of all JSON logs)
```

## Functional vs. Wizard of Oz

| Feature | Functional | WoZ |
|---------|-----------|-----|
| Video playback & controls | Yes | No |
| Level 1-2 descriptions | Yes (pre-written JSON) | No |
| Level 3 descriptions | Partial (key frames) | Researcher supplements |
| VQA interface | Yes (UI) | Researcher answers via hidden panel |
| Granularity controller | Yes | No |
| TTS | Yes (Web Speech API) | Researcher backup |
| Smart Handover UI | Yes | No |
| AI handover suggestions | Yes (UI) | Researcher triggers |
| Local Mirroring | Yes (WebRTC) | Researcher fallback sync |
| Session logging | Yes | No |

## Data Export Structure

```
session_export.zip
├── session_metadata.json
├── baseline/event_log.json
├── probe1/
│   ├── event_log.json
│   ├── description_interactions.json
│   └── vqa_log.json
├── probe2/
│   ├── event_log.json
│   └── handover_log.json
└── probe3/
    ├── event_log.json
    └── sync_log.json
```

## Keyboard Shortcuts

- Space: Play/Pause
- Left/Right arrows: Seek ±5 seconds
- 1/2/3: Switch description level (Probe 1+)
- H: Initiate handover (Probe 2)
- F: Flag description (Probe 1+)
- Tab: Cycle through UI panels

## Accessibility Requirements

- All interactive elements have ARIA labels
- Logical tab order with focus management
- `aria-live="polite"` for dynamic content updates
- High contrast toggle
- Adjustable text size (small/medium/large)
- Audio output toggle (auto-speak vs text-only)
- Minimum 16px body text
- Screen reader compatible (NVDA, TalkBack)

## Layout

- **Desktop**: Two-column (60% video + controls, 40% description + VQA + actions)
- **Mobile/Tablet**: Stacked (video top, collapsible panels below)

## Priority Tiers (all included)

- P0: Video shell, description system, TTS, WoZ VQA panel
- P1: Intent Locker + mode switching, WebRTC sync + separate interfaces
- P2: Flag/verification, workspace awareness, data export ZIP
- P3: WoZ handover suggestions, high contrast + text size, speech-to-text VQA input
