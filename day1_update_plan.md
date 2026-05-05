# Day 1 Update Plan: video-collab-probe

**Source:** Day 1 morning session (David + Mary) and afternoon session (Lily + Naomi), 4 May 2026, plus Lan's in-room notes.
**Buffer day:** Tuesday 5 May. Next field day: Wednesday 6 May (2 dyads).
**Last updated:** Tuesday 5 May 2026 evening, after afternoon session review.

Scope of "must ship" is whatever the next morning dyad will hit. Anything that affects how Probe 1, 2a, 2b, or 3 *feels* during the run is P1. Anything that affects only researcher tooling or polish is P2 or later.

File paths below are best guesses; verify against actual `src/` before editing. Read source files, not `CLAUDE.md`.

---

## P1: Ship before May 6 morning session

### 1. Fix video player to top half of editing views
- **What:** Video player and its play/pause controls remain pinned at the top half of the screen across editing surfaces. Description panel, edit controls, and AI/helper interaction collapse below it. Controls must remain visible and tappable after any edit completes (this is what was missing in Probe 2a after Mary's brightness change and after AI's zoom).
- **Where (verify):** likely shared layout in `src/components/decoupled/` plus the Probe 2a co-located view. Look for the scene container component used in both 2a and 2b.
- **Source:** Lan note 1; transcript [00:59:25] David: "We minimize everything, now we see the video itself", [01:21:49] David after AI edit: "AI has edited these things, but we cannot see what he has done... There's no place to play."
- **Note:** Applies to Probe 1 as well, not just editing views.

### 2. Add "Play this scene" button alongside "Play from here"
- **What:** Two distinct buttons. "Play from here" keeps current behaviour (continuous through to end of video). "Play this scene" loops the current scene only and stops at the scene boundary. Both visible after any edit.
- **Where (verify):** scene action row component, same place "Play from here" lives now.
- **Source:** Lan note 3; transcript [01:00:33] David: "it is very important that it doesn't go to the next scene before we are done"; [00:51:36] same point earlier.
- **Implementation note:** "Play this scene" should be the default users reach for during edit verification. Consider button order: "Play this scene" first, "Play from here" second.

### 3. Highlight changed scenes after edit + regenerate description
- **What:** After helper or AI commits an edit:
  - The affected scene gets a visual badge (something like "Edited" with a colour change for the helper) and a TalkBack-readable status ("Scene 3, edited, brightness increased").
  - The scene description is regenerated and replayed automatically, or at minimum a "What changed" line is prepended to the existing description.
- **Where (verify):** edit commit handler (helper-side and AI accept-edit handler); description generation pipeline (likely the segment-to-Gemini path).
- **Source:** Lan notes 4 and 5; transcript [01:17:57] David: "Otherwise, why are we editing in the first place? We have to know whether we have achieved the objectives that we wanted to achieve... those new descriptions will be sort of tools to measure whether we have accomplished our description, especially if there's no helper around."
- **Implementation note:** Full Gemini regeneration may be too slow (4 to 8 seconds per scene). Two-tier fallback: instant templated diff string from edit parameters ("Brightness increased to 85, magenta tint reduced") plus an async full re-description that replaces the templated one when ready. The templated version alone covers the equivalence-of-information-access principle for tomorrow.

### 4. Helper-side and WoZ-side visual adjustment panel
- **What:** Editor panel exposes brightness, contrast, saturation, plus zoom and rotate. Same control surface for the helper (Probes 2a, 2b, 3) and the WoZ researcher override buffer (Probes 2b, 3 AI actions).
- **Where (verify):** helper editor component plus the researcher override panel gated by `?mode=researcher`. These should share the same adjustment component.
- **Source:** Lan note 6; transcript [01:07:09] Mary couldn't find zoom or crop and asked twice; [02:44:06] Mary on AI's "fix" attempt: "I didn't see any change" (because override buffer had no way to actually apply a zoom).
- **Implementation note:** Crop is a bigger build, leave for P2. Brightness, contrast, saturation, zoom, rotate cover what Mary asked for and what the AI suggestions in your bank will plausibly route through.

### 5. Sound option: simplify to add / mute
- **What:** Replace the current "add music / add sound effect" sub-options with two clear actions: "Add sound" and "Remove sound (mute)". The mute option mutes the original audio for that scene.
- **Where (verify):** sound editing sub-panel.
- **Source:** Lan note 7.
- **Implementation note:** Mute removes the *original* scene audio (resolved D4). This covers the case David flagged where DJ's audio overpowered his vocal in the recording.

