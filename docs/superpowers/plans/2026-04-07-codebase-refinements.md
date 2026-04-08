# Codebase Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate code duplication, fix performance issues in state management, improve accessibility edge cases, and clean up dead code across the research probe app.

**Architecture:** Extract a shared `useSpeechRecognition` hook to DRY up voice input logic. Split EventLoggerContext into separate write/read contexts to prevent re-render cascading. Memoize context values and debounce localStorage writes. Fix accessibility timing issues and add missing ARIA attributes.

**Tech Stack:** React 19, Vite, Tailwind CSS v4, Web Speech API

---

### Task 1: Extract `useSpeechRecognition` Hook

**Files:**
- Create: `src/hooks/useSpeechRecognition.js`
- Modify: `src/components/shared/InlineVQAComposer.jsx`
- Modify: `src/components/probe2/Probe2aSceneActions.jsx`
- Modify: `src/components/probe2/Probe2bSceneActions.jsx`

- [ ] **Step 1: Create the hook**

```js
// src/hooks/useSpeechRecognition.js
import { useState, useRef, useCallback } from 'react';
import { announce } from '../utils/announcer.js';

/**
 * Shared speech recognition hook.
 * @param {object} options
 * @param {string} [options.lang='en-GB'] - BCP 47 language tag
 * @param {(transcript: string) => void} options.onResult - called with final transcript
 * @param {string} [options.announcement='Listening...'] - screen reader announcement on start
 * @returns {{ isListening: boolean, toggleListening: () => void }}
 */
export default function useSpeechRecognition({
  lang = 'en-GB',
  onResult,
  announcement = 'Listening...',
} = {}) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  const toggleListening = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      announce('Voice input is not supported in this browser.');
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false);
      onResult(transcript);
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      if (event.error === 'not-allowed') {
        announce('Microphone access denied. Please allow microphone permissions.');
      }
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    announce(announcement);
  }, [isListening, lang, onResult, announcement]);

  return { isListening, toggleListening };
}
```

- [ ] **Step 2: Refactor InlineVQAComposer to use the hook**

Replace lines 6-7, 19-50 in `src/components/shared/InlineVQAComposer.jsx`:

Remove `isListening` state, `recognitionRef`, and the entire `toggleListening` callback. Replace with:

```js
import useSpeechRecognition from '../../hooks/useSpeechRecognition.js';

// Inside the component, after submitQuestion:
const { isListening, toggleListening } = useSpeechRecognition({
  onResult: submitQuestion,
  announcement: 'Listening for your question.',
});
```

Delete the `recognitionRef` import from `useRef` usage (keep `inputRef`).

- [ ] **Step 3: Refactor Probe2aSceneActions to use the hook**

Replace lines 55-56 (`isListening` state + `recognitionRef`) and lines 128-149 (`toggleListening` callback) in `src/components/probe2/Probe2aSceneActions.jsx`:

```js
import useSpeechRecognition from '../../hooks/useSpeechRecognition.js';

// Inside the component, replace isListening state + recognitionRef + toggleListening with:
const { isListening, toggleListening } = useSpeechRecognition({
  onResult: (transcript) => setIntentText(transcript),
  announcement: 'Listening for your instruction.',
});
```

Remove `useRef` from the import if no longer needed.

- [ ] **Step 4: Refactor Probe2bSceneActions to use the hook**

Replace lines 41-42 (`isListening` state + `recognitionRef`) and lines 110-131 (`toggleListening` callback) in `src/components/probe2/Probe2bSceneActions.jsx`:

```js
import useSpeechRecognition from '../../hooks/useSpeechRecognition.js';

// Inside the component:
const { isListening, toggleListening } = useSpeechRecognition({
  onResult: (transcript) => setTaskText(transcript),
  announcement: 'Listening for your instruction.',
});
```

Remove `useRef` from the import if no longer needed.

