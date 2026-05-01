# Study Operations Manual

**Companion to Study Protocol v2.2 · Nairobi Fieldwork · May 2026**

This document sits alongside the field-team protocol (v2.2). The protocol describes what the study is. This manual describes how to run it: what each probe must produce to answer its research question, what every team member does before, during, and after each probe, what we ask in debriefs, and what instruments and metrics we use.

Lead researcher: Lan Xiao (UCL). Secondary researcher: Maryam (UCL). Field support: Hannington (Senses Hub).

---

## Team configuration during sessions

The lead researcher operates the wizard console (Gemini override buffer) at a separate station, ideally out of the participant's line of attention. The secondary researcher sits with the participant, runs opening prompts, listens for think-aloud silences, takes observation notes, and runs the mini-debriefs. Field support handles logistics, language mediation, recording setup, and quiet observation of things audio and video may miss.

Joint routines around every session:
- 15-minute pre-session brief between lead and secondary researcher.
- 30-minute joint debrief after every session.

A pilot session is run before formal fieldwork begins (see Pilot section at the end).

---

## RQ–Probe map

| RQ | Primary probe | Supporting probes |
|---|---|---|
| RQ1 — Information access: how AI-mediated visual access reshapes what a BLV creator can do independently during editing | Probe 1 | Probes 2a/2b feed VQA and information-request data on enacted needs |
| RQ2 — Coordination: how creator and helper coordinate differently when each has their own access to the video and the AI | Probes 2a + 2b | Probe 1 baseline (uninstructed helper) |
| RQ3 — Co-creation (exploratory): what happens when AI initiates rather than only responds | Probe 3 | Probe 2b is the within-study comparison (same setup, only AI proactivity changes) |

---

## Probe 1 — Creator solo, reactive AI

### A. RQ mapping

Primary site for RQ1. Carries three pieces of evidence:

1. The set of editing decisions the creator can articulate when given AI access alone (the artefact of the task).
2. The information categories they request through VQA, granularity switches, and helper fallback (the inductive vocabulary).
3. The relationship between AI sufficiency and helper fallback: when AI is enough, when it is not, and why.

### B. Data the probe must produce

Each session must leave us with:

- An audio-captured list of intended edits, articulated by the creator at the end of the probe.
- VQA exchanges with question/answer pairs, override decisions, and scene context for each.
- Granularity switches paired with what the creator was trying to do at that moment (real-time articulation, prompted articulation, or debrief retrieval).
- Helper fallback events with triggers coded post-hoc: creator explicitly asked, helper inserted unprompted, or creator deferred preemptively without trying AI first.
- Continuous think-aloud audio.
- Mini-debrief audio.

If a session ends and any of these are missing or thin, RQ1's vocabulary contribution suffers from that session.

### C. Participant task

The framing read aloud at the start of Probe 1:

> "Watch and review the video. As you go, tell us out loud what you notice, what you'd want to change, and what feels right. The AI is there to answer questions about the video. At the end I'll ask you to walk me through the edits you'd want to make."

Two structural prompts bake the data we need into the task itself:

**Opening prompt** (Maryam reads): explicit invitation to think-aloud and to ask the AI freely. Reassure the creator there are no wrong questions and the AI may sometimes get things wrong.

**Closing prompt**, last 3 minutes of the 20-minute slot: "Now can you walk me through the edits you'd want to make? You can refer to scene numbers if that helps." This produces the artefact (audio-captured list of intended edits) without needing an in-app capture mechanism.

The helper sits beside the creator. They are told they're welcome to stay quiet but we won't stop them if they speak. We do not give them a job.

### D. Researcher tasks

**Lead researcher (Lan, wizard)**

*Before*: set up the wizard console, verify Gemini connection on participant's video, load the override interface, brief Maryam on the override protocol (when to override, when to let through, how to log it).

*During*: monitor every VQA round-trip in the 2–3 second override buffer. Override only when Gemini's answer is wrong, harmful, or radically off-context. Log every override (what was said, what was changed, why) for analysis. Track systematic Gemini failure modes; these become a paper sub-finding.

*After*: save wizard logs, reconcile VQA log with override log, write a five-line note on what felt off this session.

**Secondary researcher (Maryam, in-room)**

*Before*: read v2.2 cold before fieldwork starts, walk through the prototype with Lan, agree the observation focus list and the four-prompt set for granularity switches. Confirm she runs mini-debriefs.

*During*: sit with the participant. Run the opening prompt. Listen for think-aloud silences. Use the four-prompt repertoire (below) at most once per scene's worth of activity, only when there is a behavioural cue, with a 5–10 second pause first. Take observation notes on helper engagement, body language, hesitation. Capture timestamps of helper fallback events for later coding.

*After*: run the mini-debrief. Ten-minute structured note immediately after: what surprised her, helper fallback summary, anything she'd ask differently next session.

### E. Facilitator tasks (Hannington)

*Before*: greet, settle, consent process. Verify devices charged and TalkBack working on the creator's phone. Set up two cameras (rear and front) and audio recorder. Test wizard-relay connection between Lan's station and the participant area. Confirm refreshments and transport for end of session.

*During*: quietly monitor logistics. Step in for language mediation when the participant code-switches and Maryam needs help. Take field notes on things audio and video may miss: what the helper is doing when silent, room interruptions, equipment glitches. Do not prompt the participant on prototype use. Do not signal whether anything is going well or badly.

*After*: handle compensation, transport, departure. End-of-day equipment check, transfer recordings to encrypted storage.

### F. Mini-debrief (Maryam runs, 10 minutes)

The aim is to surface what observation alone cannot reach: the creator's reasoning and felt experience.

1. Walk me through what you'd say this video is about now. How well do you feel you understood it?
2. When you were going through the scenes, what were you trying to figure out?
3. Can you tell me about a moment when you switched between description levels? What were you looking for?
4. Was there anything you wanted to know about the video that the AI couldn't tell you?
5. Did you turn to [helper name] at any point? Why that moment?
6. How did the AI's descriptions feel? Were they telling you what you needed? Was anything wrong?
7. If you had to make these edits on your own with the AI, what would still be missing?

