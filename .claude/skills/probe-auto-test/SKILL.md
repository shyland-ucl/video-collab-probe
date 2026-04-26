---
name: probe-auto-test
description: Headless-Playwright regression harness for the four study conditions (Probe 1 / 2a / 2b / 3). Drives each probe through the user flows specified in STUDY_PLAN.md, samples DOM + media-element state, and reports PASS/FAIL per claim. Use after any change to scene blocks, scene actions, the playback engine, the WS relay, or the pipeline so a regression shows up before manual phone testing.
args:
  - name: probes
    description: Comma-separated list of probes to test (probe1, probe2a, probe2b, probe3, all). Defaults to all.
    required: false
user-invokable: true
---

Run automated, study-plan-aligned smoke tests against the live dev server and report which behaviours work vs. regressed. **Do not propose fixes from this skill** — surface findings only; root-cause and patching belong to `superpowers:systematic-debugging`.

## When to invoke

- User asks to "auto test the probes", "run the probe regression", "check if anything broke", "verify the study flows", or types `/probe-auto-test`.
- After you've just edited any of: `src/components/shared/SceneBlock*.jsx`, `src/components/{probe1,probe2,probe3}/Probe*SceneActions.jsx`, `src/hooks/usePlaybackEngine.js`, `src/components/shared/VideoPlayer.jsx`, `src/services/wsRelayService.js`, `vite-ws-relay-plugin.js`, `vite-pipeline-plugin.js`, or anything in `pipeline/`.
- Before recommending the user pull the project out of dev to test on a phone.

## What it covers vs. what it can't

**Covered (automatable):**
- Probe 1: library → exploring transition, scene-block expansion, the "Play scene N" → auto-follow-as-playback-crosses-boundaries behaviour, visible-vs-aria-label match on the play/pause button, presence of all 5 scenes for a sample video.
- Probe 2a: edit-by-myself buttons (Trim / Split / Move Earlier / Move Later / Add Caption / Add Note) actually mutate `editState` and not just fire log events (B2 regression).
- Probe 2b / 3: WebSocket pairing handshake completes when two clients are open — both leave the "Waiting for helper" / "Waiting for creator" screen.
- Cross-cutting: announcer (`#sr-announcer`) is in the DOM and updates on key transitions; no React hydration errors in the console.

