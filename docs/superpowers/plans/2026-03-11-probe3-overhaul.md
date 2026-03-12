# Probe 3 Overhaul — Adopt Probe 2 Patterns with WebSocket Sync

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite Probe 3 to use the same UI patterns as Probe 2 (VideoLibrary, ExplorationMode, voice notes, marks, handover flow, MockEditorVisual) while keeping the dual-device WebSocket architecture.

**Architecture:** Creator device gets ExplorationMode with voice notes + marks (like Probe 2 CreatorMode). Helper device gets MockEditorVisual with TaskQueue (like Probe 2 HelperMode). Handover sends marks via WebSocket instead of physical device pass. VideoLibrary added as first phase for both roles — creator gets text summaries, helper gets video previews.

**Tech Stack:** React 19, Vite, Tailwind CSS v4, WebSocket relay (wsRelayService)

---

## File Structure

### Modified Files
- `src/pages/Probe3.jsx` — Complete rewrite: add VideoLibrary phase, marks state, handover flow, HandoverTransition, HandoverSuggestion
- `src/components/probe3/CreatorDevice.jsx` — Replace with ExplorationMode + voice notes + marks (mirror Probe 2 CreatorMode)
- `src/components/probe3/HelperDevice.jsx` — Replace with MockEditorVisual + TaskQueue + handover UI (mirror Probe 2 HelperMode)
- `src/components/probe1/VideoLibrary.jsx` — Add `showPreview` prop for helper video thumbnails

### Kept As-Is
- `src/components/probe3/WorkspaceAwareness.jsx` — Still used in HelperDevice
- `src/services/wsRelayService.js` — No changes needed (new message types are just JSON objects)
- All Probe 2 components (`HandoverModeSelector`, `HandoverTransition`, `HandoverSuggestion`, `VoiceNoteRecorder`, `MarkList`, `TaskQueue`, `ResearcherHandoverPanel`) — Reused directly from probe2/

---

## Chunk 1: VideoLibrary Enhancement + Probe3Page Rewrite

### Task 1: Add `showPreview` prop to VideoLibrary

**Files:**
- Modify: `src/components/probe1/VideoLibrary.jsx`

- [ ] **Step 1: Add showPreview prop and video thumbnail**

Add `showPreview` boolean prop. When true, render a small `<video>` element (muted, no controls, poster frame) inside each video item card, between the checkbox and the text content.

```jsx
export default function VideoLibrary({ videos, onImport, showPreview = false }) {
```

Inside the video button, after the checkbox div and before the text div, add:

```jsx
{showPreview && (
  <video
    src={video.src}
    muted
    playsInline
    preload="metadata"
    className="w-20 h-14 rounded object-cover bg-gray-200 shrink-0"
    aria-hidden="true"
    onLoadedMetadata={(e) => { e.target.currentTime = 1; }}
  />
)}
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/probe1/VideoLibrary.jsx
git commit -m "feat(probe3): add showPreview prop to VideoLibrary for helper video thumbnails"
```

---

### Task 2: Rewrite Probe3Page.jsx

**Files:**
- Modify: `src/pages/Probe3.jsx`

This is the largest change. The new Probe3Page has these phases:
1. `roleSelect` — Choose creator/helper (existing)
2. `library` — VideoLibrary selection (NEW)
3. `waiting` — Wait for peer connection (existing)
4. `active` — Main session (existing, but now with handover flow)

- [ ] **Step 1: Add new imports**

Replace existing imports with:

```jsx
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadDescriptions } from '../data/sampleDescriptions.js';
import { useEventLogger } from '../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../utils/eventTypes.js';
import { announce } from '../utils/announcer.js';
import { buildInitialSources, buildAllSegments, getTotalDuration } from '../utils/buildInitialSources.js';
import { wsRelayService } from '../services/wsRelayService.js';
import ConditionHeader from '../components/shared/ConditionHeader.jsx';
import OnboardingBrief from '../components/shared/OnboardingBrief.jsx';
import VideoLibrary from '../components/probe1/VideoLibrary.jsx';
import ResearcherVQAPanel from '../components/probe1/ResearcherVQAPanel.jsx';
import CreatorDevice from '../components/probe3/CreatorDevice.jsx';
import HelperDevice from '../components/probe3/HelperDevice.jsx';
import HandoverModeSelector from '../components/probe2/HandoverModeSelector.jsx';
import HandoverTransition from '../components/probe2/HandoverTransition.jsx';
import HandoverSuggestion from '../components/probe2/HandoverSuggestion.jsx';
import ResearcherHandoverPanel from '../components/probe2/ResearcherHandoverPanel.jsx';
```

