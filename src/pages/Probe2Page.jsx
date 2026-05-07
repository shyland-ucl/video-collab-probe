import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadDescriptions } from '../data/sampleDescriptions.js';
import { loadPipelineVideos, fetchAssignments } from '../services/pipelineApi.js';
import { findAssignmentsForDyad } from '../utils/dyadId.js';
import { useEventLogger } from '../contexts/EventLoggerContext.jsx';
import { useAccessibility } from '../contexts/AccessibilityContext.jsx';
import { EventTypes, Actors } from '../utils/eventTypes.js';
import { announce, setAnnouncerMuted } from '../utils/announcer.js';
import { buildAllSegments, buildInitialSources, getTotalDuration } from '../utils/buildInitialSources.js';
import { filterClipsByKept, colourValuesToFilter, colourValuesToTransform } from '../utils/editStateView.js';
import { applyOperation, getClipMuted } from '../utils/sceneEditOps.js';
import { buildEditChangeSceneStamp } from '../utils/editChangeStamp.js';
import {
  describeEditOp,
  labelEditActor,
  summarizeEditStateChange,
  summarizeVisualAdjustment,
} from '../utils/projectOverview.js';
import { captureFrame, askGemini } from '../services/geminiService.js';
import ttsService from '../services/ttsService.js';
import { wsRelayService } from '../services/wsRelayService.js';
import ConditionHeader from '../components/shared/ConditionHeader.jsx';
import OnboardingBrief from '../components/shared/OnboardingBrief.jsx';
import VideoPlayer from '../components/shared/VideoPlayer.jsx';
import VideoLibrary from '../components/probe1/VideoLibrary.jsx';
import SceneBlockList from '../components/shared/SceneBlockList.jsx';
import Probe2aSceneActions from '../components/probe2/Probe2aSceneActions.jsx';
import HelperMode from '../components/probe2/HelperMode.jsx';
import HandoverTransition from '../components/probe2/HandoverTransition.jsx';
import HandoverSuggestion from '../components/probe2/HandoverSuggestion.jsx';
import ResearcherVQAPanel from '../components/probe1/ResearcherVQAPanel.jsx';
import ResearcherHandoverPanel from '../components/probe2/ResearcherHandoverPanel.jsx';
import ResearcherAIEditPanel from '../components/probe3/ResearcherAIEditPanel.jsx';

const VISUAL_PROPERTIES = ['brightness', 'contrast', 'saturation', 'zoom', 'rotate'];

function baseSceneId(id) {
  if (!id || typeof id !== 'string') return id || null;
  return id.replace(/-split-\d+$/, '');
}

function sceneLabel(sceneId, segments = []) {
  const baseId = baseSceneId(sceneId);
  const index = segments.findIndex((scene) => scene.id === baseId);
  if (index === -1) return 'a scene';
  return `scene ${index + 1}`;
}

function cleanFeedbackText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function addFeedbackItem(items, item) {
  const text = cleanFeedbackText(item);
  if (text && !items.includes(text)) items.push(text);
}

function formatHelperSessionChange(change, segments = []) {
  const text = cleanFeedbackText(change?.text);
  if (!text) return '';
  const sceneId = baseSceneId(change?.sceneId);
  return sceneId ? `${text} on ${sceneLabel(sceneId, segments)}` : text;
}

function buildHelperFeedback(items) {
  if (items.length === 0) return null;
  return {
    id: Date.now(),
    title: `Helper made ${items.length} ${items.length === 1 ? 'change' : 'changes'}`,
    items,
    announcement: `Phone returned to creator. Helper made ${items.length} ${items.length === 1 ? 'change' : 'changes'}: ${items.join('. ')}.`,
  };
}

function getSceneIdAtTime(segments = [], time = 0) {
  return segments.find((scene) => (
    time >= scene.start_time && time < scene.end_time
  ))?.id || segments[0]?.id || null;
}

function buildHelperReturnFeedback(startSnapshot, endSnapshot, segments = [], visualSceneIds = {}, sessionChanges = []) {
  const items = [];

  sessionChanges.forEach((change) => {
    addFeedbackItem(items, formatHelperSessionChange(change, segments));
  });

  if (!startSnapshot || !endSnapshot) return buildHelperFeedback(items);

  const startColours = startSnapshot.colourValues || {};
  const endColours = endSnapshot.colourValues || {};

  VISUAL_PROPERTIES.forEach((property) => {
    if (startColours[property] === endColours[property]) return;
    const text = describeEditOp(property, { value: endColours[property] });
    const sceneId = visualSceneIds[property] || endSnapshot.fallbackSceneId;
    addFeedbackItem(items, sceneId ? `${text} on ${sceneLabel(sceneId, segments)}` : text);
  });

  const prevClips = startSnapshot.editState?.clips || [];
  const nextClips = endSnapshot.editState?.clips || [];
  const nextClipIds = new Set(nextClips.map((clip) => clip.id));
  prevClips.forEach((clip) => {
    if (nextClipIds.has(clip.id)) return;
    addFeedbackItem(items, `Removed ${sceneLabel(clip.id, segments)}`);
  });

  return buildHelperFeedback(items);
}

