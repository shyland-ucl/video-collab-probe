# Prototype Walkthrough Method

A reusable playbook for running an accessibility / UX / study-validity walkthrough of this prototype with an AI agent (Claude). Distilled from the first walkthrough on 2026-04-25; see `walkthrough_findings_2026-04-25.md` for the findings produced.

The corresponding agent skill is `video-collab-probe-walkthrough` — installing it makes Claude follow this exact method by default whenever you ask for a walkthrough. This document covers the same ground in human-readable form.

---

## Why this document exists

Generic UX audits miss what matters in this study. We are testing a prototype that:
- Targets blind / low-vision (BLV) creators using TalkBack on Android phones.
- Is structured around a within-subjects four-condition study (Probe 1 → 2a → 2b → 3).
- Uses Wizard-of-Oz to simulate AI features in some places.
- Coordinates two devices via a WebSocket relay in Probes 2b and 3.
- Has a footage pipeline that ingests participant footage and generates AI descriptions.

A walkthrough that only catches "low contrast on a button" is missing 90 % of the risk. The findings that matter are the ones that distort study results, break the WoZ illusion, fail TalkBack, or silently degrade because of spec/implementation drift.

---

## Setup

1. Make sure the dev server is running locally:
   ```
   cd <repo root>
   npm run dev
   ```
   Vite prints `http://localhost:5173/`. Leave the terminal open for the duration.

2. Decide whether you need one or two clients:

   | Probes in scope | Browser setup |
   |---|---|
   | Probe 1 only | One browser tab. |
   | Probe 2a only | One browser tab. |
   | Probe 1 + Probe 2a | One browser tab; navigate between routes. |
   | Probe 2b or Probe 3 | **Two browsers / two tabs.** These are decoupled two-device conditions. The creator and helper pair over the WS relay. Without two clients you only see the role-selector and "Waiting for helper" screen. |
   | All four | Single tab for 1 + 2a, then add a second client for 2b + 3. |

   For the two-client setup, two tabs in the same Chrome window is enough for the WS pairing handshake, but if you want to drive both with an agent, the second client needs to be in a separate Chrome window — Claude-in-Chrome currently exposes only one tab at a time per MCP group.

3. If using an AI agent (Claude-in-Chrome), connect Chrome via the extension first, then have the agent navigate to `localhost:5173`.

---

## The walkthrough loop

### Step 1 — Re-orient

Read these in this order before doing anything:
- `CLAUDE.md` — what the prototype is supposed to do.
- `STUDY_PLAN.md` — user-facing description of each condition. *Differences between this and the live UI are findings, not bugs to ignore.*
- `docs/PROTOTYPE.md` — theoretical framing.
- Prior `docs/walkthrough_findings_*.md` — don't re-find issues already documented unless verifying a fix.

A `git log --oneline -20` since last walkthrough surfaces what changed.

### Step 2 — Scope the session

Pick before starting (the agent should ask you these via AskUserQuestion):
- **Which probes** are in scope.
- **Focus** — accessibility / study validity / UX / technical robustness (any combination).
- **Depth** — quick sanity check, step-by-step playthrough, or deep audit with written report.
- **Verification target** — fresh audit or verify previously-flagged findings.

### Step 3 — Walk through each probe

For each probe, the loop is:
1. Navigate to the route. Take a screenshot. Read the accessibility tree.
2. Click into the most consequential affordance for that probe (see checklists below).
3. **Verify clicks actually do something.** Compare before/after. Buttons that fire log events but produce no UI change are findings — we caught Probe 2a's Trim/Split/Move/Add Caption/Add Note this way.
4. Read the relevant component source. Many findings are only visible in code: unwired components, race conditions in `useEffect`, hardcoded keys, silent error swallowing.
5. Cite findings with file path + line number.

### Per-probe checklists

These come from the first walkthrough. Verify each one is still present on subsequent runs.

#### Probe 1 — `/probe1`

Library phase:
- VideoLibrary uses `role="listbox"` with `<button role="option">` children — ARIA antipattern.
- VIDEO_SUMMARIES / MOCK_DATES are hardcoded by sample ID.
- Upload-success doesn't `announce()`.

