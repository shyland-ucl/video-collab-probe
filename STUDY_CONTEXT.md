# Study Context: AI-Mediated Ability-Diverse Collaboration in Video Content Creation

## Principal Researcher
**Lan Xiao** — Third-year PhD researcher at UCL's Global Disability Innovation Hub  
**Supervisor:** Prof. Catherine Holloway (Principal Investigator)  
**Ethics Approval:** UCL REC Project ID 16149/001 + Strathmore University SU-ISERC (local Kenya ethics, in progress)

---

## 1. Research Overview

### 1.1 Core Research Question
How can AI reduce information asymmetry between creators with sensory impairments and their sighted/hearing collaborators, transforming collaboration dynamics from **"delegation"** (surrender of agency) to **"management of labor"** (maintained creative control)?

### 1.2 Published Foundations

- **ASSETS '25** (Xiao et al., 2025): Empirical study of video content creation by 20 creators with sensory impairments (10 BPS, 10 DHH) in Nairobi, Kenya. Found that creators typically delegate entire visual editing processes to sighted collaborators while providing directive input, but lack independent means to verify execution. DOI: `10.1145/3663547.3746356`
- **CHI '24** (Xiao et al., 2024): Systematic review of 117 papers on ability-diverse collaboration in HCI. Introduces the Ability-Diverse Collaboration Framework with two models: **Ability Sharing** (one person provides ability support to another) and **Ability Combining** (multiple people contribute different abilities toward a shared goal). DOI: `10.1145/3613904.3641930`

### 1.3 Theoretical Framework

**Three-layer research agenda:**
1. **Information Access** — AI as ability supporter (providing equivalent modality-adapted information)
2. **Coordination** — AI as communication supporter (structuring collaboration workflows)
3. **Co-creation** — AI as ability provider/combiner (enabling true joint creative work)

**Key CSCW foundations:**
- Clark & Brennan's grounding in communication
- Gutwin & Greenberg's workspace awareness framework
- Extended to novel **triadic configurations** (creator + helper + AI)

**Central concept — "Double Digital Divide":** Accessibility barriers compounded by infrastructure and resource constraints in LMIC contexts (limited device capabilities, high data costs, unreliable connectivity, absent training). This is a theoretical contribution, not just a practical constraint.

---

## 2. Current Study: Technology Probe Study

### 2.1 Study Design
- **Type:** Within-subjects design with technology probes
- **Participants:** 10 creator-helper dyads in Nairobi, Kenya
  - Creators: People with visual impairments (blind or low vision)
  - Helpers: Their existing sighted collaborators (friends, family, colleagues)
- **Session Duration:** ~3 hours per dyad
- **Conditions:** Baseline + 3 progressive probes (counterbalanced after baseline)
- **Core paradigm:** Triadic collaboration (creator + helper + AI) — NOT a single-user AI tool with collaboration added on

### 2.2 Conditions

#### Baseline (No AI)
- No AI descriptions, VQA, handover mechanisms, or mirroring
- Creator and helper collaborate on a single device using standard practice
- Captures natural delegation/information-request patterns found in prior Kenya study
- NOTE: Includes a brief familiarization period with the editor shell before timing begins (to avoid confounding interface novelty with condition effects)

#### Probe 1: AI Video Description with Granularity Control
- **Purpose:** Test whether direct AI-mediated information access changes creator agency and collaboration patterns
- **Features:**
  - Three-level granularity controller: **Level 1** (High-Level Flow), **Level 2** (Action & Object), **Level 3** (Aesthetic & Technical)
  - Keyboard shortcuts 1/2/3 for switching; auto-advance on segment boundaries
  - Conversational VQA channel (Wizard of Oz — interface is coded, answers come from researcher via hidden panel)
  - Verification/Flag mechanism (keyboard shortcut F) for uncertain descriptions
  - Pre-authored descriptions at all three levels for each video segment
  - VQA pre-populated answer bank per segment, with researcher typing custom answers for unanticipated questions
