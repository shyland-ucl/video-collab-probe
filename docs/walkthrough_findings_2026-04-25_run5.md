# Prototype Walkthrough Findings — 2026-04-25 Run 5

Code-only audit against HEAD `b8276f5` ("codex"). The codex commit is undocumented in the session notes but lines up with the open Run 4 findings (B1 pipeline assignments, M1 helper false-lock warning, m1 Probe 1 copy drift) — verifying it is the primary purpose of this round, plus a fresh pass for new regressions.

Live browser testing was attempted via the Claude-in-Chrome extension but localhost permissions were denied at every layer. A partial live confirmation pass was completed via OS-level screenshots (Chrome at "read" tier in computer-use); two pages were inspected visually (`/`, `/probe1` library). The remaining live coverage was substituted with code-traced verification. Items confirmed live are marked **"live ✓"** in the regression table; everything else is code-traced.

## Regression checks (codex commit)

| Run 4 ID | Codex change | Code-traced verdict |
|---|---|---|
| **B1** Unassigned pipeline videos shown to every dyad | New `src/utils/pipelineAssignments.js` extracts the dyad-id and assignment helpers. `filterAssignedPipelineVideos` returns `[]` when `assignedProjectIds.length === 0`. All four probe pages (Probe1, Probe2, Probe2b, Probe3) now use it. | **Fixed (live ✓)** — `/probe1` with dyad "T1" (no pipeline assignments) shows only the 3 sample videos. |
| **M1** Helper editor announces control-lock error on load | `MockEditorVisual` adds `didNotifyMountRef` (skip first onEditChange after mount) and `suppressEditBroadcastUntilRef` (250 ms guard around hydration paths). Probe2bPage and Probe3Page add their own `suppressNonOwnerEditWarningUntilRef` (1 s) around state-import paths (Phase-2a load, EDIT_STATE_UPDATE, PROJECT_STATE_EXPORT, library import). `useTextOverlay` got the same `didNotifyMountRef` treatment. | **Fixed** (code-only). See N1/m1 below for a side-effect of the 1 s outer window. |
| **m1** Probe 1 copy still mentions edit/flag/Play All | `VideoLibrary` accepts a `selectionPrompt` prop; Probe 1 passes "Select the videos you want to explore with AI descriptions." (drops "and edit"). Exploration `OnboardingBrief` rewritten to "play that scene or ask AI a question" — no more "flag a description" or "Play All button". | **Fixed (live ✓)** — visible Probe 1 library prompt reads exactly the new copy. |

## Regression checks from prior rounds (still passing)

| ID | How verified |
|---|---|
| B6 collapsed scene-button label | `SceneBlock.jsx` aria-label still uses scene name + duration only (verified earlier in Run 3). |
| M4 heading hierarchy | `ConditionHeader` is a real `<h1>` (Session 6). |
| M5 Probe 2a library phase | `Probe2Page.jsx:42` initialises `phase='library'` and renders `VideoLibrary`. |
| M6 control lock | `ControlLockBanner.jsx` exists; `handleEditChange` in Probe2bPage / Probe3Page refuses to broadcast when `controlOwner !== role`. |
| M7 AI-failure system message | `Probe2Page.jsx:188-200` writes a yellow-amber "AI could not answer right now…" entry into `vqaHistories`. |
| B2 Probe 2a real edit ops | `Probe2aSceneActions.jsx` imports `trimClipStart`, `trimClipEnd`, `splitClip`, `moveClip`, `addCaption`, `addNote` from `sceneEditOps.js`. |
| NF2 StrictMode WS pairing | Auto-connect useEffect collapsed; verified live in Run 3. |

## Severity legend
- **B** (Blocker): distorts study results or blocks participation. Fix before any pilot.
- **M** (Major): meaningful UX, accessibility, or validity problem. Fix before main study.
- **m** (minor): polish / low-risk robustness.

## 1. Blockers (B)

### B1. (Carried forward, unfixed) Accessibility audio remains hidden and defaults off

This was Run 4's B2. The codex commit did not touch `SessionSetupPage.jsx` or `AccessibilityContext.jsx`. The session-setup form still exposes only the Dyad ID input and Start Session button. `audioEnabled` defaults to `false`, so all in-app TTS paths (`audioEnabled && ttsService.speak(...)`) are inert until someone manually edits `localStorage['accessibilitySettings']`.

**Live confirmed ✓** — screenshot of `http://localhost:5173/` shows only "Participant Dyad ID" input and "Start Session" button; no a11y settings UI present.

Files: `src/contexts/AccessibilityContext.jsx:15-19` (defaults), `src/pages/SessionSetupPage.jsx:119-147` (form).