- [ ] **Step 5: Verify the app runs**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useSpeechRecognition.js src/components/shared/InlineVQAComposer.jsx src/components/probe2/Probe2aSceneActions.jsx src/components/probe2/Probe2bSceneActions.jsx
git commit -m "refactor: extract useSpeechRecognition hook to DRY up voice input"
```

---

### Task 2: Extract `playEarcon` Utility

**Files:**
- Create: `src/utils/earcon.js`
- Modify: `src/components/probe2/Probe2aSceneActions.jsx`

- [ ] **Step 1: Create earcon utility**

```js
// src/utils/earcon.js
/**
 * Play a short feedback tone using Web Audio API.
 * @param {number} [freq=660] - Frequency in Hz
 * @param {number} [duration=150] - Duration in ms
 */
export function playEarcon(freq = 660, duration = 150) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + duration / 1000);
  } catch { /* ignore audio errors */ }
}
```

- [ ] **Step 2: Update Probe2aSceneActions to import from utility**

In `src/components/probe2/Probe2aSceneActions.jsx`, delete lines 11-24 (the local `playEarcon` function). Add import:

```js
import { playEarcon } from '../../utils/earcon.js';
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/earcon.js src/components/probe2/Probe2aSceneActions.jsx
git commit -m "refactor: extract playEarcon utility"
```

---

### Task 3: Extract Shared Probe2 Base — `TaskRouterPanel`

**Files:**
- Create: `src/components/shared/TaskRouterPanel.jsx`
- Modify: `src/components/probe2/Probe2aSceneActions.jsx`
- Modify: `src/components/probe2/Probe2bSceneActions.jsx`

The Intent Locker (Probe2a) and Send to Helper (Probe2b) panels are nearly identical: voice input + text field + category pills + priority pills + submit button. Extract the shared UI.

- [ ] **Step 1: Create TaskRouterPanel**

```jsx
// src/components/shared/TaskRouterPanel.jsx
import { useState } from 'react';
import useSpeechRecognition from '../../hooks/useSpeechRecognition.js';
import { announce } from '../../utils/announcer.js';

const TASK_CATEGORIES = ['Trim', 'Colour', 'Framing', 'Audio', 'Caption', 'General Review'];
const PRIORITIES = ['Must Do', 'Nice to Have', 'Just Check'];