### 6. Rewrite Probe 3 suggestion bank
- **What:** Every pre-authored suggestion in the bank rewritten in plain, actionable language. Test by reading aloud cold to Hannington tonight; if he can't immediately tell you what action it implies, rewrite again.
- **Where (verify):** suggestion bank file (likely a JSON or TS data file referenced from the Probe 3 component).
- **Source:** transcript [02:38:19] David: "I haven't even understood that suggestion"; [02:38:29] Mary on the same: "I am not getting how to edit the length of the DNA"; [02:39:39] David: "I feel it's a very vague suggestion." Specifically the "Consider whether the full duration earns its length in the edit" suggestion was opaque to both participants and required Maryam to translate.
- **Counter-evidence (afternoon session):** Conference-video suggestions worked better, e.g. "A large bright blank projector screen dominates the background behind the presenter which competes for visual attention" and "A loud cough from an audience member is clearly audible over the presenter during this segment." Use these as templates.
- **Bank composition:** Mix of AI-fixable and helper-only suggestions per Lan's design intent. Rationale: forces some triadic-loop behaviour (helper-only suggestions can't bypass the helper) while letting the study observe creator preferences when both AI-action and helper-action are available. Aim for roughly 60/40 AI-fixable to helper-only across each video's bank.
- **Implementation note:** Each suggestion should answer: (a) what is the issue, (b) what would fixing it do, (c) is the fix routable to AI or helper. Keep under 25 words. Include the `fix_template` field per item 7 for AI-fixable suggestions; helper-only suggestions omit `fix_template` and the "Ask AI to fix" button is hidden for those.

### 7. Probe 3: wire "Ask AI to fix" through the override buffer
- **What:** Connect the "Ask AI to fix" button in Probe 3 to the researcher override buffer. When a participant taps it, the buffer receives a routing event with the suggestion ID and scene context. The researcher applies the corresponding edit using the visual adjustment controls from item 4. After the edit applies, the description regenerates per item 3 so participants can verify the AI's "fix."
- **Where (verify):** suggestion routing handler in the Probe 3 component; override buffer panel at `?mode=researcher`.
- **Source:** Lan's design intent clarified on buffer day: Probe 3 explores proactive AI with direct-action capability.
- **Implementation note:** Each suggestion in the bank should include a `fix_template` field describing the AI fix in terms the override buffer can execute, e.g. `{action: 'brightness', delta: '+15'}`, `{action: 'rotate', degrees: -3}`, `{action: 'zoom', scale: 1.2, center: 'subject'}`. For suggestions without a clean fix template (camera shake, pacing-level critiques), the buffer applies a best-effort adjustment using its fallback library and surfaces a status message to the participant.
- **Methodological note:** This shifts the 2b-vs-3 comparison from "only proactivity varies" to "proactivity plus direct-AI-action varies." Update the operations manual to reflect this, and flag for paper framing.

### 8. Persistent suggestion state with resolution markers
- **What:** After a participant takes any action on a suggestion (dismiss, "I'll do it", "Ask AI to fix", "Ask helper to fix"), the suggestion remains visible on the scene with:
  - A resolution badge showing the chosen action and responsible party
  - An outcome status (pending, applied, failed)
  - A timestamp
- The suggestion is removed only if the participant explicitly removes it.
- **Where (verify):** `SuggestionItem` component (the participant-facing one; `SuggestionCard` is dead code per repo notes) plus the Probe 3 suggestion state.
- **Source:** Lan's note; transcript [02:46:34] David: "the suggestion has got lost." This happened repeatedly during Probe 3 and broke the record of triadic decisions.
- **Implementation note:** State shape something like `{suggestionId, resolution: 'dismissed' | 'self' | 'ai' | 'helper', outcomeStatus: 'pending' | 'applied' | 'failed', timestamp}`. Resolution badge must be TalkBack-readable, e.g. "Suggestion 1 of 3, routed to AI, applied."
- **Why this matters for analysis:** The suggestion log is the primary in-app artefact for RQ3. Persisting state across actions means session video plus the log gives a complete trail of triadic decisions per scene.

### 9. Auto-toggle TalkBack on handover (Probe 2a)
- **What:** "Hand over" button automatically disables TalkBack; "Take back" re-enables it. Currently both participants do this manually and the operations manual flagged it as a friction point.
- **Where (verify):** Probe 2a handover component.
- **Source:** Lan's own in-session note [01:15:00]: "I literally wrote it down just now."
- **Implementation note:** Android TalkBack toggle requires accessibility permissions. If automation isn't possible inside the web app, fall back to a clear voice prompt + a one-tap shortcut button.