For Question 3, before the debrief Maryam glances at the granularity switch log and picks one or two switches that look interesting (long dwell after, dramatic level jump, switch immediately followed by VQA). She uses them as concrete debrief prompts: "I noticed around scene 5 you went into the most detailed level. Can you tell me what was happening for you there?"

Order matters. Q1 grounds the conversation in the creator's mental model. Q2–3 surface granularity reasoning. Q4 surfaces information gaps directly. Q5 surfaces helper-fallback rationale. Q6 surfaces AI trust and error perception. Q7 anchors the RQ1 framing about independence.

### G. Instruments and metrics

**Event log fields**, per event: timestamp, event_type, scene_id, level (where applicable), payload.

- VQA events: question_text, gemini_raw_answer, override_applied (bool), final_answer, override_reason.
- Granularity switches: from_level, to_level, scene_id.
- Helper interactions: trigger_type (asked / unprompted / preemptive, coded post-hoc), brief description.
- Play events: scene_id, level.

**Questionnaires**: none in-probe. Screening questionnaire covers demographics and current workflow. A single quantitative anchor for cross-probe comparison may be added at the end of the final interview ("across the four probes, which condition felt most supportive of you doing the editing yourself?"), to be confirmed after we discuss Probes 2–3.

**Coding scheme entries**:

- *VQA category starter list* (refined inductively into the final taxonomy): identity, activity, spatial layout, object detail, text on screen, lighting and colour, framing and composition, camera movement, technical issues, continuity.
- *Helper fallback trigger codes*: asked, unprompted, preemptive.
- *Granularity switch context codes*: orientation, detail-seek, verification, reset, accidental, unclear.

**Coding reliability**: informal calibration on the first two sessions (independent coding, joint reconciliation, codebook refinement). Cohen's kappa computed on a 20% subsample for reporting. Detailed mechanics to be agreed later.

### Granularity switch context guidance (Probe 1, applies to all probes that use granularity)

**Tutorial phase, after TalkBack gesture training, 3–5 minutes**: introduce the three levels using the practice video. Have the creator try each level on one or two scenes. While they do, Maryam asks open questions: "What feels different between Overview and What's Visible for you?" / "When would you want to be at the most detailed level?" / "Which one feels easiest to start with?" This builds the participant's own vocabulary for the levels and rehearses the switching gesture in context.

**In-the-moment prompts (Maryam)**:

Three rules:
1. Don't prompt every switch. Aim for at most once per scene's activity, and only when there is a behavioural cue (pause, hesitation, re-listen).
2. Pause first, prompt second. Give 5–10 seconds. Many participants articulate spontaneously.
3. Keep prompts open and downstream of the switch. Avoid asking "did you switch because X". Ask what they are trying to do.

The four-prompt repertoire, in increasing specificity:
- "What are you noticing?" — most open.
- "What are you working on right now?" — task-anchoring.
- "What were you hoping to find?" — most switch-relevant.
- "Mm, walk me through that." — encouraging, when they've started but trailed off.

None names a level or assumes a direction.

**Debrief retrieval**: see Q3 above.

**If a participant doesn't switch at all, that is also data**. Don't prompt them to switch. Don't suggest in the task framing that they should explore all three levels. Default to Level 1 (Overview) at the start of Probe 1.

---

## Probe 2a — Co-located, shared device

### A. RQ mapping

Probe 2a is the shared-device condition, paired with Probe 2b to answer RQ2 through their contrast. 2a alone establishes the baseline: how creator and helper coordinate when AI is added to current practice (sharing a single phone, passing it between them with a handover affordance). The 2a→2b transition is the experimental change: only device topology shifts. What changes between 2a and 2b is what RQ2 reports.

Probe 2a carries three pieces of evidence:

1. The distribution of editing decisions across the three action channels (self / AI / helper) under shared-device conditions.
2. The handover dynamics: who initiates, how intent is expressed, what happens in Helper Mode, what comes back.
3. Verbal-vs-interface decision-making patterns: which decisions get negotiated out loud before any tap happens, and which get acted on directly through the UI.

### B. Data the probe must produce

Each session must leave us with:

- The rough edit project state at the end of 2a (becomes the input to 2b).
- Event log of every edit attempt with channel attribution (self / AI / helper), timestamps, scene context.
- Handover event chain: initiator, intent (text + category + priority), time in Helper Mode, helper actions and marks, return summary, creator response.
- AI action request log: voice intent, Gemini parse, confirmation response, execution outcome, wizard override (where applicable).
- Device-hold timeline: who is holding the phone moment to moment.
- Continuous audio capture of both creator and helper speech.
- Think-aloud from both participants.
- Mini-debrief audio.

If device-hold isn't auto-logged, it has to be reconstructed from video. Worth confirming during pilot.

### C. Participant task

The framing read aloud at the start of Probe 2a:

> "For this part, you'll work together to put together a rough edit of this video. The AI can answer questions and can also do simple edits if you ask it to. You can pass the phone to each other when one of you wants to do something the other can't easily do. There's no perfect edit you have to reach. Just work as you'd want to. Tell me out loud what you're doing as you go."

The framing carries three things: "rough edit" sets expectations that they don't need to finish, the three channels are mentioned without prescribing which to use, and both participants are invited to think aloud, not just the creator.

The dyad's anchor for what to edit comes from Probe 1's articulated edit list (the closing prompt artefact). The pre-session goals (see Cross-cutting) sit in reserve as backup if Probe 1's articulation was sparse or if the dyad stalls.

The handover is a new affordance. During the 5-minute training before Probe 2a starts, Maryam walks the dyad through it: how the creator opens the Intent Locker, what the audio earcon means, what the helper sees in Helper Mode, how the helper marks tasks (Done / Needs Discussion / Cannot Do), and how Return to Creator works. Demonstrate each of the three action channels (edit by myself, ask AI to edit, ask helper) by example on the practice video, so each affordance has been under the dyad's hand once before the probe begins.

### D. Researcher tasks

**Lead researcher (Lan, wizard)**

