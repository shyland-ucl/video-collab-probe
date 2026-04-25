# Spot-Check Walkthrough — 2026-04-25 (run 2)

Second pass on the same day, spot-check focus. Purpose: validate the `video-collab-probe-walkthrough` skill triggers correctly and the methodology produces actionable output without re-doing the full audit. This document supplements `walkthrough_findings_2026-04-25.md`; it does not replace it.

No code changes since the morning walkthrough (same HEAD commit `08d105f`), so the expectation is: prior findings reproduce.

## Skill validation result

The skill triggered correctly when the user said "run it again". The methodology executed end-to-end:

- Step 0 (re-orient) — `git log` confirmed no probe-source changes since this morning. ✓
- Step 1 (scope via AskUserQuestion) — surfaced probes / focus / two-client availability before any tool calls. ✓
- Step 2 (setup) — Chrome already connected, dev server already running; skipped re-asking. ✓
- Step 3 (TodoList) — five tasks, paced visibly. ✓
- Step 4 (per-probe walk-through) — confirmed below. ✓
- Step 5 (compile findings) — this file. ✓

The skill is working. One adjustment to consider for v2 of the skill: when the dev server has been running for a while and the WS relay has accumulated state from previous sessions, the "two-client" pairing check can fail in a misleading way (see NF1 below). The skill should suggest restarting the dev server before any 2b/3 spot-check.

## Verified findings from morning walkthrough

| ID | Description | How verified | Result |
|---|---|---|---|
| B1 | Mark/Flag and Edit + Play All missing from Probe 1 | Expanded scene 1, read accessibility tree — actions list contains only Detail-level radios, Play, Ask AI, Close. | ✓ Reproduced |
| B2 | Probe 2a Trim/Split/Move/Add Caption/Add Note are placeholders | Expanded scene 1, Edit by Myself, clicked Trim — before/after screenshots pixel-identical. | ✓ Reproduced |
| B3 | Probes 2a/2b/3 don't load pipeline videos | `grep -n loadPipelineVideos src/pages/Probe2Page.jsx src/pages/Probe2bPage.jsx src/pages/Probe3Page.jsx` returned nothing. | ✓ Reproduced |
| B4 | Probe 3 suggestions only fire for Lakeside Adventure | Inspected `public/data/descriptions.json` — only `video-sample3` has a `suggestions` array. | ✓ Reproduced |
| B6 | Scene-button `aria-label` dumps full description | Read /probe1 page tree — Scene 1 button name still includes the full Level-1 description. | ✓ Reproduced |
| M5 | Probe 2a has no library phase | Navigated to /probe2 — UI auto-loaded all 15 scenes from 3 sample videos. | ✓ Reproduced |
| m7 | Probe 3 role-selector copy identical to Probe 2b | `DecoupledRoleSelector.jsx` line 19 — single hardcoded description string used regardless of `condition` prop. | ✓ Reproduced |

