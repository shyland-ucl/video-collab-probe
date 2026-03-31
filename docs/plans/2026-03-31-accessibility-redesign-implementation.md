# Accessibility Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix critical accessibility barriers found during BLV user testing — simplify landing page, reduce onboarding verbosity, and move probe navigation control to the researcher dashboard via WebSocket.

**Architecture:** Extend the existing WS relay to support a `researcher` role that broadcasts to all connected `participant` clients. Participant phones connect on startup and auto-navigate when the researcher triggers probe changes. Remove ConditionNav entirely from participant UI.

**Tech Stack:** React 19, react-router-dom v7, WebSocket (existing wsRelayService + vite-ws-relay-plugin)

---

### Task 1: Extend WS Relay Server to Support Researcher + Participant Roles

**Files:**
- Modify: `vite-ws-relay-plugin.js`

**Step 1: Add researcher and participant tracking**

In `vite-ws-relay-plugin.js`, extend the server to track a `researcher` socket and an array of `participant` sockets alongside the existing `creator`/`helper`. When a researcher sends a message, broadcast it to all other connected clients (participants, creator, helper).

```js
// Replace the existing variables after `const wss = new WebSocketServer({ noServer: true });`
let creator = null;
let helper = null;
let researcher = null;
const participants = new Set();
```

**Step 2: Update the JOIN handler**

In the `ws.on('message')` handler, extend the JOIN case:

```js
if (msg.type === 'JOIN') {
  role = msg.role;
  if (role === 'creator') {
    creator = ws;
  } else if (role === 'helper') {
    helper = ws;
  } else if (role === 'researcher') {
    researcher = ws;
  } else if (role === 'participant') {
    participants.add(ws);
  }
  tryPair();
  return;
}
```

**Step 3: Update the relay logic**

Replace the simple peer relay with role-aware routing:

```js
// After the JOIN handler:
// Researcher broadcasts to all clients
if (role === 'researcher') {
  const targets = [creator, helper, ...participants].filter(
    (t) => t && t.readyState === 1
  );
  for (const target of targets) {
    target.send(raw.toString());
  }
  return;
}

// Creator/helper relay to each other (existing behavior)
const peer = role === 'creator' ? helper : creator;
if (peer && peer.readyState === 1) {
  peer.send(raw.toString());
}
```

**Step 4: Update the close handler**

```js
ws.on('close', () => {
  if (role === 'researcher') {
    researcher = null;
  } else if (role === 'participant') {
    participants.delete(ws);
  } else {
    const peer = role === 'creator' ? helper : creator;
    if (role === 'creator') creator = null;
    if (role === 'helper') helper = null;
    if (peer && peer.readyState === 1) {
      peer.send(JSON.stringify({ type: 'PEER_DISCONNECTED' }));
    }
  }
});
```

**Step 5: Verify dev server starts**

Run: `npm run dev`
Expected: Dev server starts without errors. WS relay is available at `/__ws_relay`.

**Step 6: Commit**

```bash
git add vite-ws-relay-plugin.js
git commit -m "feat: extend WS relay to support researcher broadcast and participant roles"
```

---

### Task 2: Simplify SessionSetupPage to Minimal Researcher Start Screen

**Files:**
- Modify: `src/pages/SessionSetupPage.jsx`

**Step 1: Strip accessibility settings and study phases**

Remove the entire "Accessibility Preferences" section (text size radio group, high contrast toggle, audio descriptions toggle, speech rate slider) and the "Study Phases" ordered list. Remove the `useAccessibility` import and all its destructured values.

Keep only:
- Header (simplified)
- Dyad ID input
- Start button

**Step 2: Add waiting state with WS connection**

After the researcher presses Start:
- Save session config to localStorage (keep existing logic)
- Connect to wsRelayService as `'participant'`
- Show a "Waiting for researcher" screen
- Listen for `{ type: 'NAVIGATE', path: '...' }` messages
- On receiving NAVIGATE, call `navigate(msg.path)`

Replace the current `SessionSetupPage` with:

```jsx
import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEventLogger } from '../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../utils/eventTypes.js';
import { wsRelayService } from '../services/wsRelayService.js';

function generateUUID() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function SessionSetupPage() {
  const navigate = useNavigate();
  const { logEvent, setCondition } = useEventLogger();

  const [dyadId, setDyadId] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [connected, setConnected] = useState(false);

  // Restore dyad ID from localStorage if exists
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sessionConfig');
      if (stored) {
        const config = JSON.parse(stored);
        if (config.dyadId) setDyadId(config.dyadId);
      }
    } catch {
      // ignore
    }
  }, []);

  // Listen for NAVIGATE messages when waiting
  useEffect(() => {
    if (!waiting) return;

    const unsubData = wsRelayService.onData((msg) => {
      if (msg.type === 'NAVIGATE' && msg.path) {
        navigate(msg.path);
      }
    });

    const unsubConnected = wsRelayService.onConnected(() => {
      setConnected(true);
    });

    return () => {
      unsubData();
      unsubConnected();
    };
  }, [waiting, navigate]);

  const handleStart = useCallback(() => {
    if (!dyadId.trim()) return;

    const sessionId = generateUUID();
    const config = {
      sessionId,
      dyadId: dyadId.trim(),
      conditionOrder: ['probe1', 'probe2a', 'probe2b', 'probe3'],
      completedConditions: [],
      startedAt: new Date().toISOString(),
    };

    localStorage.setItem('sessionConfig', JSON.stringify(config));

    setCondition(null);
    logEvent(EventTypes.SESSION_START, Actors.RESEARCHER, {
      sessionId,
      dyadId: dyadId.trim(),
      conditionOrder: config.conditionOrder,
    });

    // Connect as participant and wait for researcher navigation
    wsRelayService.connect('participant');
    setWaiting(true);
  }, [dyadId, logEvent, setCondition]);

  if (waiting) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div
            className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center"
            style={{ backgroundColor: '#1F3864' }}
            aria-hidden="true"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <h1
            className="text-xl font-bold mb-2"
            style={{ color: '#1F3864' }}
          >
            Ready
          </h1>
          <p
            className="text-gray-600 text-base"
            role="status"
            aria-live="polite"
          >
            Waiting for the researcher to begin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div
        className="w-full px-4 py-3"
        style={{ backgroundColor: '#1F3864' }}
        role="banner"
      >
        <h1 className="text-white font-bold text-lg">Session Setup</h1>
      </div>

      <div className="max-w-xl mx-auto mt-8 px-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="mb-5">
            <label
              htmlFor="dyad-id"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Participant Dyad ID <span className="text-red-500">*</span>
            </label>
            <input
              id="dyad-id"
              type="text"
              value={dyadId}
              onChange={(e) => setDyadId(e.target.value)}
              placeholder="e.g. D01, D02..."
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-blue-500"
              aria-required="true"
              required
            />
          </div>

          <button
            onClick={handleStart}
            disabled={!dyadId.trim()}
            className="w-full py-3 rounded text-white font-bold text-base transition-colors disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
            style={{ backgroundColor: '#1F3864', minHeight: '48px' }}
          >
            Start Session
          </button>
        </div>

        <div className="mt-4 text-center text-sm text-gray-400">
          <a
            href="/researcher"
            className="underline hover:text-gray-600 focus:outline-2 focus:outline-blue-500"
          >
            Researcher Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Verify it renders**

Run: `npm run dev`, open `/` in browser.
Expected: Shows only Dyad ID input + Start button. No accessibility settings. No study phases list. After clicking Start, shows "Waiting for the researcher to begin."

**Step 4: Commit**

```bash
git add src/pages/SessionSetupPage.jsx
git commit -m "feat: simplify session setup to minimal researcher start screen"
```

---

### Task 3: Simplify OnboardingBrief to Title + One Sentence + Start

**Files:**
- Modify: `src/components/shared/OnboardingBrief.jsx`

**Step 1: Simplify CONDITION_BRIEFS data**

Replace the `steps` arrays with just `title` and `summary` (one clear sentence each). Remove `buildProjectTourBrief` function.

```js
const CONDITION_BRIEFS = {
  probe1: {
    title: 'AI Scene Explorer',
    color: '#2B579A',
    summary: 'Explore video scenes using AI-generated descriptions.',
  },
  probe2: {
    title: 'Smart Handover',
    color: '#5CB85C',
    summary: 'Mark scenes and hand over editing tasks to a sighted helper.',
  },
  probe2b: {
    title: 'Decoupled Coordination',
    color: '#5CB85C',
    summary: 'Work on separate phones with shared project updates.',
  },
  probe3: {
    title: 'Proactive AI Collaboration',
    color: '#9B59B6',
    summary: 'Edit across two phones while AI surfaces suggestions.',
  },
};
```

**Step 2: Simplify the component render**

Replace the entire component with a minimal 3-element dialog:

```jsx
import { useEffect, useRef } from 'react';
import { announce } from '../../utils/announcer.js';