### 10. Probe 3 should reset to fresh video selection
- **What:** Probe 3 currently inherits the video selected in Probe 2a/2b. Per the design memo, Probe 3 uses a *fresh* video, not state-carryover. Reset video selection (and project state) when entering Probe 3, while preserving the 2a-to-2b state carryover via `loadProjectState()`.
- **Where (verify):** probe transition handler; the `loadProjectState()` call should be gated by probe ID so it only fires for 2a → 2b, not for 2b → 3.
- **Source:** afternoon transcript [01:22:33] "Video is already selected?" caused brief participant confusion. Per memory: design intent is "Fresh video" for Probe 3.
- **Implementation note:** Quick fix. Likely a one-line gate in the probe transition handler.

---

## P2: Ship this week if possible (between field days)

### 11. TalkBack vs. video audio interference
- **What:** Suppress TalkBack announcements during scene playback (resolved D3 = option a). When playback ends or is paused, TalkBack resumes normally.
- **Where (verify):** scene playback handler; TalkBack state needs to be paused via the screen reader API or by deferring `aria-live` updates during playback.
- **Source:** Lan note 2; transcript [00:32:38] David: "It's only audio. So you cannot really know whether whatever he's saying is true or not"; [00:51:07] Mary explicitly requesting that description be paused during playback.
- **Implementation note:** If suppressing TalkBack at the system level isn't reliable, fall back to clearing `aria-live` regions during playback and queuing announcements until playback ends. Risk to monitor: creator misses important status changes during long scenes; mitigate by re-announcing scene state after playback ends.

### 12. Voice input "Ask AI" announcement loop
- **What:** Screen reader looped "Your video is shown as a list of scenes below" 21 times during AI processing in Probe 1 [00:41:45], then read the response three times back-to-back [00:42:42]. Eliminates over a 3-hour session.
- **Where (verify):** the live region announcement logic for AI processing state.
- **Implementation note:** likely a stale `aria-live` region updating with the same content on every state tick. Debounce to one announcement per state change, and de-duplicate identical consecutive announcements.

### 13. Helper-side notification cue (Probe 2b)
- **What:** When the creator routes a task to the helper, the helper currently has to look at the screen to know it arrived. Add a short audio cue plus haptic ping.
- **Source:** transcript [02:03:43] Mary: "But now, do it have a sound like when it's coming to me?"
- **Implementation note:** Web Audio API + `navigator.vibrate()`. Confirm both work on the field-test Android phones.

### 14. Voice input "Replay video" command not handled
- **What:** When a participant says playback verbs ("play", "replay", "pause") into the Ask AI input, the system currently treats them as content questions and returns a description. Either expand voice input to handle a small set of playback commands directly, or detect playback verbs and return a clear redirect message: "I can answer questions about this scene. To play the video, tap Play from here."
- **Where (verify):** voice input handler in the Ask AI flow.
- **Source:** afternoon transcript [00:29:13] Lily said "Replay my video"; system returned a description instead of playing.
- **Implementation note:** Redirect option is simpler and lower-risk for the next field day. Direct playback control is nicer but adds a voice-to-action mapping that needs separate testing.

### 15. AI rejection wording is misread as acceptance
- **What:** When Gemini cannot perform a request, the response should start with an unambiguous "Sorry, I can't do that" before listing what it can do. Current phrasing buries the refusal: "my current capabilities are limited to video editing actions like trimming, splitting, deleting, reordering, or adding captions." Participants read this as a list of things AI can do for them, not as a refusal.
- **Where (verify):** Gemini system prompt for the Ask AI flow.
- **Source:** afternoon transcript [01:28:08] Lily asked AI to remove background noise; AI's "limited capabilities" response was misread by Lily [01:28:34]: "So AI can also remove the background noise."
- **Implementation note:** Update the system prompt with a refusal template: "Sorry, I can't [requested action]. I can help with: [list]." Low effort, high payoff.

### 16. AI executed wrong action (brightness request, captions applied)
- **What:** Lily asked AI to increase brightness; AI proposed brightness 80%, accepted; Lily later realised "it added captions, not the brightness." Investigate whether the bug is in the override buffer (researcher applied wrong action) or in Gemini's tool routing (AI proposed brightness but applied the captions tool). Add a researcher-facing confirmation step in the override buffer that displays the planned action before applying.
- **Where (verify):** override buffer action handler; Gemini tool-call logs.
- **Source:** afternoon transcript [01:29:00 to 01:30:32].
- **Implementation note:** Even before root-causing, the researcher confirmation step is a useful guard against this class of error.