- [ ] **Step 2: Add new state variables**

Add to the component state:

```jsx
// Phase: roleSelect -> library -> waiting -> active
const [phase, setPhase] = useState(validRoleParam ? 'waiting' : 'roleSelect');

// Video library
const [selectedVideos, setSelectedVideos] = useState(null);

// Marks (voice notes + segment markers) — creator side
const [marks, setMarks] = useState([]);

// Handover state
const [handoverMode, setHandoverMode] = useState(null); // 'tasks' | 'live' | null
const [showModeSelector, setShowModeSelector] = useState(false);
const [isTransitioning, setIsTransitioning] = useState(false);
const [transitionDirection, setTransitionDirection] = useState(null);
const [pendingSuggestion, setPendingSuggestion] = useState(null);

// Helper-received tasks (sent via WebSocket from creator)
const [helperTasks, setHelperTasks] = useState([]);
const [helperHandoverMode, setHelperHandoverMode] = useState(null);
```

- [ ] **Step 3: Add projectData / allVideos / handleImport**

Mirror the Probe1Page pattern for building project data from selected videos:

```jsx
const projectData = useMemo(() => {
  if (selectedVideos && data) {
    return {
      videos: data.videos
        ? data.videos.filter((v) => selectedVideos.some((sv) => sv.id === v.id))
        : [data.video],
    };
  }
  return data;
}, [data, selectedVideos]);

const segments = useMemo(() => buildAllSegments(projectData), [projectData]);
const videoDuration = useMemo(() => getTotalDuration(projectData), [projectData]);
const initialSources = useMemo(() => buildInitialSources(projectData), [projectData]);

const allVideos = useMemo(() => {
  if (!data) return [];
  if (data.videos) return data.videos;
  if (data.video) return [data.video];
  return [];
}, [data]);

const handleImport = useCallback((videos) => {
  setSelectedVideos(videos);
  const SOURCE_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#84CC16'];
  const sources = [];
  const clips = [];
  videos.forEach((v, srcIdx) => {
    const color = SOURCE_COLORS[srcIdx % SOURCE_COLORS.length];
    sources.push({ id: v.id, name: v.title || 'Untitled', src: v.src, duration: v.duration });
    const segs = v.segments || [];
    if (segs.length > 0) {
      segs.forEach((seg) => {
        clips.push({
          id: seg.id, sourceId: v.id, name: seg.name,
          startTime: seg.start_time, endTime: seg.end_time,
          color: seg.color || color, trimStart: 0, trimEnd: 0,
        });
      });
    } else {
      clips.push({
        id: `clip-${v.id}`, sourceId: v.id, name: v.title || 'Untitled',
        startTime: 0, endTime: v.duration || 0, color, trimStart: 0, trimEnd: 0,
      });
    }
  });
  setEditState({ clips, captions: [], sources });
  setPhase('waiting');
  logEvent(EventTypes.IMPORT_VIDEO, Actors[role === 'creator' ? 'CREATOR' : 'HELPER'], {
    videoIds: videos.map((v) => v.id), count: videos.length,
  });
  announce(`Project created with ${videos.length} video${videos.length > 1 ? 's' : ''}.`);
}, [logEvent, role]);
```

- [ ] **Step 4: Add marks management handlers**

```jsx
const handleAddMark = useCallback((mark) => {
  setMarks((prev) => [...prev, mark]);
}, []);

const handleDeleteMark = useCallback((markId) => {
  setMarks((prev) => prev.filter((m) => m.id !== markId));
}, []);
```

- [ ] **Step 5: Add handover flow handlers**