Exploring phase (the critical surface):
- Scene-block `aria-label` dumps the full description (`SceneBlock.jsx` line 74) — kills granularity.
- TTS / live-region / TalkBack collision on expand (`SceneBlock.jsx` lines 36–46 + 70).
- Auto-expand-during-playback yanks reading focus (`SceneBlockList.jsx` lines 69–78).
- `OnboardingBrief` is permanent inline, not the dismissible overlay the spec describes.
- Heading hierarchy: only `<h1>` is `sr-only`.
- ~~Mark/Flag and Edit buttons are missing~~ — resolved as intentional (2026-04-25). Probe 1 is scoped to information access only; editing belongs to Probes 2a/2b/3. Don't re-flag this.
- ~~"Play All" button is mentioned in the onboarding text but never implemented~~ — same scoping. Onboarding text should be cleaned up to remove the mention.
- Visible-vs-aria-label mismatch on Play button: "Play from here" / "Play scene N".
- Pipeline videos: confirm `Probe1Page` calls `loadPipelineVideos` (it should — Probe 2a/2b/3 don't, which is a separate finding).

#### Probe 2a — `/probe2`

- No library phase — the dyad doesn't get to pick footage. CLAUDE.md says they should.
- All sample videos auto-loaded (15 scenes from 3 sources).
- Click any scene → expand → "Edit by Myself".
- Click Trim. Compare before/after screenshots — **identical**. Same for Split, Move, Add Caption, Add Note. They log events but do nothing visible.
- "Keep (tap to discard)" button: visible/aria mismatch.
- "Ask Helper" → TaskRouterPanel. Confirm it opens.
- No "cancel handover" mid-transition.

#### Probe 2b — `/probe2b` (two clients)

- Drive client A: Creator → "Waiting for helper".
- Drive (or have user drive) client B: Helper.
- Both should advance to library together. Confirm via screenshots.
- Creator selects video, taps Create Project. Helper should see the same project.
- **NF2 regression check:** `grep -n didAutoConnect src/pages/Probe2bPage.jsx src/pages/Probe3Page.jsx` should return nothing. If it returns matches, the StrictMode-safe fix has been reverted and the WS auto-connect is broken again. URL deep links (`?role=creator`) will silently fail with both sides stuck on "Waiting" forever.
- Code review focus:
  - `detectEditAction` falls back to vague "made an edit" frequently (`Probe2bPage.jsx` line 192).
  - No control lock — last-write-wins on simultaneous edits.
  - Two transports for Phase 2a → 2b state (localStorage + WS message), undefined ordering.
  - `window.__taskStatusUpdate` global pollution.
  - Pipeline videos ignored.

#### Probe 3 — `/probe3` (two clients)

- Same role-selector / pairing as 2b.
- **Defining feature is fragile**:
  - Suggestions pre-authored per video in `descriptions.json` — currently only Lakeside Adventure has any.
  - Auto-deploy fires only when `currentSegment` matches a suggestion's `relatedScene`.
  - If the dyad picks any other video, no proactive AI fires at all.
  - Pipeline videos have no `suggestions` field — Probe 3 silently degrades.
  - Onboarding role-selector copy is identical to Probe 2b.
- Suggestion routing chain (SUGGESTION_DEPLOYED → ROUTED → HELPER_RESPONSE → CHAIN_COMPLETE) is well-instrumented — acknowledge as a strength.

#### Researcher dashboard — `/researcher` or `/probeN?mode=researcher`

Skipped in first walkthrough. Worth a deep audit:
- `window.__vqaReceiveAnswer` round-trip.
- `window.__aiEditReceive` / `__aiEditResponse`.
- Suggestion deployment from `ResearcherSuggestionPanel`.
- AI-failure recovery flow (Gemini errors → researcher takeover handoff).

---

## Output format

Write findings to `docs/walkthrough_findings_<YYYY-MM-DD>.md` with this structure:

```markdown
# Prototype Walkthrough Findings — YYYY-MM-DD

[Context paragraph: who walked through, what was live vs. code-only.]

## Severity legend
- B (Blocker): distorts study results or blocks participation. Fix before any pilot.
- M (Major): meaningful UX, a11y, or validity problem. Fix before main study.
- m (minor): polish / low-risk robustness.

## 1. Blockers (B)
### B1. Title
[Description]

Files: src/path.jsx line N.

Why it matters: [explicit link to study consequence or BLV experience]

## 2. Major issues (M)
[same pattern]

## 3. Minor issues (m)
[same pattern]

## 4. Cross-cutting recommendations
[Strategic suggestions]

## Appendix: what was tested live vs. code-only
[Table.]
```

**Rules:**
- Always cite file path + line number. Without these, findings aren't actionable.
- "Why it matters" must link the issue to a research question or BLV experience. If you can't articulate it, the finding probably isn't a blocker or major.
- Don't re-find issues already in prior findings docs. Reference them.
- Group by severity, not by probe.

---

## Common pitfalls to avoid

- **Don't run the dev server in a sandbox** that uses the OneDrive mount — Vite's cache fails on permissions. Run it locally on Windows.
- **Don't trust the page snapshot to find every element** — depth-limit it. Use natural-language search ("Find the Trim button") for specific affordances.
- **Don't skip the code review.** The browser tells you what the user sees; the code tells you what they won't see when something fails (errors swallowed, components unimported, transports racing).
- **Don't paste long findings inline in chat.** Write to the markdown doc. Keep chat brief.
- **Don't undertrigger the methodology.** Anything that smells like "review the prototype" should follow this loop, not a generic UX audit.
- **Don't forget the dyad context.** A "Play from here" button that says "Play scene 1" to TalkBack is a *communication* problem in a sighted-helper / BLV-creator dyad, not just a label inconsistency.

---

## Cadence

After each round of fixes, re-run the walkthrough scoped to the changed probes only. The first walkthrough was comprehensive (all four probes); subsequent runs should be shorter and verification-focused.

Recommended schedule:
- After major refactors → full walkthrough.
- After targeted fixes → scoped to affected probes, with explicit verification of the fixes from the prior findings doc.
- Before each pilot → quick sanity check on all four probes plus researcher dashboard.
- Before main study → deep audit including pipeline UI and researcher dashboard.
