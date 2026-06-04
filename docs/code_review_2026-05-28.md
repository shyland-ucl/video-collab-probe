# Complete Code Review — video-collab-probe

**Date:** 2026-05-28
**Scope:** Full repo (118 JS/JSX files, ~24.7k LOC) — React 19 SPA + Express pipeline backend + Vite dev plugins.
**Method:** 20 per-area reviewers + 4 cross-cutting sweeps (security, a11y, React hazards, dead-code), each finding adversarially re-verified against source. 84 findings confirmed, 15 plausible-but-wrong findings rejected. Dead-code sweep redone inline (its agent failed). Production build: **passes** (`vite build`, exit 0).

## Scorecard

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 11 |
| Medium | 29 |
| Low | 43 |

| Category | Count |
|----------|-------|
| Bug | 19 |
| Accessibility | 19 |
| React hazards | 18 |
| Correctness | 14 |
| Security | 5 |
| Maintainability | 5 |
| Performance | 4 |

**Headline themes:** (1) the Express/Vite pipeline API is unauthenticated and trusts client input into the filesystem + a shell (RCE-grade); (2) several cross-device sync paths (undo, remove-scene, colour) can silently diverge or lose the peer's edits; (3) effect-dependency hazards cause WebSocket churn, repeating earcons, and stale closures; (4) duplicate live-region + TTS announcements undercut the screen-reader UX that is the whole point of the app; (5) ~17 orphaned component files + 1 unused dependency.

---

## CRITICAL

### C1. Command injection / arbitrary file write in `resegment` (RCE on the researcher's machine)
**`pipeline/services/segmentation.js:139-147`** (reached via `pipeline/routes/projects.js:52` and `vite-pipeline-plugin.js:184`)

`PUT /:projectId/segments` passes `req.body.segments` to `resegment` after only an `Array.isArray` check (`projects.js:35`, `45-48`). Inside `resegment`, `seg.start_seconds`/`seg.end_seconds` are interpolated **unquoted** into a shell string run by `child_process.exec` (promisified, line 8), and `seg.file`/`seg.keyframe` are joined into output paths with no validation. A body like `start_seconds: "0 -i x -y out.mp4; calc & "` injects shell commands; a `file` of `../../...` writes FFmpeg output anywhere. Combined with `Access-Control-Allow-Origin: *` (C-adjacent, see H8), any web page the researcher visits while the server runs can trigger it cross-origin.

**Fix:** Use `execFile`/`spawn` with an argv array (no shell). Coerce `start`/`end` via `Number()` and reject non-finite/out-of-range. Never trust `seg.file`/`seg.keyframe` from the body — derive them server-side from the validated `seg.id` and assert `path.resolve(projectDir, derived)` stays inside `projectDir`.

---

## HIGH

### H1. Path traversal on every non-upload pipeline route
**`pipeline/routes/projects.js:19-26, 39-40` + `descriptions.js` + `export.js` + `vite-pipeline-plugin.js:147-325`**

`upload.js` defines and uses `isValidProjectId` (`/^[a-zA-Z0-9_-]{1,64}$/`), proving the author knows it's needed — but every GET/PUT/DELETE/export/descriptions route passes the raw `:projectId` straight into `path.join(workspace, projectId, …)`. Express URL-decodes params and `path.join` collapses `..`, so `DELETE …/projects/%2e%2e%2fsomeDir` resolves outside the workspace. `deleteProject` uses `fs.rm(dir, {recursive:true, force:true})` → **destructive arbitrary-directory delete**; read routes leak arbitrary files.

**Fix:** Add `router.param('projectId', …)` (and the `:id`/`:segId` params in the Vite plugin) that 400s anything failing `isValidProjectId` before any handler runs. Export the validator from one shared module and apply it everywhere an id touches the filesystem.

### H2. `PUT /segments` replaces `project.segments` wholesale from the request body
**`pipeline/routes/projects.js:55`** (mirror in `vite-pipeline-plugin.js:186`)

`project.segments = segments` is assigned directly from `req.body`, with no per-segment schema check. A client can drop `descriptions`, change `id`, or point `file`/`keyframe` outside the project. The export path (`export.js:34`) later dereferences `seg.descriptions.level_1` and throws; `resegment` trusts `seg.file` (feeds C1).