**NOT covered — these still need a phone or manual run:**
- TalkBack / VoiceOver actual speech output (browsers don't expose AT speech).
- Web Speech API voice input (microphone permission).
- Voice-note recording.
- Real Gemini API calls (the harness skips VQA submission to keep tests deterministic).
- Researcher dashboard `?mode=researcher` controls (out of scope for now; add a panel test later).

If the user asks "did the description get read out?" or "does TalkBack work?" — answer honestly that this harness can't verify that, and recommend a phone walkthrough following `docs/walkthrough_method.md`.

## How to run

1. **Make sure the dev server is up.** Either:
   - The user already has `npm run dev` running, or
   - Start it in the background: `npm run dev` with `run_in_background: true`. Wait until the output shows `VITE ... ready in ... ms` and read the `Local: http://localhost:NNNN/` line — Vite often falls through to 5174/5175 if 5173 is taken. Set `BASE` accordingly when invoking the scripts.

2. **Make sure Playwright + Chromium are installed.** First run only:
   ```
   npm install --no-save playwright
   npx playwright install chromium
   ```
   (Both are no-ops on subsequent runs.)

3. **Run the harness.** From the repo root:
   ```
   BASE=http://localhost:5174 node .claude/skills/probe-auto-test/scripts/run-all.mjs
   ```
   Or one probe at a time:
   ```
   BASE=http://localhost:5174 node .claude/skills/probe-auto-test/scripts/probe1.mjs
   BASE=http://localhost:5174 node .claude/skills/probe-auto-test/scripts/probe2a.mjs
   BASE=http://localhost:5174 node .claude/skills/probe-auto-test/scripts/probe2b-pair.mjs
   ```

   If the user passed an arg (`probe1` / `probe2a` / `probe2b` / `probe3` / `all`), only run that script. Default is `all`.

4. **Read the output.** Each script prints `[PASS]` / `[FAIL]` lines per claim, plus diagnostic samples for any FAIL. If everything is PASS, summarise "N/N passed" and stop. If anything FAILed, drop into `superpowers:systematic-debugging` to investigate — do not patch from this skill.

## Output format to the user

After running, write a one-screen summary in chat:

```
Probe 1: 5/5 PASS
Probe 2a: 3/4 PASS — FAIL: Trim does not mutate editState
Probe 2b pairing: PASS
Probe 3 pairing: PASS

Detail for the one FAIL is at scripts/.last-run.log.
```

Keep it terse. Don't paste sample tables unless the user asks.

## Where to find what

- `scripts/lib.mjs` — shared helpers (browser launch, navigate-to-probe, dismiss-onboarding, expand scene N, sample expanded scene + video time, record transitions). Reuse these from any new probe script — don't reimplement.
- `scripts/probe1.mjs` — Probe 1 user flow checks.
- `scripts/probe2a.mjs` — Probe 2a edit-mutation regression checks (B2).
- `scripts/probe2b-pair.mjs` — two-client WS pairing smoke test for Probe 2b. Probe 3 reuses it via the same pairing handshake.
- `scripts/run-all.mjs` — runs every script in sequence, aggregates the PASS/FAIL totals, exits non-zero if anything failed.
- `scripts/a11y-report.mjs` — for each probe state, dumps the TalkBack reading order (DOM walk in role-aware order, skipping `aria-hidden`/`inert` subtrees) plus the `#sr-announcer` live-region stream observed during transitions. Writes `docs/probe_a11y_report_<date>.md`. Use this when the user asks "what does TalkBack hear?", or before making any change to ARIA labels / heading hierarchy / live regions, or before a study pilot. The companion human-readable interpretation lives at `docs/probe_a11y_findings_<date>.md` (write by hand from the raw dump — the raw is for evidence, the findings doc is for action).

### Running the a11y report

```
BASE=http://localhost:5173 node .claude/skills/probe-auto-test/scripts/a11y-report.mjs
```

The script writes `docs/probe_a11y_report_<date>.md`. After reading it, write
or update the matching `docs/probe_a11y_findings_<date>.md` with B/M/m-tagged
findings, citing each finding to the state and item index in the raw report so
a reviewer can audit the interpretation.

## Adding a new check

When the study plan grows or a new finding lands, add a check by:

1. Decide which probe it belongs to.
2. Open the matching `scripts/probe*.mjs`. Add a `check('claim name', async () => { ... return { pass, detail }; })` block. Use `lib.mjs` helpers for navigation, never re-launch a fresh browser per check inside the same script.
3. Tie the claim text to a paragraph in `STUDY_PLAN.md` so future readers know what spec is being enforced.
4. Run that probe script alone first to see green, then `run-all` to confirm aggregation.

## Anti-patterns to avoid

- **Don't add `setTimeout` waits "just in case"** — use `page.waitForFunction` against an actual DOM condition. The auto-follow check already polls every 500ms because it's measuring continuous time evolution; that's the exception, not the template.
- **Don't run more than one probe in parallel against the same dev server.** Probes mutate `localStorage['sessionConfig']` and `localStorage['probe2a_project_state']`; parallel runs race.
- **Don't reach into React internals.** Stick to the DOM (`aria-expanded`, `aria-label`, `currentTime` on `<video>`). The harness is supposed to break in the same ways a real user's flow would break.
- **Don't add tests for behaviour the harness fundamentally can't observe** (screen-reader speech, audio output, microphone). Mark them in the "NOT covered" list above and require a phone walkthrough.
