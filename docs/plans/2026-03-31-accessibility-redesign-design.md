# Accessibility Redesign — Post-BLV User Testing

**Date:** 2026-03-31
**Motivation:** Internal testing with a blind content creator revealed critical accessibility barriers in the participant-facing UI.

---

## Problem Summary

1. **Landing page (SessionSetupPage):** Participants shouldn't need to fill in session IDs or configure accessibility settings — researcher handles setup, and participants use their own TalkBack.
2. **Onboarding (OnboardingBrief):** Screen reader reads the entire dialog (title + summary + all 4 steps) as one block, overwhelming the user. Participant couldn't navigate independently.
3. **Bottom tabs (ConditionNav):** Unnecessary on participant phones. Researcher should control which probe is active from the dashboard.

---

## Design

### 1. Minimal Researcher Start Screen

**Replace** the current `SessionSetupPage` content. Remove:
- Accessibility preferences section (text size, contrast, audio/speech rate)
- Study phases display
- Session ID field (auto-generate silently)

**Keep:**
- Dyad ID input (required)
- Start button

**Add:**
- After pressing Start, phone enters a **"Waiting for researcher"** state
- Phone connects to the WebSocket relay as role `"participant"`
- Displays a simple message: "Connected. Waiting for the researcher to begin."
- When the researcher starts a condition from the dashboard, the phone auto-navigates

**Screen reader experience:** Two elements — one input, one button. Then a status message while waiting.

### 2. Simplified Onboarding

**Replace** the current multi-step dialog with a minimal overlay:
- **Title** (e.g., "AI Scene Explorer")
- **One sentence** summary (e.g., "Explore video scenes using AI-generated descriptions.")
- **"Start" button**

Remove:
- The 4-step numbered guide
- `aria-describedby` pointing to the steps list
- `buildProjectTourBrief` multi-step variant

The `CONDITION_BRIEFS` object will keep only `title` and `summary` (rewritten as a single clear sentence). The `steps` array and `sectionTitle` are removed.

**Screen reader experience:** Focus lands on title, user swipes once to hear summary, swipes again to reach Start button. Three elements total.

### 3. Researcher-Controlled Navigation via WebSocket

#### 3a. WS Relay Extension

The current `vite-ws-relay-plugin.js` only tracks one `creator` and one `helper`. Extend to support:
- **`researcher`** role — can send messages to all connected clients
- **`participant`** role — receives broadcast messages from researcher (replaces the waiting phone)
- Keep existing `creator`/`helper` pairing for Probe 2b/3 dual-device sync

Server changes:
- Track `researcher` socket (at most one)
- Track multiple `participant` sockets (array)
- When researcher sends a message, broadcast to all participants + creator + helper
- New message type: `{ type: 'NAVIGATE', path: '/probe1' }`

Client (`wsRelayService.js`) changes:
- Add `connect('participant')` and `connect('researcher')` as valid roles
- No structural API changes needed — `onData` callback already receives all messages

#### 3b. Researcher Dashboard — Navigation Controls

Add a **"Navigate Participant Phones"** section to the researcher dashboard:
- Buttons for each probe: "Go to Probe 1", "Go to Probe 2a", "Go to Probe 2b", "Go to Probe 3"
- Clicking sends `{ type: 'NAVIGATE', path: '/probe1' }` via wsRelayService
- These buttons exist alongside the existing "Start/End Condition" buttons

The researcher connects to WS as role `"researcher"` when the dashboard loads.

#### 3c. Participant Phone — Navigation Listener

In `App.jsx` (or a new `useResearcherNav` hook):
- After the participant connects to WS, listen for `NAVIGATE` messages
- On receiving `{ type: 'NAVIGATE', path: '/probe1' }`, call `navigate(path)`
- This works from the waiting screen AND from within any probe page

#### 3d. Remove ConditionNav

- Remove `ConditionNav` from `StudyLayout`
- `StudyLayout` becomes a simple wrapper (just renders `children`)
- Remove the `pb-16` bottom padding that compensated for the fixed nav bar
- Delete `ConditionNav.jsx`

---

## Files Changed

| File | Action |
|------|--------|
| `src/pages/SessionSetupPage.jsx` | Simplify to dyad ID + start + waiting state |
| `src/components/shared/OnboardingBrief.jsx` | Simplify to title + 1 sentence + start button |
| `src/components/shared/ConditionNav.jsx` | **Delete** |
| `src/components/shared/StudyLayout.jsx` | Remove ConditionNav import/usage |
| `vite-ws-relay-plugin.js` | Add researcher + participant roles, broadcast support |
| `src/services/wsRelayService.js` | No structural changes (roles are just strings) |
| `src/pages/ResearcherPage.jsx` | Add navigation buttons, connect as researcher role |
| `src/App.jsx` | Add WS navigation listener for participant phones |

---

## Out of Scope

- Changing the probe pages themselves (Probe1Page, Probe2Page, etc.)
- Modifying the actual editing/collaboration UX within probes
- TalkBack-specific customizations (participants configure their own assistive tech)
