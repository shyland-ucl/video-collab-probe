---
name: process-participant-footage
description: Use when a participant has uploaded video footage via the pipeline and the researcher needs to review and finalize it before a study session. Triggers when a new project appears under footage_workspace/, when the researcher mentions a participant or session date, when descriptions have just been generated, or when the user types /process-participant-footage.
args:
  - name: project-id
    description: The workspace folder name under footage_workspace/ (e.g. VID-20260429-WA0003_1__moq4eplt). Required.
    required: true
  - name: probe3
    description: Set if this is the participant's Probe 3 video — triggers suggestion-bank generation.
    required: false
user-invokable: true
---

# Process participant footage

Per-participant footage prep for the BLV creator + sighted helper study. Walks through reviewing AI-generated scene descriptions, applying researcher-led corrections, and (for the Probe 3 video) generating a suggestion bank via Gemini web.

## When to invoke

- Participant's video has been uploaded and the pipeline has produced descriptions (`status.descriptions_generated: true` in `project.json`).
- The researcher mentions a participant by name, dyad code, or session date.
- A new directory appears under `footage_workspace/`.
- User types `/process-participant-footage <project-id> [--probe3]`.

## What this does

- Audits generated descriptions against four known failure modes (see table below).
- Proposes per-segment edits, with the **researcher** supplying the verified activity context (the AI cannot infer it from a still keyframe).
- Updates `ai_title`, `ai_summary`, and sets `manually_edited: true` on every touched segment.
- (`--probe3` only) Builds the Gemini Studio paste block for suggestion-bank generation; reviews the JSON output the researcher pastes back; links the bank into `project.json`.

## What this does NOT do

- Does not regenerate descriptions — that's the researcher's call via re-upload or `POST /api/pipeline/projects/:id/generate_descriptions`.
- Does not invent activity context. If the model says "performing on stage", ASK the researcher whether it's singing, keynoting, dancing, etc. Never guess.
- Does not call Gemini for the suggestion bank. The researcher runs that step on Gemini web (aistudio.google.com) and pastes the output back.

## Per-participant workflow

### Step 1 — Audit

Read `footage_workspace/<project-id>/project.json`. Scan every segment's L1/L2/L3 against the four failure modes. Report findings as a compact per-segment delta — don't dump full descriptions.

| Failure mode | Look for in descriptions | Single-pass-fixable? |
|---|---|---|
| **Audio-blind misread** | Any assertion of "speaking" / "singing" / "talking" / "shouting" / "addressing the audience" — the model has no audio access on still keyframes | Yes — researcher supplies activity |
| **Hallucinated text** | Confident transcription of brand names / event names / signage; year mismatches; "AFROGA" / "AFRIQ" / similar near-misses | Yes — manual fix |
| **Cross-segment inconsistency** | Same person described as "dark hair" in one scene and "bald" in another; same lighting called "magenta" in one segment and "warm-tinted" in another; prop shape flips (hexagonal/octagonal) | Partial — fix obvious cases; full fix needs two-pass anchor (out of scope) |
| **Redundant re-description** | Long video of one continuous shot produces N near-identical descriptions | No — consider re-segmenting the video via the review UI if it hurts Probe 1/2a/2b granularity exploration |

### Step 2 — Apply researcher corrections

If the researcher hasn't already told you the verified activity context, ASK: *"What is this person actually doing in the video?"* Wait for the answer.

Then for each affected segment:
- Replace the model's neutral verbs ("performing on stage", "addressing the audience", "holding a microphone close to the mouth") with the verified activity ("singing into a microphone", "delivering a keynote", "dancing", etc.).
- Fix factual errors flagged in Step 1 (year, hair/beard, hallucinated text — substitute correct text or hedge as `text not clearly legible`).
- Update `ai_title` and `ai_summary` to reflect the verified activity.
- Set `manually_edited: true` on every modified segment.

**Tooling preference:** use `Edit` (surgical, preserves audit trail in diffs). Reach for `Write` only if more than half the segments need rewrites.

### Step 3 — (Probe 3 only) Build the Gemini Studio paste block

Read `pipeline/prompts/suggestion_bank_generation.txt`. Concatenate it with the segments-list block in this exact shape (zero-based `index` = array position, NOT the project.json's 1-based `index` field):

```
================================================================
SEGMENTS LIST FOR THIS VIDEO
================================================================

segments: [
  {"id": "seg_001", "index": 0, "label": "Scene 1", "start_seconds": 0, "end_seconds": 5},
  ...
]
```

Hand the full assembled block to the researcher with the source video path: `footage_workspace/<project-id>/original/source.mp4`. They paste into Gemini web, upload the video, run.

### Step 4 — Review and link the bank

When the researcher pastes the JSON output back, review for:

- **`relatedScene` precision** — model often over-attributes (e.g. tags `[0,1,2,3]` when only scenes 0 and 3 actually have the issue). Cross-check against the reviewed descriptions and tighten.
- **Activity-naming drift** — the prompt forbids "speaker"/"spoken interaction", but residual instances may slip through. Rephrase with researcher input.
- **Soft directives** ("could be trimmed", "might need to be smoothed") — acceptable; they read naturally with all four routes.
- **Within-bank duplication** — multiple suggestions saying the same underlying thing about the video. Drop duplicates per the prompt's rule 8.

Add the curated bank to `project.json` at the top level under `"suggestions": [...]`. The existing `pipelineApi.js` mappers (both `loadPipelineVideos` and `uploadAndProcess`) already surface `project.suggestions`, and `Probe3Page.jsx` merges into `videoSuggestions` — no further wiring needed.

## Verification

After processing, confirm:

- All reviewed segments have `manually_edited: true`.
- `ai_title` and `ai_summary` reflect verified activity.
- (Probe 3 only) `suggestions` array has 6–8 items; all `relatedScene` indices are valid (zero-based, in range, point to real segment array positions).
- `npm run build` passes.
- Optionally: load `/researcher`, assign the project to a dyad, load the relevant probe page, confirm suggestions deploy.

## Common mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Editing without verified activity context | You write speculative narrative ("the singer dances around stage") | Always ask the researcher first |
| Using project.json's 1-based `index` for `relatedScene` | Suggestions misroute by one scene | Use array position (zero-based) for `relatedScene` |
| Forgetting `manually_edited: true` | Pipeline regen overwrites your edits | Set the flag on every touched segment |
| Skipping the segments list in the Gemini paste | `{"error": "segments list required"}` returned | The prompt's defensive check fires; re-paste with the segments block |
| Pasting Gemini output verbatim without `relatedScene` review | Suggestions over-attribute and route to wrong scenes | Always cross-check against your reviewed descriptions before linking |

## When the prompt itself is the problem

If Gemini banks across multiple participants show the same systemic flaw (e.g. consistently inert observations, or category drift), patch `pipeline/prompts/suggestion_bank_generation.txt` rather than fixing each output by hand. Document the new rule there with a GOOD/BAD example, then re-run for the affected video.