**Fix:** Validate/normalize each incoming segment: require an `id` matching an existing segment, coerce boundaries to finite numbers, and reconstruct `file`/`keyframe`/`descriptions` server-side. Merge boundary edits onto stored objects instead of replacing the array.

### H3. Wide-open CORS on an unauthenticated, mutating, RCE-capable API
**`pipeline/server.js:22-28`**

`Access-Control-Allow-Origin: *` covers POST/PUT/DELETE that shell out to FFmpeg, delete project dirs, and spend paid Gemini quota — with no auth. The same routes are mounted on the Vite dev server, which `vite.config.js` exposes with `server.host: true` and `npm run dev:tunnel` publishes via cloudflared. Any page the researcher visits can drive the API.

**Fix:** Restrict allowed origin to the known dev/tunnel origin(s) or require a shared-token header on mutating routes; bind the standalone server to `127.0.0.1` by default. Closes the cross-origin RCE/data-loss vector together with H1/H2/C1.

### H4. WebSocket force-reconnects mid-session on AI-analysis or a11y-setting changes (Probe 3)
**`src/pages/Probe3Page.jsx:1160-1168`**

The connection-lifecycle effect depends on `[role, setupHandlers, clearSubscriptions]`. `setupHandlers` → `runAnalysisSequence`, whose deps include `analysisTriggered, analysisInProgress, curatedSuggestions, audioEnabled, speechRate`. Each change recreates the callbacks → the effect's cleanup `disconnect()`s and reconnects. `handleTriggerAnalysis` toggles `analysisInProgress` (true→false) during the 3s analysis flow, so the socket tears down/re-pairs at the worst moment; toggling global audio or speech rate also forces a full reconnect. Connection auto-recovers (server re-pairs on JOIN), so the impact is churn + duplicate announcements + redundant state recovery, not a permanent break.

**Fix:** Depend only on `[role]` and read `setupHandlers`/`clearSubscriptions` from refs, **or** read the volatile values from refs inside `runAnalysisSequence` to stabilize its identity (matches the existing `editStateRef`/`currentSegmentRef` pattern in this file). Connect/disconnect should run once per role.

### H5. Undo broadcasts a stale snapshot that silently reverts the peer's edits (Probe 2b)
**`src/pages/Probe2bPage.jsx:476-493`**

`editHistory` is pushed only on **local** edits (446-450); peer `EDIT_STATE_UPDATE` applies state without pushing (by design, 116-118, 581). `handleUndoEdit` restores `h[h.length-1]` — captured *before* any peer edits — and broadcasts it. Both sides apply it verbatim, so a creator undo wipes every helper edit that landed since the creator's last local edit, unrecoverably. Blast radius is one study session (research probe), but it corrupts the collaborative edit state.