### 17. Helper-side notification workflow ambiguity
- **What:** The helper-side action buttons are currently labelled "mark as done / needs discussion / can't do." Naomi clicked "mark as done" *before* doing the edit because the label reads as a status acknowledgement rather than a completion signal. Rename "mark as done" to "I've finished this" and disable it until the editor panel has been opened (or until an edit has been committed).
- **Where (verify):** helper-side request acceptance component.
- **Source:** afternoon transcript [around 01:25:00] Naomi initially clicked done before doing the edit; Lan corrected the workflow mid-task.

---

## P3: Post-fieldwork

### 18. Log AI rejection variability for analysis
- **What:** Log every "AI rejected as ambiguous" or "AI didn't act" event with the user's prompt, scene context, and Gemini response. This is RQ1 data, not a bug to fix.
- **Source:** transcript [01:19:37] "Zoom in on the performer" was rejected; the rephrased "Zoom in on the performer. Make the performer more prominent on the video." was accepted. Likely Gemini variability rather than the override buffer.
- **Implementation note:** Add to existing session logging if not already there.

---

## Resolved decisions

All four open decisions from the buffer-day review are resolved:

| ID | Decision | Resolution |
|----|----------|------------|
| D1 | Scope of fixed-video-top-half layout | Apply across all probes (Probe 1 included) |
| D2 | Probe 3 "Ask AI to fix" handling | Option B: wire through override buffer (see item 7) |
| D3 | TalkBack vs. video audio collision | Option (a): suppress TalkBack during playback (see item 10) |
| D4 | "Remove sound" scope | Original audio only (see item 5) |

---

## Process changes (not code; for the operations manual)

These don't go to Claude Code, but flagging here so they don't get lost:

1. **Probe 1 closing artefact:** Read the creator's edit list back to them scene by scene before transitioning to Probe 2a. Capture in a structured sheet.
2. **Mid-probe detours:** Decide policy before tomorrow. Recommendation: defer with "great question, let's come back at the end" to keep probe demarcation clean.
3. **Helper fallback in Probe 1:** Track per-dyad count of helper interventions. Direct RQ1 measure.
4. **AI-as-objective-mediator debrief question:** "If AI suggested something different from what your helper preferred, who would you trust more?" Probes the finding from David at [02:48:46].
5. **Privacy debrief question:** "Did having your own phone vs. sharing one phone change how comfortable you felt during editing?" Probes Lily's framing at [01:10:50].
6. **AI-role typology debrief question:** "Do you think of AI more as your assistant, or more as your helper's assistant?" Tests whether Lily's "AI as primary partner" model (afternoon) generalises beyond David's "AI as advisor" model (morning).
7. **Pre-flight sync check before Probe 2b:** Connection failure at afternoon [01:08:15] required mid-session redo. Add a 30-second sync verification to the changeover checklist before Probe 2b begins.

---

## Paper findings to track across remaining dyads

Saving here so they aren't lost in the field log churn. These are observations to test for replication across the remaining 8 dyads.

1. **AI as information equaliser between BLV creator and sighted helper.** Afternoon [01:58:32]: AI flagged a wide-angle issue that *neither* Lily nor Naomi had noticed. This is the cleanest RQ1 evidence so far for AI providing information access that ability-diverse collaboration alone cannot.
2. **Two creator models of AI's role.** David (morning) frames AI as advisor providing suggestions; helper implements; creator approves. Lily (afternoon) frames AI as primary one-on-one partner; helper as final proofreader. Worth testing whether this varies by content type, creator background, or helper-relationship type.
3. **AI as cost-reduction in resource-limited contexts.** Lily [01:35:29]: "Naomi is my sister. What if Naomi was not my sister? It would mean I need to pay her." Economic dimension of AI-mediated collaboration that doesn't appear in Western-context literature.
4. **Privacy as a reason to prefer decoupled mode.** Lily [01:10:50] frames decoupled phones as protecting both her own and her helper's phone privacy. Different from David's "engagement" framing of the same setup.
5. **Captions and translation as core need for advocacy creators.** Lily mentioned captions seven times: auto-captioning from voiceover, English-to-Kiswahili translation, language simplification for audiences with intellectual disabilities. Absent from David's session entirely. Probably correlates with creator type (advocacy vs performance).
6. **AI voice tradeoff: confidence-enabling but pronunciation-limiting.** Lily uses AI voice to overcome confidence barriers but the AI mispronounces local names and brand names ("mall paid"), pushing her toward eventually using her own voice. AI removes one barrier (confidence) while creating another (pronunciation accuracy).