The wizard load is structurally different from Probe 1, not strictly heavier. Two channels run side by side: VQA (live Gemini with override option, as in Probe 1) and AI edit execution (WoZ-driven, see note below).

*How AI edits work in this build*: when the creator (or helper) invokes "Ask AI to Edit" with a voice instruction, the system first checks for canned matches against pre-authored common requests (trim N seconds, remove section, simple reorder). If a canned match fires, the system responds automatically. If no canned match fires, the request is parked and surfaced on the wizard console, where Lan manually authors the AI response. So in Probe 2a the wizard is partly "the AI" for novel edit requests, not a monitor over Gemini's auto-parsing.

*Before*: confirm the wizard console exposes both the VQA override interface and the AI edit response queue. Pre-author the canned match list with anticipated common requests for the dyad's video, so the wizard doesn't have to author every response from scratch. Brief Maryam on what kinds of AI edit responses you'll author live and what the typical latency looks like, since this affects how she handles the participant's wait.

*During*:

- VQA override as in Probe 1: monitor, override only when wrong, log every override.
- AI edit queue: when a non-canned request arrives, author a response (accept the parsed action / propose a different action / decline gracefully with redirect to helper). Aim for the same 2–3 second responsiveness as VQA so the WoZ illusion holds. Log intent text, response authored, time-to-respond.
- Track which canned matches fire vs which require live authoring. The proportion is itself useful data on what AI ought to handle vs where humans currently fill the gap.
- Track AI graceful-failure responses ("I can't adjust lighting directly. Send to [helper name]?") as a category of AI's stated boundaries.

*After*: save wizard logs (VQA + AI edit), reconcile against event log, flag systematic patterns: which AI edit categories required live authoring most often, which canned matches mis-fired or were over-eager.

**Secondary researcher (Maryam, in-room)**

Observation load also higher: two active participants plus a device that moves between them.

*Before*: pre-session brief includes the handover walkthrough and the dyad-observation focus list. Agree the device-hold notation (C = creator, H = helper, with rough timestamps; or just count handovers if continuous tracking is too demanding alongside everything else).

*During*:

- Run the opening prompt and the handover training.
- Track the device-hold timeline in field notes.
- Listen for verbal coordination happening before, during, and after each interface action. This is the most data-rich coordination signal.
- Note any moment where the dyad seemed to *avoid* a channel (e.g., a decision the creator could have asked AI but went straight to handover). These avoidances are findings.
- Use the four-prompt repertoire if granularity switches happen, but expect them to be less frequent. The focus is now editing, not orientation.

*After*: run the mini-debrief. Ten-minute structured note.

### E. Facilitator tasks (Hannington)