**Fix:** Either keep undo local-only (don't broadcast), compute undo against `editStateRef.current` (live merged state), or clear `editHistory` whenever a peer update is applied (581) so undo can't reach across a peer commit. Document the chosen semantics.

### H6. Handover transition timer + earcon restart on every playback tick (Probe 2a)
**`src/pages/Probe2Page.jsx:805`** (+ `HandoverTransition.jsx:69`)

`handleTransitionComplete` lists `currentTime` in its deps, so its identity changes on every `onTimeUpdate`. It's passed as `onComplete`; `HandoverTransition`'s effect lists `onComplete` in deps and arms a 2.5s `setTimeout` + creates an `AudioContext` for the earcon. `handleHandover` doesn't pause playback, so while the video plays each tick re-arms the timer (transition may never complete) and recreates the AudioContext, **replaying the earcon repeatedly** — a stuttering tone for a BLV creator.

**Fix:** Read the clock from a `currentTimeRef` (and `segmentsRef`) inside the callback so its identity is stable across ticks; remove `currentTime`/`segments` from the dep array.

### H7. Segment detection / `SEGMENT_ENTER` never fires in multi-source mode
**`src/components/shared/VideoPlayer.jsx:93-104`**

`handleTimeUpdate` does segment detection via `singleVideoRef.current`, but in multi-source mode the single `<video>` is never rendered (each source uses `videoRefs[id]`), so `video` is always null and line 95 returns early. `currentSegment` never updates, `onSegmentChange`/`SEGMENT_ENTER` never fire. Multi-source is the normal path for pipeline/multi-clip projects, so scene tracking, VQA targeting, the marker panel, Probe 3 scene matching, and the researcher event log are silently broken there. The polling interval (108-117) only updates time, not segments.

**Fix:** Resolve the active element for multi-source (`videoRefs[engine.activeSourceId]`) and feed `engine.edlTime` (combined-timeline coordinates) into `findSegment`, since `buildAllSegments` offsets each source's segment times.

### H8. Modal-open state doesn't gate the global keydown handler (Probe 1)
**`src/components/probe1/ExplorationMode.jsx:419-462`**

While the VQA/Edit modal is open, the `window` keydown listener still handles Arrow (navigate/level), Enter (open VQA), `m` (mark), Space (play/pause) on the explorer behind the dialog. Only Escape is gated. The underlying UI is `inert` for AT, but a window listener fires regardless. Pressing Space to activate the focused dialog button also toggles playback underneath; Arrows silently move scene/level. A memoized `isModalOpen` already exists (line 104) and the Edit panel has no text inputs, so the input-tag guard protects nothing there.

**Fix:** At the top of the handler: `if (isModalOpen) { if (e.key === 'Escape') { … } return; }`.

### H9. VQA answers announced 2–3× (container `aria-live` + per-bubble `role=status` + TTS)
**`src/components/probe1/VQAPanel.jsx:121-159`**

The scroll container has `aria-live="polite"` (125) and each AI/error bubble has `role="status"` (145, itself a polite region); when `audioEnabled`, `ttsService.speak(answer)` (69-70) reads it again. The unambiguous double-read is container + TTS; the nested live region may add a third (SR-dependent). Error/timeout paths also call `announce(errMsg)` on top of the bubble. Directly contradicts the project's "one announce per action, no stacked TTS" convention.

**Fix:** Pick one channel — keep the container as the single polite region, drop the per-bubble `role="status"`, and don't also `ttsService.speak` the same text (or gate it so only one path speaks).

### H10. `playEarcon` leaks a new `AudioContext` per call; earcons die mid-session
**`src/utils/earcon.js:1-13`**

Every call constructs a new `AudioContext` and never closes it. Browsers cap concurrent contexts (~6 in Chrome). Earcons fire on every speech-recognition state change (`useSpeechRecognition.js:52,61,91`) plus Probe 2a/3 actions, so a session quickly hits the cap; `new AudioContext()` then throws and the `catch` swallows it — the BLV participant silently loses a core non-visual feedback channel.

**Fix:** Reuse one module-level context (`ctx.resume()` per play), or set `osc.onended = () => ctx.close()` to release each one.

### H11. (also H1 family) Vite-plugin pipeline routes never validate the id param
**`vite-pipeline-plugin.js:147-153,156-166,169-201,204-213,216-257,260-277,280-325`** — same defect as H1 on the dev-server-mounted copy of the API; the DELETE route (`fs.rm` recursive) is the most dangerous. Fix with the same shared validator/middleware.

---

## MEDIUM (29)

### Cross-device sync / state correctness
| File:line | Issue |
|-----------|-------|
| `Probe2bPage.jsx:1160` | Local "Remove scene" (`keptScenes`) is never broadcast → creator & helper play divergent EDLs. |
| `Probe2Page.jsx:510` | Undo restores `editState` but doesn't re-broadcast/re-stamp → researcher mirror & scene badges desync. |
| `ResearcherPage.jsx:149-158` | Tab-switch effect overwrites the researcher's explicit Start/End condition selection. |
| `pipeline/PipelineReviewPage.jsx:79-90` | `adjustTime` lets `start` pass `end` → negative-duration / inverted segment. |
| `geminiService.js:196-206` | `draftAIEditResponse` returns raw model prose as `description` when JSON parse fails and text doesn't start with `{`. |
| `assignmentsStore.js:26-35` | `writeAssignments` overwrites the whole table, no per-dyad merge or backup. |

### Bugs / data hazards
| File:line | Issue |
|-----------|-------|
| `Probe2Page.jsx:535` | `window.__vqaReceiveAnswer` is process-global → races with concurrent researcher tabs / late answers. |
| `pipeline/PipelineReviewPage.jsx:162-178` | No unsaved-changes guard: navigating away / generating silently discards dirty segment edits. |
| `ResearcherSuggestionPanel.jsx:44-55,211-227` | Ad-hoc suggestion scene number is 1-based but consumed 0-based (off-by-one). |
| `ControlLockBanner.jsx:16-21` | Component is dead code — the concurrent-edit hazard (M6) it documents is still unfixed. |
| `vite-ws-relay-plugin.js:91-104` | Duplicate JOIN silently overwrites an occupied creator/helper/researcher slot, orphaning the previous socket. |
| `vite-pipeline-plugin.js:169-325` | Concurrent non-atomic read-modify-write of `project.json` risks corruption / lost updates. |

### React hazards
| File:line | Issue |
|-----------|-------|
| `ResearcherPage.jsx:776-791` | Event-log rows keyed by array index while backlog ingestion re-sorts events. |
| `SegmentCard.jsx:41-42` | `labelValue` state doesn't resync when the `segment` prop changes (stale label after save). |
| `MockEditorVisual.jsx:479-509` | Trim-drag end handler reads stale pre-drag clip state for logging + SR announcement. |
| `MockEditorVisual.jsx:1031-1058` | `applyVolume`/`applySound` broadcast the same edit to `onEditChange` twice (double WS broadcast). |
| `ResearcherAIEditPanel.jsx:140-151` | `handleSend` `setTimeout` has no cleanup → setState / `onSendResponse` after unmount or on stale request. |
| `useSpeechRecognition.js:20-113` | Recognition callbacks `setState` after unmount (no cleanup). |
| `useSpeechRecognition.js:32-37` | Stopping during preparation can be re-overridden by a late `onstart`/`onresult`. |
| `useTextOverlay.js:37-52` | Props-sync effect can clobber an in-progress local edit when parent echoes stale overlays. |

### Accessibility
| File:line | Issue |
|-----------|-------|
| `Probe2Page.jsx:946` | Handover-feedback dialog rendered as sibling of the SR-hidden player but under no live/focus constraint. |
| `SessionSetupPage.jsx:77-107` | Switching to "waiting" drops keyboard focus and may not announce the new state. |
| `ResearcherPage.jsx:601-626` | Single tabpanel not associated with the selected tab; tabs lack `aria-controls`/`id`. |
| `DescriptionEditor.jsx:12-74` | Modal has no focus trap, no Escape, no focus restoration, background not inert. |
| `MockEditorVisual.jsx:757-798` | Timeline has `role=listbox` but clip `option`s aren't keyboard-focusable (only the container is). |
| `SegmentMarkerPanel.jsx:16-29` | Double-announces segment changes (live-region container + global `announce`). |
| `DetailLevelSelector.jsx:35-47` | Non-standard `role="text"` on an interactive, focusable control. |
| `HandoverSuggestion.jsx:62-64` | Toast never focused; contradictory ARIA (`role=alert` + `aria-live=polite`). |

### Performance
| File:line | Issue |
|-----------|-------|
| `VideoPlayer.jsx:108-117` | Multi-source polling interval recreated ~60×/sec, defeating its own throttle. |

---

## LOW (43)

### Accessibility (9)
| File:line | Issue |
|-----------|-------|
| `Probe2bPage.jsx:160-177` | Load effect can announce "Project state loaded from Phase 2a" even when nothing was applied. |
| `SegmentCard.jsx:60-77` | Inline label-edit input has no associated label / accessible name. |
| `MockEditorVisual.jsx:814-819` | Trim slider `aria-valuemax` is full clip duration, allowing reported values to exceed enforced max. |
| `SwipeHandler.jsx:103-115` | Gesture-only actions, no keyboard/SR equivalent. *(Component is unused — see dead code.)* |
| `TextOverlay.jsx:50-77` | Edit-mode element is `role="button"` but not focusable and has no keyboard handler. |
| `HelperMode.jsx:222-235` | Dismiss modal lacks Escape and traps with no return-focus. |
| `ActivityFeed.jsx:225-247` | `creatorActivities` keyed by array index after `.reverse()` → content/focus desync. |
| `WorkspaceAwareness.jsx:60-101` | Focusable entries nested inside an `aria-live="polite"` region. *(Component is unused.)* |
| `AccessibilityContext.jsx:7-22` | Unvalidated localStorage merge feeds corrupt a11y settings into rendering/TTS. |

### Bugs (10)
| File:line | Issue |
|-----------|-------|
| `VQAPanel.jsx:31-86` | No video element → VQA blocks the user a full 15s before failing. |
| `VoiceNoteRecorder.jsx:16-23` | Unmount cleanup stops tracks but never stops the `MediaRecorder`. |
| `usePlaybackEngine.js:99` | `video.play()` promise rejections unhandled across the engine. |
| `sceneEditOps.js:49` | Clip-id collision risk in split/caption/note (`Date.now()` only). |
| `wsRelayService.js:99-103` | Messages sent right after `connect()` are dropped (no send queue / PAIRED gate). |
| `geminiService.js:23-25` | `captureFrame` can throw on tainted canvas / null 2D ctx → unhandled error mid-VQA. |
| `segmentation.js:33-40` | `getVideoMeta` → NaN duration when `format.duration` missing → zero segments. |
| `vite-pipeline-plugin.js:55-65,77` | Upload route has no Multer/Express error handler → HTML 500 + leaked temp files. |
| `vite-ws-relay-plugin.js:158-178` | Heartbeat interval + `WebSocketServer` not cleaned up on dev-server restart/HMR. |
| `AccessibilityContext.jsx:43-48` | Debounced localStorage write can throw (quota/serialization) with no guard. |

### Correctness (8)
| File:line | Issue |
|-----------|-------|
| `Probe3Page.jsx:675-699` | Legacy auto-deploy effect (ungated by `analysisTriggered`, 1-based vs 0-based scene index) emits wrong-scene `SUGGESTION_DEPLOYED` events, corrupting the study log. Remove it. |
| `MockEditor.jsx:228-248` | Trim buttons can only add trim, never untrim — clip permanently shrinks. *(Component unused.)* |
| `TransportControls.jsx:84-94` | "Jump to end"/"Forward" use raw source duration, not EDL duration, in edited multi-source. |
| `DecoupledCreatorDevice.jsx:47-73` | play/pause sync omits `handleSeek`'s SEEK and never sends an initial `STATE_UPDATE`. |
| `sceneEditOps.js:235-236` | `move_later`/`move_down` ignores `options.direction` — dead ternary always returns 'down'. |
| `projectStore.js:22-25` | Non-atomic `writeProject` can corrupt `project.json` on concurrent/interrupted writes. |
| `geminiWorkflow.js:596-607` | Can mark project `ready_for_probe` with fewer than 3 valid suggestions. |
| `scripts/rewrite_suggestions.js:201` | Resolves `project.json` via CWD-relative path, ignoring `FOOTAGE_WORKSPACE`. |

### React (8)
| File:line | Issue |
|-----------|-------|
| `Probe3Page.jsx:1201-1203` | Pending AI-edit promise never resolves on unmount → resolver leak, callers hang. |
| `Probe2bPage.jsx:779-788` | `COLOUR_UPDATE` debounce timers never cleared → setState after unmount/role change. |
| `Probe2Page.jsx:941` | `editHistory.length` captured stale in `renderSceneActions`; `canUndoEdit` lags. |
| `Probe1Page.jsx:87-123` | `allVideos` memo comment claims "fresh each render" but is gated by `useMemo` deps. |
| `MockEditor.jsx:32-36` | Broadcasts empty edit state on mount, clobbering parent (missing didMount guard). *(Unused.)* |
| `SceneBlockList.jsx:378-389` | Auto-follow effect re-runs every playback tick (`currentTime` dep), may fight focus mgmt. |
| `TaskQueue.jsx:19-27` | Resets all task statuses whenever the `tasks` prop reference changes. *(Component unused.)* |
| `SuggestionCard.jsx:13-24` | Conditional hook order: early `return null` precedes `useEffect` (rules-of-hooks). *(Unused.)* |

### Maintainability (5) & Performance (3)
| File:line | Issue |
|-----------|-------|
| `pipeline/PipelineReviewPage.jsx:11` | `getWorkspaceUrl` imported but unused. |
| `MarkList.jsx:21-32` | Numbered badge uses array index (index-as-label can mislead). *(Component unused.)* |
| `HandoverModeSelector.jsx:4` | Unused dead dialog with an incomplete a11y contract. |
| `dataExport.js:25-26` | Mutates `sessionMetadata` param; `JSON.stringify` unguarded vs circular/non-serialisable. |
| `upload.js:94-101` | Temp-file cleanup uses `req.file.path` after `fs.rename` may have moved it. |
| `CreatorMode.jsx:96-107` | Voice-note object URL never revoked (leak). *(Component unused.)* |
| `usePlaybackEngine.js:120-126` | RAF loop spins forever, never settles `currentClipIndex` at EDL end. |
| `EventLoggerContext.jsx:120-128` | `EVENT_BACKLOG` reply serializes the full log in the WS handler, no size guard. |

---

## Dead code & dependencies (inline sweep)

**Orphaned files — no import anywhere in `src/`** (the app evolved past them; several "bugs" above live here, so *delete rather than fix*):

- `src/components/shared/MockEditor.visual.jsx.bak` — committed backup file.
- `src/services/videoAnalysisService.js` — zero usages (CLAUDE.md: "currently unwired").
- `src/components/probe2/CreatorMode.jsx` — superseded by the exploration-first pattern (Probe2Page imports only `HelperMode`).
- `src/components/shared/MockEditor.jsx` — superseded by `MockEditorVisual` (the only editor imported).
- `src/components/probe2/TaskQueue.jsx`, `MarkList.jsx` (removed per its own comment), `HandoverModeSelector.jsx`
- `src/components/probe3/SuggestionCard.jsx`, `SuggestionHistory.jsx`, `WorkspaceAwareness.jsx`, `CreatorDevice.jsx`
- `src/components/probe1/DescriptionPanel.jsx`, `FlagButton.jsx`, `GranularityController.jsx`
- `src/components/shared/SoundEffectsPanel.jsx`, `MockFramingControls.jsx`, `SwipeHandler.jsx` (intentionally dropped for VoiceOver)
- `src/components/decoupled/ControlLockBanner.jsx`

**Unused dependency:** `idb` is in `package.json` but never imported (0 usages). Remove it.

**Clean:** no `console.log`/`console.debug` and no `TODO/FIXME/HACK` markers left in `src/` or `pipeline/`.

> Caveat: "orphaned" = no static import found in `src/`. Confirm none are intended as future/in-progress work before deleting; the adversarial verifier independently flagged `ControlLockBanner` and `HandoverModeSelector` (and a dead modal path in `DecoupledCreatorDevice`) as unreachable, corroborating this list.

## Build / bundle

`vite build` passes, but the whole app ships as **one 671 kB JS chunk (204 kB gzip)** with no route-level code-splitting (Vite warns about it). Participants load this on phones, often over a tunnel — lazy-load each probe page with `React.lazy` + `Suspense` and/or set `build.rollupOptions.output.manualChunks`.

## Rejected findings (false positives filtered by verification)

15 plausible findings were dropped after reading the source — e.g. `formatDuration` "NaN min NaN sec" (guarded by `m > 0`), `TaskQueue` divide-by-zero (guarded), `serialiseProjectState` quota loss (try/catch present), `ttsService` rate (applied via options), `tryPair` readyState (peers freshly connected). Two were real *code patterns* but in **dead components**, so unreachable. Every finding above survived this adversarial re-read.

## Suggested remediation order

1. **Security as one PR (C1, H1, H2, H3, H11)** — shared `isValidProjectId` param-guard on all routes, `exec`→`execFile`/argv in segmentation, per-segment body validation, CORS lockdown + bind to localhost. Closes the cross-origin RCE/arbitrary-delete chain.
2. **Cross-device data integrity (H5 + `Probe2bPage:1160`, `Probe2Page:510`)** — define undo / remove-scene / colour broadcast semantics so a session can't silently desync or lose a peer's edits.
3. **H7 multi-source segment detection** — restores scene tracking + researcher event log on the normal pipeline path (currently silently broken).
4. **H4, H6, H9, H10** — effect-deps, duplicate announcements, AudioContext leak; these degrade the BLV experience mid-session.
5. **Dead-code purge + remove `idb` + delete `.bak`** — removes ~17 files and several lower findings at once.
6. **Bundle code-splitting**, then the Medium/Low backlog by file.