Why it matters: the study protocol describes scene descriptions and AI answers being read aloud. For BLV creators using TalkBack on Android, this is the difference between "I hear AI's answer" and "TalkBack reads the system message about the AI answer" — fundamentally different UX. The fact that no setup-page UI exists also means researchers running back-to-back dyads have no in-app way to flip the switch per session. This is the single highest-impact open issue.

## 2. Major issues (M)

### M1. (Carried forward) Probe 3 proactive suggestions only fire for one of three sample videos

Run 4 didn't re-find this because the Probe 3 walkthrough used the Lakeside sample. The codex commit improved the structural plumbing — `Probe3Page.jsx:110-120` now aggregates suggestions across `selectedVideos` (which can include pipeline videos) — but the underlying data is unchanged.

```
video-sample  (Morning Coffee Routine):  0 suggestions
video-sample2 (Coffee Vlog):              0 suggestions
video-sample3 (Lakeside Adventure):       8 suggestions
```

Files: `public/data/descriptions.json` — only video-sample3 has a `suggestions[]` array; `src/pages/Probe3Page.jsx:341-365` (auto-deploy effect runs once per scene match).

Why it matters: if the dyad picks Morning Coffee Routine or Coffee Vlog (or any pipeline-uploaded video without authored suggestions), Probe 3 silently degrades to a basic decoupled-collaboration session — no proactive AI fires, defeating the entire research question for this condition. The researcher's WoZ "Compose ad-hoc suggestion" path is the documented mitigation (and is implemented), but it puts the burden on the researcher to be ready with a suggestion script for every non-Lakeside choice. Adding 4-6 suggestions each to the other two sample videos (and a `suggestions: []` field with placeholder text on pipeline videos) would close this without code changes.

## 3. Minor issues (m)

### m1. The 1-second `suppressNonOwnerEditWarning` window can swallow legitimate helper edit warnings

After any state-import event (Phase-2a load, peer EDIT_STATE_UPDATE, PROJECT_STATE_EXPORT, library import) the page sets a 1-second outer suppression window. During this window, `handleEditChange` returns silently when called by a non-owner — no announce(), no broadcast.

Between T+250 ms and T+1 s, the inner MockEditorVisual guard has expired but the outer page guard is still active. If the helper genuinely taps an edit button in that window, their edit silently does nothing and they hear no "Take control first" message. They get the worst of both worlds: the data is correctly refused, but the explanation is missing.

Files: `src/pages/Probe2bPage.jsx:222`, `src/pages/Probe3Page.jsx:209`.

Why minor: no data corruption (broadcast still refused), no incorrect state. The user just experiences "did my tap register?" for up to 750 ms after a peer broadcast. Fix options: tighten the outer window to ~300 ms (matching the inner), or rely on the inner MockEditorVisual guard alone since `MockEditorVisual` correctly distinguishes prop-driven vs user-driven changes.

### m2. DecoupledRoleSelector helper-button copy implies a "request control" flow that doesn't exist

The helper-role button reads "Visual-optimised interface. Can request control or work independently." But M6 was implemented as an immediate take-control gesture — `ControlLockBanner` shows a "Take control" button that fires `handleTakeControl` which sets `controlOwner = role` and broadcasts CONTROL_TAKEN. There is no request/grant negotiation; the helper just takes control and the creator's banner flips.

Files: `src/components/decoupled/DecoupledRoleSelector.jsx:58`, `src/components/decoupled/ControlLockBanner.jsx:62-66`, `src/pages/Probe2bPage.jsx:248-259`.

Why minor: the actual button text on the banner ("Take control") is correct; only the role-selector copy implies a different mental model. Fix by editing the role-selector helper description to "Visual-optimised interface. Can take control of the edits at any time."

### m3. (Carried forward, unfixed) DecoupledRoleSelector copy is identical for Probe 2b and Probe 3

The selector accepts a `condition` prop but only uses it for `<ConditionHeader condition={condition} />`. The `OnboardingBrief` description is a single hardcoded string regardless of which decoupled probe the user is entering. So when participants land on Probe 3, they get no advance signal that proactive AI suggestions will appear — neither in the role-select nor anywhere else.

Files: `src/components/decoupled/DecoupledRoleSelector.jsx:17-21`.

Why minor: the proactive AI feature still works once participants encounter it; this is a "no advance warning" issue, not a feature-broken one. Recommended fix: branch the `description` text on `condition` to mention "AI suggestions may appear during your session" for `probe3`.

### m5. Probe 1 library brief refers to an "Import" button but the actual button is "Create Project"

The Probe 1 library `OnboardingBrief` reads "...then tap **Import** to begin." But the live UI shows the action button labelled "**Create Project (N selected)**". Two different verbs for the same action.

**Live confirmed ✓** — screenshot of `/probe1` library shows brief mentioning "Import" while the button at the bottom reads "Create Project".

