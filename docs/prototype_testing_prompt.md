# Prompt: Test the Video-Collab-Probe Prototype

Copy this entire file (or its contents) into a fresh agent session. The agent should follow the methodology below to produce a usability / accessibility / study-validity audit of the prototype, in the same style as the existing reports under `docs/walkthrough_findings_*.md` and `docs/walkthrough_session*.md`.

---

## Mission

You are auditing a research prototype for a study about collaborative video editing between blind / low-vision (BLV) creators and sighted helpers. The audit is **not** a generic UX review. Your job is to surface issues that materially affect:

1. The accessibility experience for BLV creators using TalkBack on Android — the study's primary device target.
2. The study's internal validity — does the prototype actually produce the behaviours the research questions need? (Findings, log events, probe-specific affordances.)
3. The Wizard-of-Oz (WoZ) illusion — can the WoZ flow plausibly stand in for AI?
4. The cross-device coordination in Probes 2b and 3 — does the WebSocket relay pair, sync, and route correctly?

Findings that don't connect back to one of those four lenses are probably not worth flagging.

---

## Project context (very brief — read more in repo if needed)

- Repo: `C:\Users\shyla\OneDrive\Документы\GitHub\video-collab-probe`
- Stack: React 19 + Vite 7, Tailwind v4. Pure JavaScript (no TypeScript).
- Four conditions in fixed order: `probe1` (Solo AI exploration) → `probe2a` (Co-located handover, single device) → `probe2b` (Decoupled, two devices) → `probe3` (Proactive AI, two devices). Plus a researcher dashboard and a footage upload pipeline.
- Mobile-first; participant routes target phones, the researcher dashboard targets desktop.
- WoZ pattern: a researcher on `?mode=researcher` can override AI answers, push suggestions, and inject edits.

For more depth, read in this order before any audit work:

1. `CLAUDE.md` — source of truth for what the prototype is supposed to do.
2. `STUDY_PLAN.md` — user-facing description of each condition. Differences between this and the live UI are findings.
3. `docs/PROTOTYPE.md` — theoretical framing.
4. `docs/walkthrough_findings_2026-04-25.md` and any later-dated reports — known issues. **Don't re-find these unless you're asked to verify whether they're fixed.**
5. `git -C <repo> log --oneline -20` — what's changed since the prior reports were written.

---

## Setup before anything else

1. Tell the user to run the dev server **locally** on their machine — not in any sandbox you might have. Vite chokes on the OneDrive mount permissions and most sandboxes kill background processes. The command is `npm run dev` from the repo root; Vite prints `http://localhost:5173/`. Wait for the user to say "ready".

2. Decide whether you need one or two browser clients:
   | Probes in scope | Setup |
   | --- | --- |
   | Only Probe 1 or Probe 2a | One browser tab. |
   | Probe 2b or Probe 3 in scope | **Two browser tabs / clients.** These are decoupled probes; without two clients you only see the role-selector and "Waiting" screen. |

3. Use whatever browser-driving tool you have (Claude in Chrome, Playwright, Puppeteer, etc.) to navigate to `http://localhost:5173/`. If you can drive multiple tabs in the same browser, do so for two-client testing. If you can only drive one, instruct the user to drive the second and you focus on the first.

4. Resize to ~400×900 if you can — it's a mobile-first app — but don't sweat it if Chrome enforces a min width.

---

## Scoping (use a multi-question prompt before touching anything)

Ask the user via a structured multiple-choice prompt (use whatever clarification tool you have) the following four things. Don't ask about tooling — that's settled above.

1. **Probes in scope** (multi-select): Probe 1 / Probe 2a / Probe 2b / Probe 3.
2. **Focus** (multi-select): accessibility / study validity / UX / technical robustness.
3. **Depth** (single): quick sanity check (~10 min) / step-by-step playthrough (~30 min, default) / deep audit with written report (~60+ min).
4. **Verification target** (single): fresh audit / verify previously-flagged findings. Skip if there is no prior findings doc.

If `Probe 2b` or `Probe 3` is in scope, confirm the user can supply a second browser client for pairing.

---

## Per-probe checklists

For each probe in scope, the loop is:

1. Navigate to the route and read the page's accessibility tree.
2. Take a screenshot for visual context.
3. Click into the most consequential affordance for that probe (see lists below).
4. **Verify clicks actually do something.** Compare before/after screenshots. Buttons that fire log events but produce no UI change are findings — Probe 2a's `Trim/Split/Move/Add Caption/Add Note` were caught this way.
5. Read the relevant component source. Many findings are only visible in code: unwired components, race conditions in `useEffect`, hardcoded keys, dead transports, silent error swallowing.
6. Cite findings with file path **and line number**. Without these, findings aren't actionable.

### Probe 1 — `/probe1`