```jsx
const handleInitiateHandover = useCallback(() => {
  logEvent(EventTypes.HANDOVER_INITIATED, Actors.CREATOR, { fromMode: 'creator', markCount: marks.length });
  setShowModeSelector(true);
}, [logEvent, marks.length]);

const handleSelectHandoverMode = useCallback((selectedMode) => {
  setShowModeSelector(false);
  setHandoverMode(selectedMode);

  if (selectedMode === 'tasks') {
    logEvent(EventTypes.HANDOVER_TASKS, Actors.CREATOR, { taskCount: marks.length });
  } else {
    logEvent(EventTypes.HANDOVER_LIVE, Actors.CREATOR);
  }

  // Send handover data to helper via WebSocket
  wsRelayService.sendData({
    type: selectedMode === 'tasks' ? 'HANDOVER_TASKS' : 'HANDOVER_LIVE',
    marks: selectedMode === 'tasks' ? marks.map((m) => ({
      id: m.id, segmentId: m.segmentId, segmentName: m.segmentName,
      audioDuration: m.audioDuration, timestamp: m.timestamp,
      // Note: audioBlob cannot be sent via WebSocket — voice notes are creator-local
    })) : [],
    actor: 'CREATOR',
  });

  // Start transition animation
  setTransitionDirection('toHelper');
  setIsTransitioning(true);
}, [logEvent, marks]);

const handleTransitionComplete = useCallback(() => {
  setIsTransitioning(false);
  if (transitionDirection === 'toHelper') {
    logEvent(EventTypes.HANDOVER_COMPLETED, Actors.SYSTEM, { toMode: 'helper', handoverMode });
    announce('Tasks sent to helper');
  } else {
    setHandoverMode(null);
    logEvent(EventTypes.HANDOVER_COMPLETED, Actors.SYSTEM, { toMode: 'creator' });
    announce('Helper has returned');
  }
  setTransitionDirection(null);
}, [transitionDirection, handoverMode, logEvent]);

// WoZ suggestion flow
const handleTriggerSuggestion = useCallback((text) => {
  setPendingSuggestion(text);
}, []);

const handleSuggestionAccept = useCallback(() => {
  setPendingSuggestion(null);
  handleInitiateHandover();
}, [handleInitiateHandover]);

const handleSuggestionDismiss = useCallback(() => {
  setPendingSuggestion(null);
}, []);
```

- [ ] **Step 6: Add WebSocket handlers for new message types**

In the `setupHandlers` function, add cases for new message types:

```jsx
case 'HANDOVER_TASKS':
  // Helper receives task list from creator
  setHelperTasks(msg.marks || []);
  setHelperHandoverMode('tasks');
  announce('Creator sent you tasks to complete');
  break;

case 'HANDOVER_LIVE':
  setHelperHandoverMode('live');
  announce('Creator started live collaboration');
  break;

case 'NOTIFY_CREATOR':
  // Creator receives notification from helper
  announce('Helper is trying to reach you');
  break;

case 'RETURN_SUMMARY':
  // Creator receives completion summary from helper
  announce(`Helper finished: ${msg.summary || 'No summary provided'}`);
  logEvent(EventTypes.HELPER_ACTION, Actors.HELPER, { action: 'return_device', summary: msg.summary });
  setTransitionDirection('toCreator');
  setIsTransitioning(true);
  break;
```

- [ ] **Step 7: Update role selection to go to library phase**

Change `handleRoleSelect` so after selecting a role, the next phase is `library` instead of `waiting`:

```jsx
const handleRoleSelect = useCallback((selectedRole) => {
  setRole(selectedRole);
  setPhase('library');
  logEvent(EventTypes.SESSION_START, Actors.SYSTEM, { role: selectedRole, probe: 'probe3' });
}, [logEvent]);
```

Move the WebSocket connection to happen after library import (in `handleImport`), or connect immediately and go to library:

Actually, connect immediately on role select (so peer detection works while browsing library), but don't show the "waiting" screen until after library import:

```jsx
const handleRoleSelect = useCallback((selectedRole) => {
  setRole(selectedRole);
  setPhase('library');
  logEvent(EventTypes.SESSION_START, Actors.SYSTEM, { role: selectedRole, probe: 'probe3' });
  setupHandlers(selectedRole);
  wsRelayService.connect(selectedRole);
}, [logEvent, setupHandlers]);
```

Update `onConnected` handler to NOT auto-set phase to `active` — instead track connection state separately, and move to `active` only when both connected AND library import done:

```jsx
unsubscribeRef.current.connected = wsRelayService.onConnected(() => {
  setConnected(true);
  logEvent(EventTypes.DEVICE_CONNECTED, Actors.SYSTEM, { role: currentRole });
  announce('Device connected');
});
```

Then in `handleImport`, after setting editState, check if already connected:

```jsx
// In handleImport, after setting editState:
if (wsRelayService.isPeerConnected) {
  setPhase('active');
} else {
  setPhase('waiting');
}
```