- **Key design question:** What does the helper see/do while creator uses AI? (Avoid creating new asymmetry where creator has AI info the helper doesn't know about)

#### Probe 2: Smart Handover (Single Device)
- **Purpose:** Test how structured handover on a shared device affects collaboration when both parties have AI-mediated information access
- **Features:**
  - **Intent Locker mechanism:** Before handing device to helper, creator locks creative intent via:
    - Text/voice input for specific instructions (e.g., "Trim market scene to start at second stall")
    - Checkbox list of pre-defined categories (Trim/Cut, Adjust Color, Check Framing, Add Caption, General Review)
    - Priority indicator (Must Do / Nice to Have / Just Check)
  - **Guest Mode for helper:** Intent displayed as sticky banner; helper marks items Done / Needs Discussion / Cannot Do
  - Mode switching with transition animation + distinct audio earcons for each direction
  - Handover suggestions are Wizard of Oz (researcher-triggered)
  - All Probe 1 features (descriptions, VQA) remain available as foundation

#### Probe 3: Local Mirroring (Two Devices)
- **Purpose:** Test how decoupled, simultaneous access with modality-adapted interfaces affects collaboration
- **Features:**
  - Creator and helper each have their own device, synchronized playback
  - **Creator device:** Audio/text-optimized; full Probe 1 interface + "Send to Helper" button for text/voice notes + helper activity feed
  - **Helper device:** Visual-optimized; video player with timeline + simplified editing tools + creator intent feed + optional toggle to see what AI descriptions creator is hearing
  - **Sync protocol:** WebSocket via local relay (preferred over WebRTC for fieldwork reliability). Connection via QR code or session code. Sync can be toggled to "Independent mode"
  - **Fallback:** If connection fails, researcher manually synchronizes on a third device (invisible to participants)
  - Communication happens verbally (co-located) supplemented by persistent text/voice notes

### 2.3 What Is Functional vs. Wizard of Oz

| Component | Implementation |
|-----------|---------------|
| Video playback & transport controls | **Functional** |
| Granularity controller (3 levels) | **Functional** |
| Description display & auto-advance | **Functional** |
| VQA interface (input, thinking indicator, chat history) | **Functional UI, Wizard of Oz answers** |
| Verification/Flag button | **Functional** |
| Intent Locker UI & Guest Mode | **Functional** |
| Handover suggestions | **Wizard of Oz** (researcher-triggered) |
| Device synchronization (WebSocket relay) | **Functional** |
| Event logging (all interactions timestamped) | **Functional** |
| Screen reader accessibility (ARIA, keyboard nav) | **Functional** |

### 2.4 Session Procedure (~3 hours)

| Time | Duration | Activity |
|------|----------|----------|
| 0:00 | 15 min | Welcome, informed consent, study overview |
| 0:15 | 10 min | Pre-session questionnaires (demographics, relationship, workflow) |
| 0:25 | 5–10 min | Interface familiarization (practice clip, no data collected) |
| 0:35 | 30 min | BASELINE: Edit Video Clip A using current practice |
| 1:05 | 5 min | Post-condition questionnaire |
| 1:10 | 10 min | Break + training on Probe [X] |
| 1:20 | 25–30 min | PROBE [X]: Edit Video Clip B |
| 1:50 | 10 min | Post-condition scales + brief probe-specific interview |
| 2:00 | 5 min | Transition + training on Probe [Y] |
| 2:05 | 25–30 min | PROBE [Y]: Edit Video Clip C |
| 2:35 | 10 min | Post-condition scales + brief probe-specific interview |
| 2:45 | 5 min | Transition + training on Probe [Z] |
| 2:50 | 25–30 min | PROBE [Z]: Edit Video Clip D |
| 3:20 | 10 min | Post-condition scales + brief probe-specific interview |
| 3:30 | 20 min | Semi-structured dyad interview + comparative ranking |
| 3:50 | 10 min | Debrief, compensation |

### 2.5 Measures

**Quantitative (per condition):**
- NASA-TLX (6 subscales) — cognitive load; mental demand expected to be the most sensitive subscale
- Custom Perceived Agency Scale (5-item, 5-point Likert)
- Custom Collaboration Quality Scale (5-item, 5-point Likert)
- Information Sufficiency Rating (1–7)
- AI Trust Rating (1–7) — for probe conditions only
- Task completion metrics (issues identified/fixed, time on task)
- Condition preference ranking (end of session)

**Probe 1–specific:**
- Description Quality scale (descriptive, objective, accurate, clear — from VideoA11y)
- Granularity preference (which level used most vs. preferred)

**Qualitative:**
- Audio recording of verbal interactions during tasks → behavioral coding + conversation analysis
- Think-aloud during probe conditions
- Screen recording on devices → interaction log analysis
- Semi-structured dyad interview (creator + helper together)
- Video recording of physical interactions (optional)

### 2.6 Behavioral Coding Scheme

**Original codes:**

| Code | Definition | Example |
|------|-----------|---------|
| Information Request (IR) | Creator asks helper for visual info | "What does the background look like?" |
| Task Delegation (TD) | Creator hands off entire task | "Can you just fix the lighting?" |
| Directed Instruction (DI) | Creator gives specific instruction | "Increase brightness by 20%" |
| Verification Request (VR) | Creator asks to confirm result | "Is it better now?" |
| Helper Initiative (HI) | Helper suggests action unprompted | "I notice there's also some shake here" |
| Negotiation (N) | Back-and-forth about approach | "Maybe try cropping?" "No, let's just trim" |

**Additional codes from CHI 2026 literature:**

| Code | Definition | Source |
|------|-----------|--------|
| Curation Act (CA) | Creator explicitly accepts, rejects, or modifies AI info | ADCanvas |
| VQA Interaction (VQA) | Creator asks targeted question about specific visual element | ADCanvas |
| Trust Repair (TR) | Creator or helper addresses an AI error/inconsistency | MAVP |
| Granularity Switch (GS) | Creator changes AI description level | Probe 1 |
| AI Verification (AV) | Creator asks helper to verify AI description | Probe 1 |
| Flag Setting (FS) | Creator sets Intent Locker flag | Probe 2 |
| Mode Toggle (MT) | Device switches creator/helper mode | Probe 2 |
| Timeline Sync Reference (TSR) | Either party references shared timeline position | Probe 3 |

**Central hypothesis:** Interactions should shift from Task Delegation + Information Request (baseline) → Directed Instruction + Negotiation + Curation Act (probe conditions).

### 2.7 Data Analysis Plan

**Quantitative:** Non-parametric (n=10):
- Friedman test for comparing conditions (repeated measures)
- Wilcoxon signed-rank for pairwise comparisons (Bonferroni correction)
- Descriptive statistics: medians, IQRs, effect sizes (Kendall's W)

**Key comparisons:**
1. Baseline vs. all probes (overall effect)
2. Probe 1 vs. baseline (information access alone)
3. Probe 2 vs. Probe 3 (collaboration configuration)
4. Granularity levels within Probe 1

**Qualitative:** Thematic analysis (Braun & Clarke reflexive approach) of interview data; conversation analysis of verbal interactions with behavioral coding.

---

## 3. Technical Architecture & Design Principles

### 3.1 Platform
- **Web-based** technology probes (HTML/CSS/JS, React recommended)
- Must work on entry-level smartphones and basic laptops common in LMIC contexts
- Compatible with screen readers (TalkBack on Android, VoiceOver on iOS, NVDA on Windows)
- Full keyboard navigation; ARIA labels on all interactive elements

### 3.2 Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Device sync | Local WebSocket relay | More reliable than WebRTC in Nairobi network conditions |
| Speech input | Web Speech API | Test voice availability on field devices pre-deployment |
| VQA backend | Wizard of Oz (researcher panel) | Avoids unreliable MLLM integration in fieldwork |
| Description storage | Pre-authored JSON per video segment | Three levels per segment, loaded at runtime |
| State management | localStorage with careful namespacing | Prevent cross-condition data leaks |
| Logging | Client-side event log (timestamped JSON) | Exported at session end for analysis |

### 3.3 Description Data Structure
```json
{
  "video_id": "task1",
  "segments": [
    {
      "id": "seg1",
      "start_time": 0,
      "end_time": 15,
      "name": "Market Scene",
      "descriptions": {
        "level_1": "A woman walks through an outdoor market, stopping at several stalls.",
        "level_2": "A woman in a red jacket walks through a busy outdoor market. She pauses at a produce stall, picks up tomatoes, and moves to a second stall selling fabric.",
        "level_3": "Medium shot, natural daylight. A woman in a bright red waterproof jacket walks right-to-left through a crowded market with corrugated iron roofing. Camera is handheld with slight shake. She pauses at a wooden produce stall (tomatoes, onions, green peppers), examines tomatoes, then walks to a fabric stall with colorful kikoy displayed on rails. Ambient market noise, Swahili conversation audible."
      },
      "vqa_prepared": {
        "What color is her jacket?": "Bright red, waterproof material",
        "How many stalls are visible?": "Three stalls — produce, fabric, and a partially visible one behind"
      }
    }
  ]
}
```

### 3.4 Accessibility Requirements
- Full keyboard navigation for all features
- Screen reader compatible (test with TalkBack, VoiceOver, NVDA)
- ARIA live regions for dynamic content updates (description changes, notifications)
- Audio earcons for state changes (mode switch, segment advance, flag set)
- High contrast mode
- Adjustable text size
- No time-dependent interactions
- Description panel readable as plain text by screen readers
- "Thinking" indicator for VQA accessible via ARIA

### 3.5 Event Logging Schema
All interactions must be logged with timestamps for behavioral analysis:
```json
{
  "session_id": "dyad_01_probe_1",
  "timestamp": "2026-05-15T10:23:45.123Z",
  "event_type": "granularity_switch",
  "details": {
    "from_level": 1,
    "to_level": 3,
    "current_segment": "seg2",
    "video_time": 23.5
  },
  "actor": "creator"
}
```

Event types to capture:
- `video_play`, `video_pause`, `video_seek`
- `granularity_switch` (with from/to levels)
- `vqa_question_asked` (with question text)
- `vqa_answer_received` (with answer text)
- `description_flagged` (with segment ID)
- `intent_locked` (with intent text, categories, priority)
- `mode_switch` (creator→helper or helper→creator)
- `intent_item_completed` (with status: done/needs_discussion/cannot_do)
- `send_to_helper` / `send_to_creator` (with message content)
- `sync_toggle` (linked/independent)
- `edit_action` (trim, color adjust, etc.)

---

## 4. Key Literature Informing the Design

### 4.1 ADCanvas (Li et al., CHI 2026)
- Accessible AD authoring tool for BLV creators using conversational AI agent
- Key insight: **Creator-as-curator** mental model — creators supervise, verify, and refine AI output rather than generating from scratch
- Conversational VQA enables creators to probe video content at varying abstraction levels
- Users developed "trust-but-verify" patterns; AI proactivity without explicit request violated agency
- Separation of conversation (asking questions) from editing (changing the script) is critical

### 4.2 MAVP (Olmos et al., CHI 2026)
- Multimodal Agent Video Player with adaptive description granularity
- Progressive disclosure of visual information (broad overview → detailed)
- Trust/verification mechanisms embedded in the interface
- Meta-conversation about AI accuracy was a natural part of user behavior

### 4.3 Niu et al. (CHI 2026)
- Creating disability story videos with generative AI
- Creator agency over narrative control is paramount
- Emotional and social dimensions of video content matter (not just functional accuracy)
- Relevant for task design — video clips should include content with emotional/social significance

### 4.4 AVscript (Huh et al., CHI 2023)
- Audio-visual scripts for accessible video editing by BLV creators
- Within-subjects study with 12 BLV editors — NASA-TLX showed mental demand as most sensitive subscale
- Creators reported AVscript would enable editing more videos without sighted assistance
- Provides methodological precedent for the study design

### 4.5 VideoA11y (Li et al.)
- Method and dataset for accessible video descriptions
- 4-metric quality scale: descriptive, objective, accurate, clear — adapted for Probe 1 evaluation
- VideoA11y-40K dataset for benchmarking

### 4.6 Other Key References
- **Borgos-Rodriguez:** Understanding and amplifying labor among disabled co-creators; helper experience matters
- **Jung et al.:** How accessibility practices impact teamwork in mixed-ability groups
- **Kamikubo AccessShare:** Co-designing data access with blind people; informed consent in accessibility research
- **DescribePro (Cheema et al.):** Collaborative audio description with human-AI interaction; forking and variation patterns
- **VizXpress (Zhang et al.):** AI-supported expressive visual content by blind creators

---

## 5. Design Principles

1. **Triadic dynamics must be centered** — The three-way dynamic (creator + helper + AI) is the primary unit of analysis. Don't treat it as a single-user AI tool with collaboration added on.
2. **Equivalence, not equality** — Creator and helper get modality-adapted information access; the goal is equivalent understanding, not identical interfaces.
3. **Creator-as-curator** — The creator supervises, verifies, and refines AI-provided information rather than passively receiving it.
4. **Preserved creator agency** — All design decisions should maintain the creator's creative control. AI should never make changes without explicit creator authorization.
5. **Trust verification mechanisms** — Every AI output should have a path for the creator to verify or question it.
6. **Ecological validity** — Having dyads edit their own footage is ideal; at minimum, use culturally relevant Kenyan content.
7. **LMIC-aware design** — Optimize for entry-level devices, unreliable networks, multilingual/code-switching contexts.
8. **Helper experience matters** — Parallel measurement of helper's perspective; don't treat the helper as invisible infrastructure.
9. **WoZ consistency** — Wizard of Oz VQA responses need standardized protocols to avoid introducing confounds across sessions.
10. **Technology probe, not product** — The goal is to generate design insights and provoke reflection, not to build a polished tool.

---

## 6. Fieldwork Realities (Nairobi, Kenya)

- **Network:** Unreliable connectivity; local WebSocket relay preferred over cloud-dependent solutions
- **Devices:** Entry-level smartphones and basic laptops; optimize for limited RAM and processing power
- **Languages:** English, Swahili, Kenyan Sign Language (KSL); expect code-switching during sessions; VQA WoZ operator must handle multilingual questions
- **Screen readers:** TalkBack (Android) most common; test on actual field devices before deployment
- **Recruitment:** Through local disability organizations (existing relationships from ASSETS '25 study)
- **Ethics:** Dual approval required (UCL + Strathmore). Accessible consent formats: screen-reader-compatible digital documents, read-aloud support, KSL interpretation for DHH participants
- **Compensation:** Appropriate local rates (to be confirmed)
- **Venue:** Needs reliable power, local network capability (researcher-provided hotspot), quiet space for audio recording
- **Pre-deployment:** Test Web Speech API voice availability, screen reader behavior, and localStorage on actual field devices

---

## 7. Open Questions & Decisions Pending

1. **Video content selection:** Use footage from prior Kenya study, have dyads edit their own footage (best for ecological validity), or pre-record new clips? Need to pre-author descriptions at 3 levels per segment regardless.
2. **Helper interface in Probe 1:** Does the helper see/hear the AI output? If not, this creates a new form of information asymmetry.
3. **Condition counterbalancing strategy:** Fixed progressive (baseline always first), then Latin square for probes? Or allow different baseline positions?
4. **Code-switching in VQA:** How does the WoZ researcher handle questions in Swahili or mixed language?
5. **Session feasibility:** If pilot testing reveals fatigue, options include reducing to 3 conditions (Probes 2 & 3 between-subjects) or splitting into two sessions.
6. **Behavioral coding codebook:** Needs full operational definitions with examples and boundary cases before data collection begins.

---

## 8. Project Timeline (Approximate)

- **Current:** Finalizing technology probe prototypes + completing Strathmore ethics submission
- **Next:** Pilot testing with 1–2 dyads
- **Then:** Full data collection in Nairobi (10 dyads)
- **After:** Data analysis, write-up, targeting CSCW or ASSETS venue

---

## 9. Contribution Positioning

This work contributes to CSCW theory by:
1. Extending human-AI collaboration beyond dyadic configurations to **triadic human-human-AI systems**
2. Providing empirical evidence of how AI can transform collaboration dynamics in **ability-diverse teams**
3. Demonstrating that **LMIC context** is a theoretical contribution (double digital divide), not just a practical constraint
4. Operationalizing the shift from **delegation to management** as a measurable construct in accessible collaborative work
