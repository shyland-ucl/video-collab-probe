# Prototype Walkthrough Findings — 2026-04-25

Co-walkthrough between Lan and Claude. Combination of live browser inspection (`localhost:5173` driven via Claude-in-Chrome) and source-code review across all four conditions and shared infrastructure.

The findings are organised by **severity** first, then by **probe / area**. Each finding cites the file and line numbers so the fix is easy to locate.

---

## Severity legend

- **B (Blocker)** — likely to materially distort study results or block participation. Fix before any pilot.
- **M (Major)** — meaningful UX, accessibility, or validity problem; fix before the main study.
- **m (Minor)** — polish, copy, or low-risk robustness issue.

---

## 1. Blockers (B)

### ~~B1. Mark/Flag and Edit features missing from Probe 1~~ — RESOLVED AS INTENTIONAL (2026-04-25)

**Status: not a blocker. Re-scoped as intentional research-design choice.**

The original finding observed that components for Mark/Flag, the Edit slide-up panel, and the Play All button exist on disk but aren't wired into Probe 1. After discussion with Lan, this is a deliberate scoping decision: Probe 1's research question is about **information access** (how BLV creators use AI-generated descriptions at varying granularity to understand video content), not about editing. Surfacing Mark/Flag and Edit affordances in Probe 1 would distract from the central interaction (granularity exploration + VQA) and confuse the comparison with Probe 2a, which is where editing actually belongs in the four-condition design.

The unimported components (`src/components/probe1/FlagButton.jsx`, `src/components/shared/MockEditor.jsx`) and the "Play All" reference in the onboarding text are leftovers from earlier iterations of the protocol. They can either:
- Be deleted to remove dead code (recommended), or
- Be kept on disk for future use, with the onboarding text updated to drop the "Play All" mention so it doesn't promise something the UI doesn't offer.

Future walkthroughs should not flag B1 as a blocker. The skill's regression-check table has been updated accordingly.

STUDY_PLAN.md should be updated to remove the Mark/Edit description from Probe 1's section so the spec matches the implementation.

### B2. "Edit by Myself" buttons in Probe 2a are non-functional placeholders

In `Probe2aSceneActions.jsx` the Edit-by-Myself menu shows Trim, Split, Move, Add Caption, Add Note. Five of these (everything except Keep/Discard) call `handleSelfEdit(action)` → `logEvent(EDIT_ACTION)` → `onEditSelf(scene, action)`, but `onEditSelf` in `Probe2Page.jsx` line 150 only logs another event. **No `editState` mutation, no UI feedback, no preview.** Verified live: clicking "Trim" produces zero visible change; the screenshots before and after are identical.

A participant trying to actually edit on their own will silently fail and likely escalate to Ask Helper, which biases the comparison the study is trying to make.

Files: `src/components/probe2/Probe2aSceneActions.jsx` lines 90–104, `src/pages/Probe2Page.jsx` line 150.

### B3. Pipeline-uploaded videos do not load in Probe 2a, 2b, or 3

Only `Probe1Page.jsx` calls `loadPipelineVideos()`. `Probe2Page.jsx`, `Probe2bPage.jsx`, and `Probe3Page.jsx` only call `loadDescriptions()`.

Consequence: if a researcher uploads real participant footage via the pipeline (the methodology described in `CLAUDE.md` and `docs/PROTOTYPE.md` §5), that footage will appear in Probe 1 but disappear in Probes 2a, 2b, and 3. The dyad will be working on different footage across conditions, breaking the within-subjects design.

Files: `src/pages/Probe2Page.jsx` line 49, `src/pages/Probe2bPage.jsx` line 70, `src/pages/Probe3Page.jsx` line 78.

### B4. Probe 3's "Proactive AI" only works on specific sample videos

The "proactive AI" is a hard-coded loop over pre-authored `suggestions` in `descriptions.json` (`Probe3Page.jsx` lines 82–94 and 310–334). Only videos whose data contains a `suggestions` array (currently only the Lakeside Adventure sample) generate any proactive deployments. If the dyad chooses any other video — including any pipeline-uploaded footage — the defining feature of Probe 3 does nothing.

Combined with B3, this means the entire Proactive AI condition silently degrades to a basic decoupled session for any non-Lakeside footage.

Files: `src/pages/Probe3Page.jsx`, `public/data/descriptions.json`.

### B5. No accessibility-preferences UI on Session Setup

`STUDY_PLAN.md` specifies that session setup collects text size, high-contrast toggle, audio descriptions, and speech rate. `AccessibilityContext` holds the state and persists to `localStorage['accessibilitySettings']`, but there is no UI anywhere in the app for the participant or researcher to set these on session start. They stay at defaults (`textSize: 'medium'`, `highContrast: false`, `audioEnabled: true`, `speechRate: 1.2`) unless someone manually edits localStorage.