And add an effect to auto-advance from waiting to active when connection completes:

```jsx
useEffect(() => {
  if (phase === 'waiting' && connected && selectedVideos) {
    setPhase('active');
  }
}, [phase, connected, selectedVideos]);
```

- [ ] **Step 8: Update the render — library phase**

Add the library phase between roleSelect and waiting:

```jsx
if (phase === 'library') {
  return (
    <div className="min-h-screen bg-white">
      {showOnboarding && (
        <OnboardingBrief condition="probe3" onDismiss={() => setShowOnboarding(false)} />
      )}
      <ConditionHeader condition="probe3" modeLabel={`${role.charAt(0).toUpperCase() + role.slice(1)} — Select Videos`} />
      <VideoLibrary
        videos={allVideos}
        onImport={handleImport}
        showPreview={role === 'helper'}
      />
    </div>
  );
}
```

- [ ] **Step 9: Update the active session render**

Replace the active session render to pass new props:

For **CreatorDevice**: pass marks, onAddMark, onDeleteMark, onInitiateHandover, and remove old props like webrtcService messages.

For **HelperDevice**: pass helperTasks, helperHandoverMode, and remove old message channel props.

Add handover overlays (shared with both roles):

```jsx
{/* Handover Mode Selector — creator only */}
{role === 'creator' && showModeSelector && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <HandoverModeSelector
      onSelectMode={handleSelectHandoverMode}
      onCancel={() => setShowModeSelector(false)}
      markCount={marks.length}
    />
  </div>
)}

{/* Handover Suggestion — creator only */}
{role === 'creator' && (
  <HandoverSuggestion
    suggestion={pendingSuggestion}
    onAccept={handleSuggestionAccept}
    onDismiss={handleSuggestionDismiss}
  />
)}

{/* Transition animation — both devices */}
{isTransitioning && transitionDirection && (
  <HandoverTransition
    direction={transitionDirection}
    onComplete={handleTransitionComplete}
  />
)}
```

Update researcher panel to include ResearcherHandoverPanel:

```jsx
{isResearcher && (
  <div className="max-w-7xl mx-auto px-4 pb-4 space-y-4">
    <ResearcherVQAPanel segment={currentSegment} pendingQuestion={pendingQuestion} />
    <ResearcherHandoverPanel
      onTriggerSuggestion={handleTriggerSuggestion}
      currentMode={role}
    />
    {/* Keep existing sync controls */}
  </div>
)}
```

- [ ] **Step 10: Verify build compiles**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 11: Commit**

```bash
git add src/pages/Probe3.jsx
git commit -m "feat(probe3): rewrite Probe3Page with VideoLibrary, handover flow, and WebSocket task sync"
```

---

## Chunk 2: CreatorDevice + HelperDevice Rewrite

### Task 3: Rewrite CreatorDevice.jsx

**Files:**
- Modify: `src/components/probe3/CreatorDevice.jsx`

Mirror Probe 2 CreatorMode but keep WebSocket sync. Key changes:
- Replace GranularityController/DescriptionPanel/VQAPanel/FlagButton with ExplorationMode
- Add VoiceNoteRecorder + MarkList
- Add "Send to Helper" button
- Wrap VideoPlayer in `aria-hidden="true"`
- Keep WebSocket play/pause/seek sync to helper
- Remove old message channel

- [ ] **Step 1: Replace imports**

```jsx
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';
import { buildAllSegments, getTotalDuration, buildInitialSources } from '../../utils/buildInitialSources.js';
import VideoPlayer from '../shared/VideoPlayer.jsx';
import ExplorationMode from '../probe1/ExplorationMode.jsx';
import VoiceNoteRecorder from '../probe2/VoiceNoteRecorder.jsx';
import MarkList from '../probe2/MarkList.jsx';
```

- [ ] **Step 2: Update props interface**

```jsx
export default function CreatorDevice({
  videoRef,
  videoData,
  webrtcService,
  currentTime,
  duration,
  isPlaying,
  currentSegment,
  onTimeUpdate,
  onSegmentChange,
  onSeek,
  onInitiateHandover,
  marks,
  onAddMark,
  onDeleteMark,
  editState,
  onEditChange,
  initialSources = [],
}) {
```

- [ ] **Step 3: Add voice note recording state and handlers**

Mirror CreatorMode's voice note pattern:

```jsx
const [recordingForSegment, setRecordingForSegment] = useState(null);
const audioPlayerRef = useRef(null);

const handleMarkFromExploration = useCallback((segmentId, segmentName) => {
  setRecordingForSegment({ segmentId, segmentName });
  announce(`Recording voice note for ${segmentName}. Press the record button.`);
}, []);

const handleRecordingComplete = useCallback((blob, audioDuration) => {
  if (!recordingForSegment) return;
  const mark = {
    id: `mark-${Date.now()}`,
    segmentId: recordingForSegment.segmentId,
    segmentName: recordingForSegment.segmentName,
    audioBlob: blob,
    audioDuration,
    timestamp: Date.now(),
  };
  logEvent(EventTypes.RECORD_VOICE_NOTE, Actors.CREATOR, {
    segmentId: mark.segmentId, duration: audioDuration,
  });
  onAddMark(mark);
  setRecordingForSegment(null);
  announce(`Voice note saved for ${mark.segmentName}`);
}, [recordingForSegment, logEvent, onAddMark]);

const handleMarkWithoutVoice = useCallback(() => {
  if (!recordingForSegment) return;
  const mark = {
    id: `mark-${Date.now()}`,
    segmentId: recordingForSegment.segmentId,
    segmentName: recordingForSegment.segmentName,
    audioBlob: null,
    audioDuration: 0,
    timestamp: Date.now(),
  };
  onAddMark(mark);
  setRecordingForSegment(null);
  announce(`Marked ${mark.segmentName} without voice note`);
}, [recordingForSegment, onAddMark]);

const handlePlayVoiceNote = useCallback((mark) => {
  if (!mark.audioBlob) return;
  const url = URL.createObjectURL(mark.audioBlob);
  if (audioPlayerRef.current) {
    audioPlayerRef.current.src = url;
    audioPlayerRef.current.play();
  }
  logEvent(EventTypes.PLAY_VOICE_NOTE, Actors.CREATOR, { markId: mark.id, segmentId: mark.segmentId });
}, [logEvent]);

const handleDeleteMark = useCallback((markId) => {
  logEvent(EventTypes.DELETE_MARK, Actors.CREATOR, { markId });
  onDeleteMark(markId);
}, [logEvent, onDeleteMark]);
```

- [ ] **Step 4: Add keyboard shortcut for handover**

```jsx
useEffect(() => {
  function handleKeyDown(e) {
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.key === 'h' || e.key === 'H') {
      e.preventDefault();
      onInitiateHandover();
    }
  }
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [onInitiateHandover]);
```

- [ ] **Step 5: Keep WebSocket sync for play/pause/seek**

Keep the existing `useEffect` blocks for syncing play/pause/seek to helper via `webrtcService.sendData()`. Keep the periodic STATE_UPDATE interval. Keep the `handleSeek` wrapper that sends SEEK via WebSocket.

Remove: message channel state/handlers, control request handler, messages UI.

- [ ] **Step 6: Write the new render**