Findings not re-tested in this spot-check (still valid from morning's report): B5 (no a11y-prefs UI), M1–M4, M6, M7–M14, m1–m6, m8–m14.

## New findings

NF2 (below) is a **Blocker** and is the most consequential finding from this entire day. NF1 was the symptom; NF2 is the root cause we surfaced by digging.

### NF2. URL-param role shortcut (`?role=creator|helper`) is permanently broken under React StrictMode — Blocker

Files: `src/pages/Probe2bPage.jsx` lines 547–559, `src/pages/Probe3Page.jsx` lines 547–559, `src/main.jsx` line 8 (StrictMode), `src/services/wsRelayService.js`.

This is a real bug I confirmed live in this session. After manual investigation, the cause is unambiguous: the auto-connect path that fires when a participant lands on `/probe2b?role=creator` or `/probe3?role=helper` is destroyed by React StrictMode's double-mount cycle.

**Sequence under StrictMode:**

1. `Probe2bPage` mounts. Auto-connect useEffect (line 549) runs: `didAutoConnect.current = true`; `setupHandlers(role)` registers three callbacks; `wsRelayService.connect(role)` opens the WS and sends JOIN.
2. StrictMode invokes the cleanup-only useEffect's cleanup (line 556): `clearSubscriptions()` removes the page's three callbacks; `wsRelayService.disconnect()` closes the WS, sets `ws=null`, and **clears all callback arrays** including App.jsx's NAVIGATE listener.
3. StrictMode re-mounts. The auto-connect useEffect re-runs setup, but `didAutoConnect.current === true` from step 1 → the body is skipped. **No reconnect happens.**
4. Final state: `wsRelayService.ws === null`, `onConnectedCallbacks.length === 0`, `onDisconnectedCallbacks.length === 0`. The page sits on "Waiting" forever with no error, no diagnostic, no recovery.

**Verified live in this session via in-browser JavaScript inspection:**
- Page state on stuck "Waiting" creator tab: `{ ws: undefined, callbackCounts: { data: 1, connected: 0, disconnected: 0 } }`. Same on helper tab.
- The single `data` callback is App.jsx's NAVIGATE listener, re-registered by App's own StrictMode re-mount.
- Manually calling `wsRelayService.connect('creator')` from the creator tab's console + `wsRelayService.connect('helper')` from the helper tab's console produced pairing in 3 seconds: `isPeerConnected: true`.
- Therefore the WS server, the relay protocol, the `?role=*` URL handling, and the click-through `handleRoleSelect` path are all fine. The auto-connect useEffect is the only broken thing.

**Why this is a Blocker:**

- This is the URL pattern a researcher would put on the participant's phone to skip the role-selector. Used in any deep-link scenario.
- The click-through path (`/probe2b` → manually click Creator card) works, because `handleRoleSelect` (line 539) is a click handler, not a useEffect, so StrictMode doesn't double-invoke it.
- Combined with NF1 (no failure surface on the waiting screen), the participant has zero way to know what's wrong or how to recover.
- This bug also explains why the morning's walkthrough succeeded (we used click-through) and this afternoon's failed (the methodology I documented in the skill says to use the URL shortcut for speed). The skill's own efficiency optimisation exposed the bug.

**Recommended fix:**

Move connection ownership to a single useEffect with proper cleanup, instead of split setup-only + cleanup-only effects:

```jsx
useEffect(() => {
  if (!validRoleParam) return;
  setupHandlers(validRoleParam);
  wsRelayService.connect(validRoleParam);
  return () => {
    clearSubscriptions();
    wsRelayService.disconnect();
  };
}, [validRoleParam, setupHandlers, clearSubscriptions]);
```

Drop the `didAutoConnect` ref and the separate cleanup-only useEffect (line 556). Under StrictMode, this runs setup → cleanup → setup, ending in a connected state. The same fix applies to `Probe3Page.jsx`.

Alternative: disable StrictMode in `main.jsx`. **Not recommended** — StrictMode catches real bugs, and this same pattern issue could surface again in production (e.g., a parent re-render that remounts the probe page).

### NF1. WS-relay pairing fails silently when stale state lingers — recovery requires server restart

Files: `vite-ws-relay-plugin.js`, `src/services/wsRelayService.js`, `src/components/decoupled/DecoupledWaitingScreen.jsx`.

During this spot-check, two clients (one Chrome window driven by Claude on `/probe2b?role=creator`, one separate Chrome window opened by the user on `/probe2b?role=helper`) both sat on their respective "Waiting for [other]" screens for at least 30 seconds. The URL params were correct, both auto-connect paths in `Probe2bPage.jsx` (line 549) should have fired, and the WS plugin's `tryPair()` should have sent PAIRED to both.

Most likely cause: residual state from the morning's pairing test left a slot occupied by a WebSocket whose `close` handler didn't fire when its tab navigated away to a non-2b route, *or* the new JOIN raced with cleanup and overwrote the slot in a way the new clients couldn't recover from. The plugin source (`vite-ws-relay-plugin.js` lines 35–93) does not log diagnostic events, so it isn't possible to confirm from a live dev server which slot is occupied at any given time.

What the participant sees: a spinner that never resolves, with no error and no retry button. The methodology document (`docs/walkthrough_method.md`) and `STUDY_PLAN.md` both assume pairing "just works"; in practice, a researcher running back-to-back pilots will hit this state and have no recovery path other than restarting the dev server.

Why it matters: this is the *first* thing both creator and helper see in Probe 2b and Probe 3. If pairing fails between participants, the session can't begin. There is no in-app diagnostic, no retry, no timeout indicator, and no documentation of "if both sides are stuck, restart the server". For a study running 10 dyads back-to-back in Nairobi, this is a real risk. Proposed fix: (a) `DecoupledWaitingScreen` shows a "Trouble connecting? Try refreshing this page" prompt after 10 s; (b) the WS plugin logs JOIN/CLOSE events to the dev-server console so the researcher can diagnose; (c) the plugin tracks WebSocket liveness with a heartbeat and evicts dead sockets so a new JOIN doesn't race against a zombie slot.

This finding upgrades M10 from the morning ("Waiting screen has no failure surface") from Major to **Blocker** for any session that runs Probe 2b or 3.

## Skill methodology improvements observed

- The skill correctly batches `navigate + wait + find + screenshot` into single `browser_batch` calls, which keeps the walk-through fast.
- The skill correctly warns about two-client requirement for 2b/3 and asked the user upfront.
- The skill caught the placeholder-Trim issue by following its own "verify clicks actually do something" rule.
- Suggested addition for skill v2: at the start of any 2b/3 spot-check, restart the dev server (or document why not). Add this to Step 2 of `SKILL.md`.

## Appendix: tested live vs. code-only

| Probe | Live | Code |
|---|---|---|
| Probe 1 — library + scene expand | ✓ | – |
| Probe 2a — Edit-by-Myself + Trim | ✓ | – |
| Probe 2b — pairing handshake | ✓ (failed — see NF1) | ✓ |
| Probe 3 — role-selector copy + suggestion data | – | ✓ |