For a study with BLV creators this is the difference between a usable session and an unusable one.

Files: `src/pages/SessionSetupPage.jsx`, `src/contexts/AccessibilityContext.jsx`.

### B6. Scene-button `aria-label` dumps the full description on every collapsed scene

`SceneBlock.jsx` line 74:

```
aria-label={`Scene ${index + 1} of ${total}: ${scene.name}. ${formatDuration(duration)}. ${description}. ${isExpanded ? 'Tap to close actions.' : 'Tap to open actions.'}`}
```

Verified live: TalkBack reads the full Level-N description on every focus change as a BLV user swipes through 5–15 scenes. They cannot quickly skim the list at a low granularity; they pay the full audio cost per scene. This **directly defeats the study's premise** that granularity controls let creators choose how much detail to receive.

Recommended fix: aria-label = `Scene ${index+1} of ${total}: ${scene.name}. ${formatDuration(duration)}.` Description should be exposed as a separate focusable element inside the expanded region, or hidden from the trigger and revealed only on expand.

Files: `src/components/shared/SceneBlock.jsx` line 74.

---

## 2. Major issues (M)

### M1. TTS / live-region / TalkBack audio collision on scene expand

When the user expands a scene, three audio sources race:

1. The scene-block button's `aria-label` (read by TalkBack on activation).
2. `ttsService.speak(description)` fires synchronously in the button's `onClick` (`SceneBlock.jsx` line 70).
3. The `useEffect` on `isExpanded` calls `ttsService.stop()` then `announce("Opened scene N. ${name}. Showing actions.")` (lines 36–46).

Result: partial Web Speech reads, gets cut off, then the live region announcement fires while TalkBack is also reading element semantics. Audio salad. This will be obvious in pilots.

Files: `src/components/shared/SceneBlock.jsx`.

### M2. Auto-expand-during-playback yanks reading focus

`SceneBlockList.jsx` lines 69–78: while `isPlaying` and a scene is expanded, the list auto-switches the expanded scene at each segment boundary. This calls `ttsService.stop()` and fires a new `announce()`. If a BLV user is reading a description while the video plays in the background (the central audio-only exploration use case), playback **interrupts their reading mid-sentence**.

Recommend: only auto-advance if the user explicitly enabled "follow-along" mode; otherwise, decouple description reading from playback.

Files: `src/components/shared/SceneBlockList.jsx` lines 69–78.

### M3. `OnboardingBrief` is permanent inline text, not a dismissible overlay

`STUDY_PLAN.md` and `CLAUDE.md` describe an onboarding overlay "Dismissible with 'Got it, let's start.'" The actual `OnboardingBrief.jsx` is a non-dismissible `<section>` that sits at the top of every page taking ~25 % of mobile vertical real estate. It auto-focuses on mount, which is correct for screen readers but means the user starts at "instructions focus" every page transition.

The actual usability problem: on every probe screen the participant sees a wall of text indefinitely; cumulatively over 15-scene Probe 2a, this pushes content below the fold and forces extra scrolling.

Files: `src/components/shared/OnboardingBrief.jsx`.

### M4. Heading hierarchy is broken visually

The only visible "Probe N: X" header in each probe is a `<div>` inside `ConditionHeader.jsx`, not a heading element. The only `<h1>` is `sr-only` and lives inside `OnboardingBrief`. So sighted users see chrome that *looks* like a page header but isn't semantically one. The first visible heading is `<h2>` ("Your Videos" / "Select Your Role") further down.

Files: `src/components/shared/ConditionHeader.jsx`, `src/components/shared/OnboardingBrief.jsx`.

### M5. Probe 2a has no library phase

`CLAUDE.md` says "Probe 1 / 2a / 2b open in a library phase where the participant selects sample or pipeline-uploaded videos before entering exploring." `Probe2Page.jsx` has no `phase` state and drops the user straight into the explorer with all sample videos preloaded (15 scenes). This contradicts the CLAUDE.md spec and means Probe 2a uses different footage than Probe 1 / 2b unless the researcher manually intervenes.

Files: `src/pages/Probe2Page.jsx`.

### M6. No control lock between creator and helper in Probe 2b

The role descriptions say helper "can request control or work independently" but `Probe2bPage.jsx` and `Probe3Page.jsx` have no concept of an edit lock. Both sides' edits broadcast `EDIT_STATE_UPDATE` and apply directly via `handleEditChange`. Simultaneous edits clobber each other (last-write-wins). No "request control" UI affordance exists.

Files: `src/pages/Probe2bPage.jsx` lines 210–225, `src/pages/Probe3Page.jsx` lines 201–213.

### M7. AI-failure dead-end on VQA in Probes 1 and 2a