```jsx
return (
  <div>
    <audio ref={audioPlayerRef} className="hidden" />

    {/* Send-to-Helper button bar */}
    <div className="flex items-center gap-2 px-4 py-2 mb-4 rounded-lg" style={{ backgroundColor: '#2B579A' }}>
      <span className="text-white font-semibold text-sm" aria-hidden="true">Creator Mode</span>
      <button
        onClick={onInitiateHandover}
        className="ml-auto px-4 py-1.5 rounded font-bold text-sm text-white transition-colors hover:brightness-110 focus:outline-2 focus:outline-offset-2 focus:outline-orange-400"
        style={{ backgroundColor: '#E67E22', minHeight: '44px' }}
        aria-label="Send tasks to helper"
      >
        Send to Helper
      </button>
    </div>

    {/* Voice Note Recording overlay */}
    {recordingForSegment && (
      <div role="dialog" aria-modal="false" aria-label={`Voice note for ${recordingForSegment.segmentName}`} className="mb-4 p-4 border-2 border-amber-400 bg-amber-50 rounded-lg">
        <h3 className="font-bold text-sm mb-2" style={{ color: '#1F3864' }}>
          Voice Note for: {recordingForSegment.segmentName}
        </h3>
        <p className="text-xs text-gray-600 mb-3">
          Record a voice note explaining what needs to change, or skip to mark without audio.
        </p>
        <div className="flex items-center gap-3">
          <VoiceNoteRecorder onRecordingComplete={handleRecordingComplete} />
          <button onClick={handleMarkWithoutVoice}
            className="px-3 py-2 text-xs font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-gray-400"
            style={{ minHeight: '44px', minWidth: '44px' }} aria-label="Mark without voice note">
            Skip
          </button>
          <button onClick={() => setRecordingForSegment(null)}
            className="px-3 py-2 text-xs font-medium rounded text-red-600 hover:bg-red-50 transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-red-400"
            style={{ minHeight: '44px', minWidth: '44px' }} aria-label="Cancel marking">
            Cancel
          </button>
        </div>
      </div>
    )}

    {/* Video player — visual only, not navigable by VoiceOver */}
    <div aria-hidden="true">
      <VideoPlayer
        ref={videoRef}
        src={videoData?.video?.src || videoData?.videos?.[0]?.src || null}
        segments={segments}
        onTimeUpdate={onTimeUpdate}
        onSegmentChange={onSegmentChange}
        editState={editState}
      />
    </div>

    {/* Exploration Mode — always active */}
    <ExplorationMode
      active={true}
      segments={segments}
      videoTitle={videoData?.video?.title || videoData?.videos?.[0]?.title || 'Untitled Video'}
      onExit={() => {}}
      onMark={handleMarkFromExploration}
      onEdit={() => { logEvent(EventTypes.OPEN_EDITOR, Actors.CREATOR); }}
      isPlaying={isPlaying}
      playerRef={videoRef}
      editState={editState}
      currentTime={currentTime}
      onSeek={handleSeek}
      onEditChange={onEditChange}
    />

    {/* Marks with voice notes */}
    {marks && marks.length > 0 && (
      <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wide mb-3">
          Marked Segments ({marks.length})
        </h2>
        <MarkList marks={marks} onDelete={handleDeleteMark} onPlayVoiceNote={handlePlayVoiceNote} />
      </div>
    )}
  </div>
);
```

- [ ] **Step 7: Verify build compiles**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add src/components/probe3/CreatorDevice.jsx
git commit -m "feat(probe3): rewrite CreatorDevice with ExplorationMode, voice notes, marks"
```

---

### Task 4: Rewrite HelperDevice.jsx

**Files:**
- Modify: `src/components/probe3/HelperDevice.jsx`

Mirror Probe 2 HelperMode but keep WebSocket sync. Key changes:
- Replace MockEditor with MockEditorVisual
- Add TaskQueue (receives tasks via props from Probe3Page, which got them via WebSocket)
- Add live mode banner
- Add Notify Creator button (sends via WebSocket)
- Add Done button with summary modal (sends summary via WebSocket)
- Keep: sync/independent toggle, WorkspaceAwareness, creator status

- [ ] **Step 1: Replace imports**

```jsx
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';
import { buildAllSegments, getTotalDuration } from '../../utils/buildInitialSources.js';
import VideoPlayer from '../shared/VideoPlayer.jsx';
import TransportControls from '../shared/TransportControls.jsx';
import SegmentMarkerPanel from '../shared/SegmentMarkerPanel.jsx';
import MockEditorVisual from '../shared/MockEditorVisual.jsx';
import TaskQueue from '../probe2/TaskQueue.jsx';
import WorkspaceAwareness from './WorkspaceAwareness.jsx';
```

- [ ] **Step 2: Update props interface**

```jsx
export default function HelperDevice({
  videoRef,
  videoData,
  webrtcService,
  creatorActivities,
  currentTime,
  duration,
  isPlaying,
  currentSegment,
  onTimeUpdate,
  onSegmentChange,
  onSeek,
  independentMode,
  onToggleIndependentMode,
  creatorState,
  editState,
  onEditChange,
  initialSources = [],
  // New props from handover
  tasks,          // marks received from creator via WebSocket
  handoverMode,   // 'tasks' | 'live' | null
}) {
```

- [ ] **Step 3: Add Notify Creator and Done handlers**

```jsx
const [showReturnModal, setShowReturnModal] = useState(false);
const [returnSummary, setReturnSummary] = useState('');
const returnModalTriggerRef = useRef(null);
const returnModalFirstFocusRef = useRef(null);
const audioRef = useRef(null);

useEffect(() => {
  if (showReturnModal) {
    setTimeout(() => { returnModalFirstFocusRef.current?.focus(); }, 50);
  }
}, [showReturnModal]);

const handleNotify = useCallback(() => {
  // Play chime
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.15].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(i === 0 ? 523 : 659, ctx.currentTime + offset);
      gain.gain.setValueAtTime(0.3, ctx.currentTime + offset);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + offset + 0.2);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.2);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch {}

  // Send notification via WebSocket
  if (webrtcService) {
    webrtcService.sendData({ type: 'NOTIFY_CREATOR', actor: 'HELPER' });
  }
  logEvent(EventTypes.HELPER_ACTION, Actors.HELPER, { action: 'notify_creator' });
  announce('Creator notified');
}, [logEvent, webrtcService]);