export default function TaskRouterPanel({
  onSubmit,
  submitLabel = 'Send',
  accentColor = '#5CB85C',
  idPrefix = 'task',
}) {
  const [taskText, setTaskText] = useState('');
  const [category, setCategory] = useState('General Review');
  const [priority, setPriority] = useState('Must Do');

  const { isListening, toggleListening } = useSpeechRecognition({
    onResult: (transcript) => setTaskText(transcript),
    announcement: 'Listening for your instruction.',
  });

  const handleSubmit = () => {
    if (!taskText.trim()) {
      announce('Please describe the task.');
      return;
    }
    onSubmit({ instruction: taskText, category, priority });
    setTaskText('');
  };

  return (
    <div className="mt-2 p-3 bg-green-50 rounded-lg border border-green-200 space-y-3">
      <div className="flex gap-2">
        <button
          onClick={toggleListening}
          aria-label={isListening ? 'Stop listening' : 'Voice input'}
          className={`flex items-center justify-center rounded ${
            isListening ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'
          }`}
          style={{ minHeight: '44px', minWidth: '44px' }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
            <rect x="7" y="1" width="4" height="10" rx="2" />
            <path d="M4 8a5 5 0 0 0 10 0" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <line x1="9" y1="14" x2="9" y2="17" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <input
          type="text"
          value={taskText}
          onChange={(e) => setTaskText(e.target.value)}
          placeholder="Describe the task..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-blue-500"
          style={{ minHeight: '44px' }}
          aria-label="Task instruction"
        />
      </div>
      <div>
        <span className="text-xs font-medium text-gray-600 block mb-1" id={`${idPrefix}-cat`}>Category</span>
        <div className="flex flex-wrap gap-1" role="group" aria-labelledby={`${idPrefix}-cat`}>
          {TASK_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              aria-pressed={category === cat}
              className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                category === cat ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              style={{ minHeight: '36px' }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="text-xs font-medium text-gray-600 block mb-1" id={`${idPrefix}-pri`}>Priority</span>
        <div className="flex gap-1" role="group" aria-labelledby={`${idPrefix}-pri`}>
          {PRIORITIES.map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              aria-pressed={priority === p}
              className={`flex-1 px-2 py-1.5 text-xs rounded transition-colors ${
                priority === p ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              style={{ minHeight: '36px' }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={handleSubmit}
        disabled={!taskText.trim()}
        className="w-full py-3 text-sm font-bold rounded text-white transition-colors disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
        style={{ backgroundColor: accentColor, minHeight: '48px' }}
      >
        {submitLabel}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Refactor Probe2aSceneActions to use TaskRouterPanel**

In `src/components/probe2/Probe2aSceneActions.jsx`:

1. Remove the `TASK_CATEGORIES` and `PRIORITIES` constants (lines 8-9).
2. Remove state variables: `intentText`, `category`, `priority`, `isListening`, `recognitionRef` (lines 52-56).
3. Remove the `toggleListening` callback entirely.
4. Replace the Intent Locker `<div>` (lines 288-376) with:

```jsx
import TaskRouterPanel from '../shared/TaskRouterPanel.jsx';

{/* Ask Helper (Intent Locker) */}
<div>
  <button
    onClick={() => setShowIntentLocker(!showIntentLocker)}
    aria-expanded={showIntentLocker}
    className="w-full py-3 text-sm font-medium rounded text-white transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
    style={{ backgroundColor: accentColor, minHeight: '48px' }}
  >
    {showIntentLocker ? 'Cancel Handover' : 'Ask Helper'}
  </button>
  {showIntentLocker && (
    <TaskRouterPanel
      idPrefix="intent-2a"
      submitLabel="Hand Over"
      accentColor="#D9534F"
      onSubmit={({ instruction, category, priority }) => {
        playEarcon(660, 150);
        logEvent(EventTypes.INTENT_LOCKED, Actors.CREATOR, {
          segmentId: scene.id, instruction, category, priority,
        });
        if (onHandover) {
          onHandover({ segmentId: scene.id, segmentName: scene.name, instruction, category, priority });
        }
        setShowIntentLocker(false);
      }}
    />
  )}
</div>
```

- [ ] **Step 3: Refactor Probe2bSceneActions to use TaskRouterPanel**

In `src/components/probe2/Probe2bSceneActions.jsx`:

1. Remove `TASK_CATEGORIES` and `PRIORITIES` constants (lines 8-9).
2. Remove state variables: `taskText`, `category`, `priority`, `isListening`, `recognitionRef` (lines 38-42).
3. Remove `toggleListening` and `handleSendToHelper` callbacks.
4. Replace the Send to Helper `<div>` (lines 258-335) with:

```jsx
import TaskRouterPanel from '../shared/TaskRouterPanel.jsx';

{/* Send to Helper */}
<div>
  <button
    onClick={() => setShowSendHelper(!showSendHelper)}
    aria-expanded={showSendHelper}
    className="w-full py-3 text-sm font-medium rounded text-white transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
    style={{ backgroundColor: accentColor, minHeight: '48px' }}
  >
    {showSendHelper ? 'Cancel' : `Send to ${helperName}`}
  </button>
  {showSendHelper && (
    <TaskRouterPanel
      idPrefix="task-2b"
      submitLabel={`Send to ${helperName}`}
      accentColor={accentColor}
      onSubmit={({ instruction, category, priority }) => {
        logEvent(EventTypes.TASK_ROUTE_HELPER, Actors.CREATOR, {
          segmentId: scene.id, instruction, category, priority,
        });
        if (onSendToHelper) {
          onSendToHelper({ segmentId: scene.id, segmentName: scene.name, instruction, category, priority });
        }
        announce(`Task sent to ${helperName}.`);
        setShowSendHelper(false);
      }}
    />
  )}
</div>
```

- [ ] **Step 4: Verify the app runs**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/TaskRouterPanel.jsx src/components/probe2/Probe2aSceneActions.jsx src/components/probe2/Probe2bSceneActions.jsx
git commit -m "refactor: extract TaskRouterPanel to DRY up Probe2a/2b handover UI"
```

---

### Task 4: Memoize EventLoggerContext Value + Fix `logEvent` Stale Closure

**Files:**
- Modify: `src/contexts/EventLoggerContext.jsx`

- [ ] **Step 1: Add useMemo and fix logEvent**

The current `logEvent` has `state.sessionStart` and `state.currentCondition` in its dependency array, meaning a new function identity on every condition/session change — but more importantly, the `value` object is recreated every render, causing all consumers to re-render on every `LOG_EVENT` dispatch.

Replace the entire `EventLoggerProvider` function in `src/contexts/EventLoggerContext.jsx`:

```jsx
import { createContext, useContext, useReducer, useCallback, useRef, useMemo } from 'react';
import { EventTypes, Actors } from '../utils/eventTypes.js';

const EventLoggerContext = createContext(null);

const initialState = {
  events: [],
  currentCondition: null,
  sessionStart: Date.now(),
};

function reducer(state, action) {
  switch (action.type) {
    case 'LOG_EVENT':
      return { ...state, events: [...state.events, action.payload] };
    case 'SET_CONDITION':
      return { ...state, currentCondition: action.payload };
    case 'CLEAR_EVENTS':
      return { ...state, events: [] };
    case 'RESET_SESSION':
      return { ...initialState, sessionStart: Date.now() };
    default:
      return state;
  }
}

export function EventLoggerProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const videoTimeRef = useRef(0);
  // Use refs for values that logEvent needs but shouldn't cause re-identity
  const sessionStartRef = useRef(state.sessionStart);
  const conditionRef = useRef(state.currentCondition);
  sessionStartRef.current = state.sessionStart;
  conditionRef.current = state.currentCondition;

  const logEvent = useCallback((eventType, actor, data = {}) => {
    const event = {
      timestamp: Date.now() - sessionStartRef.current,
      eventType,
      actor,
      data,
      videoTimestamp: videoTimeRef.current,
      condition: conditionRef.current,
    };
    dispatch({ type: 'LOG_EVENT', payload: event });
  }, []);

  const setCondition = useCallback((condition) => {
    dispatch({ type: 'SET_CONDITION', payload: condition });
  }, []);

  const setVideoTime = useCallback((time) => {
    videoTimeRef.current = time;
  }, []);

  const getEvents = useCallback((condition) => {
    if (!condition) return state.events;
    return state.events.filter((e) => e.condition === condition);
  }, [state.events]);

  const clearEvents = useCallback(() => {
    dispatch({ type: 'CLEAR_EVENTS' });
  }, []);

  const value = useMemo(() => ({
    events: state.events,
    currentCondition: state.currentCondition,
    sessionStart: state.sessionStart,
    logEvent,
    setCondition,
    setVideoTime,
    getEvents,
    clearEvents,
  }), [state.events, state.currentCondition, state.sessionStart, logEvent, setCondition, setVideoTime, getEvents, clearEvents]);

  return (
    <EventLoggerContext.Provider value={value}>
      {children}
    </EventLoggerContext.Provider>
  );
}

export function useEventLogger() {
  const context = useContext(EventLoggerContext);
  if (!context) {
    throw new Error('useEventLogger must be used within an EventLoggerProvider');
  }
  return context;
}

export { EventTypes, Actors };
```

Key changes:
- `logEvent` now has `[]` deps — reads session/condition from refs
- `value` is wrapped in `useMemo` so consumers only re-render when state actually changes
- `sessionStartRef` and `conditionRef` keep `logEvent` stable across renders

- [ ] **Step 2: Verify the app runs**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/contexts/EventLoggerContext.jsx
git commit -m "perf: memoize EventLoggerContext value and stabilize logEvent"
```

---

### Task 5: Debounce AccessibilityContext localStorage Writes

**Files:**
- Modify: `src/contexts/AccessibilityContext.jsx`

- [ ] **Step 1: Replace the useEffect with a debounced version**

In `src/contexts/AccessibilityContext.jsx`, replace lines 42-45:

```jsx
// Old:
useEffect(() => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}, [state]);
```

With:

```jsx
// Debounce localStorage writes — 500ms after last change
useEffect(() => {
  const timer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, 500);
  return () => clearTimeout(timer);
}, [state]);
```

- [ ] **Step 2: Memoize the context value**

Replace lines 63-69:

```jsx
// Old:
const value = {
  ...state,
  setTextSize,
  toggleContrast,
  toggleAudio,
  setSpeechRate,
};
```

With:

```jsx
const value = useMemo(() => ({
  ...state,
  setTextSize,
  toggleContrast,
  toggleAudio,
  setSpeechRate,
}), [state, setTextSize, toggleContrast, toggleAudio, setSpeechRate]);
```

Add `useMemo` to the import on line 1.

- [ ] **Step 3: Verify the app runs**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/AccessibilityContext.jsx
git commit -m "perf: debounce localStorage writes and memoize AccessibilityContext value"
```

---

### Task 6: Fix OnboardingBrief Focus Timing

**Files:**
- Modify: `src/components/shared/OnboardingBrief.jsx`

- [ ] **Step 1: Replace setTimeout with requestAnimationFrame**

Replace lines 6-12 in `src/components/shared/OnboardingBrief.jsx`:

```jsx
// Old:
useEffect(() => {
  const timer = setTimeout(() => {
    sectionRef.current?.focus();
  }, 100);
  return () => clearTimeout(timer);
}, [description]);
```

With:

```jsx
useEffect(() => {
  // requestAnimationFrame waits for the browser to paint,
  // ensuring the DOM is ready for screen readers on slow devices
  const raf = requestAnimationFrame(() => {
    sectionRef.current?.focus();
  });
  return () => cancelAnimationFrame(raf);
}, [description]);
```

- [ ] **Step 2: Commit**

```bash
git add src/components/shared/OnboardingBrief.jsx
git commit -m "a11y: use requestAnimationFrame for OnboardingBrief focus timing"
```

---

### Task 7: Fix SceneBlock Announcement/TTS Conflict

**Files:**
- Modify: `src/components/shared/SceneBlock.jsx`

- [ ] **Step 1: Stop TTS before announcing**

In `src/components/shared/SceneBlock.jsx`, replace lines 35-43:

```jsx
// Old:
useEffect(() => {
  if (isExpanded && actionsRef.current) {
    actionsRef.current.focus();
    announce(`Opened scene ${index + 1}. ${scene.name}. Showing actions.`);
  }
  if (!isExpanded) {
    ttsService.stop();
  }
}, [isExpanded]); // eslint-disable-line react-hooks/exhaustive-deps
```

With:

```jsx
useEffect(() => {
  if (isExpanded && actionsRef.current) {
    actionsRef.current.focus();
    // Stop any in-progress TTS before announcing to avoid collision
    ttsService.stop();
    announce(`Opened scene ${index + 1}. ${scene.name}. Showing actions.`);
  }
  if (!isExpanded) {
    ttsService.stop();
  }
  // scene.name and index are stable for the lifecycle of this block
}, [isExpanded]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 2: Commit**

```bash
git add src/components/shared/SceneBlock.jsx
git commit -m "a11y: stop TTS before announcing scene expansion to prevent collision"
```

---

### Task 8: Add Missing `aria-expanded` Attributes

**Files:**
- Modify: `src/components/shared/InlineVQAComposer.jsx`

- [ ] **Step 1: Add aria-expanded to voice button**

In `src/components/shared/InlineVQAComposer.jsx`, on the voice input button (line 62), add `aria-expanded`:

```jsx
// Old:
<button
  onClick={toggleListening}
  aria-label={isListening ? 'Stop listening' : 'Voice input — speak your question'}
  className={...}
```

```jsx
// New:
<button
  onClick={toggleListening}
  aria-label={isListening ? 'Stop listening' : 'Voice input — speak your question'}
  aria-expanded={isListening}
  className={...}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/shared/InlineVQAComposer.jsx
git commit -m "a11y: add aria-expanded to voice input button"
```

---

### Task 9: Remove Empty StudyLayout Wrapper

**Files:**
- Modify: `src/App.jsx`
- Delete: `src/components/shared/StudyLayout.jsx`

- [ ] **Step 1: Check if StudyLayout receives or uses the `condition` prop**

Looking at the current code, `StudyLayout` receives `condition` as a prop but does nothing with it — it just renders `{children}`. The `condition` prop is not passed down. Confirm no other file imports it:

Run: `grep -r "StudyLayout" src/ --include="*.jsx" --include="*.js"`

- [ ] **Step 2: Remove StudyLayout from App.jsx**

In `src/App.jsx`, remove the import (line 12) and unwrap all `<StudyLayout>` wrappers (lines 55-58):

```jsx
// Old:
import StudyLayout from './components/shared/StudyLayout.jsx'
// ...
<Route path="/probe1" element={<StudyLayout condition="probe1"><Probe1Page /></StudyLayout>} />
<Route path="/probe2" element={<StudyLayout condition="probe2a"><Probe2Page /></StudyLayout>} />
<Route path="/probe2b" element={<StudyLayout condition="probe2b"><Probe2bPage /></StudyLayout>} />
<Route path="/probe3" element={<StudyLayout condition="probe3"><Probe3Page /></StudyLayout>} />
```

```jsx
// New:
<Route path="/probe1" element={<Probe1Page />} />
<Route path="/probe2" element={<Probe2Page />} />
<Route path="/probe2b" element={<Probe2bPage />} />
<Route path="/probe3" element={<Probe3Page />} />
```

- [ ] **Step 3: Delete StudyLayout.jsx**

```bash
rm src/components/shared/StudyLayout.jsx
```

- [ ] **Step 4: Verify the app runs**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git rm src/components/shared/StudyLayout.jsx
git commit -m "cleanup: remove empty StudyLayout wrapper"
```

---

### Task 10: Rename Probe3.jsx to Probe3Page.jsx

**Files:**
- Rename: `src/pages/Probe3.jsx` -> `src/pages/Probe3Page.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Rename the file**

```bash
cd src/pages && git mv Probe3.jsx Probe3Page.jsx
```

- [ ] **Step 2: Update the import in App.jsx**

In `src/App.jsx`, change:

```jsx
// Old:
import Probe3Page from './pages/Probe3.jsx'
```

```jsx
// New:
import Probe3Page from './pages/Probe3Page.jsx'
```

- [ ] **Step 3: Verify the app runs**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Probe3Page.jsx src/App.jsx
git rm src/pages/Probe3.jsx  # already handled by git mv
git commit -m "cleanup: rename Probe3.jsx to Probe3Page.jsx for consistency"
```

---

### Task 11: Change sr-announcer from `assertive` to `polite`

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Change aria-live from assertive to polite**

In `src/App.jsx`, line 50:

```jsx
// Old:
<div id="sr-announcer" role="status" aria-live="assertive" className="sr-only" />
```

```jsx
// New:
<div id="sr-announcer" role="status" aria-live="polite" className="sr-only" />
```

This prevents announcements from interrupting in-progress TTS speech. `role="status"` already implies `polite`, so this also makes the attributes consistent.

- [ ] **Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "a11y: change sr-announcer to aria-live=polite to avoid TTS interruptions"
```

---

## Execution Summary

| Task | Type | Impact |
|------|------|--------|
| 1 | DRY / Bug fix | Eliminates 3x duplicated voice input code + adds error handling |
| 2 | DRY | Extracts earcon utility |
| 3 | DRY | Extracts shared task routing panel (~100 lines saved per probe) |
| 4 | Performance | Prevents re-render cascade on every logged event |
| 5 | Performance | Debounces localStorage writes + memoizes context value |
| 6 | Accessibility | More reliable screen reader focus on slow devices |
| 7 | Accessibility | Prevents TTS/announcement collision |
| 8 | Accessibility | Missing ARIA attribute |
| 9 | Cleanup | Removes dead code |
| 10 | Cleanup | Naming consistency |
| 11 | Accessibility | Prevents assertive announcements from cutting off TTS |
