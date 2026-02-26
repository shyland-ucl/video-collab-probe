# Video Collaboration Probes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a complete set of web-based technology probes (Baseline + 3 probes) for a formative study on AI-supported ability-diverse collaboration in video creation.

**Architecture:** React SPA with React Router for condition switching, React Context + useReducer for centralized state/event logging, Tailwind CSS for styling, Web Speech API for TTS, WebRTC via simple-peer for Probe 3 device sync. All video descriptions are pre-authored JSON loaded client-side. WoZ panels are accessed via `?mode=researcher` URL parameter.

**Tech Stack:** React 18, Vite, Tailwind CSS, React Router v6, idb (IndexedDB), simple-peer (WebRTC), jszip (data export), qrcode.react (QR codes), Web Speech API

**Reference doc:** `refined_study_plan_and_design_guidelines.docx` in parent directory, and `docs/plans/2026-02-24-video-collab-probes-design.md`

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`, `index.html`
- Create: `src/main.jsx`, `src/App.jsx`, `src/index.css`

**Step 1: Initialize Vite React project**

```bash
cd "C:/Users/shyla/OneDrive - University College London/Claude/video-collab-probe"
npm create vite@latest . -- --template react
```

Select React, JavaScript when prompted. If the directory is non-empty, accept overwrite.

**Step 2: Install dependencies**

```bash
npm install react-router-dom idb simple-peer jszip qrcode.react file-saver
npm install -D tailwindcss @tailwindcss/vite
```

**Step 3: Configure Tailwind**

Replace `src/index.css` with:
```css
@import "tailwindcss";
```

Update `vite.config.js`:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

**Step 4: Set up base App with Router**

`src/App.jsx`:
```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/baseline" replace />} />
        <Route path="/baseline" element={<div>Baseline</div>} />
        <Route path="/probe1" element={<div>Probe 1</div>} />
        <Route path="/probe2" element={<div>Probe 2</div>} />
        <Route path="/probe3" element={<div>Probe 3</div>} />
        <Route path="/researcher" element={<div>Researcher Panel</div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

**Step 5: Verify it runs**

```bash
npm run dev
```

Open browser to localhost URL. Should see "Baseline" text. Navigate to /probe1, /probe2, /probe3 to confirm routing works.

**Step 6: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Vite React project with routing and Tailwind"
```

---

## Task 2: Sample Video Data & Description JSON

**Files:**
- Create: `public/videos/sample.mp4` (placeholder)
- Create: `public/data/descriptions.json`
- Create: `src/data/sampleDescriptions.js`

**Step 1: Create sample video placeholder**

Create a short placeholder video using ffmpeg (or add a note to drop real .mp4 files here):
```bash
mkdir -p public/videos public/data
```

If ffmpeg is available:
```bash
ffmpeg -f lavfi -i color=c=black:s=1280x720:d=120 -f lavfi -i anullsrc -shortest public/videos/sample.mp4
```

Otherwise create a README noting to place .mp4 files here.

**Step 2: Create descriptions JSON**

`public/data/descriptions.json`:
```json
{
  "video_id": "task1",
  "title": "Market Scene",
  "file": "videos/sample.mp4",
  "segments": [
    {
      "id": "seg1",
      "start_time": 0,
      "end_time": 30,
      "name": "Market Entrance",
      "color": "#4A90D9",
      "descriptions": {
        "level_1": "A woman in a red jacket walks through an outdoor market. The market is busy with vendors and shoppers. The atmosphere is lively.",
        "level_2": "The woman wears a bright red waterproof jacket and carries a woven basket. She walks left to right past three vendor stalls selling fruit, textiles, and electronics. The sun is behind her, creating a silhouette effect. A hand-painted sign reads 'Fresh Mangoes - 50 KSh.' Children play in the foreground while an elderly vendor arranges produce.",
        "level_3": "0:00 - Wide shot opens on a dusty market entrance. A wooden arch with faded blue paint frames the scene. 0:03 - Camera pans right to follow a woman in a bright red waterproof jacket entering from the left. She carries a round woven basket on her right arm. 0:07 - Medium shot: she passes the first stall (tropical fruits piled high, a scale hanging from a pole). The vendor, a man in a green apron, waves. 0:12 - She pauses at the second stall (colorful kitenge fabrics draped on wooden frames). She touches a blue-and-yellow pattern. 0:18 - Close-up of a hand-painted wooden sign: 'Fresh Mangoes - 50 KSh' in red and white letters. 0:22 - Two children (approximately 6-8 years old) run past laughing. 0:25 - She moves to the third stall (electronics: phone cases, chargers, earphones displayed on a board). 0:28 - Wide shot pulls back to show the full market stretching into the distance. Dust particles visible in the late-afternoon sunlight."
      },
      "vqa_prepared": {
        "What color is her jacket?": "Bright red, it appears to be a waterproof material.",
        "How many stalls are visible?": "Three stalls are visible: one selling fruit, one with textiles/fabrics, and one with electronics.",
        "What does the sign say?": "The hand-painted sign reads 'Fresh Mangoes - 50 KSh' in red and white lettering.",
        "Are there other people in the scene?": "Yes - a vendor in a green apron at the first stall, two children (roughly 6-8 years old) running and laughing, and various shoppers visible in the background.",
        "What time of day does it appear to be?": "Late afternoon based on the angle of sunlight and warm golden tone of the light. Dust particles are visible in the sunbeams.",
        "What is the camera doing?": "The camera starts with a wide establishing shot, then pans right to follow the woman, moves to medium shots at each stall, includes a close-up of the sign, then pulls back to a wide shot."
      }
    },
    {
      "id": "seg2",
      "start_time": 30,
      "end_time": 60,
      "name": "Vendor Interaction",
      "color": "#E8793A",
      "descriptions": {
        "level_1": "The woman stops at a fruit stall and speaks with the vendor. They negotiate while she examines mangoes. A friendly exchange ends with a purchase.",
        "level_2": "The woman approaches the fruit stall where mangoes, bananas, and passion fruits are displayed in neat rows. The vendor, a middle-aged man in a green apron and white cap, greets her with a handshake. She picks up a large mango, turning it in her hand to inspect it. They converse animatedly — she gestures at three mangoes, he holds up five fingers indicating price. She laughs, shakes her head, holds up three fingers. He nods, bags the mangoes in a paper bag. Money changes hands.",
        "level_3": "0:30 - Medium shot of the fruit stall. Produce arranged in rows: yellow-green mangoes, ripe bananas in bunches, purple passion fruits in a wooden crate. 0:33 - The woman reaches the stall. The vendor (middle-aged, green apron, white knitted cap) extends his right hand. They shake hands warmly. 0:36 - She points at the mango pile. He picks up a large mango and holds it toward her. 0:39 - Close-up of her hands turning the mango, pressing gently to test ripeness. The mango has a red-yellow blush. 0:42 - Two-shot: she gestures to three mangoes, nodding. He holds up his right hand with five fingers spread — indicating price. 0:47 - She laughs, her head tilting back slightly. She holds up three fingers. 0:50 - He pauses, then grins and nods. He picks up a crinkled brown paper bag. 0:53 - He places three mangoes carefully into the bag. 0:56 - She reaches into the woven basket and pulls out folded bills. He takes the money and gives a thumbs up. 0:59 - She places the bag in her basket and waves goodbye."
      },
      "vqa_prepared": {
        "What fruit is she buying?": "Mangoes — she buys three of them. The stall also has bananas and passion fruits.",
        "What is the vendor wearing?": "A green apron over his clothes and a white knitted cap.",
        "How much does she pay?": "The visual negotiation suggests they agree on a reduced price: he initially holds up 5 fingers, she counters with 3, and he accepts.",
        "What is her facial expression during negotiation?": "She appears relaxed and amused — she laughs at one point with her head tilting back, suggesting a friendly and familiar interaction.",
        "What kind of bag are the mangoes placed in?": "A crinkled brown paper bag."
      }
    },
    {
      "id": "seg3",
      "start_time": 60,
      "end_time": 90,
      "name": "Street Performance",
      "color": "#9B59B6",
      "descriptions": {
        "level_1": "A group of musicians performs on the street near the market. Bystanders gather to watch. The mood is joyful and energetic.",
        "level_2": "Three musicians set up on a cleared patch of dusty ground near the market exit. A young man plays a djembe drum with rapid, syncopated rhythms. Beside him, a woman plays a small thumb piano (kalimba). A third person plays a homemade shaker made from a plastic bottle filled with seeds. About fifteen bystanders form a loose semicircle. Two teenage girls begin dancing, their movements synchronized. A small boy claps along, slightly off-beat. The woman from the market scene stops to watch, placing her basket down.",
        "level_3": "1:00 - Wide shot from above: a cleared area near the market exit. Three musicians visible. A crowd begins to form. 1:03 - Medium shot of the drummer: a young man (early 20s) in a yellow t-shirt and jeans, seated on a low stool, playing a wooden djembe. His hands move rapidly. 1:06 - Cut to the kalimba player: a woman in a patterned head wrap and blue dress, standing, holding the small instrument at chest height. Close-up of her thumbs plucking the metal tines. 1:10 - Third musician: a teenager in school uniform shakes a homemade instrument — a clear plastic bottle half-filled with dried seeds. 1:14 - Audience shot: approximately fifteen people in a loose semicircle. 1:17 - Two teenage girls step forward and begin dancing, their arms rising and falling together. 1:21 - A small boy (approximately 4-5 years old) claps enthusiastically, slightly off the beat. An adult beside him smiles. 1:25 - The woman in the red jacket enters the frame from the left. She sets her basket down by her feet and watches. 1:28 - Close-up of her face: she's smiling, her head nodding subtly to the rhythm."
      },
      "vqa_prepared": {
        "How many musicians are performing?": "Three musicians: a djembe drummer, a kalimba player, and someone playing a homemade shaker.",
        "What instruments are being played?": "A djembe drum (hand drum), a kalimba (thumb piano with metal tines), and a homemade shaker made from a plastic bottle with seeds.",
        "How many people are watching?": "About fifteen bystanders in a semicircle, including two teenage girls who are dancing and a small boy clapping.",
        "Is the woman from earlier in this scene?": "Yes, the woman in the red jacket appears, sets down her basket, and watches the performance while nodding to the rhythm.",
        "What is the overall atmosphere?": "Joyful and energetic. People are smiling, dancing, and clapping. The performance appears to be an informal, community-gathering moment."
      }
    },
    {
      "id": "seg4",
      "start_time": 90,
      "end_time": 120,
      "name": "Departure",
      "color": "#27AE60",
      "descriptions": {
        "level_1": "The woman leaves the market as the sun begins to set. She walks down a quiet road carrying her purchases. The scene has a peaceful, reflective mood.",
        "level_2": "The woman picks up her basket, now heavier with purchases, and walks away from the performance. She heads down a dirt road lined with low concrete buildings and corrugated metal roofs. The sun is low on the horizon, casting long shadows. A boda-boda (motorcycle taxi) passes in the opposite direction, its headlight on. She shifts the basket to her other arm. Two goats stand by the roadside. In the distance, the market sounds fade and birdsong becomes audible. She reaches a T-junction and turns left, disappearing around a corner. The camera holds on the empty road for three seconds.",
        "level_3": "1:30 - Medium shot: the woman bends to pick up her basket, now visibly heavier. She straightens and walks away from the crowd to the right. 1:33 - New angle: a long dirt road stretching into the distance. Low concrete buildings with corrugated metal roofs on both sides. The sun is low, casting long shadows from left to right. 1:37 - She walks toward the camera, basket on her left arm. She shifts it to her right arm. 1:40 - A boda-boda (motorcycle taxi, red frame, single rider with helmet) passes behind her going the opposite direction. Its headlight is on. 1:43 - Static shot: two brown-and-white goats stand at the right roadside near a patch of grass. They look up briefly as she passes. 1:47 - Sound shift: market noise fades, replaced by birdsong and distant traffic. 1:50 - She reaches a T-junction with a blue street sign (text too small to read). She turns left. 1:53 - Camera holds on the empty road. Dust settles in the golden light. Holds for 3 seconds. 1:56 - Fade to black."
      },
      "vqa_prepared": {
        "What is happening with the lighting?": "The sun is low on the horizon, casting long shadows. It's golden-hour lighting, indicating early evening / late afternoon.",
        "What passes on the road?": "A boda-boda (motorcycle taxi) with a red frame. The rider wears a helmet and the headlight is on.",
        "Are there any animals?": "Yes, two brown-and-white goats standing by the right side of the road near a grass patch.",
        "What are the buildings like?": "Low concrete buildings with corrugated metal roofs line both sides of the dirt road.",
        "How does the scene end?": "She turns left at a T-junction and walks out of frame. The camera holds on the empty road for about 3 seconds as dust settles in golden light, then fades to black."
      }
    }
  ]
}
```

**Step 3: Create data loader utility**

`src/data/sampleDescriptions.js`:
```js
export async function loadDescriptions(videoId = 'task1') {
  const response = await fetch(`/data/descriptions.json`);
  if (!response.ok) throw new Error(`Failed to load descriptions for ${videoId}`);
  return response.json();
}
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add sample video descriptions and data loader"
```

---

## Task 3: Event Logging Context

**Files:**
- Create: `src/contexts/EventLoggerContext.jsx`
- Create: `src/utils/eventTypes.js`

**Step 1: Define event types**

`src/utils/eventTypes.js`:
```js
export const EventTypes = {
  // Video transport
  PLAY: 'PLAY',
  PAUSE: 'PAUSE',
  SEEK: 'SEEK',
  SEGMENT_ENTER: 'SEGMENT_ENTER',

  // Description
  DESCRIPTION_LEVEL_CHANGE: 'DESCRIPTION_LEVEL_CHANGE',
  DESCRIPTION_VIEWED: 'DESCRIPTION_VIEWED',
  DESCRIPTION_SPOKEN: 'DESCRIPTION_SPOKEN',
  DESCRIPTION_FLAGGED: 'DESCRIPTION_FLAGGED',

  // VQA
  VQA_QUESTION: 'VQA_QUESTION',
  VQA_ANSWER: 'VQA_ANSWER',

  // Edit actions
  EDIT_ACTION: 'EDIT_ACTION',

  // Handover (Probe 2)
  HANDOVER_INITIATED: 'HANDOVER_INITIATED',
  INTENT_LOCKED: 'INTENT_LOCKED',
  HANDOVER_COMPLETED: 'HANDOVER_COMPLETED',
  HELPER_ACTION: 'HELPER_ACTION',
  HANDOVER_SUGGESTION_SHOWN: 'HANDOVER_SUGGESTION_SHOWN',
  HANDOVER_SUGGESTION_ACCEPTED: 'HANDOVER_SUGGESTION_ACCEPTED',
  HANDOVER_SUGGESTION_DISMISSED: 'HANDOVER_SUGGESTION_DISMISSED',

  // Sync (Probe 3)
  DEVICE_CONNECTED: 'DEVICE_CONNECTED',
  DEVICE_DISCONNECTED: 'DEVICE_DISCONNECTED',
  SYNC_EVENT: 'SYNC_EVENT',
  INDEPENDENT_MODE_TOGGLE: 'INDEPENDENT_MODE_TOGGLE',
  MESSAGE_SENT: 'MESSAGE_SENT',

  // Session
  SESSION_START: 'SESSION_START',
  SESSION_END: 'SESSION_END',
  CONDITION_START: 'CONDITION_START',
  CONDITION_END: 'CONDITION_END',

  // Accessibility
  TEXT_SIZE_CHANGE: 'TEXT_SIZE_CHANGE',
  CONTRAST_TOGGLE: 'CONTRAST_TOGGLE',
  AUDIO_TOGGLE: 'AUDIO_TOGGLE',
};

export const Actors = {
  CREATOR: 'creator',
  HELPER: 'helper',
  AI: 'ai',
  RESEARCHER: 'researcher',
  SYSTEM: 'system',
};
```

**Step 2: Create EventLogger context**

`src/contexts/EventLoggerContext.jsx`:
```jsx
import { createContext, useContext, useReducer, useCallback, useRef } from 'react';

const EventLoggerContext = createContext(null);

function eventReducer(state, action) {
  switch (action.type) {
    case 'LOG_EVENT':
      return { ...state, events: [...state.events, action.payload] };
    case 'SET_CONDITION':
      return { ...state, currentCondition: action.payload };
    case 'CLEAR':
      return { events: [], currentCondition: null, sessionStart: Date.now() };
    default:
      return state;
  }
}

export function EventLoggerProvider({ children }) {
  const [state, dispatch] = useReducer(eventReducer, {
    events: [],
    currentCondition: null,
    sessionStart: Date.now(),
  });
  const videoTimeRef = useRef(0);

  const logEvent = useCallback((eventType, actor, data = {}) => {
    const event = {
      timestamp: Date.now() - state.sessionStart,
      eventType,
      actor,
      data,
      videoTimestamp: videoTimeRef.current,
      condition: state.currentCondition,
    };
    dispatch({ type: 'LOG_EVENT', payload: event });
  }, [state.sessionStart, state.currentCondition]);

  const setCondition = useCallback((condition) => {
    dispatch({ type: 'SET_CONDITION', payload: condition });
  }, []);

  const setVideoTime = useCallback((time) => {
    videoTimeRef.current = time;
  }, []);

  const getEvents = useCallback((condition) => {
    if (!condition) return state.events;
    return state.events.filter(e => e.condition === condition);
  }, [state.events]);

  const clearEvents = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  return (
    <EventLoggerContext.Provider value={{
      events: state.events,
      currentCondition: state.currentCondition,
      logEvent,
      setCondition,
      setVideoTime,
      getEvents,
      clearEvents,
    }}>
      {children}
    </EventLoggerContext.Provider>
  );
}

export function useEventLogger() {
  const ctx = useContext(EventLoggerContext);
  if (!ctx) throw new Error('useEventLogger must be used within EventLoggerProvider');
  return ctx;
}
```

**Step 3: Wrap App with provider**

In `src/App.jsx`, wrap the `<BrowserRouter>` with `<EventLoggerProvider>`.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add centralized event logging context with event types"
```

---

## Task 4: VideoPlayer Component

**Files:**
- Create: `src/components/shared/VideoPlayer.jsx`
- Create: `src/components/shared/TransportControls.jsx`

**Step 1: Build VideoPlayer**

`src/components/shared/VideoPlayer.jsx`:
```jsx
import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext';
import { EventTypes, Actors } from '../../utils/eventTypes';
import TransportControls from './TransportControls';

const VideoPlayer = forwardRef(function VideoPlayer({ src, segments = [], onTimeUpdate, onSegmentChange }, ref) {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentSegment, setCurrentSegment] = useState(null);
  const { logEvent, setVideoTime } = useEventLogger();

  useImperativeHandle(ref, () => ({
    play: () => videoRef.current?.play(),
    pause: () => videoRef.current?.pause(),
    seek: (time) => { if (videoRef.current) videoRef.current.currentTime = time; },
    getCurrentTime: () => videoRef.current?.currentTime || 0,
    get video() { return videoRef.current; },
  }));

  const handleTimeUpdate = useCallback(() => {
    const time = videoRef.current?.currentTime || 0;
    setCurrentTime(time);
    setVideoTime(time);
    onTimeUpdate?.(time);

    const seg = segments.find(s => time >= s.start_time && time < s.end_time);
    if (seg && seg.id !== currentSegment?.id) {
      setCurrentSegment(seg);
      onSegmentChange?.(seg);
      logEvent(EventTypes.SEGMENT_ENTER, Actors.SYSTEM, { segmentId: seg.id, segmentName: seg.name });
    }
  }, [segments, currentSegment, logEvent, setVideoTime, onTimeUpdate, onSegmentChange]);

  const handlePlay = () => { setIsPlaying(true); logEvent(EventTypes.PLAY, Actors.CREATOR); };
  const handlePause = () => { setIsPlaying(false); logEvent(EventTypes.PAUSE, Actors.CREATOR); };

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) videoRef.current.play();
    else videoRef.current.pause();
  }, []);

  const seek = useCallback((offset) => {
    if (!videoRef.current) return;
    const newTime = Math.max(0, Math.min(videoRef.current.duration, videoRef.current.currentTime + offset));
    videoRef.current.currentTime = newTime;
    logEvent(EventTypes.SEEK, Actors.CREATOR, { from: currentTime, to: newTime });
  }, [currentTime, logEvent]);

  const jumpToStart = useCallback(() => {
    if (videoRef.current) { videoRef.current.currentTime = 0; logEvent(EventTypes.SEEK, Actors.CREATOR, { to: 0 }); }
  }, [logEvent]);

  const jumpToEnd = useCallback(() => {
    if (videoRef.current) { videoRef.current.currentTime = videoRef.current.duration; logEvent(EventTypes.SEEK, Actors.CREATOR, { to: videoRef.current.duration }); }
  }, [logEvent]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.code) {
        case 'Space': e.preventDefault(); togglePlay(); break;
        case 'ArrowLeft': e.preventDefault(); seek(-5); break;
        case 'ArrowRight': e.preventDefault(); seek(5); break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [togglePlay, seek]);

  return (
    <div className="video-player flex flex-col gap-2">
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          src={src}
          className="w-full h-full object-contain"
          onTimeUpdate={handleTimeUpdate}
          onPlay={handlePlay}
          onPause={handlePause}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
          aria-label="Video player"
        />
      </div>
      <TransportControls
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        onTogglePlay={togglePlay}
        onSeekBack={() => seek(-5)}
        onSeekForward={() => seek(5)}
        onJumpToStart={jumpToStart}
        onJumpToEnd={jumpToEnd}
      />
    </div>
  );
});

export default VideoPlayer;
```

**Step 2: Build TransportControls**

`src/components/shared/TransportControls.jsx`:
```jsx
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TransportControls({ isPlaying, currentTime, duration, onTogglePlay, onSeekBack, onSeekForward, onJumpToStart, onJumpToEnd }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 bg-[#1F3864] rounded-lg" role="toolbar" aria-label="Video transport controls">
      <button onClick={onJumpToStart} className="p-2 text-white hover:bg-white/20 rounded" aria-label="Jump to beginning" title="Jump to beginning">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
      </button>
      <button onClick={onSeekBack} className="p-2 text-white hover:bg-white/20 rounded" aria-label="Rewind 5 seconds" title="Rewind 5s">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>
      </button>
      <button onClick={onTogglePlay} className="p-2.5 text-white bg-[#2B579A] hover:bg-[#3567AA] rounded-full" aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
        {isPlaying ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        )}
      </button>
      <button onClick={onSeekForward} className="p-2 text-white hover:bg-white/20 rounded" aria-label="Forward 5 seconds" title="Forward 5s">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
      </button>
      <button onClick={onJumpToEnd} className="p-2 text-white hover:bg-white/20 rounded" aria-label="Jump to end" title="Jump to end">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2 0h2V6h-2v12z" transform="scale(-1,1) translate(-24,0)"/></svg>
      </button>
      <span className="text-white text-sm font-mono ml-auto" aria-live="off">{formatTime(currentTime)} / {formatTime(duration)}</span>
    </div>
  );
}
```

**Step 3: Verify the component renders**

Import VideoPlayer in the Baseline route and confirm it renders with the sample video.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add VideoPlayer with transport controls and keyboard shortcuts"
```

---

## Task 5: Timeline & Segment Marker Panel

**Files:**
- Create: `src/components/shared/Timeline.jsx`
- Create: `src/components/shared/SegmentMarkerPanel.jsx`

**Step 1: Build Timeline**

`src/components/shared/Timeline.jsx`:
```jsx
import { useMemo } from 'react';

export default function Timeline({ segments, currentTime, duration, onSeek }) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const segmentBars = useMemo(() => {
    if (!duration) return [];
    return segments.map(seg => ({
      ...seg,
      leftPct: (seg.start_time / duration) * 100,
      widthPct: ((seg.end_time - seg.start_time) / duration) * 100,
    }));
  }, [segments, duration]);

  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    onSeek?.(pct * duration);
  };

  return (
    <div className="timeline" role="slider" aria-label="Video timeline" aria-valuenow={Math.round(currentTime)} aria-valuemin={0} aria-valuemax={Math.round(duration)} tabIndex={0}>
      <div className="relative h-10 bg-gray-200 rounded cursor-pointer" onClick={handleClick}>
        {segmentBars.map(seg => (
          <div
            key={seg.id}
            className="absolute top-0 h-full flex items-center justify-center text-xs text-white font-medium overflow-hidden border-r border-white/30"
            style={{ left: `${seg.leftPct}%`, width: `${seg.widthPct}%`, backgroundColor: seg.color || '#2B579A' }}
            title={`${seg.name} (${formatTimeShort(seg.start_time)} - ${formatTimeShort(seg.end_time)})`}
          >
            <span className="truncate px-1">{seg.name}</span>
          </div>
        ))}
        {/* Playhead */}
        <div className="absolute top-0 h-full w-0.5 bg-white shadow-lg z-10 pointer-events-none" style={{ left: `${progress}%` }}>
          <div className="absolute -top-1 -left-1.5 w-3.5 h-3.5 bg-white rounded-full shadow" />
        </div>
      </div>
    </div>
  );
}