Library phase:
- VideoLibrary should use `role="group"` with `aria-pressed` buttons (post-fix; older code had the listbox+option antipattern).
- Pipeline videos load alongside sample videos via `loadPipelineVideos` (filter by `localStorage['pipelineAssignments'][dyadId]`).

Exploring phase (the critical surface):
- The collapsed scene-block button's `aria-label` should NOT contain the full description (post-B6 fix). If it does, the granularity affordance is broken. Check `src/components/shared/SceneBlock.jsx` ~line 83.
- TTS / live-region / TalkBack collision when expanding a scene — code-only verification of the speak/stop/announce flow in `SceneBlock.jsx`.
- Auto-expand-during-playback in `SceneBlockList.jsx` lines 69–78: does it interrupt reading?
- `OnboardingBrief` is intentionally inline-and-permanent (a11y choice — don't flag it as a bug; see `docs/walkthrough_findings_2026-04-25.md` M3 annotation).
- Mark/Flag and Edit + Play All are intentionally NOT in Probe 1 (B1 is annotated as a deliberate scoping choice — Probe 1 is information access only). Don't flag these as missing.
- Visible vs. aria-label mismatches on the Play button — should match (post-M11 fix).
- The "Researcher Dashboard" link on `/` (session setup) should pass AA contrast (post-m1; expect `text-gray-600`).

### Probe 2a — `/probe2`

- Should now have a **library phase** (post-B3-with-library): the dyad picks footage before entering the explorer. If you land directly in a 15-scene explorer, the library phase has regressed.
- Click any scene → expand → "Edit by Myself".
- The Trim / Split / Move / Add Caption / Add Note buttons should produce **visible state changes** (post-B2). Trim shows status like "Trimmed from start: 0.5s · from end: 0.0s". Split inserts a new clip. Move reorders. Captions and notes accumulate per scene. If any of these are silent placeholders, B2 has regressed.
- "Keep (tap to discard)" / "Discarded (tap to keep)" should have aria-label aligned with visible text (post-M11).
- "Ask Helper" → opens `TaskRouterPanel`. Verify form is reachable.
- Mid-handover, a "Cancel handover" button should appear during the toHelper transition (post-m12). Timer is ~2.5s.

### Probe 2b — `/probe2b` (two clients required)

- Use the URL deep links: tab A on `?role=creator`, tab B on `?role=helper`. Both should auto-pair within ~3s and advance to library together (post-NF2 — if they sit on "Waiting" forever, the StrictMode-safe useEffect collapse has regressed; check `Probe2bPage.jsx` for `didAutoConnect` — should NOT be present).
- After pairing, the active phase should show a **control-lock banner** (post-M6). Creator sees "You have control of the edits."; helper sees "Creator has control" + "Take control" button.
- If the helper taps Take control, both banners flip and only the helper's edits propagate via `EDIT_STATE_UPDATE`.
- After ~10s waiting alone (before the helper joins), a "Trouble connecting?" banner should appear with a Refresh button (post-NF1.1).
- Pipeline videos load (post-B3-narrow): grep `loadPipelineVideos` in `Probe2bPage.jsx` should find the call.
- Awareness messages on edits should be specific (post-M14): "Helper added a caption" / "Helper trimmed a clip" rather than the old fallback "Helper made an edit".

### Probe 3 — `/probe3` (two clients required)

- Same role-selector and pairing flow as 2b.
- Same control-lock banner (post-M6).
- Same pipeline-video loading (post-B3-narrow).
- The proactive-AI auto-deploy fires when the creator's currentSegment matches a `relatedScene` in any selected video's `suggestions` data. Sample videos: only Lakeside has prepared suggestions. Pipeline videos have no suggestions data, so auto-deploys won't fire — but the **researcher WoZ panel always exposes a "Compose ad-hoc suggestion" form** (post-B4) so manual deploys work for any selected video. Verify the compose form is reachable on `/probe3?role=creator&mode=researcher`.
- Suggestion routing chain (`SUGGESTION_DEPLOYED` → `SUGGESTION_ROUTED` → `HELPER_SUGGESTION_RESPONSE` → `SUGGESTION_CHAIN_COMPLETE`) is well-instrumented in events. Acknowledge as a strength.

### Researcher dashboard (optional, only if depth = deep audit)

- `/researcher` and `/probeN?mode=researcher` overlay WoZ panels.
- Verify `window.__vqaReceiveAnswer`, `window.__aiEditReceive`/`__aiEditResponse` round-trip cleanly. (These globals are a known minor issue — m5 — but kept for now.)
- AI-failure recovery: when Gemini errors, a yellow "AI could not answer right now. Researcher is checking your question." chat bubble appears (post-M7); the researcher's WoZ override appends the real answer afterwards. Verify by triggering a VQA without `VITE_GEMINI_API_KEY` set, or by mocking a failure.

---

## Common pitfalls to avoid

- **Don't run the dev server in your own sandbox.** Vite cache fails on the OneDrive mount and most sandboxes kill processes between calls. The user runs it locally; you drive the browser via your tools.
- **Don't trust `read_page` / page snapshots to find every interactive element on first read.** They're depth-limited. Use natural-language `find` queries for specific affordances.
- **Don't skip the code review.** Many of the most important findings are only visible in the source — unwired components, race conditions, hardcoded keys, silent error swallowing. The browser tells you what the user sees; the code tells you what they *won't* see when something fails.
- **Don't paste long findings inline in chat.** Write to a markdown file in `docs/` and reference it. Chat output should be a brief summary.
- **Don't forget to cite file:line for every finding.** It's the difference between a useful report and a frustrated researcher.
- **Don't re-find issues already in `docs/walkthrough_findings_*.md`.** Use them as a known-fix checklist instead. Each finding should be either a fresh discovery or a verification of a documented one.
- **B1 (Mark/Flag/Edit/PlayAll missing in Probe 1) and M3 (OnboardingBrief inline-permanent) are intentional design choices.** Don't flag them as bugs.

---

## Output format

Write findings to `docs/walkthrough_findings_<YYYY-MM-DD>.md` with this structure:

```markdown
# Prototype Walkthrough Findings — YYYY-MM-DD

[1-paragraph context: who walked through, what was tested live vs. code-only.]

## Severity legend
- B (Blocker): distorts study results or blocks participation. Fix before any pilot.
- M (Major): meaningful UX, a11y, or validity problem. Fix before main study.
- m (minor): polish / low-risk robustness.

## 1. Blockers (B)
### B1. <title>
<one paragraph description>

Files: `src/path.jsx` line N.

Why it matters: <link to study consequence or BLV experience>

(repeat)

## 2. Major issues (M)
(same pattern)

## 3. Minor issues (m)
(same pattern)

## 4. Cross-cutting recommendations
<strategic suggestions>

## Appendix: what was tested live vs. code-only
| Probe | Live | Code |
| --- | --- | --- |
| ... | ✓ | ✓ |
```

Rules:
- Always cite file path + line number.
- "Why it matters" must connect to a research question or BLV experience.
- Don't pad the report with already-documented findings; reference them instead.
- For verification runs, use a single table at the top: `| ID | how verified | result |` so the user can scan known-fixes-still-fixed in 30 seconds.

---

## Wrap-up

End with a short conversational summary:
- The 2–3 most consequential findings (one line each).
- 1–2 things you didn't cover (researcher dashboard, pipeline UI, etc.) — flag for next time.
- Offer concrete next steps: walk through what wasn't covered, fix specific blockers, or verify a previous fix.

Don't repeat the markdown findings inline in chat. Provide a clickable file link (e.g. `computer://<absolute path>`) so the user can open it directly. **Don't** use `present_files` if the path contains Cyrillic — it fails on this repo's path. Use a plain markdown link.

---

## Already-known issues snapshot (as of 2026-04-25)

If the user is running a verification pass rather than a fresh audit, these have all been fixed and merged or staged across PRs `fix/nf2-strictmode-ws-pairing`, `fix/nf1-b3`, `fix/m14-b4-b3-library`, and a session-6 batch (M6 / B2 / M3 annotation / M4 / M7 / M8 / m2 / m3 / m6 / m12 / m14):

- NF1 (pairing failure recovery banner + WS heartbeat eviction + diagnostic logging)
- NF2 (StrictMode-safe WS auto-connect)
- B2 (real Edit-by-Myself in Probe 2a)
- B3 (pipeline videos in 2a / 2b / 3)
- B4 (proactive AI for any selected video + ad-hoc compose form)
- B6 (scene-button aria-label no longer dumps description)
- M4 (heading hierarchy)
- M6 (control lock)
- M7 (AI-failure UI cue)
- M8 (announce queue)
- M9 (`aria-atomic` on live region)
- M11 (Play button label alignment)
- M14 (`summarizeEditStateChange` instead of clip-count heuristic)
- M5 partial (Probe 2a library phase, via B3-with-library)
- m1 (Researcher Dashboard contrast)
- m3 (VideoLibrary ARIA antipattern)
- m4 (history pollution on scene expand)
- m6 (detail-level naming)
- m9 (upload-success announcement)
- m10 (NAVIGATE announcement)
- m12 (cancel-handover button)
- m14 (videoAnalysisService.js deletion)

**Annotated as intentional, not bugs:** B1 (Probe 1 scope), M3 (OnboardingBrief inline-permanent).

**Still open** at session 6 wrap: B5 (a11y prefs UI), M1 (TTS collision), M2 (auto-expand-during-playback), M12 (state-transport unification), M13 (text-size sweep), m5 (window globals), m8 (hardcoded summaries), m11 (speech recognition fallback), m13 (AI proposal heuristic). Each is deferred for a focused future PR; reasoning in `docs/walkthrough_session6_changes_2026-04-25.md`.