Files: `src/pages/Probe1Page.jsx:208` (brief text), `src/components/probe1/VideoLibrary.jsx:225` (button label).

Why minor: participants will work it out; but for screen-reader users hearing the brief, then tabbing to find an "Import" button that doesn't exist, this adds a small navigation cost. Pick one verb and align both copy points.

### m4. Helper sees nothing if creator's selected pipeline videos resolve to empty on the helper side

When the creator broadcasts `PROJECT_CREATED` with videoIds, the helper's resolution useEffect filters `allVideos` by those IDs:

```js
const resolved = allVideos.filter((v) => selectedVideos.includes(v.id));
if (resolved.length > 0) { /* build editState */ }
```

If `resolved.length === 0` (e.g., the creator and helper devices have different `dyadId`s in their `sessionConfig`, so they get different filtered pipeline lists), the effect silently does nothing. The helper page sits with an empty editor and no diagnostic.

Files: `src/pages/Probe2bPage.jsx:443-470`, `src/pages/Probe3Page.jsx:540-578`.

Why minor: this only happens under researcher mis-configuration (mismatched dyadIds). But in a back-to-back pilot where the researcher copies dyadIds between devices, a typo would be silent. Fix: announce("Could not load the creator's selected videos. Check that both devices are using the same Dyad ID.") in the empty-resolved branch.

## 4. Cross-cutting recommendations

1. **Land B5/B2-Run4 next.** It has been deferred for several sessions and remains the largest open accessibility risk. A minimal MVP is a four-control card on `SessionSetupPage` (text size radio, high-contrast toggle, audio toggle, speech rate slider) before the Start Session button — no need for a separate route. The state already persists via `AccessibilityContext`.
2. **Author Probe 3 suggestions for the other two samples.** Add 4-6 entries each to `video-sample` and `video-sample2` in `public/data/descriptions.json`, mirroring the `video-sample3` shape (`{ id, category, text, relatedScene }`). No code change. This converts B4 from "Lakeside-only" to "any sample works".
3. **Tighten or remove the outer `suppressNonOwnerEditWarning` window.** The inner `MockEditorVisual` 250 ms guard already handles the cascade-from-prop case correctly. The outer 1 s window is double-defence with a real cost (m1 above). Either tighten it to 300 ms or delete it and rely on the inner.
4. **Differentiate decoupled probe role-select copy.** Branch the `OnboardingBrief description` and helper-button subtitle on `condition`. Tiny change, big clarity win for participants.
5. **Spec/code reconciliation pass for STUDY_PLAN.md.** Verify each interaction the protocol promises (e.g. "speech rate slider" in the session-setup section) against the actual UI. The recurring "copy promises X, code does Y" findings suggest the protocol doc is drifting ahead of the prototype.

## Appendix: what was tested live vs. code-only

| Probe / area | Live | Code | Notes |
|---|---|---|---|
| Codex commit verification (B1, M1, m1) | partial | yes | B1 + m1 visually confirmed via screenshot of `/probe1` library; M1 helper-mount fix code-only (would need 2-tab pairing). |
| Session setup | yes (screenshot) | yes | Screenshot confirms no a11y prefs UI present, B1-Run5 (audio-off blocker) still open in live build. |
| Probe 1 | partial | yes | Library phase live-confirmed via screenshot — selectionPrompt copy + 3-sample-only + Probe 1 header rendered; exploration-phase scene blocks code-only. |
| Probe 2a | no | yes | Library phase + `sceneEditOps.js` import paths confirmed in source. |
| Probe 2b | no | yes | Control lock + suppression windows traced through `handleEditChange`. |
| Probe 3 | no | yes | Suggestion aggregation refactor confirmed; data gap remains. |
| Researcher dashboard | no | no | Not exercised this round. Flag for next round. |
| Pipeline upload/review UI | no | no | Not exercised this round. Flag for next round. |

### Live coverage limitations

Claude-in-Chrome MCP rejected every `navigate`, `read_page`, `get_page_text`, and `javascript_tool` call against `localhost` even after the user disabled "Ask before acting" and moved the dev-server tab into a new window. The denial happened at the extension layer with no visible permission popup to actively allow. As a fallback, OS-level screenshots via the computer-use MCP were used — Chrome is granted at "read" tier so screenshots work, but no clicks/typing into the browser are possible. This produced two live confirmations (SessionSetupPage and Probe 1 library) before the user's clicking budget was exhausted.

Recommend for next round: investigate the Claude-in-Chrome extension allowlist for localhost specifically. The extension may have a separate "always block" entry for localhost that overrides the side-panel "Ask before acting" toggle. Resetting the extension's site permissions or running the dev server with a non-localhost hostname (e.g. via the existing `npm run dev:tunnel` cloudflared script) should unblock interactive testing.
