# Prototype Walkthrough Findings - 2026-04-25 Run 4

Fresh default-scope walkthrough by Codex against the local Vite server at `http://localhost:5173/`. Live browser coverage included Probe 1 library/scene expansion, Probe 2a library/edit/helper-routing surfaces, Probe 2b two-client pairing/control lock, and Probe 3 two-client pairing with the researcher WoZ suggestion panel. Source review covered the line-level routing, pipeline, accessibility, and WebSocket paths. This report avoids re-finding the already-documented deferred issues except where the current code adds a new consequence or verifies a changed state.

## Regression checks that passed

| Area | How verified | Result |
| --- | --- | --- |
| Probe 1 scene-button label | Live: first scene button after import; source: `SceneBlock.jsx` | Collapsed `aria-label` no longer includes the full description. |
| VideoLibrary ARIA | Live button metadata; source: `VideoLibrary.jsx` | Library uses `role="group"` with `aria-pressed` video buttons. |
| Probe 2a library phase | Live: `/probe2` starts on library, imports one clip into five scenes. | Fixed state still holds. |
| Probe 2a self-edit actions | Live: expanded Trim controls show visible trim status and enabled increment buttons. | No silent placeholder regression found. |
| Probe 2b pairing and NF1 banner | Live: creator alone shows "Trouble connecting?" after ~11s; creator/helper tabs auto-pair. | Fixed state still holds. |
| Probe 2b control lock | Live: helper sees "Creator has control" + "Take control"; after tapping it, both banners flip. | Fixed state still holds. |
| Probe 3 WoZ compose path | Live: `/probe3?role=creator&mode=researcher` pairs and shows "Compose ad-hoc suggestion"; source confirms deploy button inside the form. | Fixed state still holds. |
| Build | `npm.cmd run build` | Passes; only Vite chunk-size warning. |

## Severity legend
- B (Blocker): distorts study results or blocks participation. Fix before any pilot.
- M (Major): meaningful UX, accessibility, or validity problem. Fix before main study.
- m (minor): polish / low-risk robustness.

## 1. Blockers (B)

### B1. Unassigned pipeline videos are shown to every dyad

The participant probe pages only filter pipeline videos when `pipelineAssignments[dyadId]` exists and has at least one item. If there is no assignment for the current dyad, `filteredPipeline` remains the full `pipelineVideos` list, so all uploaded pipeline projects appear alongside the samples. This is the opposite of the study setup expectation that researcher-assigned footage is scoped by dyad. In a real session with multiple uploaded participant videos, the wrong dyad can see or select another participant's footage.

Files: `src/pages/Probe1Page.jsx` lines 75-95; `src/pages/Probe2Page.jsx` lines 71-88; `src/pages/Probe2bPage.jsx` lines 132-145; `src/pages/Probe3Page.jsx` lines 138-149.

Why it matters: this is both a study-validity risk and a privacy risk. The within-subjects comparison depends on each dyad working with the intended footage across conditions; showing all unassigned pipeline footage can silently put the wrong material into every probe.

### B2. Accessibility audio remains hidden and now defaults off

The earlier B5 finding said session setup lacks UI for text size, high contrast, audio descriptions, and speech rate. In the current code, that is compounded by `audioEnabled` defaulting to `false`, while `SessionSetupPage` still exposes only the dyad ID and Start Session button. Because scene-description and AI-answer TTS paths check `audioEnabled`, app-driven speech is disabled unless someone manually edits `localStorage['accessibilitySettings']`.

Files: `src/contexts/AccessibilityContext.jsx` lines 15-19; `src/pages/SessionSetupPage.jsx` lines 119-147.

Why it matters: the study protocol describes descriptions and AI answers being read aloud. For BLV creators, especially those not already expert at locating every dynamic text update with TalkBack, disabling TTS by default changes the accessibility condition being tested.

## 2. Major issues (M)

### M1. Helper editor announces a control-lock error on load before the helper acts

In Probe 2b live testing, after the creator imported a project, the helper page immediately started with "You don't have control of the edits right now. Tap Take control to start editing." before the helper clicked anything. The source path explains it: `MockEditorVisual` initializes its internal clips from `initialSources`, then the generic "notify parent whenever clips/captions/sources change" effect calls `onEditChange`. On helper devices, `handleEditChange` treats that initialization like an attempted edit by a non-owner and announces the lock warning.

Files: `src/components/shared/MockEditorVisual.jsx` lines 42-50 and 65-113; `src/components/decoupled/DecoupledHelperDevice.jsx` lines 179-185; `src/pages/Probe2bPage.jsx` lines 232-238; `src/pages/Probe3Page.jsx` lines 220-223.

Why it matters: the first helper-side awareness message falsely implies the helper tried to edit without control. That can confuse the helper, nudge them to take control unnecessarily, and pollute the control-lock experience the study is trying to observe.

## 3. Minor issues (m)

### m1. Probe 1 copy still promises edit/flag/play-all affordances after the scope was reclassified

This does not re-open the old B1 feature finding: Probe 1 intentionally remains information-access only. The issue is copy drift. The shared `VideoLibrary` tells Probe 1 users to select videos they want to "explore and edit," while the Probe 1 scene-explorer brief says users can "flag a description" and "Use the Play All button." The current Probe 1 scene actions expose detail level, Play scene, and Ask AI only.

Files: `src/components/probe1/VideoLibrary.jsx` lines 117-123; `src/pages/Probe1Page.jsx` lines 217-230; `src/components/probe1/Probe1SceneActions.jsx` lines 58-96.

Why it matters: the baseline condition is supposed to measure solo information access. Copy that primes editing or unavailable actions can make participants search for controls that are intentionally absent, adding avoidable confusion to Probe 1 behaviour.

## 4. Cross-cutting recommendations

1. Make pipeline assignment filtering fail closed on participant routes: if a dyad has no assigned pipeline IDs, show sample videos only, or show a researcher-visible warning that no participant footage has been assigned.
2. Treat accessibility settings as session-critical configuration. Add the UI from the protocol, and decide whether `audioEnabled` should default on for BLV sessions or be explicitly chosen before the first probe begins.
3. Split editor initialization from user edits in `MockEditorVisual`. Initial clip/source hydration should not call the same `onEditChange` path used for deliberate edit mutations.
4. Do one copy reconciliation pass focused on Probe 1 after the B1/M3 re-scope decisions, so protocol docs and participant-facing text no longer describe intentionally absent controls.

## Appendix: what was tested live vs. code-only

| Probe / area | Live | Code | Notes |
| --- | --- | --- | --- |
| Session setup | partial | yes | Browser landing text inspected; accessibility settings verified code-only. |
| Probe 1 | yes | yes | Library import, scene expansion, ARIA metadata, and action set checked. |
| Probe 2a | yes | yes | Library phase, Trim controls, and Ask Helper form checked live; handover transition not fully exercised. |
| Probe 2b | yes | yes | Two-client auto-pairing, waiting banner, project import, control-lock flip checked live. |
| Probe 3 | yes | yes | Two-client auto-pairing and researcher compose entry checked live; suggestion chain verified in source. |
| Researcher dashboard | no | partial | Inline researcher panel checked through Probe 3; full `/researcher` dashboard not walked end-to-end. |
| Pipeline upload/review UI | no | partial | Pipeline visibility/filtering reviewed in probe-page source; no upload performed. |