function formatTimeShort(s) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
```

**Step 2: Build SegmentMarkerPanel**

`src/components/shared/SegmentMarkerPanel.jsx`:
```jsx
export default function SegmentMarkerPanel({ segment }) {
  if (!segment) {
    return (
      <div className="p-3 bg-gray-50 rounded border text-sm text-gray-500" aria-label="Segment information">
        No segment selected
      </div>
    );
  }

  return (
    <div className="p-3 bg-gray-50 rounded border" role="region" aria-label="Current segment information" aria-live="polite">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: segment.color || '#2B579A' }} />
        <span className="font-semibold text-[#1F3864]">{segment.name}</span>
      </div>
      <div className="text-sm text-gray-600">
        {formatTime(segment.start_time)} &ndash; {formatTime(segment.end_time)}
      </div>
    </div>
  );
}

function formatTime(s) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add Timeline with segments and SegmentMarkerPanel"
```

---

## Task 6: Edit Action Bar

**Files:**
- Create: `src/components/shared/EditActionBar.jsx`

**Step 1: Build EditActionBar**

`src/components/shared/EditActionBar.jsx`:
```jsx
import { useEventLogger } from '../../contexts/EventLoggerContext';
import { EventTypes, Actors } from '../../utils/eventTypes';

const editActions = [
  { id: 'trim_start', label: 'Trim Start', icon: '⟨' },
  { id: 'trim_end', label: 'Trim End', icon: '⟩' },
  { id: 'add_caption', label: 'Add Caption', icon: 'CC' },
  { id: 'add_ad', label: 'Add Audio Description', icon: 'AD' },
  { id: 'mark_review', label: 'Mark for Review', icon: '⚑' },
];