const CONDITION_BRIEFS = {
  probe1: {
    title: 'AI Scene Explorer',
    color: '#2B579A',
    summary: 'Explore video scenes using AI-generated descriptions.',
  },
  probe2: {
    title: 'Smart Handover',
    color: '#5CB85C',
    summary: 'Mark scenes and hand over editing tasks to a sighted helper.',
  },
  probe2b: {
    title: 'Decoupled Coordination',
    color: '#5CB85C',
    summary: 'Work on separate phones with shared project updates.',
  },
  probe3: {
    title: 'Proactive AI Collaboration',
    color: '#9B59B6',
    summary: 'Edit across two phones while AI surfaces suggestions.',
  },
};

export default function OnboardingBrief({ condition, onDismiss, guide = null }) {
  const headingRef = useRef(null);

  const brief = guide || CONDITION_BRIEFS[condition];

  useEffect(() => {
    if (!brief) {
      onDismiss?.();
      return;
    }
    const timer = window.setTimeout(() => {
      headingRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [brief, onDismiss]);

  if (!brief) return null;

  const dismissLabel = brief.dismissLabel || "Start";
  const titleId = `${condition || 'guide'}-onboarding-title`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto">
        <div className="px-6 py-5" style={{ backgroundColor: brief.color }}>
          <h2
            ref={headingRef}
            id={titleId}
            tabIndex={-1}
            className="text-white font-bold text-xl focus:outline-none"
          >
            {brief.title}
          </h2>
        </div>

        <div className="px-6 py-5">
          <p className="text-base text-gray-700">{brief.summary}</p>
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={() => {
              announce(`Starting ${brief.title}`);
              onDismiss?.();
            }}
            className="w-full py-4 rounded-xl text-white font-bold text-base transition-colors hover:brightness-110 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
            style={{ backgroundColor: brief.color, minHeight: '48px' }}
          >
            {dismissLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Update callers that pass `projectStats`**

In `src/pages/Probe1Page.jsx`, find the `<OnboardingBrief>` that passes `projectStats` and remove that prop (the component no longer accepts it). Check that all callers in these files still work:
- `src/pages/Probe1Page.jsx`
- `src/pages/Probe2Page.jsx`
- `src/pages/Probe2bPage.jsx`
- `src/pages/Probe3.jsx`
- `src/components/decoupled/DecoupledRoleSelector.jsx`
- `src/components/decoupled/DecoupledWaitingScreen.jsx`

Remove any `projectStats` prop from the callers. The `guide` prop can stay if used (for custom tour guides).

**Step 4: Verify in browser**

Run: `npm run dev`, navigate to `/probe1`.
Expected: Onboarding overlay shows title + one sentence + Start button. TalkBack: focus on title → swipe → summary → swipe → Start button. Three elements.

**Step 5: Commit**

```bash
git add src/components/shared/OnboardingBrief.jsx src/pages/Probe1Page.jsx src/pages/Probe2Page.jsx src/pages/Probe2bPage.jsx src/pages/Probe3.jsx src/components/decoupled/DecoupledRoleSelector.jsx src/components/decoupled/DecoupledWaitingScreen.jsx
git commit -m "feat: simplify onboarding to title + one sentence for screen reader clarity"
```

---

### Task 4: Remove ConditionNav from StudyLayout

**Files:**
- Modify: `src/components/shared/StudyLayout.jsx`
- Delete: `src/components/shared/ConditionNav.jsx`

**Step 1: Simplify StudyLayout**

Replace `StudyLayout` to just render children without ConditionNav or bottom padding:

```jsx
export default function StudyLayout({ children }) {
  return <>{children}</>;
}
```

Remove the `ConditionNav` import.

**Step 2: Delete ConditionNav**

Delete `src/components/shared/ConditionNav.jsx`.

**Step 3: Verify no remaining imports**

Search the codebase for any remaining `ConditionNav` imports. There should be none — it's only used in `StudyLayout.jsx`.

**Step 4: Verify pages still render**

Run: `npm run dev`, navigate to `/probe1`, `/probe2`, `/probe2b`, `/probe3`.
Expected: Pages render without bottom navigation bar. No layout shift from removed padding.

**Step 5: Commit**

```bash
git add src/components/shared/StudyLayout.jsx
git rm src/components/shared/ConditionNav.jsx
git commit -m "feat: remove ConditionNav, navigation now controlled by researcher dashboard"
```

---

### Task 5: Add Navigation Controls to Researcher Dashboard

**Files:**
- Modify: `src/pages/ResearcherPage.jsx`

**Step 1: Connect researcher to WS on mount**

Add a `useEffect` that connects to `wsRelayService` as `'researcher'` when the page mounts, and disconnects on unmount:

```jsx
// At the top of ResearcherPage component, after existing state:
useEffect(() => {
  wsRelayService.connect('researcher');
  return () => wsRelayService.disconnect();
}, []);
```

**Step 2: Add navigation handler**

```jsx
const handleNavigatePhone = useCallback((path) => {
  wsRelayService.sendData({ type: 'NAVIGATE', path });
}, []);
```

**Step 3: Add navigation buttons section**

Add a new card in the right column (Session Controls area), after the existing Session Controls card:

```jsx
<div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
  <h2 className="font-bold text-sm mb-3" style={{ color: COLORS.navy }}>
    Navigate Participant Phones
  </h2>
  <div className="space-y-1.5">
    <button
      onClick={() => handleNavigatePhone('/probe1')}
      className="w-full py-2 px-3 rounded text-sm font-medium text-white transition-colors focus:outline-2 focus:outline-offset-2"
      style={{ backgroundColor: COLORS.blue }}
    >
      Go to Probe 1
    </button>
    <button
      onClick={() => handleNavigatePhone('/probe2')}
      className="w-full py-2 px-3 rounded text-sm font-medium text-white transition-colors focus:outline-2 focus:outline-offset-2"
      style={{ backgroundColor: COLORS.green }}
    >
      Go to Probe 2a
    </button>
    <button
      onClick={() => handleNavigatePhone('/probe2b')}
      className="w-full py-2 px-3 rounded text-sm font-medium text-white transition-colors focus:outline-2 focus:outline-offset-2"
      style={{ backgroundColor: COLORS.green }}
    >
      Go to Probe 2b
    </button>
    <button
      onClick={() => handleNavigatePhone('/probe3')}
      className="w-full py-2 px-3 rounded text-sm font-medium text-white transition-colors focus:outline-2 focus:outline-offset-2"
      style={{ backgroundColor: COLORS.purple }}
    >
      Go to Probe 3
    </button>
  </div>
</div>
```

Place this card between the "Session Controls" card and the "Quick Links" card in the right column.

**Step 4: Add wsRelayService import**

Add at the top of the file (it's already imported — verify. If not, add):

```js
import { wsRelayService } from '../services/wsRelayService.js';
```

(Note: wsRelayService is already imported in this file.)

**Step 5: Verify in browser**

Run: `npm run dev`, open `/researcher`.
Expected: New "Navigate Participant Phones" card appears with 4 colored buttons. Clicking sends WS messages.

**Step 6: Commit**

```bash
git add src/pages/ResearcherPage.jsx
git commit -m "feat: add probe navigation controls to researcher dashboard via WebSocket"
```

---

### Task 6: Add Global WS Navigation Listener to App.jsx

**Files:**
- Modify: `src/App.jsx`

**Step 1: Add navigation listener in AppShell**

The participant phone needs to listen for NAVIGATE messages even when already inside a probe page. Add a `useEffect` in `AppShell` that listens for NAVIGATE messages:

```jsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
// ... existing imports

function AppShell() {
  const { highContrast, textSize } = useAccessibility()
  const navigate = useNavigate()

  // Listen for researcher navigation commands via WebSocket
  useEffect(() => {
    const unsubscribe = wsRelayService.onData((msg) => {
      if (msg.type === 'NAVIGATE' && msg.path) {
        navigate(msg.path);
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // ... rest of component
}
```

Add the import for `wsRelayService`:

```js
import { wsRelayService } from './services/wsRelayService.js'
```

Note: This listener works in addition to the one in `SessionSetupPage` waiting state. Once the phone navigates away from the setup page, the App-level listener takes over for subsequent probe changes. The `SessionSetupPage` listener handles the initial navigation from the waiting screen. Having both is harmless — `navigate()` to the same path is a no-op.

**Step 2: Verify end-to-end flow**

1. Open `/` on one browser tab (participant phone)
2. Open `/researcher` on another tab (researcher dashboard)
3. On phone: enter dyad ID, tap Start → shows "Waiting for researcher"
4. On researcher: click "Go to Probe 1" → phone auto-navigates to `/probe1`
5. On researcher: click "Go to Probe 2a" → phone auto-navigates to `/probe2`

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add global WS navigation listener for researcher-controlled probe switching"
```

---

### Task 7: Build Verification and Cleanup

**Files:**
- All modified files

**Step 1: Run production build**

Run: `npm run build`
Expected: Build succeeds with no errors. Check that the deleted `ConditionNav.jsx` causes no import errors.

**Step 2: Verify no dead imports**

Search for any remaining references to deleted code:
- `ConditionNav` — should only appear in git history
- `buildProjectTourBrief` — should be gone
- `speechRate`, `setSpeechRate` in SessionSetupPage — should be gone

**Step 3: Commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: cleanup dead imports and verify build"
```