In `Probe1Page.jsx` line 178 (and same pattern in `Probe2Page.jsx` line 132), the comment `/* Fall back to WoZ */` is followed by an empty `catch` block. If Gemini errors, the `setPendingQuestion(null)` in the `finally` runs, and the participant sees only their question echoed with no answer — the researcher panel may not have been opened. The participant has no UX cue that the AI failed and that human takeover is happening.

Recommend: render an "Researcher is checking…" status when Gemini errors, and surface the error to the researcher panel proactively.

Files: `src/pages/Probe1Page.jsx` lines 153–183, `src/pages/Probe2Page.jsx` lines 111–135.

### M8. `announce()` race condition

`src/utils/announcer.js` clears the live region then sets text after a 100 ms `setTimeout`. Two `announce()` calls within ~100 ms drop the first message: the second clear cancels the first text. In a chained-event flow (e.g. expand + level-change + autoplay-advance) announcements will be lost.

Recommend: queue messages and drain on a 150 ms interval until empty.

Files: `src/utils/announcer.js`.

### M9. Live-region missing `aria-atomic="true"`

`#sr-announcer` in `App.jsx` line 51 has `role="status" aria-live="polite"` but no `aria-atomic`. Without it, when the text node is replaced, some screen readers (notably TalkBack on Android, the study's target platform) will only read the diff, not the full new message — you'll get truncated announcements.

Files: `src/App.jsx` line 51.

### M10. "Waiting for the researcher" screen has no failure surface

In `SessionSetupPage.jsx` after `wsRelayService.connect('participant')`, the user is locked on a "Waiting" screen. If the WS connection fails (e.g. dev tunnel not running, port closed), the user has no error indication, no retry button, and no way back to the form. Same applies to the `DecoupledWaitingScreen` in 2b/3 — pairing failure is invisible.

Files: `src/pages/SessionSetupPage.jsx` lines 77–107, `src/components/decoupled/DecoupledWaitingScreen.jsx`.

### M11. Visible-text vs. `aria-label` mismatch on action buttons

Consistent across all probes:

- Probe 1/2a/2b/3 Play button: visible "Play from here" / aria-label "Play scene N".
- Probe 2a Keep button: visible "Keep (tap to discard)" / aria-label "Mark scene for removal".
- Library upload button: visible "Upload Your Videos" / aria-label "Upload videos from your phone".

These mismatches break communication in a sighted-helper / BLV-creator dyad — the helper says one phrase, TalkBack speaks a different one.

Files: `src/components/probe1/Probe1SceneActions.jsx` line 67, `src/components/probe2/Probe2aSceneActions.jsx` line 116/157, `src/components/shared/VideoUpload.jsx` (verify).

### M12. Two transport mechanisms for Phase 2a → 2b state, undefined ordering

`Probe2bPage.jsx` reads from `localStorage['probe2a_project_state']` via `loadProjectState()` AND handles a `PROJECT_STATE_EXPORT` WS message. Both can fire and write to the same `editState`. If both fire the order is non-deterministic — the WS message may arrive after the localStorage load and silently overwrite (or be overwritten by) it.

Pick one mechanism, drop the other, or merge with explicit precedence.

Files: `src/pages/Probe2bPage.jsx` lines 73–89, 342–349.

### M13. `text-sm` / `text-xs` overrides override the global text-size preference

`AccessibilityProvider` sets `text-sm | text-base | text-lg` on the root div, but many child components hardcode `text-sm` (form labels, radio-group label, scene metadata) or `text-xs` (duration/date metadata, "Thinking…", GlobalControlsBar stats). Tailwind utility precedence means hardcoded child sizes win over the parent. So a participant who selected "large text" still gets small text in many places.

Files: many — start with `src/pages/SessionSetupPage.jsx` line 124/134, `src/components/shared/DetailLevelSelector.jsx` line 18, `src/components/shared/GlobalControlsBar.jsx` line 19.

### M14. "Edit-action" inference is unreliable

`detectEditAction` in `Probe2bPage.jsx` line 192 and `Probe3Page.jsx` line 183 compares clip counts and falls back to "made an edit" for many cases. The peer-awareness announcement to a BLV creator will frequently be the unhelpful "Helper made an edit." Use `summarizeEditStateChange` (which is already imported) consistently.

Files: `src/pages/Probe2bPage.jsx`, `src/pages/Probe3Page.jsx`.

---

## 3. Minor issues (m)

### m1. Researcher Dashboard link contrast fails AA

`text-gray-400` on `bg-gray-50` ≈ 2.5 : 1. Bump to `text-gray-600`. `src/pages/SessionSetupPage.jsx` line 152.

### m2. "Thinking…" indicator in VQA is `text-xs italic text-gray-400`

Too small / too low contrast for an a11y-first study. `src/components/probe1/Probe1SceneActions.jsx` line 91 and equivalent in Probe 2a/2b/3.

### m3. ARIA antipattern in VideoLibrary

`role="listbox"` with `<button role="option">` children. Listboxes expect option-role children with implemented arrow-key navigation. Currently users tab between the buttons. `src/components/probe1/VideoLibrary.jsx` line 129.

### m4. Browser-back-button history pollution

`SceneBlock.jsx` line 55 calls `window.history.pushState` on each expand but doesn't `popState` on collapse. Five expand/collapse cycles accumulate five history entries to back-button through.

### m5. `window.__vqaReceiveAnswer`, `window.__taskStatusUpdate`, `window.__aiEditReceive` global pollution

Race condition if the page remounts (e.g. researcher-driven NAVIGATE) — old handler may still be installed when new mount runs.

Files: `src/pages/Probe1Page.jsx`, `src/pages/Probe2Page.jsx`, `src/pages/Probe2bPage.jsx`, `src/pages/Probe3Page.jsx`.

### m6. Detail level naming inconsistency

Selector buttons read "Overview / Detailed / Technical" while `STUDY_PLAN.md` says "Brief / Standard / Detailed". Pick one and align across docs and code.

### m7. Probe 3 onboarding text identical to Probe 2b

The role-selector text on `/probe3` does not mention proactive AI suggestions — it's the same copy as Probe 2b. The defining feature of Probe 3 is invisible to participants until it fires.

### m8. Hardcoded `VIDEO_SUMMARIES` and `MOCK_DATES` keyed by sample IDs

If `descriptions.json` IDs ever change, summaries silently disappear. `src/components/probe1/VideoLibrary.jsx` lines 6–10, 36–40.

### m9. No upload-success announcement

`VideoLibrary.jsx`'s `handleUpload` doesn't `announce()`. A BLV user uploading via the file picker won't know it succeeded. `src/components/probe1/VideoLibrary.jsx` line 71.

### m10. No remote-NAVIGATE announcement

When the researcher pushes a `NAVIGATE` over WS, the participant's app silently swaps pages. Add a central `announce("Moving to next condition…")` in `App.jsx` before/after `navigate(msg.path)`.

Files: `src/App.jsx` lines 27–33.

### m11. Speech recognition may be Chromium-only

`useSpeechRecognition` relies on `webkitSpeechRecognition`. Will silently fail on non-Chromium iOS Safari. Confirm pilots use Chromium-based browsers or implement a fallback.

### m12. "Cancel handover" not available mid-transition in Probe 2a

Once `handleHandover` runs, `setIsTransitioning(true)` triggers `HandoverTransition` and then `setMode('helper')`. There is no recovery path if the creator realises they made a mistake. `src/pages/Probe2Page.jsx` line 159.

### m13. AI proposal in Probe 2a uses heuristic key matching

`handleAskAIEdit` in `Probe2Page.jsx` line 137 does `instruction.toLowerCase().includes(key.replace('_', ' '))`. Unrelated phrasings won't match, and the user will see "I can't do '...' directly." for many real instructions. Tune the matching or expand the prepared keys.

### m14. Ad-hoc `videoAnalysisService.js` is unwired

`CLAUDE.md` describes it as "currently unwired." Remove if not planned, or wire it; otherwise it's just dead weight.

---

## 4. Cross-cutting recommendations

1. **Run a Phase-0 spec / implementation reconciliation pass.** Many of the blockers above are not bugs but features that were planned, partially built, then disconnected. Update `STUDY_PLAN.md` and `CLAUDE.md` to match the current reality, OR finish the wiring. Do not run pilots while spec and code disagree.
2. **Pick one library phase, apply consistently.** Probe 1 has it; Probe 2a doesn't; Probe 2b/3 do. Either every probe respects the dyad's video selection or none does.
3. **Audit hardcoded text-size classes.** Search-and-replace `text-xs` and most `text-sm` in `src/components/**/*.jsx` and `src/pages/**/*.jsx`, then re-verify the global text-size preference actually scales the entire UI.
4. **Pilot the audio interaction flow with a TalkBack user before any participant.** B6 + M1 + M2 are likely to be cumulatively disorienting in ways code review can't fully predict.

---

## Appendix: what was tested live (vs. code-only)

| Probe | Live in browser | Code review |
|---|---|---|
| Session setup | ✓ | ✓ |
| Probe 1 — library + scene block + expand + Ask AI | ✓ | ✓ |
| Probe 2a — scene actions, Edit-by-Myself, Trim placeholder | ✓ | ✓ |
| Probe 2b — role selector, pairing handshake (two tabs), library | ✓ (pairing only) | ✓ |
| Probe 3 — role selector | ✓ (role select only) | ✓ |
| Researcher dashboard / WoZ panels | ✗ | partial |
| Pipeline upload UI | ✗ | ✗ |

The pipeline UI and researcher dashboard were not exercised in this pass and may surface additional findings.