export default function EditActionBar({ actor = Actors.CREATOR }) {
  const { logEvent } = useEventLogger();

  const handleAction = (actionId) => {
    logEvent(EventTypes.EDIT_ACTION, actor, { action: actionId });
  };

  return (
    <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Edit actions">
      {editActions.map(action => (
        <button
          key={action.id}
          onClick={() => handleAction(action.id)}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#2B579A] text-[#2B579A] rounded hover:bg-[#2B579A] hover:text-white transition-colors text-sm font-medium"
          aria-label={action.label}
        >
          <span aria-hidden="true">{action.icon}</span>
          {action.label}
        </button>
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add EditActionBar with logged edit actions"
```

---

## Task 7: Accessibility Toolbar

**Files:**
- Create: `src/contexts/AccessibilityContext.jsx`
- Create: `src/components/shared/AccessibilityToolbar.jsx`

**Step 1: Build Accessibility context**

`src/contexts/AccessibilityContext.jsx`:
```jsx
import { createContext, useContext, useReducer, useCallback } from 'react';

const AccessibilityContext = createContext(null);

function reducer(state, action) {
  switch (action.type) {
    case 'SET_TEXT_SIZE': return { ...state, textSize: action.payload };
    case 'TOGGLE_CONTRAST': return { ...state, highContrast: !state.highContrast };
    case 'TOGGLE_AUDIO': return { ...state, audioEnabled: !state.audioEnabled };
    default: return state;
  }
}

export function AccessibilityProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, {
    textSize: 'medium', // small | medium | large
    highContrast: false,
    audioEnabled: true,
  });

  const setTextSize = useCallback((size) => dispatch({ type: 'SET_TEXT_SIZE', payload: size }), []);
  const toggleContrast = useCallback(() => dispatch({ type: 'TOGGLE_CONTRAST' }), []);
  const toggleAudio = useCallback(() => dispatch({ type: 'TOGGLE_AUDIO' }), []);

  return (
    <AccessibilityContext.Provider value={{ ...state, setTextSize, toggleContrast, toggleAudio }}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error('useAccessibility must be used within AccessibilityProvider');
  return ctx;
}
```

**Step 2: Build AccessibilityToolbar**

`src/components/shared/AccessibilityToolbar.jsx`:
```jsx
import { useAccessibility } from '../../contexts/AccessibilityContext';
import { useEventLogger } from '../../contexts/EventLoggerContext';
import { EventTypes, Actors } from '../../utils/eventTypes';

export default function AccessibilityToolbar() {
  const { textSize, setTextSize, highContrast, toggleContrast, audioEnabled, toggleAudio } = useAccessibility();
  const { logEvent } = useEventLogger();

  const handleTextSize = (size) => {
    setTextSize(size);
    logEvent(EventTypes.TEXT_SIZE_CHANGE, Actors.CREATOR, { size });
  };

  const handleContrast = () => {
    toggleContrast();
    logEvent(EventTypes.CONTRAST_TOGGLE, Actors.CREATOR, { enabled: !highContrast });
  };

  const handleAudio = () => {
    toggleAudio();
    logEvent(EventTypes.AUDIO_TOGGLE, Actors.CREATOR, { enabled: !audioEnabled });
  };

  const sizes = ['small', 'medium', 'large'];

  return (
    <div className="flex items-center gap-3 p-2 bg-gray-100 rounded" role="toolbar" aria-label="Accessibility settings">
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-600 mr-1">Text:</span>
        {sizes.map(size => (
          <button
            key={size}
            onClick={() => handleTextSize(size)}
            className={`px-2 py-1 text-xs rounded ${textSize === size ? 'bg-[#2B579A] text-white' : 'bg-white border text-gray-700 hover:bg-gray-200'}`}
            aria-label={`${size} text`}
            aria-pressed={textSize === size}
          >
            {size.charAt(0).toUpperCase() + size.slice(1)}
          </button>
        ))}
      </div>
      <button
        onClick={handleContrast}
        className={`px-2 py-1 text-xs rounded ${highContrast ? 'bg-black text-white' : 'bg-white border text-gray-700 hover:bg-gray-200'}`}
        aria-label="Toggle high contrast"
        aria-pressed={highContrast}
      >
        High Contrast
      </button>
      <button
        onClick={handleAudio}
        className={`px-2 py-1 text-xs rounded ${audioEnabled ? 'bg-[#5CB85C] text-white' : 'bg-white border text-gray-700 hover:bg-gray-200'}`}
        aria-label={audioEnabled ? 'Audio descriptions on' : 'Audio descriptions off'}
        aria-pressed={audioEnabled}
      >
        {audioEnabled ? '🔊 Audio On' : '🔇 Audio Off'}
      </button>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add accessibility context and toolbar (text size, contrast, audio)"
```

---

## Task 8: Condition Header Bar

**Files:**
- Create: `src/components/shared/ConditionHeader.jsx`

**Step 1: Build ConditionHeader**

`src/components/shared/ConditionHeader.jsx`:
```jsx
const conditionConfig = {
  baseline: { label: 'Baseline', color: '#6B7280', description: 'No AI support' },
  probe1: { label: 'Probe 1: AI Description', color: '#2B579A', description: 'AI video description with granularity control' },
  probe2: { label: 'Probe 2: Smart Handover', color: '#5CB85C', description: 'Single device with structured handover' },
  probe3: { label: 'Probe 3: Local Mirroring', color: '#9B59B6', description: 'Two devices with synchronized playback' },
};

export default function ConditionHeader({ condition, modeLabel }) {
  const config = conditionConfig[condition] || conditionConfig.baseline;

  return (
    <header className="flex items-center justify-between px-4 py-2 text-white" style={{ backgroundColor: config.color }} role="banner">
      <div>
        <h1 className="text-lg font-bold">{config.label}</h1>
        <p className="text-sm opacity-80">{config.description}</p>
      </div>
      {modeLabel && (
        <div className="px-3 py-1 bg-white/20 rounded text-sm font-semibold">
          {modeLabel}
        </div>
      )}
    </header>
  );
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add ConditionHeader with color-coded condition indicator"
```

---

## Task 9: Baseline Condition (Complete Page)

**Files:**
- Create: `src/pages/BaselinePage.jsx`
- Modify: `src/App.jsx` (update route)

**Step 1: Build the Baseline page**

`src/pages/BaselinePage.jsx` — assembles the shared video shell with NO AI features:
```jsx
import { useState, useEffect, useRef } from 'react';
import { loadDescriptions } from '../data/sampleDescriptions';
import { useEventLogger } from '../contexts/EventLoggerContext';
import { EventTypes, Actors } from '../utils/eventTypes';
import ConditionHeader from '../components/shared/ConditionHeader';
import VideoPlayer from '../components/shared/VideoPlayer';
import Timeline from '../components/shared/Timeline';
import SegmentMarkerPanel from '../components/shared/SegmentMarkerPanel';
import EditActionBar from '../components/shared/EditActionBar';
import AccessibilityToolbar from '../components/shared/AccessibilityToolbar';

export default function BaselinePage() {
  const [videoData, setVideoData] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentSegment, setCurrentSegment] = useState(null);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef(null);
  const { setCondition, logEvent } = useEventLogger();

  useEffect(() => {
    setCondition('baseline');
    logEvent(EventTypes.CONDITION_START, Actors.SYSTEM, { condition: 'baseline' });
    loadDescriptions().then(setVideoData);
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <ConditionHeader condition="baseline" />
      <div className="flex-1 p-4">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-4">
          {/* Left column: Video (60%) */}
          <div className="lg:w-3/5 flex flex-col gap-3">
            <VideoPlayer
              ref={videoRef}
              src={videoData ? `/${videoData.file}` : ''}
              segments={videoData?.segments || []}
              onTimeUpdate={(t) => { setCurrentTime(t); setDuration(videoRef.current?.video?.duration || 0); }}
              onSegmentChange={setCurrentSegment}
            />
            <Timeline
              segments={videoData?.segments || []}
              currentTime={currentTime}
              duration={duration}
              onSeek={(t) => videoRef.current?.seek(t)}
            />
            <SegmentMarkerPanel segment={currentSegment} />
          </div>
          {/* Right column: Edit actions (40%) */}
          <div className="lg:w-2/5 flex flex-col gap-3">
            <AccessibilityToolbar />
            <div className="p-4 bg-gray-50 rounded border">
              <h2 className="text-sm font-semibold text-[#1F3864] mb-3">Edit Actions</h2>
              <EditActionBar />
            </div>
            <div className="p-4 bg-gray-50 rounded border text-sm text-gray-500">
              <p>Baseline condition: No AI descriptions available. Collaborate with your partner as you normally would.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Update App.jsx route**

Replace the baseline route placeholder with `<BaselinePage />`.

**Step 3: Verify the full baseline page works**

Run `npm run dev`, navigate to `/baseline`. Confirm: video player renders, transport controls work (play/pause/seek), timeline segments are clickable, segment panel updates, edit action buttons log events.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: complete Baseline condition page with all shared components"
```

---

## Task 10: TTS Service

**Files:**
- Create: `src/services/ttsService.js`

**Step 1: Build TTS service**

`src/services/ttsService.js`:
```js
class TTSService {
  constructor() {
    this.synth = window.speechSynthesis;
    this.currentUtterance = null;
  }

  speak(text, { rate = 1, pitch = 1, onEnd } = {}) {
    this.stop();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.lang = 'en-US';
    if (onEnd) utterance.onend = onEnd;
    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  }

  stop() {
    this.synth.cancel();
    this.currentUtterance = null;
  }

  get isSpeaking() {
    return this.synth.speaking;
  }
}

export const ttsService = new TTSService();
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add TTS service using Web Speech API"
```

---

## Task 11: Probe 1 — Description Panel & Granularity Controller

**Files:**
- Create: `src/components/probe1/DescriptionPanel.jsx`
- Create: `src/components/probe1/GranularityController.jsx`

**Step 1: Build GranularityController**

`src/components/probe1/GranularityController.jsx`:
```jsx
import { useEffect } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext';
import { EventTypes, Actors } from '../../utils/eventTypes';

const levels = [
  { key: 1, label: 'Overview', shortcut: '1' },
  { key: 2, label: 'Detailed', shortcut: '2' },
  { key: 3, label: 'Frame-by-Frame', shortcut: '3' },
];

export default function GranularityController({ level, onLevelChange }) {
  const { logEvent } = useEventLogger();

  const handleChange = (newLevel) => {
    if (newLevel !== level) {
      onLevelChange(newLevel);
      logEvent(EventTypes.DESCRIPTION_LEVEL_CHANGE, Actors.CREATOR, { from: level, to: newLevel });
    }
  };

  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (['1', '2', '3'].includes(e.key)) {
        e.preventDefault();
        handleChange(parseInt(e.key));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [level]);

  return (
    <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Description detail level">
      <label className="text-sm font-semibold text-[#1F3864]">Description Detail</label>
      <div className="flex gap-1">
        {levels.map(l => (
          <button
            key={l.key}
            onClick={() => handleChange(l.key)}
            className={`flex-1 py-2 px-3 text-sm rounded font-medium transition-colors ${
              level === l.key
                ? 'bg-[#2B579A] text-white'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
            }`}
            role="radio"
            aria-checked={level === l.key}
            aria-label={`${l.label} (Press ${l.shortcut})`}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Build DescriptionPanel**

`src/components/probe1/DescriptionPanel.jsx`:
```jsx
import { useEffect, useRef } from 'react';
import { useAccessibility } from '../../contexts/AccessibilityContext';
import { useEventLogger } from '../../contexts/EventLoggerContext';
import { EventTypes, Actors } from '../../utils/eventTypes';
import { ttsService } from '../../services/ttsService';

const textSizeMap = { small: 'text-sm', medium: 'text-base', large: 'text-lg' };

export default function DescriptionPanel({ segment, level }) {
  const { textSize, audioEnabled } = useAccessibility();
  const { logEvent } = useEventLogger();
  const prevDescRef = useRef('');

  const levelKey = `level_${level}`;
  const description = segment?.descriptions?.[levelKey] || 'No description available for this segment.';

  useEffect(() => {
    if (description && description !== prevDescRef.current) {
      prevDescRef.current = description;
      logEvent(EventTypes.DESCRIPTION_VIEWED, Actors.CREATOR, {
        segmentId: segment?.id,
        level,
      });
      if (audioEnabled) {
        ttsService.speak(description);
        logEvent(EventTypes.DESCRIPTION_SPOKEN, Actors.CREATOR, { segmentId: segment?.id, level });
      }
    }
  }, [description, audioEnabled]);

  return (
    <div
      className={`p-4 bg-gray-50 rounded border ${textSizeMap[textSize]}`}
      role="region"
      aria-label={`Video description - Level ${level}`}
      aria-live="polite"
    >
      <div className="flex items-center gap-2 mb-2">
        <h3 className="font-semibold text-[#1F3864]">
          {segment ? segment.name : 'Video Description'}
        </h3>
      </div>
      <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{description}</p>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add Probe 1 description panel with granularity controller and TTS"
```

---

## Task 12: Probe 1 — Flag/Verification Mechanism

**Files:**
- Create: `src/components/probe1/FlagButton.jsx`

**Step 1: Build FlagButton**

`src/components/probe1/FlagButton.jsx`:
```jsx
import { useState, useEffect } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext';
import { EventTypes, Actors } from '../../utils/eventTypes';

export default function FlagButton({ segmentId, level }) {
  const [flagged, setFlagged] = useState(false);
  const { logEvent } = useEventLogger();

  // Reset flag when segment changes
  useEffect(() => { setFlagged(false); }, [segmentId]);

  const handleFlag = () => {
    const newFlagged = !flagged;
    setFlagged(newFlagged);
    if (newFlagged) {
      logEvent(EventTypes.DESCRIPTION_FLAGGED, Actors.CREATOR, { segmentId, level });
    }
  };

  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); handleFlag(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [flagged, segmentId, level]);

  return (
    <button
      onClick={handleFlag}
      className={`flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium transition-colors ${
        flagged
          ? 'bg-[#F0AD4E] text-white'
          : 'bg-white border border-[#F0AD4E] text-[#F0AD4E] hover:bg-[#F0AD4E]/10'
      }`}
      aria-label={flagged ? 'Description flagged as uncertain' : 'Flag description as uncertain (F)'}
      aria-pressed={flagged}
    >
      ⚑ {flagged ? 'Flagged' : 'Flag (F)'}
    </button>
  );
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add Flag button for description verification"
```

---

## Task 13: Probe 1 — VQA Panel (Creator Side)

**Files:**
- Create: `src/components/probe1/VQAPanel.jsx`

**Step 1: Build VQAPanel**

`src/components/probe1/VQAPanel.jsx`:
```jsx
import { useState, useRef, useEffect } from 'react';
import { useAccessibility } from '../../contexts/AccessibilityContext';
import { useEventLogger } from '../../contexts/EventLoggerContext';
import { EventTypes, Actors } from '../../utils/eventTypes';
import { ttsService } from '../../services/ttsService';

const textSizeMap = { small: 'text-sm', medium: 'text-base', large: 'text-lg' };

export default function VQAPanel({ onQuestion }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);
  const { textSize, audioEnabled } = useAccessibility();
  const { logEvent } = useEventLogger();

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  const submitQuestion = (text) => {
    if (!text.trim()) return;
    const question = text.trim();
    setMessages(prev => [...prev, { role: 'user', text: question }]);
    setInput('');
    setIsThinking(true);
    logEvent(EventTypes.VQA_QUESTION, Actors.CREATOR, { question });
    onQuestion?.(question);
  };

  // Called externally when researcher sends answer
  const receiveAnswer = (answer) => {
    setIsThinking(false);
    setMessages(prev => [...prev, { role: 'ai', text: answer }]);
    logEvent(EventTypes.VQA_ANSWER, Actors.AI, { answer });
    if (audioEnabled) ttsService.speak(answer);
  };

  // Expose receiveAnswer via window for researcher panel communication
  useEffect(() => {
    window.__vqaReceiveAnswer = receiveAnswer;
    return () => { delete window.__vqaReceiveAnswer; };
  }, [audioEnabled]);

  const startListening = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  return (
    <div className={`flex flex-col border rounded bg-white ${textSizeMap[textSize]}`} role="region" aria-label="Ask about the video">
      <div className="px-3 py-2 bg-[#1F3864] text-white text-sm font-semibold rounded-t">
        Ask About the Video
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 max-h-60 min-h-[120px]">
        {messages.length === 0 && (
          <p className="text-gray-400 text-sm italic">Type or speak a question about what you see in the video...</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
              msg.role === 'user' ? 'bg-[#2B579A] text-white' : 'bg-gray-100 text-gray-800'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isThinking && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-500 px-3 py-2 rounded-lg text-sm animate-pulse">
              Thinking...
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 p-2 border-t">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submitQuestion(input); }}
          placeholder="Ask about the video..."
          className="flex-1 px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#2B579A]"
          aria-label="Type a question about the video"
        />
        <button
          onClick={startListening}
          className={`p-2 rounded ${isListening ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          aria-label={isListening ? 'Listening...' : 'Speak your question'}
        >
          🎤
        </button>
        <button
          onClick={() => submitQuestion(input)}
          className="px-3 py-2 bg-[#2B579A] text-white rounded text-sm hover:bg-[#3567AA]"
          aria-label="Submit question"
        >
          Ask
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add VQA panel with speech-to-text input for Probe 1"
```

---

## Task 14: Probe 1 — Researcher WoZ Panel

**Files:**
- Create: `src/components/probe1/ResearcherVQAPanel.jsx`

**Step 1: Build ResearcherVQAPanel**

`src/components/probe1/ResearcherVQAPanel.jsx`:
```jsx
import { useState, useEffect } from 'react';

export default function ResearcherVQAPanel({ segment }) {
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [customAnswer, setCustomAnswer] = useState('');

  // Listen for questions from VQAPanel
  useEffect(() => {
    const handler = (e) => {
      if (e.key === '__vqa_question') {
        setPendingQuestion(JSON.parse(e.newValue));
      }
    };
    // Poll for questions via BroadcastChannel or window event
    window.__researcherOnQuestion = (question) => {
      setPendingQuestion(question);
    };
    return () => { delete window.__researcherOnQuestion; };
  }, []);

  // Override VQAPanel's onQuestion to also notify researcher
  useEffect(() => {
    const origOnQuestion = window.__vqaOnQuestion;
    window.__vqaOnQuestion = (q) => {
      setPendingQuestion(q);
      origOnQuestion?.(q);
    };
  }, []);

  const preparedAnswers = segment?.vqa_prepared || {};

  const sendAnswer = (answer) => {
    if (window.__vqaReceiveAnswer) {
      // Simulate 2-4s delay
      const delay = 2000 + Math.random() * 2000;
      setTimeout(() => window.__vqaReceiveAnswer(answer), delay);
    }
    setPendingQuestion(null);
    setCustomAnswer('');
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-yellow-50 border-2 border-yellow-300 rounded">
      <h2 className="text-lg font-bold text-yellow-800">Researcher Panel (WoZ)</h2>

      {pendingQuestion ? (
        <div className="p-3 bg-white rounded border">
          <p className="text-sm font-semibold text-gray-600 mb-1">Creator's Question:</p>
          <p className="text-base font-medium text-[#1F3864]">{pendingQuestion}</p>
        </div>
      ) : (
        <p className="text-sm text-gray-500 italic">Waiting for creator to ask a question...</p>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Prepared Answers</h3>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {Object.entries(preparedAnswers).map(([q, a]) => (
            <button
              key={q}
              onClick={() => sendAnswer(a)}
              className="w-full text-left p-2 bg-white border rounded hover:bg-blue-50 text-sm"
            >
              <span className="text-gray-500">Q: {q}</span>
              <br />
              <span className="text-gray-800">A: {a}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Custom Answer</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={customAnswer}
            onChange={e => setCustomAnswer(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && customAnswer.trim()) sendAnswer(customAnswer); }}
            placeholder="Type a custom answer..."
            className="flex-1 px-3 py-2 border rounded text-sm"
          />
          <button
            onClick={() => { if (customAnswer.trim()) sendAnswer(customAnswer); }}
            className="px-4 py-2 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add Researcher WoZ panel for VQA answers"
```

---

## Task 15: Probe 1 Complete Page

**Files:**
- Create: `src/pages/Probe1Page.jsx`
- Modify: `src/App.jsx`

**Step 1: Build Probe1Page**

`src/pages/Probe1Page.jsx` assembles all Probe 1 components. Uses same layout as Baseline but adds the description panel, granularity controller, VQA panel, and flag button in the right column. Conditionally renders ResearcherVQAPanel if `?mode=researcher` is in the URL.

Key structure:
- Left column (60%): VideoPlayer, Timeline, SegmentMarkerPanel
- Right column (40%): GranularityController, DescriptionPanel + FlagButton, VQAPanel, EditActionBar, AccessibilityToolbar
- ResearcherVQAPanel shown below main content if `?mode=researcher`

Wire the VQA: `VQAPanel.onQuestion` sets the pending question on the researcher panel. The researcher panel calls `window.__vqaReceiveAnswer` to send answers back.

**Step 2: Update App.jsx**

Replace the probe1 route with `<Probe1Page />`.

**Step 3: Verify**

Navigate to `/probe1` — see granularity toggle (1/2/3 keys work), descriptions change per level and segment, TTS speaks on segment change, flag button works with F key, VQA chat accepts questions. Open `/probe1?mode=researcher` — see researcher panel below with prepared answers.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: complete Probe 1 page with description, VQA, flag, and WoZ panel"
```

---

## Task 16: Probe 2 — Intent Locker

**Files:**
- Create: `src/components/probe2/IntentLocker.jsx`

**Step 1: Build IntentLocker**

A modal that appears when the creator presses H or clicks "Handover". Contains:
- Text/voice input for free-form intent
- Checkbox list of intent categories: Trim/Cut, Adjust Color, Check Framing, Add Caption, General Review
- Priority radio: Must Do / Nice to Have / Just Check
- "Lock & Hand Over" button

On submission, logs `INTENT_LOCKED` event and returns the locked intent data.

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add Intent Locker modal for Probe 2 handover"
```

---

## Task 17: Probe 2 — Creator & Helper Modes

**Files:**
- Create: `src/components/probe2/CreatorMode.jsx`
- Create: `src/components/probe2/HelperMode.jsx`

**Step 1: Build CreatorMode**

Same as Probe 1 interface (granularity, VQA, descriptions, edit actions) plus a prominent "Handover" button (keyboard shortcut H) that opens the IntentLocker.

**Step 2: Build HelperMode**

- Sticky intent banner at top showing creator's locked intent (task description, categories, priority)
- Visual video player with timeline
- Simplified edit toolbar based on requested actions
- Status buttons per intent item: Done / Needs Discussion / Cannot Do
- "Notify Creator" button (plays audio chime, logs event)
- "Return Device" button that shows summary of actions taken and switches back to CreatorMode
- Level 1 descriptions shown in a collapsed panel for shared context

**Step 3: Build handover transition animation**

When switching modes, display a 1-second animated transition (sliding panel effect with color shift: blue→orange for creator→helper, orange→blue for helper→creator). Play distinct audio earcons for each direction using Web Audio API (a short ascending tone for handover, descending for return).

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add Creator and Helper modes with handover transitions for Probe 2"
```

---

## Task 18: Probe 2 — Handover Suggestions (WoZ)

**Files:**
- Create: `src/components/probe2/HandoverSuggestion.jsx`
- Create: `src/components/probe2/ResearcherHandoverPanel.jsx`

**Step 1: Build researcher trigger panel**

`ResearcherHandoverPanel.jsx` — visible on `?mode=researcher`, has a text input and "Trigger Suggestion" button. When triggered, sends a suggestion to the creator's interface.

**Step 2: Build HandoverSuggestion**

A non-intrusive notification that slides in from the top-right: "This might be a good time to ask [helper name] to check the framing." Has Accept (opens IntentLocker) and Dismiss buttons. Both log events.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add WoZ handover suggestion system for Probe 2"
```

---

## Task 19: Probe 2 Complete Page

**Files:**
- Create: `src/pages/Probe2Page.jsx`
- Modify: `src/App.jsx`

**Step 1: Build Probe2Page**

Manages state for current mode (creator/helper), locked intents, and helper actions. Conditionally renders CreatorMode or HelperMode. Shows ResearcherHandoverPanel if `?mode=researcher`.

**Step 2: Verify**

Test full handover flow: creator browses video → presses H → fills intent → handover animation → helper sees intent → marks actions done → returns device → creator sees summary.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: complete Probe 2 page with smart handover flow"
```

---

## Task 20: Probe 3 — WebRTC Sync Service

**Files:**
- Create: `src/services/webrtcService.js`

**Step 1: Build WebRTC service**

Uses `simple-peer` for P2P. Provides:
- `createSession()` — creates a peer as initiator, returns offer signal data
- `joinSession(signal)` — creates peer from received signal, returns answer
- `onData(callback)` — receives messages (play/pause/seek/messages/activity)
- `sendData(data)` — sends messages to peer
- `disconnect()` — cleanup

For connection establishment: one device generates a session code (base64-encoded signal), the other enters it. Alternatively, encode as QR code.

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add WebRTC P2P sync service using simple-peer"
```

---

## Task 21: Probe 3 — Creator & Helper Devices

**Files:**
- Create: `src/components/probe3/CreatorDevice.jsx`
- Create: `src/components/probe3/HelperDevice.jsx`
- Create: `src/components/probe3/WorkspaceAwareness.jsx`
- Create: `src/components/probe3/ConnectionSetup.jsx`

**Step 1: Build ConnectionSetup**

Displays QR code (via qrcode.react) with session code and a text input for manual entry. Shows connection status. Once connected, transitions to the appropriate device interface.

**Step 2: Build CreatorDevice**

Full Probe 1 interface + "Send to Helper" button that pushes text/voice notes to helper via WebRTC. Also shows a HelperActivityFeed panel: small panel showing helper's current actions (segment viewing, edits made) received via WebRTC data channel.

**Step 3: Build HelperDevice**

Full visual video player with timeline + simplified editing tools. Shows:
- Creator Intent Feed: notifications of creator actions, edit intentions, sent messages
- Optional AI description overlay toggle (shows what creator is hearing/reading)
- Status indicators: creator's play/pause state, current segment, description level

**Step 4: Build WorkspaceAwareness**

Shared component for activity feeds on both sides. Renders a scrollable list of recent actions from the other device.

**Step 5: Implement asymmetric control**

Creator has full transport control (syncs to helper). Helper can "Request Control" — sends request via WebRTC, creator sees a prompt and can Accept/Deny. If independent mode is toggled, helper navigates freely without syncing.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Probe 3 creator/helper devices with WebRTC sync and workspace awareness"
```

---

## Task 22: Probe 3 Complete Page

**Files:**
- Create: `src/pages/Probe3Page.jsx`
- Modify: `src/App.jsx`

**Step 1: Build Probe3Page**

Detects device role via URL param (`?role=creator` or `?role=helper`). Shows ConnectionSetup first, then the appropriate device interface once connected. If `?mode=researcher`, shows a fallback manual sync panel.

**Step 2: Verify**

Open two browser tabs: `/probe3?role=creator` and `/probe3?role=helper`. Connect via session code. Verify: play/pause syncs, seek syncs, messages send, activity feeds update, independent mode toggles correctly, control request flow works.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: complete Probe 3 page with local mirroring and device sync"
```

---

## Task 23: Researcher Master Panel

**Files:**
- Create: `src/pages/ResearcherPage.jsx`

**Step 1: Build ResearcherPage**

A unified researcher dashboard accessible at `/researcher`. Includes:
- Condition selector (switch between probe contexts)
- Embedded ResearcherVQAPanel (Probe 1)
- Embedded ResearcherHandoverPanel (Probe 2)
- Probe 3 fallback sync controls (manual play/pause/seek for both devices)
- Live event log viewer (scrolling list of logged events)
- Session controls: Start/Stop session, export data

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add unified Researcher master panel"
```

---

## Task 24: Data Export System

**Files:**
- Create: `src/services/dataExport.js`
- Create: `src/components/shared/DataExportButton.jsx`

**Step 1: Build data export service**

`src/services/dataExport.js`:
```js
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export async function exportSessionData(events, sessionMetadata) {
  const zip = new JSZip();

  // Session metadata
  zip.file('session_metadata.json', JSON.stringify(sessionMetadata, null, 2));

  // Group events by condition
  const conditions = ['baseline', 'probe1', 'probe2', 'probe3'];
  for (const condition of conditions) {
    const conditionEvents = events.filter(e => e.condition === condition);
    if (conditionEvents.length === 0) continue;

    const folder = zip.folder(condition);
    folder.file('event_log.json', JSON.stringify(conditionEvents, null, 2));

    // Condition-specific logs
    if (condition === 'probe1') {
      const descEvents = conditionEvents.filter(e =>
        ['DESCRIPTION_VIEWED', 'DESCRIPTION_SPOKEN', 'DESCRIPTION_LEVEL_CHANGE', 'DESCRIPTION_FLAGGED'].includes(e.eventType)
      );
      folder.file('description_interactions.json', JSON.stringify(descEvents, null, 2));

      const vqaEvents = conditionEvents.filter(e => ['VQA_QUESTION', 'VQA_ANSWER'].includes(e.eventType));
      folder.file('vqa_log.json', JSON.stringify(vqaEvents, null, 2));
    }

    if (condition === 'probe2') {
      const handoverEvents = conditionEvents.filter(e =>
        e.eventType.startsWith('HANDOVER') || e.eventType === 'INTENT_LOCKED' || e.eventType === 'HELPER_ACTION'
      );
      folder.file('handover_log.json', JSON.stringify(handoverEvents, null, 2));
    }

    if (condition === 'probe3') {
      const syncEvents = conditionEvents.filter(e =>
        ['DEVICE_CONNECTED', 'DEVICE_DISCONNECTED', 'SYNC_EVENT', 'INDEPENDENT_MODE_TOGGLE'].includes(e.eventType)
      );
      folder.file('sync_log.json', JSON.stringify(syncEvents, null, 2));
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  saveAs(blob, `session_export_${timestamp}.zip`);
}
```

**Step 2: Build DataExportButton**

Simple button that calls `exportSessionData` with current events and metadata. Placed on the Researcher panel and optionally on each condition page.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add ZIP data export for session logs"
```

---

## Task 25: Session Setup & Navigation

**Files:**
- Create: `src/pages/SessionSetupPage.jsx`
- Modify: `src/App.jsx`

**Step 1: Build SessionSetupPage**

Landing page at `/` with:
- Session ID input (auto-generated or custom)
- Participant dyad ID input
- Condition order configuration (drag-and-drop or numbered list)
- "Start Session" button that navigates to the first condition
- Navigation bar showing all conditions with progress indicators

**Step 2: Add persistent navigation**

A slim nav bar at the bottom of every condition page showing: condition progress (Baseline → Probe 1 → Probe 2/3 → Probe 3/2), with the current condition highlighted. "Next Condition" and "Previous Condition" buttons.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add session setup page and condition navigation"
```

---

## Task 26: Polish & Accessibility Audit

**Files:**
- Modify: Various components for ARIA improvements

**Step 1: Audit all ARIA labels**

Review every interactive element across all pages. Ensure:
- All buttons have descriptive `aria-label`
- All regions have `role` and `aria-label`
- Live regions use `aria-live="polite"` where content changes dynamically
- Focus management: when panels appear/disappear, focus moves logically
- Tab order follows the visual reading order

**Step 2: Test with keyboard-only navigation**

Navigate through each condition using only Tab, Enter, Space, and arrow keys. Fix any inaccessible interactions.

**Step 3: Test with screen reader**

If NVDA is available, test the Probe 1 creator flow. Verify descriptions are announced, granularity changes are communicated, VQA responses are read.

**Step 4: Apply high contrast theme**

When highContrast is true in AccessibilityContext, apply a class to the root element that inverts colors for maximum contrast (dark backgrounds, light text, thick borders on interactive elements).

**Step 5: Apply text size globally**

Map the textSize from AccessibilityContext to a CSS class on the root element that scales all description and panel text.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: accessibility audit - ARIA labels, keyboard nav, high contrast, text sizing"
```

---

## Task 27: Final Integration & Testing

**Step 1: Full flow test**

Run through the complete study protocol:
1. Session setup → Baseline (15 min) → Debrief pause → Probe 1 (30 min) → Debrief pause → Probe 2 (30 min) → Debrief pause → Probe 3 (30 min) → Export data

**Step 2: Test data export**

Complete a full session, export ZIP, and verify:
- `session_metadata.json` has correct session info
- Each condition folder has complete event logs
- VQA, handover, and sync logs are correctly filtered

**Step 3: Test on mobile/tablet layout**

Resize browser to tablet width. Verify stacked layout works, panels are collapsible, touch targets are adequate size.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: final integration testing and layout verification"
```

---

## Summary of Tasks

| # | Task | Priority | Est. Complexity |
|---|------|----------|----------------|
| 1 | Project Scaffolding | P0 | Low |
| 2 | Sample Video Data & Descriptions | P0 | Low |
| 3 | Event Logging Context | P0 | Medium |
| 4 | VideoPlayer Component | P0 | Medium |
| 5 | Timeline & Segment Marker | P0 | Medium |
| 6 | Edit Action Bar | P0 | Low |
| 7 | Accessibility Toolbar | P3 | Low |
| 8 | Condition Header Bar | P0 | Low |
| 9 | Baseline Condition Page | P0 | Low |
| 10 | TTS Service | P0 | Low |
| 11 | Probe 1: Description + Granularity | P0 | Medium |
| 12 | Probe 1: Flag/Verification | P2 | Low |
| 13 | Probe 1: VQA Panel | P0 | Medium |
| 14 | Probe 1: Researcher WoZ Panel | P0 | Medium |
| 15 | Probe 1 Complete Page | P0 | Medium |
| 16 | Probe 2: Intent Locker | P1 | Medium |
| 17 | Probe 2: Creator & Helper Modes | P1 | High |
| 18 | Probe 2: Handover Suggestions | P3 | Low |
| 19 | Probe 2 Complete Page | P1 | Medium |
| 20 | Probe 3: WebRTC Service | P1 | High |
| 21 | Probe 3: Creator & Helper Devices | P1 | High |
| 22 | Probe 3 Complete Page | P1 | Medium |
| 23 | Researcher Master Panel | P0 | Medium |
| 24 | Data Export System | P2 | Low |
| 25 | Session Setup & Navigation | P2 | Medium |
| 26 | Accessibility Audit | P3 | Medium |
| 27 | Final Integration Testing | — | Medium |