*Before*: same as Probe 1, plus verify the handover earcon is audible to both participants in the room (test with the creator's TalkBack volume settings). Confirm the audio recording captures both creator and helper voices clearly (stand mic between them, or two lapel mics).

*During*: same as Probe 1, plus track in field notes any moment where the helper's body language shifts. Leaning in to look, leaning back when the creator regains the phone, pointing at the screen without speaking. These are coordination signals the audio misses.

*After*: same as Probe 1.

### F. Mini-debrief (Maryam runs, 10 minutes)

Probe 2a has a 10-minute mini-debrief at 1:40–1:50, then a combined 2a/2b debrief at 2:15–2:25 after Probe 2b. The 2a-only debrief focuses on 2a specifics. Cross-condition reflection lives in the combined debrief.

Probe 2a mini-debrief questions:

1. Walk me through what changed in the video. What did you decide to keep, cut, or change?
2. When you wanted to make a change, how did you decide whether to do it yourself, ask the AI, or [to creator] ask [helper name]?
3. Tell me about passing the phone back and forth. How did it feel? When did one of you want it more than the other?
4. [To helper] When the phone came to you, what did you find yourself doing? Was it like how you'd normally edit together, or different?
5. Was there a moment when the AI surprised you, in a good or not-so-good way?
6. Was there anything one of you wanted to do but didn't quite know how to ask for?

Q1 anchors. Q2 surfaces channel-selection reasoning, the core RQ2 datum. Q3 surfaces handover felt experience. Q4 brings in the helper's perspective explicitly. Helper is a co-participant from 2a onwards, so this is not optional. Q5 surfaces AI trust and error perception. Q6 surfaces wanted-but-not-asked patterns, useful for design implications.

### G. Instruments and metrics

**Event log fields**, 2a additions on top of the Probe 1 schema:

- *Edit events*: scene_id, action_type (keep / discard / trim / split / move / caption / note), channel (self / AI / helper), initiator (creator / helper), outcome (committed / cancelled / failed).
- *AI action events*: voice_intent_text, gemini_parsed_action, confirmation_shown (text), confirmation_response (accept / cancel), executed (bool), wizard_override (bool), override_reason.
- *Handover events*: handover_initiator, intent_text, task_category, priority (must / nice / check), helper_mode_start_ts, helper_mode_end_ts, helper_actions (array of action + mark), return_summary_text.
- *Device-hold events*: holder (creator / helper), start_ts, end_ts. To be confirmed whether this is auto-logged or coded post-hoc from video.

**Coding scheme additions** (from v2.1 §8.2 plus new):

- Channel Selection (CS), Handover Initiate (HOI), Handover Return (HOR), Helper Initiative (HI), Curation Act (CA), Trust Repair (TR).
- *Decision-channel coupling* (post-hoc): for each editing decision, tag (decision_type, channel_chosen, latency_to_choice, dyadic_initiator). Primary quantitative table for RQ2.
- *Verbal-coordination markers*: pre-action negotiation, mid-action commentary, post-action verification.

**Questionnaires**: none in-probe.

### Things to confirm before fieldwork

1. Pre-authored canned match list for AI edits. Common requests (trim, remove, simple reorder) should fire automatically so the wizard isn't authoring every response. Build this list per dyad's video before each session.
2. Wizard console layout: VQA override + AI edit response queue side by side, with clear visual separation. Test under load in pilot.
3. Device-hold logging: auto-log preferred but not blocking. If not auto-logged, post-hoc video coding in the first two sessions during informal calibration is feasible.
4. Helper voice capture: two-mic setup or central stand mic. Confirm during pilot.

## Probe 2b — Decoupled, two devices

### A. RQ mapping

Probe 2b is the experimental side of the 2a→2b pair. RQ2 is answered through what changes between these two conditions: same dyad, same video, same AI capabilities, only device topology shifts.

The 2b-specific evidence:

1. How channel-selection patterns shift when the helper has their own device. Does the creator ask AI more, less, or the same? Does the helper take initiative more often when they don't have to wait for the phone?
2. Whether the awareness layer (action log, activity indicators, visible AI queries) is actually used. The presence of an awareness affordance doesn't mean people use it; the absence-of-use is itself a finding.
3. How verbal coordination differs when two devices replace one shared screen. Co-located conversation continues, but its content shifts: less "let me show you," more "I'll do this scene, you do that one."
4. Parallel vs sequential work. Two devices afford parallel work on different scenes, but participants may still serialise out of habit or coordination cost.

The 2a→2b contrast feeds RQ2's main finding. 2b's data alone is necessary but incomplete.

### B. Data the probe must produce

In addition to the 2a data:

- Project state at start of 2b (carried from 2a end) and at end of 2b. Both are anchors for tracing what changed during 2b vs what was inherited.
- Task routing event chain: creator sends task to helper, status moves Sent → Seen → In Progress → Done, helper's actions, result back to creator.
- Awareness-layer engagement events: when participants focus on or tap the action log, helper activity status, or task status. Logged automatically via `AWARENESS_VIEWED` events (see §G for schema). Verbal awareness references ("I see you trimmed scene 3") still come from audio coding and complement the auto-logged engagement.
- Parallel-work timeline: who's acting on which scene at what time. Auto-logged via the event log.
- "Ask AI" channel events with visibility (both can see).
- Sync events: when each phone receives an update from the other. Latency between source and receipt is informative.

### C. Participant task

The framing read aloud:

> "Now you each have your own phone. The video is the same one you were working on, and your edits are still there, so you can pick up where you left off. The same things are possible: you can do edits yourself, ask the AI, or send a task to [helper / creator name]. You don't have to share a phone. Tell me out loud what you're doing as you go."

Three things this carries: project continuity, three channels still available with one mechanical difference (sending a task instead of handing the phone), both participants think aloud.

Anchors carry over from 2a (which carried from Probe 1). Pre-session goals remain available to Maryam as a backstop if the dyad has clearly disengaged from the project they were building.

Before the probe, a 5-minute training walks through:

- Pairing the two phones (role selector + session code)
- The "Ask AI" channel that's visible to both
- How to send a task to the other device with category and priority
- How task status updates appear (Sent → Seen → In Progress → Done)
- The action log: where it lives, what it shows, how attribution reads ("[AI, requested by Creator] trimmed this scene to 3s")

Five minutes is tight for this many new affordances. If pilot shows participants struggling, training may need to grow at the expense of the warm-up interview. Worth noting as a flex point.

### D. Researcher tasks

**Lead researcher (Lan, wizard)**

Wizard load in 2b is the same shape as 2a: VQA override (live Gemini) plus AI edit response queue (canned matches plus live authoring for novel requests). Task routing between the two phones is peer-to-peer over WebSocket and does not require wizard intervention, so it isn't an additional channel for you.

*Before*: same setup as 2a. Plus confirm the WS relay is live and paired between the two phones (the standard test: send a dummy event from one phone, watch it arrive on the other). Reuse the canned match list from 2a since the video is the same; add any 2b-specific entries if pilot surfaces new common requests.

*During*: same VQA + AI edit queue work as 2a. Watch sync events for any drift between the two phones. If scene 3 looks trimmed on the creator's phone but not the helper's, either the WS message dropped or the order of operations diverged. The build's last-write-wins behaviour and lack of a control lock mean concurrent edits can produce divergence. If sync drift happens, note it; if it's bad enough to confuse participants, you may need to manually push a re-sync.

*After*: save wizard logs, reconcile with event log, flag any sync issues for the data integrity record.

**Secondary researcher (Maryam, in-room)**

Observation focus shifts noticeably from 2a. Device-hold tracking is gone (each has their own). New focuses:

*Before*: pre-session brief includes the 2b observation list. Agree the parallel-work notation (a rough swim-lane in the field notebook: time on x-axis, creator's scene focus and helper's scene focus on y-axis), and the awareness-reference markers.

*During*:

- Sketch the parallel-work swim-lane as it unfolds. Even rough is useful: it visualises whether the dyad serialises or parallelises, and where they sync up.
- Note every moment where someone references the awareness layer: "I see you did that," "did you see what the AI just suggested," "I noticed scene 4 changed." These are the highest-value RQ2 data points.
- Note AI-channel-as-coordination uses. Did the helper ask AI a question that was actually a way of telling the creator something? Does the creator listen to what the helper is asking?
- Use the four-prompt repertoire if granularity switches happen.
- Listen for verbal coordination shifts compared with 2a: less "show me," more "you take this part."

*After*: ten-minute structured note immediately, but no separate 2b mini-debrief. The combined 2a/2b debrief sits at 2:15–2:25 and is run after Probe 2b.

### E. Facilitator tasks (Hannington)

*Before*: same as 2a, plus pair the two phones via session code, confirm WS relay is live, set up audio capture for both phones (this is where the two-mic versus stand-mic decision really matters since the participants are now physically separable). Test sync by triggering an event from each phone and confirming it appears on the other.

*During*: same as 2a, plus watch for sync issues. If the dyad starts behaving as if they don't see what the other is doing, a sync problem may be invisible to them, and your outside view can catch it. Field notes on body language: do they still look at each other's phones, lean in, or do they sit more independently?

*After*: same as 2a.

### F. Mini-debrief

There is no separate 2b mini-debrief in v2.2. The slot at 2:15–2:25 is the combined 2a/2b debrief, where the cross-condition comparison is the centrepiece.

Combined 2a/2b debrief questions (Maryam runs, 10 minutes):

1. You started on one phone, then moved to two. What changed for you?
2. Was there anything you could do on two phones that felt easier? Anything that felt harder?
3. [To creator] Did you find yourself working on different things from [helper] when you each had your own phone? How did you decide who'd do what?
4. [To helper] When you had your own phone and could see what was happening, did you do anything differently from how you'd normally help?
5. The action log showed who did what. Did you use it? Did you ever check it?
6. Was there a moment when you didn't know what the other person was doing? What did you do?
7. If you had to choose between sharing a phone or each having your own, which would you pick for editing together? Why?

Q1 grounds in subjective transition experience. Q2 surfaces affordance changes. Q3 surfaces parallel vs sequential work patterns. Q4 surfaces helper agency change, which is one of the central RQ2 hypotheses (do helpers behave differently when they have their own access?). Q5 directly probes awareness layer use. Q6 surfaces coordination breakdown. Q7 anchors a comparative preference, useful in cross-probe analysis.

### G. Instruments and metrics

**Event log fields**, 2b additions on top of the 2a schema:

- *Task routing events*: task_id, sender, recipient, task_text, category, priority, status_chain (sent / seen / in_progress / done with timestamps), result_summary.
- *AWARENESS_VIEWED events* (auto-logged on focus or tap of awareness UI elements, debounced 1500ms per element-instance):
  - `actor`: viewer (CREATOR or HELPER)
  - `element`: action_log_entry / helper_activity / task_status / activity_feed_entry / workspace_awareness
  - `scene_id`: where applicable
  - `entry_actor`: for action_log_entry, original actor of the logged action (CREATOR / HELPER / AI)
  - `entry_description`: for action_log_entry, snippet of entry text (truncated 120 chars)
  - `task_status_value`: for task_status, the current status
  - `trigger`: focus or tap
- *Sync events*: source_actor, action, propagated_at, received_at_other, latency.
- All 2a fields apply per device.

**Coding scheme additions**:

- *Verbal Awareness Reference (VAR)*: party verbally references activity or action log ("I see you did that"). Coded from audio. Complements the auto-logged AWARENESS_VIEWED engagement traces.
- *AI Attribution Notice (AAN)*: helper notices an AI action that wasn't requested by them.
- *Parallel-work segmentation*: concurrent / serialised / interleaved (post-hoc, from the swim-lane).

**Questionnaires**: none in-probe. The combined 2a/2b debrief carries the comparative load.

### Things to confirm before fieldwork

1. AWARENESS_VIEWED logging implemented and verified during Friday's pilot (build change in progress, see Claude Code prompt in the project notes).
2. Sync robustness under realistic edit volume. Pilot test with rapid concurrent edits on both phones.
3. WS relay reliability over Hannington's hotspot in the actual venue. Test before the first session of each day.
4. Audio capture of two physically separable speakers. This is where the two-mic vs stand-mic decision matters most.

## Probe 3 — Decoupled, proactive AI

### A. RQ mapping

Probe 3 is the primary site for RQ3 (exploratory): what happens when AI initiates rather than only responds. The 2b → 3 contrast is the cleanest within-study comparison. Same dyad, same setup, only AI proactivity changes. The video is fresh for ecological reasons, but the manipulation is well isolated.

Probe 3 carries four pieces of evidence:

1. The distribution of routing responses to proactive suggestions across four channels (self / AI / helper / dismiss), broken down by suggestion category (issue / structural / creative).
2. Felt experience of being interrupted by AI: useful, intrusive, surprising, threatening to autonomy. Mostly from debrief.
3. Whether AI-initiated agenda-setting changes what the dyad talks about and works on. Conversation analysis plus pre/post topic comparison.
4. How proactive AI interacts with the dyad's own goals (set in advance) and emergent goals during the probe.

### B. Data the probe must produce

Each session must leave us with:

- Suggestion deployment events: timestamp, suggestion_id, category, target scene, deployment rationale (a short note from Lan as wizard on why this moment).
- Suggestion response events: per suggestion, the chain (deployed → routed_to_X / dismissed → if routed, outcome). Auto-logged via existing event types: `SUGGESTION_DEPLOYED`, `SUGGESTION_ROUTE_SELF`, `SUGGESTION_ROUTE_AI`, `SUGGESTION_ROUTE_HELPER`, `SUGGESTION_DISMISSED`, `HELPER_SUGGESTION_RESPONSE`, `SUGGESTION_CHAIN_COMPLETE`.
- All 2b-equivalent data (channel attribution, awareness layer engagement, parallel work, sync events). Probe 3 inherits the decoupled setup, so the 2b instrumentation carries forward.
- Mini-debrief audio focused on the suggestion experience.
- Final interview audio (cross-probe comparative, see Cross-cutting).

### C. Participant task

The framing read aloud at the start of Probe 3:

> "This is a different video, the fresh one you sent us. Same as before, you each have your own phone. You can edit yourself, ask the AI, or send a task to [helper / creator name]. One thing's different in this part: the AI may sometimes notice something and tell you about it, without being asked. When that happens, you choose what to do. Do it yourself, ask the AI to handle it, send it to [helper / creator], or dismiss it. There's no right answer. Tell us out loud what you're thinking as you go."

Three things this carries: continuity with the 2b setup, explicit notice that AI may proactively interrupt, the four routing options described.

The participant's pre-elicited goals for the Probe 3 video (from pre-session goal elicitation) sit with Maryam as primary anchors. If the dyad stalls, gentle surfacing applies. The dyad does not need to address those goals explicitly — they're a backstop.

Before the probe, a 5-minute training:

- Reuse the pairing and Ask AI training from 2b (same setup).
- Demonstrate a generic non-real suggestion arriving on the practice video. Use a placeholder example unrelated to the participant's actual content.
- Walk through each of the four routing options by tapping each in turn on the practice example.
- Make explicit that the AI cannot apply suggestions directly. The creator picks the channel.

### D. Researcher tasks

**Lead researcher (Lan, wizard)**

This is the heaviest wizard load of the four probes. Three concurrent channels:

- VQA override (live Gemini, same as Probes 1, 2a, 2b).
- AI edit response queue (canned matches plus live authoring, same as Probes 2a/2b).
- Proactive suggestion deployment (new, primary task — Lan triggers each suggestion).

*Before*:

- Author the Probe 3 video's suggestion bank: 6 to 8 items, balanced across the three categories. Tied to specific scenes via `relatedScene` IDs.
- Plan rough deployment timing windows. Not exact moments (those depend on the dyad's pace) but ranges. For example: "fire issue suggestion 1 sometime in the first 8 minutes if dyad has reached scene 3", "fire creative suggestion in middle third regardless".
- Pre-author canned matches for the AI edit queue, drawing on patterns observed in the dyad's 2a/2b sessions if relevant.
- Verify the wizard suggestion panel is functional and you can deploy with one or two clicks.

*During*:

- VQA + AI edit work as in 2a/2b.
- Suggestion deployment: fire suggestions at moments that feel natural. When the dyad has reached a relevant section, when they're between actions, when there's a lull. Avoid firing during active editing of unrelated work or during conversation about something else.
- Note rationale for each deployment timing in real time, one or two words ("lull after task return", "approaching scene 4"). This becomes data on what made deployment feel right or wrong, and supports cross-session consistency.
- Track which suggestions get deployed before time runs out. Some may not fire because the moment didn't come or the dyad finished early. That's data, not failure.

*After*: save wizard logs (VQA + AI edit + suggestion deployment with rationale notes), reconcile with event log.

**Secondary researcher (Maryam, in-room)**

Core 2b observation focuses still apply (parallel-work, awareness references, AI-channel-as-coordination). Plus Probe 3 specific:

*Before*: pre-session brief covers the suggestion observation list. Maryam needs to know which suggestions are in the bank so she can recognise them when they fire, but should not signal to the dyad that they're scripted.

*During*:

- Note the dyad's reaction at each suggestion arrival: pause, surprise, immediate response, body language. Capture timestamp and a few words.
- Note pre-route deliberation: did the creator route immediately, or pause to discuss with helper? Did they think aloud during the routing decision?
- Note any moment where a suggestion changes what the dyad is doing or talking about. AI agenda-setting is a primary RQ3 datum.
- Note pre-elicited goals being addressed or ignored. If a suggestion overlaps a pre-existing goal, that's a different dynamic from one that introduces a new direction.
- Granularity prompts apply as before.

*After*: ten-minute structured note focused on suggestion reactions across the dyad. Then run the Probe 3 mini-debrief.

### E. Facilitator tasks (Hannington)

Same as 2b (same decoupled two-device setup). One addition: with the wizard load at its highest in Probe 3, Hannington's facilitator role may need to absorb more of the participant comfort monitoring (water, breaks, equipment glitches). Brief on this beforehand.

### F. Mini-debrief (Maryam runs, 10 minutes, immediately after Probe 3)

The aim is to surface what cross-probe comparison alone cannot reach: the immediate felt experience of proactive AI.

1. Walk me through the rough edit you made. What changed, what stayed?
2. The AI sometimes told you things without being asked. How did that feel?
3. Was there a suggestion that felt useful? One that felt unwanted?
4. When a suggestion came in, how did you decide what to do with it: yourself, ask AI, or [helper / creator]?
5. [To helper] When [creator] sent a suggestion to you, what did you make of it?
6. Did the AI's suggestions change what you were thinking about, or did you mostly stick with your own plan?
7. Was there a category of suggestion (problem-flagging, structure, creative) that felt more or less welcome to you?

Q1 anchors. Q2 surfaces felt experience of unsolicited AI. Q3 surfaces variability across suggestions, useful for inductive coding of "what makes a suggestion welcome." Q4 surfaces routing decision rationale, a direct RQ3 datum. Q5 surfaces the helper's perspective on receiving routed suggestions. Q6 surfaces AI agenda-setting effect, central to RQ3. Q7 surfaces category-specific reactions.

The final interview at 3:05–3:30 then anchors cross-probe reflection (see Cross-cutting section).

### G. Instruments and metrics

**Event log fields**, 3 additions on top of the 2b schema:

- *Suggestion deployment* (`SUGGESTION_DEPLOYED`): suggestion_id, category, related_scene, timestamp, deployment_rationale (Lan's note).
- *Suggestion routing* (`SUGGESTION_ROUTE_SELF` / `_AI` / `_HELPER`, `SUGGESTION_DISMISSED`): suggestion_id, category, latency_to_route (time from deploy to participant action), creator_thinking_aloud (snippet if captured).
- *Helper response* (`HELPER_SUGGESTION_RESPONSE`): for routed-to-helper suggestions, helper's response action and any verbal context.
- *Chain completion* (`SUGGESTION_CHAIN_COMPLETE`): suggestion_id, terminal_outcome (executed_self / executed_AI / executed_helper / dismissed / unresolved), elapsed_total.

**Coding scheme additions**:

- *Suggestion routing distribution table*: rows = suggestion category (issue / structural / creative), columns = response (self / AI / helper / dismiss). Per-dyad and aggregate. Primary quantitative table for RQ3.
- *Reaction codes* (post-hoc from audio + video): immediate_accept, immediate_dismiss, deliberation (creator-helper discussion before routing), confusion, surprise.
- *Agenda-shift codes*: pre-suggestion topic, post-suggestion topic, shift (yes / no / partial).
- *Goal-alignment codes*: does this suggestion overlap a pre-elicited goal (yes / no / partial), and does its routing differ from non-overlapping suggestions?

**Questionnaires**: optional single Likert in final interview as noted in Cross-cutting.

### Things to confirm before fieldwork

1. Suggestion bank authored for each dyad's Probe 3 video before the session. 6 to 8 items, three categories balanced.
2. Wizard panel for suggestion deployment tested under realistic load. Friday's pilot is the place.
3. Suggestion deployment timing approach: light guidance ("fire when natural") plus field-note rationale per fire. Pilot validates whether this is consistent enough across sessions, or whether tighter rules are needed.
4. SuggestionItem UI verified end-to-end on TalkBack: suggestion arrival announcement, four routing buttons each focusable and announced clearly, dismiss confirms.

---

## Cross-cutting

### Warm-up interview script (0:15–0:30, 15 minutes)

Maryam runs this. Conversational rather than scripted. Aim is twofold: settle the dyad and gather baseline current-practice data for interpretation later. The warm-up captures the helper as a research subject from the start of the session.

Suggested arc, flexible in order:

1. *Light opening*: "Tell me about the videos you make together. What's a recent one you're proud of?"
2. *Workflow walk-through*: "Walk me through how you'd normally work on a video together, start to finish. What happens on a typical editing day?"
3. *Roles and division*: "Who tends to do what? Has it always been like that, or has it changed over time?"
4. *Tools*: "What apps or tools do you usually use? Anything you wish worked better?"
5. *Hard parts*: "What's the part that takes the longest? What's the part that's hardest?"
6. *AI experience*: "Have you used AI tools for this kind of work before? How did that go?"
7. *Today framing*: "Today we'll show you a few different setups. They're all a bit different from how you usually work. Just go with what feels natural to you. There's no right way to do anything we'll show you."

Notes for Maryam:

- Don't push if the helper is quiet; some helpers are habituated to deferring. Direct gentle questions to the helper specifically: "And what's the part that's hardest from your side?"
- If the dyad mentions a workflow detail that contradicts what's possible in the prototype ("we always use cloud storage for collaboration"), don't try to map it onto the probes. Note for context.
- Keep it under 15 minutes. The tutorial slot at 0:30–0:40 is protected.

### Final interview script (3:05–3:30, 25 minutes)

The final interview is cross-probe and cross-condition. Maryam runs it. Lan can join if her wizard duties are wrapped.

Suggested arc:

1. Looking back at all four parts, what felt most natural to you? What felt most strange?
2. Across the four parts, when did you feel most in control of the editing? When did you feel least?
3. Has anything changed in how you think about working together on videos after this session?
4. [To creator] When did the AI feel most like a tool? When did it feel like something else: a colleague, an interruption, a stranger?
5. [To helper] When did your role feel different from how you'd normally help? When did it feel the same?
6. If you could keep one thing from any of the four setups, what would it be? Why?
7. Anything we didn't ask that you want to tell us?

Q1 grounds in subjective summary. Q2 anchors agency and control across conditions, central to RQ1 and RQ2. Q3 surfaces reflection and any meta-learning. Q4 surfaces the creator's relationship to AI, touching all three RQs. Q5 surfaces the helper's identity shift across conditions, central to RQ2. Q6 anchors comparative preference for cross-probe analysis. Q7 is the safety net.

Optional rating anchor at the end, single Likert: "across the four parts, which condition felt most supportive of you doing the editing yourself?" One quantitative cross-probe data point per dyad. Use it if it doesn't disrupt the conversational close.

### Pre-session preparation: participant goal elicitation

When the dyad sends in their footage 3 to 5 days before the session, the request goes with two video clips and a short follow-up question per clip:

> "When you imagine this video finished, what are 2 to 3 things you'd want to change or get right? They can be anything: visual, pacing, what stays in, what comes out."

Two video clips means two sets of goals: one set for the Probe 2a/2b video (which carries through both probes), and one set for the Probe 3 video. These are participant-defined anchors, not prescribed tasks. Recording: the goals go into the per-dyad session prep doc. Maryam keeps them at hand during the session.

How the goals are used in each probe:

- *Probe 1*: not used as anchors directly. Probe 1 is anticipatory and the creator generates their own articulated edit list as the artefact of the closing prompt. That list becomes the primary anchor for Probes 2a/2b. Pre-session goals are a backup if the creator's articulation in Probe 1 is sparse.
- *Probes 2a/2b*: the dyad picks up from Probe 1's articulated list. Pre-session goals sit in reserve. If the dyad stalls or finishes well before time, Maryam can gently surface a goal: "earlier you mentioned wanting to fix the lighting in the kitchen scene, is that something you want to look at?"
- *Probe 3*: pre-session goals for the fresh video are the primary anchor (no Probe 1 equivalent for this video). Same gentle-surfacing rule applies if needed.

Backup observations: in addition to participant goals, Maryam keeps a short list (3 to 4 per video) of researcher-noted observations from a quick review of the footage. These are observations, not tasks. "The lighting changes between scenes 6 and 7." "Scene 4 is significantly longer than the others." Used only if both the dyad's own goals and Maryam's mid-probe nudges fail to generate engagement. The backup observations are kept neutral so the dyad still chooses what to do with them.

### Pre-session preparation checklist

Timing milestones, working backwards from each session.

**1 to 2 weeks before**:

- Recruitment confirmed via Senses Hub (Hannington-led).
- Screening questionnaire returned and reviewed by Lan and Maryam.
- Session date, time, venue, transport confirmed with the dyad.
- Consent materials prepared in the dyad's preferred language.

**5 days before**:

- Footage request sent: two unedited clips, 15 to 60 seconds each, sent via the secure channel agreed at consent stage.
- Goal elicitation question included with the footage request (see Pre-session: participant goal elicitation above).

**3 to 5 days before**:

- Footage received. Confirm receipt with the participants.
- Goals received and recorded in the per-dyad prep doc.

**2 days before**:

- Pipeline processing: segmentation into scene blocks, three-level descriptions generated for both videos via Gemini.
- Manual review of generated descriptions for obvious errors (visual hallucinations, missed text, mis-identified people).
- Suggestion bank authored for the Probe 3 video: 6 to 8 items, balanced across issue / structural / creative. Suggestions tied to specific scene IDs.
- Researcher backup observations drafted (3 to 4 per video, neutral observations rather than tasks).
- Canned match list for the AI edit queue authored. Generic list applies across dyads; augment with video-specific entries if the footage suggests common requests likely to surface.

**1 day before**:

- Equipment check: phones charged, TalkBack working, screen recording verified, sample IDs logged.
- WS relay smoke test: pair two phones via session code, send dummy event, confirm receipt on the other.
- Wizard console smoke test: VQA override fires, AI edit queue receives parked requests, suggestion deployment panel responsive.
- Suggestion deployment plan reviewed for the dyad's Probe 3 video.
- Final dyad prep doc compiled: goals (per video), backup observations (per video), suggestion bank (Probe 3), screening notes, names and pronunciations of creator and helper.

**Morning of session**:

- Re-verify equipment charge and TalkBack settings on the participant phones.
- Hannington confirms transport, refreshments, compensation envelopes prepared.
- 15-minute brief between Lan and Maryam: review the dyad prep doc, agree any adjustments from previous sessions, note any equipment issues.

### Day-of checklist

For each session, before the dyad arrives.

**T-2 hours**: field team arrives at venue. Hannington handles room setup, refreshments, signage. Lan handles equipment.

**T-1 hour**:

- Phones charged, TalkBack on the creator's phone verified by running a few standard gestures.
- Audio recorder tested with a sample recording. Listen back to confirm both possible speaker positions are clear.
- Two video cameras positioned: rear (behind participants, screens visible) and front (faces visible). Both consented separately at the start of the session.
- WS relay paired between the two phones (Probes 2b and 3).
- Wizard console open on Lan's laptop, VQA + AI edit + suggestion panels visible. Network reliability checked (test with a remote relay event).
- Researcher dashboard at `/researcher` confirmed receiving events.

**T-30 minutes**: pre-session brief between Lan, Maryam, and Hannington (5 minutes is enough):

- Dyad name and pronunciation.
- Goals for both videos.
- Anything from the previous session worth carrying forward.
- Anything specific to this dyad from screening (e.g., particular accessibility needs, language preference).

**T-0**: dyad arrives. Hannington greets and settles them. Consent process begins (0:00–0:15 of the session).

### Post-session debrief routine

For each session, immediately after the dyad has left.

**Joint debrief between Lan and Maryam (30 minutes)**:

1. *What surprised you* (each in turn, no immediate response, just collect surprises).
2. *Equipment or build issues* (anything that needs urgent fix before the next session).
3. *Probe-by-probe quick scan*: for each of the four probes, what worked, what didn't. Two minutes max per probe.
4. *Anything to adjust for the next session*: protocol tweaks, prompt adjustments, observation focus shifts.
5. *Anything to flag for analysis*: emerging themes, unusual responses, things to watch for in future sessions.

**Equipment and data handling (Hannington)**:

- Recordings transferred from each device to encrypted storage at end of day.
- Field notebooks photographed and uploaded as backup.
- Devices wiped of session-specific data and recharged for the next session.
- Footage from the participant deleted as agreed in consent. Processed descriptions and event logs retained per data handling protocol.

**Maryam writes a one-page session note within 24 hours**, capturing:

- Date, dyad code, anything notable.
- Specific quotes that might support cross-session themes.
- Any methodological adjustments made and why.

This isn't full transcript or coding work. It's a session memory aid that compounds across the ten dyads and feeds into eventual analysis.

### Questionnaire and metrics inventory

Consolidated reference of what data is collected at each stage. The detailed schemas live in each probe's section G; this section is the single navigation point.

**Pre-session, from participants**:

- Screening questionnaire: eligibility, demographics, current workflow, AI experience, accessibility setup.
- Footage submission: two video clips (15 to 60 seconds each).
- Goal elicitation: 2 to 3 goals per video clip (free text).

**In-session, automated logging** (timestamped JSON per probe via `EventLoggerContext`):

- VQA events with override metadata. Probes 1, 2a, 2b, 3.
- Granularity switches. All probes.
- Helper interactions and fallback events. Probe 1, post-hoc coded; auto-logged where the prototype tracks them.
- Edit events with channel attribution (self / AI / helper). Probes 2a, 2b, 3.
- AI action events with WoZ response metadata. Probes 2a, 2b, 3.
- Handover events. Probe 2a.
- Task routing chain. Probes 2b, 3.
- `AWARENESS_VIEWED` events on focus or tap of awareness UI. Probes 2b, 3 (build update in progress, see Claude Code prompt).
- Suggestion deployment and routing events. Probe 3.
- Sync events. Probes 2b, 3.

**In-session, captured by recording**:

- Audio: full session.
- Video: two angles (rear, front). Each consented separately.

**In-session, researcher-captured**:

- Field notes: Maryam (in-room observations), Hannington (logistics, body language).
- Wizard log notes: Lan (override decisions, AI edit responses, suggestion deployment rationale).
- Think-aloud: captured in audio.

**In-session, structured interviews**:

- Mini-debrief after Probe 1 (10 min).
- Mini-debrief after Probe 2a (10 min).
- Combined 2a/2b debrief after Probe 2b (10 min).
- Mini-debrief after Probe 3 (10 min).
- Final interview (25 min).
- Optional single Likert at end of final interview.

**Post-session, internal**:

- Joint Lan-Maryam debrief (30 min).
- Maryam's one-page session note within 24 hours.

**Coding done post-fieldwork**:

- VQA category taxonomy (inductive from Probe 1 + supplementary VQA in 2a/2b).
- Helper fallback typology (asked / unprompted / preemptive).
- Granularity switch context (orientation / detail-seek / verification / reset / accidental / unclear).
- Channel selection codes and decision-channel coupling. Probes 2a / 2b / 3.
- Verbal awareness references coded from audio (auto-logged engagement separately). Probes 2b, 3.
- Suggestion routing distribution table. Probe 3.
- Reaction codes. Probe 3.
- Agenda-shift codes. Probe 3.
- Goal-alignment codes. Probe 3.

**Reliability**: informal calibration on first two sessions. Cohen's kappa on a 20% subsample for reportable agreement.

### Pilot session

Pre-fieldwork pilot with a student with visual impairment, this Friday. Lan to discuss outcomes after the session. Pilot purposes and protocol to be added after that conversation.

---

*Document version: 0.5 · All four probes complete · Cross-cutting complete except Pilot session · Pilot section pending Friday's pilot*