const handleReturnClick = useCallback(() => {
  returnModalTriggerRef.current = document.activeElement;
  setReturnSummary('');
  setShowReturnModal(true);
}, []);

const handleReturnConfirm = useCallback(() => {
  setShowReturnModal(false);
  // Send summary via WebSocket
  if (webrtcService) {
    webrtcService.sendData({ type: 'RETURN_SUMMARY', summary: returnSummary, actor: 'HELPER' });
  }
  logEvent(EventTypes.HELPER_ACTION, Actors.HELPER, { action: 'return_device', summary: returnSummary });
  announce('Summary sent to creator');
}, [returnSummary, webrtcService, logEvent]);

const handlePlayVoiceNote = useCallback((task) => {
  if (!task.audioBlob) return;
  const url = URL.createObjectURL(task.audioBlob);
  if (audioRef.current) {
    audioRef.current.src = url;
    audioRef.current.play();
  }
}, []);
```

- [ ] **Step 4: Keep existing WebSocket sync logic**

Keep: sendActivity, handleSeek, handleToggleIndependent, control request logic.
Remove: message channel state/handlers/UI.

- [ ] **Step 5: Write the new render**

```jsx
return (
  <div>
    <audio ref={audioRef} className="hidden" />

    {/* Mode indicator bar — matches Probe 2 HelperMode */}
    <div className="flex items-center gap-2 px-4 py-2 mb-4 rounded-lg" style={{ backgroundColor: '#E67E22' }}
      role="status" aria-label="Helper mode active">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" aria-hidden="true">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
      <span className="text-white font-semibold text-sm">
        Helper Mode {handoverMode === 'tasks' ? '— Task List' : handoverMode === 'live' ? '— Live' : ''}
      </span>
      <div className="ml-auto flex gap-2">
        <button onClick={handleNotify}
          className="px-3 py-1.5 rounded font-medium text-sm text-white border border-white/50 hover:bg-white/20 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-white"
          style={{ minHeight: '44px' }} aria-label="Notify creator">
          Notify Creator
        </button>
        <button onClick={handleReturnClick}
          className="px-4 py-1.5 rounded font-bold text-sm transition-colors hover:brightness-110 focus:outline-2 focus:outline-offset-2 focus:outline-blue-400"
          style={{ backgroundColor: '#2B579A', color: 'white', minHeight: '44px' }} aria-label="Send summary to creator">
          Done
        </button>
      </div>
    </div>

    {/* Task Queue — when creator sent tasks */}
    {handoverMode === 'tasks' && tasks && tasks.length > 0 && (
      <div className="sticky top-0 z-10 border-2 rounded-lg p-4 mb-4 shadow-md"
        style={{ borderColor: '#E67E22', backgroundColor: '#FFF8F0' }}
        aria-label="Task queue from creator">
        <h3 className="font-bold text-sm mb-3" style={{ color: '#1F3864' }}>
          Creator's Tasks ({tasks.length})
        </h3>
        <TaskQueue tasks={tasks} onTaskComplete={() => {}} onPlayVoiceNote={handlePlayVoiceNote} />
      </div>
    )}

    {/* Live mode info banner */}
    {handoverMode === 'live' && (
      <div className="border-2 rounded-lg p-4 mb-4 shadow-md"
        style={{ borderColor: '#2B579A', backgroundColor: '#F0F4FF' }}
        aria-label="Live collaboration active">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse" aria-hidden="true" />
          <p className="text-sm font-medium" style={{ color: '#1F3864' }}>
            Live collaboration — Creator is guiding you. Use the editor to make changes.
          </p>
        </div>
      </div>
    )}

    {/* Sync/Independent + Creator Status */}
    <div className="flex items-center gap-2 mb-4">
      <button onClick={handleToggleIndependent}
        className="px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors focus:outline-2 focus:outline-offset-2"
        style={{ backgroundColor: independentMode ? '#6B7280' : '#9B59B6', minHeight: '44px' }}
        aria-pressed={independentMode}
        aria-label={independentMode ? 'Return to synced mode' : 'Enter independent mode'}>
        {independentMode ? 'Return to Sync' : 'Independent Mode'}
      </button>
      <div className="ml-auto px-2 py-1 rounded text-xs font-semibold text-white"
        style={{ backgroundColor: independentMode ? '#9B59B6' : '#5CB85C' }}
        aria-label={independentMode ? 'Independent mode active' : 'Synced with creator'}>
        {independentMode ? 'Independent' : 'Synced'}
      </div>
    </div>

    {/* Video + Editor — mobile stacked layout */}
    <div className="flex flex-col gap-2">
      <VideoPlayer ref={videoRef} src={videoData?.video?.src || videoData?.videos?.[0]?.src || null}
        segments={segments} onTimeUpdate={onTimeUpdate} onSegmentChange={onSegmentChange} editState={editState} />
      <TransportControls playerRef={videoRef} isPlaying={isPlaying} currentTime={currentTime} duration={duration || videoDuration} />
      <MockEditorVisual segments={segments} initialSources={initialSources} currentTime={currentTime} onSeek={handleSeek} onEditChange={onEditChange} />
      <SegmentMarkerPanel segment={currentSegment} />
    </div>

    {/* Creator Activity Feed */}
    <div className="mt-4">
      <WorkspaceAwareness activities={creatorActivities} title="Creator Activity" />
    </div>

    {/* Return/Done Modal */}
    {showReturnModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        role="dialog" aria-modal="true" aria-label="Send summary to creator"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            setShowReturnModal(false);
            setTimeout(() => { returnModalTriggerRef.current?.focus(); }, 50);
          }
        }}>
        <div className="bg-white rounded-lg shadow-2xl w-full max-w-md mx-4">
          <div className="px-6 py-4 rounded-t-lg" style={{ backgroundColor: '#1F3864' }}>
            <h2 className="text-white font-bold text-lg">Done — Send Summary</h2>
            <p className="text-white/70 text-sm mt-1">Let the creator know what you did</p>
          </div>
          <div className="px-6 py-4">
            <textarea ref={returnModalFirstFocusRef} value={returnSummary}
              onChange={(e) => setReturnSummary(e.target.value)}
              placeholder="Describe what changes you made..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-none focus:outline-2 focus:outline-blue-500"
              rows={6} aria-label="Summary of actions taken" />
          </div>
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button onClick={() => {
                setShowReturnModal(false);
                setTimeout(() => { returnModalTriggerRef.current?.focus(); }, 50);
              }}
              className="px-4 py-2 rounded text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
              style={{ minHeight: '44px', minWidth: '44px' }} aria-label="Cancel">
              Cancel
            </button>
            <button onClick={handleReturnConfirm}
              className="px-5 py-2 rounded text-sm font-bold text-white transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
              style={{ backgroundColor: '#2B579A', minHeight: '44px', minWidth: '44px' }} aria-label="Send summary to creator">
              Send Summary
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
);
```

- [ ] **Step 6: Verify build compiles**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/components/probe3/HelperDevice.jsx
git commit -m "feat(probe3): rewrite HelperDevice with MockEditorVisual, TaskQueue, handover UI"
```

---

### Task 5: Final Integration and Verification

**Files:**
- All modified files

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Manual smoke test**

Run: `npm run dev`

Test creator flow:
1. Navigate to `/probe3`
2. Select "Creator" role
3. VideoLibrary appears (text summaries only, no video preview)
4. Select videos, click "Create Project"
5. Waiting screen appears
6. When peer connects, ExplorationMode loads
7. Navigate scenes, mark segments with voice notes
8. Click "Send to Helper" → HandoverModeSelector appears
9. Select "Hand Over Tasks" → HandoverTransition animation

Test helper flow:
1. Open `/probe3` in second browser tab
2. Select "Helper" role
3. VideoLibrary appears WITH video preview thumbnails
4. Select videos, click "Create Project"
5. Devices connect → MockEditorVisual loads
6. When creator sends tasks → TaskQueue appears
7. Notify Creator button sends notification
8. Done button → summary modal → sends via WebSocket

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(probe3): complete overhaul — Probe 2 UI patterns with dual-device WebSocket sync"
```