export default function Probe2Page() {
  const { setCondition, logEvent } = useEventLogger();
  const { audioEnabled, speechRate } = useAccessibility();
  const playerRef = useRef(null);
  const [searchParams] = useSearchParams();
  const isResearcher = searchParams.get('mode') === 'researcher';

  const [data, setData] = useState(null);
  const [pipelineVideos, setPipelineVideos] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState(null);
  const currentSegmentRef = useRef(null);
  useEffect(() => { currentSegmentRef.current = currentSegment; }, [currentSegment]);
  const [pendingQuestion, setPendingQuestion] = useState(null);
  // WoZ: when "Ask AI to Edit" finds no canned match, the request is parked
  // here so the researcher panel can craft a response. The promise from
  // handleAskAIEdit waits on `aiEditResolverRef` until the researcher sends.
  const [pendingAIRequest, setPendingAIRequest] = useState(null);
  const aiEditResolverRef = useRef(null);

  // Phase: 'library' (creator picks footage) → 'exploring' (rest of probe)
  // Library phase mirrors Probes 1 / 2b / 3 so the dyad chooses what to edit
  // before the handover flow begins. B3-with-library / M5 fix.
  const [phase, setPhase] = useState('library');
  const [selectedVideos, setSelectedVideos] = useState(null);
  const [projectSummaryFocusToken, setProjectSummaryFocusToken] = useState(0);

  // Handover state
  const [mode, setMode] = useState('creator');
  const [handoverMode, setHandoverMode] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState(null);
  const [pendingSuggestion, setPendingSuggestion] = useState(null);
  const [editState, setEditState] = useState(null);
  // Bounded history stack of editStates so the creator can undo the most
  // recent self-edit (Split, Move, Add caption). Cap at 20 to avoid leaks
  // during long sessions; the helper-mode editor doesn't push to this.
  const [editHistory, setEditHistory] = useState([]);
  const [tasks, setTasks] = useState([]); // Intent-locked tasks for helper
  const [vqaHistories, setVqaHistories] = useState({});
  const [keptScenes, setKeptScenes] = useState({}); // sceneId → boolean
  // Helper-mode colour adjustments. Lives at the page so the visual filter
  // persists when the device is handed back to the creator (the helper's
  // change should be visible in the creator's playback too).
  // Day 1 fix #4: zoom + rotate live alongside colour values; same WS message
  // shape (COLOUR_UPDATE) so the slider broadcasts work without a new wire.
  const [colourValues, setColourValues] = useState({ brightness: 0, contrast: 0, saturation: 0, zoom: 100, rotate: 0 });
  const colourValuesRef = useRef(colourValues);
  useEffect(() => { colourValuesRef.current = colourValues; }, [colourValues]);
  const helperSessionStartRef = useRef(null);
  const helperSessionChangesRef = useRef([]);
  const helperVisualSceneIdsRef = useRef({});
  const handoverFeedbackRef = useRef(null);
  const handoverFeedbackDismissRef = useRef(null);
  const [handoverFeedback, setHandoverFeedback] = useState(null);
  // Day 1 fix #3: per-scene edit stamp so SceneBlock can render an "Edited"
  // badge + a "What changed" prepend on the description. Keys are scene ids;
  // values are { text, actor, timestamp }.
  const [editedScenes, setEditedScenes] = useState({});
  const stampSceneEdit = useCallback((sceneId, operation, opts = {}) => {
    if (!sceneId) return;
    setEditedScenes((prev) => ({
      ...prev,
      [sceneId]: {
        text: describeEditOp(operation, opts),
        actor: opts.actor || 'You',
        timestamp: Date.now(),
      },
    }));
  }, []);

  // Server-side dyad assignments — see Probe1Page for rationale.
  const [serverAssignments, setServerAssignments] = useState(null);

  useEffect(() => {
    setCondition('probe2a');
    logEvent(EventTypes.CONDITION_START, Actors.SYSTEM, { condition: 'probe2a' });
    loadDescriptions().then(setData).catch(console.error);
    loadPipelineVideos().then(setPipelineVideos).catch(() => {});
    fetchAssignments()
      .then((a) => setServerAssignments(a || {}))
      .catch(() => {
        try {
          setServerAssignments(JSON.parse(localStorage.getItem('pipelineAssignments') || '{}'));
        } catch { setServerAssignments({}); }
      });
    // Always restore the announcer on unmount in case the participant
    // navigates away while the device is still in helper mode.
    return () => { setAnnouncerMuted(false); };
  }, [setCondition, logEvent]);

  // WS relay for cross-device WoZ. The participant device joins as
  // 'participant' and broadcasts AI_EDIT_REQUEST when no canned match is
  // found; the researcher device (same URL with ?mode=researcher) joins as
  // 'researcher' and replies with AI_EDIT_RESPONSE. Same-tab use (the
  // participant URL with ?mode=researcher appended) bypasses the relay
  // entirely — the local resolver handles it.
  useEffect(() => {
    const role = isResearcher ? 'researcher' : 'participant';
    wsRelayService.connect(role);
    const unsub = wsRelayService.onData((msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'AI_EDIT_REQUEST' && isResearcher) {
        // Surface the participant's request in this researcher tab's panel.
        setPendingAIRequest(msg.request || null);
      } else if (msg.type === 'AI_EDIT_RESPONSE' && !isResearcher) {
        // Resolve the parked promise with the researcher's response.
        if (aiEditResolverRef.current) {
          aiEditResolverRef.current({
            description: msg.text,
            text: msg.text,
            operation: msg.responseType || 'researcher_response',
          });
          aiEditResolverRef.current = null;
        }
        logEvent(EventTypes.AI_EDIT_PROPOSED, Actors.RESEARCHER, {
          source: 'researcher_woz_relay',
          response: msg.text,
          responseType: msg.responseType,
        });
      } else if (msg.type === 'EDIT_STATE_UPDATE' && !isResearcher && msg.editState) {
        // Researcher Editor on the dashboard pushed an edit. Apply directly.
        const previousState = editStateRef.current;
        setEditState(msg.editState);
        const peer = labelEditActor(msg.actor, 'AI');
        const sceneStamp = buildEditChangeSceneStamp(previousState, msg.editState, {
          fallbackSceneId: currentSegmentRef.current?.id,
        });
        if (sceneStamp?.sceneId) {
          setEditedScenes((prev) => ({
            ...prev,
            [sceneStamp.sceneId]: {
              text: sceneStamp.text,
              actor: peer,
              timestamp: Date.now(),
            },
          }));
        }
        if (msg.changeSummary?.announcement) announce(msg.changeSummary.announcement);
      } else if (msg.type === 'COLOUR_UPDATE' && !isResearcher) {
        if (typeof msg.property === 'string' && typeof msg.value === 'number') {
          setColourValues((prev) => ({ ...prev, [msg.property]: msg.value }));
          const peer = labelEditActor(msg.actor, 'Helper');
          const changeSummary = summarizeVisualAdjustment(msg.property, msg.value, peer);
          announce(changeSummary.announcement);
          if (msg.sceneId) {
            stampSceneEdit(msg.sceneId, msg.property, { value: msg.value, actor: peer });
          }
        }
      } else if (msg.type === 'REQUEST_EDIT_STATE' && !isResearcher) {
        // Dashboard joined late; reply with current snapshot if we have one.
        if (editStateRef.current) {
          wsRelayService.sendData({
            type: 'EDIT_STATE_UPDATE',
            editState: editStateRef.current,
            action: 'snapshot',
            changeSummary: { announcement: '', shortText: '' },
            actor: 'CREATOR',
          });
        }
      }
    });
    return () => {
      unsub();
      wsRelayService.disconnect();
    };
  }, [isResearcher, logEvent, stampSceneEdit]);

  // Pipeline-video assignment filter for the current dyad — same convention
  // as Probes 1, 2b, 3.
  const sessionDyadId = useMemo(() => {
    try {
      const stored = localStorage.getItem('sessionConfig');
      return stored ? JSON.parse(stored).dyadId : null;
    } catch { return null; }
  }, []);

  const assignedProjectIds = useMemo(() => {
    try {
      const assignments = JSON.parse(localStorage.getItem('pipelineAssignments') || '{}');
      return assignments[sessionDyadId] || [];
    } catch { return []; }
  }, [sessionDyadId]);

  // Library candidates: pipeline (filtered by server assignment) + sample.
  const libraryVideos = useMemo(() => {
    const sampleVideos = data ? (data.videos || (data.video ? [data.video] : [])) : [];

    let dyadId = null;
    let assignedIds = [];
    try {
      const cfg = JSON.parse(localStorage.getItem('sessionConfig') || '{}');
      dyadId = (cfg.dyadId || '').trim() || null;
      if (dyadId && serverAssignments) {
        assignedIds = findAssignmentsForDyad(serverAssignments, dyadId);
      }
    } catch { /* fall through */ }

    let filteredPipeline = pipelineVideos;
    let filteredSamples = sampleVideos;
    if (dyadId && serverAssignments) {
      filteredPipeline = pipelineVideos.filter(
        (v) => assignedIds.includes(v._projectId)
          || assignedIds.includes(`pipeline-${v._projectId}`)
          || assignedIds.includes(v.id)
      );
      const chosen = sampleVideos.find((v) => v.id === 'video-sample');
      filteredSamples = chosen ? [chosen] : sampleVideos.slice(0, 1);
    }
    return [...filteredPipeline, ...filteredSamples];
  }, [data, pipelineVideos, serverAssignments]);

  // The "active" project data — once a selection has been imported, narrow
  // to it; otherwise use the full sample dataset (used during the library
  // phase for thumbnails and metadata).
  const projectData = useMemo(() => {
    if (selectedVideos) return { videos: selectedVideos };
    return data;
  }, [data, selectedVideos]);

  const segments = useMemo(() => buildAllSegments(projectData), [projectData]);
  const initialSources = useMemo(() => buildInitialSources(projectData), [projectData]);
  const videoDuration = useMemo(() => getTotalDuration(projectData), [projectData]);
  const projectTitle = useMemo(() => {
    if (!projectData) return 'Untitled Video';
    if (projectData.videos?.length > 0) return projectData.videos.map((v) => v.title).join(' + ');
    return projectData.video?.title || 'Untitled Video';
  }, [projectData]);

  const recordHelperSessionChange = useCallback((change) => {
    if (mode !== 'helper') return;
    const text = cleanFeedbackText(change?.text);
    if (!text) return;
    const sceneId = baseSceneId(
      change?.sceneId
      || currentSegmentRef.current?.id
      || getSceneIdAtTime(segments, currentTime),
    );
    const key = change?.key || `${sceneId || 'project'}:${text}`;
    const entry = { key, sceneId, text, timestamp: Date.now() };
    const existingIndex = helperSessionChangesRef.current.findIndex((item) => item.key === key);
    if (existingIndex === -1) {
      helperSessionChangesRef.current = [...helperSessionChangesRef.current, entry];
    } else {
      helperSessionChangesRef.current = helperSessionChangesRef.current.map((item, index) => (
        index === existingIndex ? entry : item
      ));
    }
  }, [mode, segments, currentTime]);

  // Build editState from the imported selection. Runs once when selectedVideos
  // is first set; subsequent edits flow through handleEditChange.
  const handleImport = useCallback((videos) => {
    const SOURCE_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];
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
    setSelectedVideos(videos);
    const initialEditState = { clips, captions: [], sources, textOverlays: [] };
    setEditState(initialEditState);
    setProjectSummaryFocusToken((token) => token + 1);
    setPhase('exploring');
    logEvent(EventTypes.IMPORT_VIDEO, Actors.CREATOR, { videoIds: videos.map((v) => v.id), count: videos.length });
    // Broadcast the initial editState so the researcher dashboard's Live Edit
    // Mirror populates without waiting for the first edit.
    wsRelayService.sendData({
      type: 'EDIT_STATE_UPDATE',
      editState: initialEditState,
      action: 'project initialised',
      changeSummary: { announcement: '', shortText: '' },
      actor: 'CREATOR',
    });
  }, [logEvent]);

  // When the participant taps "Play from here" on a scene block, we only
  // want THAT segment to play; once playback reaches its end, pause without
  // advancing into the next scene. State (not a ref) so we can also pass
  // a `disableAutoFollow` flag to SceneBlockList — without it, a timeUpdate
  // tick that lands past the boundary (the player's tick can be ~100-200ms
  // wide) would let the auto-follow effect expand the next scene before
  // our pause takes effect. Cleared on manual play/pause/seek.
  const [playingSegmentEnd, setPlayingSegmentEnd] = useState(null);

  const handleTimeUpdate = useCallback((time) => {
    setCurrentTime(time);
    setPlayingSegmentEnd((stopAt) => {
      // 0.05s pre-roll keeps us inside the current segment's range when
      // the tick fires before the boundary; the disableAutoFollow flag
      // covers the case where it fires past it.
      // Day 1 fix: do NOT clear stopAt on the boundary pause. If we
      // clear, `disableAutoFollow` flips back to false BEFORE the
      // page-level isPlaying poll catches up, opening a ~250ms window
      // where the auto-follow effect can still see isPlaying=true +
      // disableAutoFollow=false and expand the next scene. Keeping
      // stopAt set holds disableAutoFollow=true until the user takes
      // an explicit action (Play from here / global play / seek), which
      // is exactly the "stay on this scene when finished" behaviour
      // requested.
      if (stopAt != null && time >= stopAt - 0.05) {
        playerRef.current?.pause();
        return stopAt;
      }
      return stopAt;
    });
  }, []);
  const handleSegmentChange = useCallback((seg) => setCurrentSegment(seg), []);
  const handleSeek = useCallback((time) => {
    setPlayingSegmentEnd(null);
    playerRef.current?.seek(time);
  }, []);
  const handlePlay = useCallback(() => {
    setPlayingSegmentEnd(null);
    playerRef.current?.play();
  }, []);
  const handlePause = useCallback(() => {
    setPlayingSegmentEnd(null);
    playerRef.current?.pause();
  }, []);
  // Single-segment playback used by SceneBlock's "Play from here". Differs
  // from handlePlay in that it parks the segment end so playback pauses at
  // the boundary instead of advancing into the next scene.
  const handlePlaySegment = useCallback((scene) => {
    if (!scene) return;
    playerRef.current?.seek(scene.start_time);
    playerRef.current?.play();
    setPlayingSegmentEnd(scene.end_time);
  }, []);

  const editStateRef = useRef(null);
  useEffect(() => { editStateRef.current = editState; }, [editState]);

  const handleEditChange = useCallback((clips, captions, sources, textOverlays) => {
    const prev = editStateRef.current;
    const nextState = { clips, captions, sources, textOverlays: textOverlays ?? prev?.textOverlays ?? [] };
    if (prev) {
      // Push prev onto history so Undo can restore it. Cap at 20 entries.
      setEditHistory((h) => {
        const next = [...h, prev];
        return next.length > 20 ? next.slice(next.length - 20) : next;
      });
    }
    editStateRef.current = nextState;
    setEditState(nextState);
    const actorLabel = mode === 'helper' ? 'Helper' : 'Creator';
    const changeSummary = summarizeEditStateChange(prev, nextState, actorLabel);
    const fallbackSceneId = currentSegment?.id || getSceneIdAtTime(segments, currentTime);
    const sceneStamp = buildEditChangeSceneStamp(prev, nextState, {
      fallbackSceneId,
    });
    const changedSceneId = sceneStamp?.sceneId || (mode === 'helper' ? fallbackSceneId : null);
    const changedText = sceneStamp?.text || (mode === 'helper' ? changeSummary.actionText : '');
    if (changedSceneId && changedText) {
      setEditedScenes((prevScenes) => ({
        ...prevScenes,
        [changedSceneId]: {
          text: changedText,
          actor: mode === 'helper' ? 'Helper' : 'You',
          timestamp: Date.now(),
        },
      }));
    }
    if (mode === 'helper') {
      recordHelperSessionChange({
        sceneId: changedSceneId,
        text: changedText,
        key: `edit:${changedSceneId || 'project'}:${changedText}`,
      });
    }
    // Broadcast to the researcher dashboard so its Live Edit Mirror stays
    // in sync. Same WS relay used for the AI WoZ flow.
    wsRelayService.sendData({
      type: 'EDIT_STATE_UPDATE',
      editState: nextState,
      action: changeSummary.actionText,
      changeSummary,
      actor: mode === 'helper' ? 'HELPER' : 'CREATOR',
    });
  }, [mode, currentSegment?.id, currentTime, segments, recordHelperSessionChange]);

  const handleUndoEdit = useCallback(() => {
    setEditHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      // Restore the previous editState without pushing onto history again
      // (otherwise undo itself would become undoable, which surprises users).
      setEditState(prev);
      logEvent(EventTypes.EDIT_ACTION, Actors.CREATOR, { action: 'undo' });
      announce('Undid last edit.');
      return h.slice(0, -1);
    });
  }, [logEvent]);

  // Track play/pause
  useEffect(() => {
    const interval = setInterval(() => {
      const video = playerRef.current?.video;
      if (video) setIsPlaying(!video.paused);
    }, 250);
    return () => clearInterval(interval);
  }, []);

  // VQA handler
  const answeredRef = useRef(false);
  useEffect(() => {
    window.__vqaReceiveAnswer = (answer) => {
      if (answeredRef.current) return;
      answeredRef.current = true;
      if (currentSegment) {
        setVqaHistories((prev) => ({
          ...prev,
          [currentSegment.id]: [...(prev[currentSegment.id] || []), { role: 'ai', text: answer, source: 'researcher' }],
        }));
      }
      logEvent(EventTypes.VQA_ANSWER, Actors.RESEARCHER, { answer, source: 'researcher_override' });
      if (audioEnabled) ttsService.speak(answer, { rate: speechRate });
    };
    return () => { delete window.__vqaReceiveAnswer; };
  }, [currentSegment, logEvent, audioEnabled, speechRate]);

  const handleAskAI = useCallback(async (question, scene) => {
    answeredRef.current = false;
    setPendingQuestion(question);
    setVqaHistories((prev) => ({
      ...prev,
      [scene.id]: [...(prev[scene.id] || []), { role: 'user', text: question }],
    }));
    const videoEl = playerRef.current?.video;
    if (videoEl) {
      try {
        const frame = captureFrame(videoEl);
        const answer = await askGemini(frame, question, { segmentDescription: scene.descriptions?.level_1 || '' });
        if (!answeredRef.current) {
          answeredRef.current = true;
          setVqaHistories((prev) => ({
            ...prev,
            [scene.id]: [...(prev[scene.id] || []), { role: 'ai', text: answer, source: 'gemini' }],
          }));
          logEvent(EventTypes.VQA_ANSWER, Actors.AI, { answer, source: 'gemini' });
          if (audioEnabled) ttsService.speak(answer, { rate: speechRate });
        }
      } catch (err) {
        // M7: surface a visible "researcher is checking" status when Gemini
        // fails so the question doesn't appear to vanish into the void.
        if (!answeredRef.current) {
          setVqaHistories((prev) => ({
            ...prev,
            [scene.id]: [...(prev[scene.id] || []), {
              role: 'system',
              text: 'AI could not answer right now. Researcher is checking your question.',
            }],
          }));
          logEvent(EventTypes.VQA_ANSWER, Actors.SYSTEM, {
            error: err?.message || 'gemini_failure',
            source: 'fallback_pending_woz',
          });
          announce('AI could not answer. Researcher is checking your question.');
        }
      }
    }
    setPendingQuestion(null);
  }, [logEvent, audioEnabled, speechRate]);

  const handleAskAIEdit = useCallback(async (instruction, scene) => {
    // Drop any earlier in-flight resolver — the participant has issued a new
    // request, so the previous one (if still parked in the panel) is stale.
    if (aiEditResolverRef.current) {
      aiEditResolverRef.current({
        description: 'Cancelled by a newer request.',
        text: '',
        operation: 'superseded',
      });
      aiEditResolverRef.current = null;
    }
    // First try the project's prepared canned responses.
    const prepared = scene.ai_edits_prepared;
    if (prepared) {
      for (const [key, val] of Object.entries(prepared)) {
        if (instruction.toLowerCase().includes(key.replace('_', ' '))) {
          logEvent(EventTypes.AI_EDIT_PROPOSED, Actors.AI, { instruction, segmentId: scene.id, source: 'prepared', operation: key });
          return { description: val.response || val.partial, operation: key, text: val.response };
        }
      }
    }
    // No canned match → park in the researcher's WoZ panel and wait. We
    // keep a local copy (so a same-tab researcher view sees it without
    // needing the WS relay) AND broadcast (so a separate researcher device
    // on ?mode=researcher receives it via the relay).
    const request = {
      instruction,
      segment: scene.name,
      segmentId: scene.id,
      timestamp: Date.now(),
    };
    setPendingAIRequest(request);
    wsRelayService.sendData({ type: 'AI_EDIT_REQUEST', request });
    announce('AI is preparing the edit. Researcher is reviewing.');
    return new Promise((resolve) => {
      aiEditResolverRef.current = resolve;
    });
  }, [logEvent]);

  const handleAIEditResponse = useCallback((responseText, responseType) => {
    setPendingAIRequest(null);
    logEvent(EventTypes.AI_EDIT_PROPOSED, Actors.RESEARCHER, { source: 'researcher_woz', response: responseText, responseType });
    // Same-tab path: resolve any local resolver immediately.
    if (aiEditResolverRef.current) {
      aiEditResolverRef.current({
        description: responseText,
        text: responseText,
        operation: responseType || 'researcher_response',
      });
      aiEditResolverRef.current = null;
    }
    // Cross-device path: broadcast so a participant on a separate device
    // can resolve their own resolver. The relay only forwards researcher
    // messages to participants/creator/helper, never back to the sender,
    // so this is safe even when the researcher is also a participant.
    wsRelayService.sendData({ type: 'AI_EDIT_RESPONSE', text: responseText, responseType });
  }, [logEvent]);

  const handleApplyEdit = useCallback((editAction) => {
    logEvent(EventTypes.AI_EDIT_APPLIED, Actors.RESEARCHER, { action: editAction });
  }, [logEvent]);

  // Applies an operation key (AI accept OR self-edit button) against the
  // current editState. Maps the key to a real edit op via applyOperation
  // and pushes the prior state onto editHistory so Undo works.
  const handleEditSelf = useCallback((scene, action) => {
    if (!scene || !action) return;
    setEditState((prev) => {
      if (!prev) return prev;
      const next = applyOperation(prev, scene.id, action, {
        currentTime,
        captionText: scene.descriptions?.level_1 || 'AI-added caption',
      });
      if (next === prev) {
        announce(`Could not apply ${action} on this scene.`);
        logEvent(EventTypes.EDIT_ACTION, Actors.CREATOR, {
          action, segmentId: scene.id, applied: false, reason: 'no-op',
        });
        return prev;
      }
      setEditHistory((h) => {
        const nxt = [...h, prev];
        return nxt.length > 20 ? nxt.slice(nxt.length - 20) : nxt;
      });
      logEvent(EventTypes.EDIT_ACTION, Actors.CREATOR, {
        action, segmentId: scene.id, applied: true,
      });
      return next;
    });
    stampSceneEdit(scene.id, action, { actor: 'You' });
  }, [currentTime, logEvent, stampSceneEdit]);

  const handleToggleKeep = useCallback((sceneId) => {
    setKeptScenes((prev) => ({ ...prev, [sceneId]: prev[sceneId] === false ? true : false }));
  }, []);

  const handleColourAdjust = useCallback((property, value, context = {}) => {
    setColourValues((prev) => ({ ...prev, [property]: value }));
    const sceneId = baseSceneId(
      context.sceneId
      || currentSegment?.id
      || getSceneIdAtTime(segments, currentTime),
    );
    if (sceneId) {
      helperVisualSceneIdsRef.current[property] = sceneId;
      const text = describeEditOp(property, { value });
      stampSceneEdit(sceneId, property, { value, actor: 'Helper' });
      recordHelperSessionChange({
        sceneId,
        text,
        key: `visual:${property}:${sceneId}`,
      });
    }
  }, [currentSegment, currentTime, segments, stampSceneEdit, recordHelperSessionChange]);

  // Derived: editState filtered to kept clips only (Removed scenes are
  // skipped during playback). Memoised so VideoPlayer's playback engine
  // doesn't tear down whenever an unrelated render fires.
  const playbackEditState = useMemo(
    () => filterClipsByKept(editState, keptScenes),
    [editState, keptScenes]
  );
  const videoFilter = useMemo(() => colourValuesToFilter(colourValues), [colourValues]);
  const videoTransform = useMemo(() => colourValuesToTransform(colourValues), [colourValues]);
  // Day 1 D4: per-scene mute of the original audio. The flag lives on the
  // active clip; the VideoPlayer applies it to the underlying <video>.
  const audioMuted = useMemo(
    () => (currentSegment ? getClipMuted(editState, currentSegment.id) : false),
    [editState, currentSegment],
  );

  // Derive the scene block order from editState.clips so reorders/deletes
  // pushed by the researcher dashboard visually appear in the participant's
  // scene list (not just in the playback engine). When the clip's id matches
  // a segment id we use the segment's descriptions; if a clip was split and
  // its id has a `-split-…` suffix, we fall back to the parent segment.
  const sceneIdToSegment = useMemo(() => {
    const m = new Map();
    for (const s of segments) m.set(s.id, s);
    return m;
  }, [segments]);

  const orderedScenes = useMemo(() => {
    if (!editState?.clips || editState.clips.length === 0) return segments;
    const seen = new Set();
    const out = [];
    for (const clip of editState.clips) {
      const baseId = typeof clip.id === 'string' && clip.id.includes('-split-')
        ? clip.id.slice(0, clip.id.lastIndexOf('-split-'))
        : clip.id;
      const seg = sceneIdToSegment.get(baseId);
      if (!seg || seen.has(seg.id)) continue;
      seen.add(seg.id);
      out.push(seg);
    }
    return out.length > 0 ? out : segments;
  }, [editState, segments, sceneIdToSegment]);

  // Intent Locker → Handover
  const handleHandover = useCallback((task) => {
    setTasks((prev) => [...prev, { ...task, id: `task-${Date.now()}`, timestamp: Date.now() }]);
    logEvent(EventTypes.HANDOVER_INITIATED, Actors.CREATOR, { task });
    // Transition to helper mode
    setTransitionDirection('toHelper');
    setHandoverMode('tasks');
    setIsTransitioning(true);
  }, [logEvent]);

  const handleTransitionComplete = useCallback(() => {
    setIsTransitioning(false);
    if (transitionDirection === 'toHelper') {
      helperSessionStartRef.current = {
        editState: editStateRef.current,
        colourValues: colourValuesRef.current,
      };
      helperSessionChangesRef.current = [];
      helperVisualSceneIdsRef.current = {};
      setHandoverFeedback(null);
      setMode('helper');
      logEvent(EventTypes.HANDOVER_COMPLETED, Actors.SYSTEM, { toMode: 'helper', handoverMode });
      // Day 1 fix #9: web apps can't toggle Android TalkBack, so we (a) silence
      // our own live region and (b) read out an explicit gesture cue first.
      // Helper hears "phone handed over, you can disable TalkBack now with…"
      // before our announcer goes quiet, so they don't have to remember the
      // gesture themselves mid-hand-off.
      announce(
        'Phone handed to helper. Helper, app announcements are now paused. ' +
          'To silence TalkBack itself, hold both volume keys for three seconds, ' +
          'or use a triple-finger triple-tap. Tap Return Device when finished.',
      );
      setTimeout(() => setAnnouncerMuted(true), 1500);
    } else {
      setAnnouncerMuted(false);
      setMode('creator');
      setHandoverMode(null);
      logEvent(EventTypes.HANDOVER_COMPLETED, Actors.SYSTEM, { toMode: 'creator' });
      const feedback = buildHelperReturnFeedback(
        helperSessionStartRef.current,
        {
          editState: editStateRef.current,
          colourValues: colourValuesRef.current,
          fallbackSceneId: currentSegmentRef.current?.id || getSceneIdAtTime(segments, currentTime),
        },
        segments,
        helperVisualSceneIdsRef.current,
        helperSessionChangesRef.current,
      );
      setHandoverFeedback(feedback);
      helperSessionStartRef.current = null;
      helperSessionChangesRef.current = [];
      // Day 1 fix #9: when the device comes back, prompt the helper to re-enable
      // TalkBack so the BLV creator's screen reader works again on hand-back.
      const talkBackReminder = 'App announcements are on again. If TalkBack was turned off, please re-enable it with the same gesture.';
      announce(feedback ? `${feedback.announcement} ${talkBackReminder}` : `Phone returned to creator. ${talkBackReminder}`);
    }
    setTransitionDirection(null);
  }, [transitionDirection, handoverMode, logEvent, segments, currentTime]);

  const handleReturnDevice = useCallback((summary) => {
    logEvent(EventTypes.HELPER_ACTION, Actors.HELPER, { action: 'return_device', summary });
    setTransitionDirection('toCreator');
    setIsTransitioning(true);
  }, [logEvent]);

  useEffect(() => {
    if (mode !== 'creator' || !handoverFeedback) return undefined;
    const raf = requestAnimationFrame(() => {
      handoverFeedbackRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [mode, handoverFeedback]);

  const dismissHandoverFeedback = useCallback(() => {
    setHandoverFeedback(null);
  }, []);

  // m12: cancel a toHelper handover during the transition window. Reverts
  // mode/handoverMode/tasks to the pre-handover state so the creator stays
  // in control. The most recently queued task is removed because that's the
  // one the creator just changed their mind about.
  const handleCancelHandover = useCallback(() => {
    setIsTransitioning(false);
    setTransitionDirection(null);
    setHandoverMode(null);
    setTasks((prev) => prev.slice(0, -1));
    logEvent(EventTypes.HANDOVER_CANCELLED, Actors.CREATOR, {});
    announce('Handover cancelled. You are still the creator.');
  }, [logEvent]);

  // WoZ suggestion
  const handleTriggerSuggestion = useCallback((text) => setPendingSuggestion(text), []);
  const handleSuggestionAccept = useCallback(() => {
    setPendingSuggestion(null);
    // Open Intent Locker for handover
    announce('Suggestion accepted. Prepare handover instruction.');
  }, []);
  const handleSuggestionDismiss = useCallback(() => setPendingSuggestion(null), []);

  const modeLabel = mode === 'creator' ? 'Creator Mode' : `Helper Mode (${handoverMode || 'live'})`;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {phase === 'library' ? (
        <>
          <ConditionHeader condition="probe2" modeLabel="Creator — Select Videos" />
          <OnboardingBrief
            pageTitle="Probe 2a: Shared Device — Video Library"
            description="You and your helper will share one phone. First, choose the video you want to work on together. Tap one or more videos and then tap Create Project to start. After that, you'll explore scenes and decide which ones to keep, discard, edit yourself, ask AI to edit, or hand over to your helper."
          />
          <VideoLibrary videos={libraryVideos} onImport={handleImport} />
        </>
      ) : mode === 'creator' ? (
        <div className="fixed inset-0 flex flex-col bg-white overflow-hidden">
          <div className="flex-1 flex flex-col min-h-0 max-w-lg mx-auto w-full">
          <ConditionHeader condition="probe2" modeLabel={modeLabel} />
          <OnboardingBrief
            pageTitle="Probe 2a: Shared Device — Creator"
            initialOpen={false}
            description="You and your helper share one phone. Below is a list of scenes from your video. Tap a scene to expand it. Inside each scene you have three choices: Edit by Myself to remove, split, move, or caption the scene (with Undo if you change your mind); Ask AI to Edit to speak an instruction and confirm the result; or Ask Helper to tell your helper out loud what you want and hand the phone over. When the helper is done, they will return the device to you."
          />
          {/* Day 1 fix #1: video pinned at top via flex layout. The
              container is `h-[100dvh] flex flex-col overflow-hidden`, so
              this wrapper keeps its natural 16:9 height while the
              SceneBlockList below takes the remaining space with its own
              internal scroll. The scene list scrolls inside its own box
              (not at window level), so the video stays pinned without
              sticky CSS and without overlapping content. */}
          <div aria-hidden="true" inert="" className="px-3 pt-3 flex-shrink-0 pointer-events-none">
            <VideoPlayer
              ref={playerRef}
              src={projectData?.video?.src || projectData?.videos?.[0]?.src || null}
              segments={segments}
              onTimeUpdate={handleTimeUpdate}
              onSegmentChange={handleSegmentChange}
              editState={playbackEditState}
              videoFilter={videoFilter}
              videoTransform={videoTransform}
              audioMuted={audioMuted}
              maxHeight="32vh"
            />
          </div>

          {/* Linear Scene Block List — Creator Mode. Uses orderedScenes so
              the researcher's reorder/delete edits show up here, not just in
              the playback engine. */}
          <SceneBlockList
            scenes={orderedScenes}
            playerRef={playerRef}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onSeek={handleSeek}
            onPlay={handlePlay}
            onPause={handlePause}
            accentColor="#5CB85C"
            videoCount={selectedVideos?.length || 1}
            summaryFocusToken={projectSummaryFocusToken}
            disableAutoFollow={playingSegmentEnd != null}
            vqaHistories={vqaHistories}
            keptScenes={keptScenes}
            editedScenes={editedScenes}
            editState={editState}
            onSceneClose={(sceneId) => {
              setVqaHistories((prev) => {
                if (!(sceneId in prev)) return prev;
                const next = { ...prev };
                delete next[sceneId];
                return next;
              });
            }}
            renderSceneActions={({ scene, index, currentLevel, onLevelChange, currentTime: ct, isPlaying: ip, onSeek: os, onPlay: op, onPause: opp }) => (
              <Probe2aSceneActions
                scene={scene}
                index={index}
                playerRef={playerRef}
                currentTime={ct}
                isPlaying={ip}
                onSeek={os}
                onPlay={op}
                onPause={opp}
                onPlaySegment={handlePlaySegment}
                onAskAI={handleAskAI}
                onAskAIEdit={handleAskAIEdit}
                onHandover={handleHandover}
                onEditSelf={handleEditSelf}
                isKept={keptScenes[scene.id] !== false}
                onToggleKeep={handleToggleKeep}
                currentLevel={currentLevel}
                onLevelChange={onLevelChange}
                accentColor="#5CB85C"
                editState={editState}
                onEditChange={handleEditChange}
                onUndoEdit={handleUndoEdit}
                canUndoEdit={editHistory.length > 0}
              />
            )}
          />
          </div>
          {handoverFeedback && (
            <div
              className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/40 px-3 pb-4 sm:items-center sm:pb-0"
              role="dialog"
              aria-modal="true"
              aria-label="Helper changes"
              onKeyDown={(event) => {
                if (event.key === 'Escape') dismissHandoverFeedback();
                if (event.key !== 'Tab') return;
                if (event.shiftKey && document.activeElement === handoverFeedbackRef.current) {
                  event.preventDefault();
                  handoverFeedbackDismissRef.current?.focus();
                } else if (!event.shiftKey && document.activeElement === handoverFeedbackDismissRef.current) {
                  event.preventDefault();
                  handoverFeedbackRef.current?.focus();
                }
              }}
            >
              <div className="w-full max-w-md rounded-xl border border-amber-300 bg-white shadow-2xl overflow-hidden">
                <div className="bg-amber-50 px-4 py-3 border-b border-amber-200">
                  <p className="text-sm font-bold text-amber-950" aria-hidden="true">
                    {handoverFeedback.title}
                  </p>
                  <div
                    ref={handoverFeedbackRef}
                    id="handover-feedback-body"
                    tabIndex={-1}
                    className="mt-1 text-sm text-amber-950 focus:outline-2 focus:outline-offset-2 focus:outline-amber-600"
                  >
                    <p>{handoverFeedback.title}:</p>
                    <ul className="mt-1 space-y-1">
                      {handoverFeedback.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="px-4 py-3 bg-white">
                  <button
                    ref={handoverFeedbackDismissRef}
                    type="button"
                    onClick={dismissHandoverFeedback}
                    className="w-full rounded-lg bg-[#1F3864] px-4 py-3 text-sm font-bold text-white focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
                    style={{ minHeight: '44px' }}
                    aria-label="Dismiss helper changes summary"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          className="fixed inset-0 bg-white overflow-y-auto"
          style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
        >
          <div className="p-3 max-w-lg mx-auto w-full min-h-full pb-8">
            <ConditionHeader condition="probe2" modeLabel={modeLabel} />
            <OnboardingBrief
              pageTitle="Probe 2a: Shared Device — Helper"
              description="The creator has handed you the phone with a task. Check the task description at the top to see what they want. Use the video editor, colour sliders, and framing tools below to make changes. When you are done, tap Return Device and describe what you did."
            />
            <HelperMode
              playerRef={playerRef}
              videoData={projectData}
              currentTime={currentTime}
              duration={videoDuration}
              isPlaying={isPlaying}
              currentSegment={currentSegment}
              handoverMode={handoverMode}
              tasks={tasks}
              onTimeUpdate={handleTimeUpdate}
              onSegmentChange={handleSegmentChange}
              onSeek={handleSeek}
              onReturnDevice={handleReturnDevice}
              onTaskComplete={() => {}}
              editState={editState}
              playbackEditState={playbackEditState}
              videoFilter={videoFilter}
              videoTransform={videoTransform}
              colourValues={colourValues}
              onColourAdjust={handleColourAdjust}
              onEditChange={handleEditChange}
              initialSources={initialSources}
            />
          </div>
        </div>
      )}

      {/* Handover Suggestion */}
      {mode === 'creator' && (
        <HandoverSuggestion
          suggestion={pendingSuggestion}
          onAccept={handleSuggestionAccept}
          onDismiss={handleSuggestionDismiss}
        />
      )}

      {/* Transition animation */}
      {isTransitioning && transitionDirection && (
        <HandoverTransition
          direction={transitionDirection}
          onComplete={handleTransitionComplete}
          onCancel={transitionDirection === 'toHelper' ? handleCancelHandover : undefined}
        />
      )}

      {/* Researcher WoZ panels */}
      {isResearcher && (
        <div className="max-w-7xl mx-auto px-4 pb-4 space-y-4">
          <ResearcherVQAPanel segment={currentSegment} pendingQuestion={pendingQuestion} />
          <ResearcherAIEditPanel
            segment={currentSegment}
            pendingRequest={pendingAIRequest}
            onSendResponse={handleAIEditResponse}
            onApplyEdit={handleApplyEdit}
          />
          <ResearcherHandoverPanel onTriggerSuggestion={handleTriggerSuggestion} currentMode={mode} />
        </div>
      )}
    </div>
  );
}
