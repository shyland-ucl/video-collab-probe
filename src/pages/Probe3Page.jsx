import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadDescriptions } from '../data/sampleDescriptions.js';
import { loadPipelineVideos, fetchAssignments } from '../services/pipelineApi.js';
import { findAssignmentsForDyad } from '../utils/dyadId.js';
import { useEventLogger } from '../contexts/EventLoggerContext.jsx';
import { useAccessibility } from '../contexts/AccessibilityContext.jsx';
import { EventTypes, Actors } from '../utils/eventTypes.js';
import { announce } from '../utils/announcer.js';
import { buildInitialSources, buildAllSegments, getTotalDuration } from '../utils/buildInitialSources.js';
import { filterClipsByKept, colourValuesToFilter, colourValuesToTransform } from '../utils/editStateView.js';
import {
  buildProjectStats,
  describeEditOp,
  labelEditActor,
  summarizeEditStateChange,
  summarizeVisualAdjustment,
} from '../utils/projectOverview.js';
import { applyOperation, getClipMuted } from '../utils/sceneEditOps.js';
import { buildEditChangeSceneStamp } from '../utils/editChangeStamp.js';
import { buildHelperTaskStatusUpdate } from '../utils/taskFeedback.js';
import { captureFrame, askGemini } from '../services/geminiService.js';
import ttsService from '../services/ttsService.js';
import { wsRelayService } from '../services/wsRelayService.js';
import { clearProjectState } from '../utils/projectState.js';
import ConditionHeader from '../components/shared/ConditionHeader.jsx';
import OnboardingBrief from '../components/shared/OnboardingBrief.jsx';
import VideoPlayer from '../components/shared/VideoPlayer.jsx';
import VideoLibrary from '../components/probe1/VideoLibrary.jsx';
import SceneBlockList from '../components/shared/SceneBlockList.jsx';
import ProjectUpdateToast from '../components/shared/ProjectUpdateToast.jsx';
import Probe3SceneActions from '../components/probe3/Probe3SceneActions.jsx';
import HelperDevice from '../components/probe3/HelperDevice.jsx';
import AIAnalysisTriggerCard from '../components/probe3/AIAnalysisTriggerCard.jsx';
import { playEarcon } from '../utils/earcon.js';
import { curateSuggestions } from '../utils/curateSuggestions.js';
import ResearcherVQAPanel from '../components/probe1/ResearcherVQAPanel.jsx';
import ResearcherAIEditPanel from '../components/probe3/ResearcherAIEditPanel.jsx';
import ResearcherSuggestionPanel from '../components/probe3/ResearcherSuggestionPanel.jsx';
import DecoupledRoleSelector from '../components/decoupled/DecoupledRoleSelector.jsx';
import DecoupledWaitingScreen from '../components/decoupled/DecoupledWaitingScreen.jsx';

const COLORS = {
  navy: '#1F3864',
  purple: '#9B59B6',
  blue: '#2B579A',
};

function baseSceneId(id) {
  if (!id || typeof id !== 'string') return id || null;
  return id.replace(/-split-\d+$/, '');
}

function getSceneIdAtTime(segments = [], time = 0) {
  return segments.find((scene) => (
    time >= scene.start_time && time < scene.end_time
  ))?.id || segments[0]?.id || null;
}

export default function Probe3Page() {
  const { setCondition, logEvent } = useEventLogger();
  const [searchParams] = useSearchParams();
  const isResearcher = searchParams.get('mode') === 'researcher';
  const roleParam = searchParams.get('role');
  const validRoleParam = roleParam === 'creator' || roleParam === 'helper' ? roleParam : null;

  const [phase, setPhase] = useState(validRoleParam ? 'waiting' : 'roleSelect');
  const [role, setRole] = useState(validRoleParam || null);
  const [sessionGuide, setSessionGuide] = useState(null);

  // Video state
  const playerRef = useRef(null);
  const [data, setData] = useState(null);
  const [selectedVideos, setSelectedVideos] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState(null);
  const currentSegmentRef = useRef(null);
  useEffect(() => { currentSegmentRef.current = currentSegment; }, [currentSegment]);
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [editState, setEditState] = useState(null);

  const [librarySelection, setLibrarySelection] = useState(new Set());
  const [projectSummaryFocusToken, setProjectSummaryFocusToken] = useState(0);
  const [feedItems, setFeedItems] = useState([]);
  const [pendingAIRequest, setPendingAIRequest] = useState(null);
  // Parked resolver for "Ask AI to edit"; see Probe2bPage for rationale.
  const aiEditResolverRef = useRef(null);

  const [helperActivities, setHelperActivities] = useState([]);
  const [creatorActivities, setCreatorActivities] = useState([]);
  const [connected, setConnected] = useState(false);
  const [projectUpdate, setProjectUpdate] = useState(null);
  const sentHelperTasksRef = useRef(new Map());
  const [vqaHistories, setVqaHistories] = useState({});
  const [awarenessData, setAwarenessData] = useState({});
  const [keptScenes, setKeptScenes] = useState({});
  // Day 1 fix #4: visual adjustments (helper-side sliders + WoZ override).
  // Broadcast via COLOUR_UPDATE so the peer's video reflects the change.
  const [colourValues, setColourValues] = useState({ brightness: 0, contrast: 0, saturation: 0, zoom: 100, rotate: 0 });
  // Day 1 fix #3: per-scene edit stamp (badge + "What changed" line).
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
  const [pipelineVideos, setPipelineVideos] = useState([]);
  // Server-side dyad assignments — see Probe1Page for rationale.
  const [serverAssignments, setServerAssignments] = useState(null);
  const { audioEnabled, speechRate } = useAccessibility();

  // Suggestion system state
  const [activeSuggestion, setActiveSuggestion] = useState(null);
  const [notedSuggestions, setNotedSuggestions] = useState([]);
  const [deployedSuggestions, setDeployedSuggestions] = useState({});
  const [showSuggestionHistory, setShowSuggestionHistory] = useState(false);
  const suggestionDeployTimeRef = useRef({});
  // Per-property debounce timers for incoming COLOUR_UPDATE messages so a
  // peer dragging a slider only triggers one final-state announcement.
  const colourAnnounceTimersRef = useRef({});
  // Day 1 fix #8: per-suggestion resolution log so the SuggestionItem can
  // render a badge (Routed to AI · applied / Routed to helper · pending /
  // Dismissed) and stay visible after the routing decision. Shape:
  //   { [suggestionId]: { routedTo, outcomeStatus, timestamp, fix_template } }
  const [suggestionResolutions, setSuggestionResolutions] = useState({});

  // Participant-triggered AI analysis (Probe 3 v2 — replaces wizard
  // single-suggestion deployment). One-shot per session; either side
  // can trigger and the other side mirrors via WS.
  const [analysisTriggered, setAnalysisTriggered] = useState(false);
  const [analysisInProgress, setAnalysisInProgress] = useState(false);
  const [analysisTriggeredBy, setAnalysisTriggeredBy] = useState(null);

  useEffect(() => {
    setCondition('probe3');
    logEvent(EventTypes.CONDITION_START, Actors.SYSTEM, { condition: 'probe3' });
    // Probe 3 always opens with a fresh video selection — design intent
    // is no state-carryover from Probes 2a/2b. Wipe any lingering serialised
    // state so the participant lands in the library with empty selection.
    clearProjectState();
    loadDescriptions().then(setData).catch(console.error);
    loadPipelineVideos().then(setPipelineVideos).catch(() => {});
    fetchAssignments()
      .then((a) => setServerAssignments(a || {}))
      .catch(() => {
        try {
          setServerAssignments(JSON.parse(localStorage.getItem('pipelineAssignments') || '{}'));
        } catch { setServerAssignments({}); }
      });
  }, [setCondition, logEvent]);

  // Resolve pipeline-video assignments for the current dyad (researcher
  // configures these via localStorage['pipelineAssignments'], same convention
  // as Probes 1 and 2b).
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

  // Aggregate pre-authored suggestions across every selected video.
  // B4 fix: previously only iterated `data.videos`, which meant pipeline-uploaded
  // videos (loaded via loadPipelineVideos) never contributed suggestions even if
  // their data carried a `suggestions` array. Now any selected video — sample
  // or pipeline — can supply suggestions, and they are merged into a single
  // list. The researcher WoZ panel additionally supports composing ad-hoc
  // suggestions on the fly for videos that have no pre-authored data.
  const videoSuggestions = useMemo(() => {
    if (!selectedVideos) return [];
    const merged = [];
    for (const v of selectedVideos) {
      const vid = typeof v === 'string' ? null : v;
      if (vid?.suggestions && vid.suggestions.length > 0) {
        merged.push(...vid.suggestions);
      }
    }
    return merged;
  }, [selectedVideos]);

  // Top-3 curation — issue > structural > creative, one per scene.
  // The full bank from project.json stays available for the wizard
  // panel; participants only see this narrowed view.
  const curatedSuggestions = useMemo(
    () => curateSuggestions(videoSuggestions, 3),
    [videoSuggestions],
  );

  // Set of scene indices that carry a curated suggestion. Surfaced into
  // SceneBlockList so each block can show the "✨ AI" badge + ring on
  // exactly the scenes worth opening. Empty until analysisTriggered.
  const sceneIndicesWithSuggestions = useMemo(() => {
    if (!analysisTriggered) return new Set();
    return new Set(
      curatedSuggestions
        .map((s) => (Array.isArray(s.relatedScene) ? s.relatedScene[0] : s.relatedScene))
        .filter((i) => typeof i === 'number'),
    );
  }, [analysisTriggered, curatedSuggestions]);

  const projectData = useMemo(() => {
    // selectedVideos is an array of full video objects (sample or pipeline)
    // once import or peer-sync has resolved it. Use it directly so pipeline
    // videos (whose ids don't exist in sample `data.videos`) keep their
    // segments. While selectedVideos is still string-ids from PROJECT_CREATED,
    // fall through to `data` — the resolver useEffect below replaces it with
    // objects shortly.
    if (selectedVideos && Array.isArray(selectedVideos) && selectedVideos.length > 0
        && typeof selectedVideos[0] === 'object') {
      return { videos: selectedVideos };
    }
    return data;
  }, [data, selectedVideos]);

  const segments = useMemo(() => buildAllSegments(projectData), [projectData]);
  const videoDuration = useMemo(() => getTotalDuration(projectData), [projectData]);
  const initialSources = useMemo(() => buildInitialSources(projectData), [projectData]);
  // Filter the playback EDL by Removed scenes so the creator's VideoPlayer
  // skips scenes the participant has marked for removal.
  const playbackEditState = useMemo(() => filterClipsByKept(editState, keptScenes), [editState, keptScenes]);
  // Day 1 D4: per-scene original-audio mute, derived from the active clip.
  const audioMuted = useMemo(
    () => (currentSegment ? getClipMuted(editState, currentSegment.id) : false),
    [editState, currentSegment],
  );
  // Day 1 fix #4: visual adjustments derived from colourValues.
  const videoFilter = useMemo(() => colourValuesToFilter(colourValues), [colourValues]);
  const videoTransform = useMemo(() => colourValuesToTransform(colourValues), [colourValues]);
  const handleColourAdjust = useCallback((property, value, context = {}) => {
    setColourValues((prev) => ({ ...prev, [property]: value }));
    const sceneId = baseSceneId(
      context.sceneId
      || currentSegment?.id
      || getSceneIdAtTime(segments, currentTime),
    );
    wsRelayService.sendData({
      type: 'COLOUR_UPDATE',
      property,
      value,
      actor: role === 'creator' ? 'CREATOR' : 'HELPER',
      sceneId,
    });
    if (sceneId) {
      stampSceneEdit(sceneId, property, {
        value,
        actor: role === 'creator' ? 'You' : 'Helper',
      });
    }
  }, [role, currentSegment, currentTime, segments, stampSceneEdit]);

  // Same orderedScenes derivation as Probe 2a/2b — keeps the creator's scene
  // block list in sync with the helper's edits (deletes, reorders, splits).
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

  const allVideos = useMemo(() => {
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

  // Mirror allVideos into a ref so the WS handler closure can read the
  // current value when bootstrapping the helper from EDIT_STATE_UPDATE.
  const allVideosRef = useRef([]);
  useEffect(() => { allVideosRef.current = allVideos; }, [allVideos]);

  useEffect(() => {
    if (phase !== 'active') return;
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const video = player.video;
      if (video) setIsPlaying(!video.paused);
      const edlDur = player.edlDuration;
      if (edlDur && edlDur > 0) setDuration(edlDur);
      else if (video?.duration && isFinite(video.duration)) setDuration(video.duration);
      else if (videoDuration) setDuration(videoDuration);
    }, 250);
    return () => clearInterval(interval);
  }, [phase, videoDuration]);

  // Day 1 fix #2: bounded "Play this scene" — pause at scene.end_time.
  // Keep stopAt set after the boundary pause so disableAutoFollow holds —
  // see Probe2Page handleTimeUpdate for the rationale.
  const [playingSegmentEnd, setPlayingSegmentEnd] = useState(null);
  const handleTimeUpdate = useCallback((time) => {
    setCurrentTime(time);
    setPlayingSegmentEnd((stopAt) => {
      if (stopAt != null && time >= stopAt - 0.05) {
        playerRef.current?.pause();
        wsRelayService.sendData({
          type: 'PAUSE',
          time,
          actor: role === 'creator' ? 'CREATOR' : 'HELPER',
        });
        return stopAt;
      }
      return stopAt;
    });
  }, [role]);
  const handleSegmentChange = useCallback((seg) => setCurrentSegment(seg), []);
  const handleSeek = useCallback((time) => {
    setPlayingSegmentEnd(null);
    playerRef.current?.seek(time);
    wsRelayService.sendData({
      type: 'SEEK',
      time,
      actor: role === 'creator' ? 'CREATOR' : 'HELPER',
    });
  }, [role]);
  const handlePlaySegment = useCallback((scene) => {
    if (!scene) return;
    playerRef.current?.seek(scene.start_time);
    playerRef.current?.play();
    setPlayingSegmentEnd(scene.end_time);
    wsRelayService.sendData({
      type: 'SEEK',
      time: scene.start_time,
      actor: role === 'creator' ? 'CREATOR' : 'HELPER',
    });
    wsRelayService.sendData({
      type: 'PLAY',
      time: scene.start_time,
      actor: role === 'creator' ? 'CREATOR' : 'HELPER',
    });
  }, [role]);
  const handleQuestion = useCallback((question) => setPendingQuestion(question), []);

  const handleSelectionChange = useCallback((videoId, isSelected) => {
    setLibrarySelection((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(videoId);
      else next.delete(videoId);
      return next;
    });
    wsRelayService.sendData({ type: 'VIDEO_SELECT', videoId, isSelected, actor: role === 'creator' ? 'CREATOR' : 'HELPER' });
  }, [role]);

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
          clips.push({ id: seg.id, sourceId: v.id, name: seg.name, startTime: seg.start_time, endTime: seg.end_time, color: seg.color || color, trimStart: 0, trimEnd: 0 });
        });
      } else {
        clips.push({ id: `clip-${v.id}`, sourceId: v.id, name: v.title || 'Untitled', startTime: 0, endTime: v.duration || 0, color, trimStart: 0, trimEnd: 0 });
      }
    });
    const nextEditState = { clips, captions: [], sources, textOverlays: [] };
    setEditState(nextEditState);
    setProjectSummaryFocusToken((token) => token + 1);
    setSessionGuide(buildProjectStats({
      projectData: { videos },
      editState: nextEditState,
      role: 'creator',
    }));
    setProjectUpdate(null);
    logEvent(EventTypes.IMPORT_VIDEO, Actors.SYSTEM, { videoIds: videos.map((v) => v.id), count: videos.length });
    wsRelayService.sendData({ type: 'PROJECT_CREATED', videoIds: videos.map((v) => v.id), actor: 'CREATOR' });
    // Also broadcast the initial editState so the researcher dashboard mirror
    // populates immediately. See Probe2bPage for rationale.
    wsRelayService.sendData({
      type: 'EDIT_STATE_UPDATE',
      editState: nextEditState,
      action: 'project initialised',
      changeSummary: { announcement: '', shortText: '' },
      actor: 'CREATOR',
    });
    setPhase('active');
  }, [logEvent]);

  const editStateRef = useRef(editState);
  useEffect(() => { editStateRef.current = editState; }, [editState]);
  const [peerEditNotification, setPeerEditNotification] = useState(null);

  // Refs the WS message handler reads to decide whether the helper still
  // needs bootstrapping. setupHandlers' onData callback closes over the
  // page at first mount, so reading state directly would always see the
  // stale initial values.
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const selectedVideosRef = useRef(selectedVideos);
  useEffect(() => { selectedVideosRef.current = selectedVideos; }, [selectedVideos]);
  // Keep the resolved video pool reachable from the WS handler closure so the
  // helper bootstrap can look up `suggestions` (and other rich fields the
  // creator's EDIT_STATE_UPDATE doesn't carry) by id. Without this the helper
  // rebuilds videos from sources/clips and AI suggestions disappear from the
  // helper view (AIAnalysisTriggerCard reports "No suggestions surfaced").

  // Both creator and helper edit freely; see Probe2bPage.jsx for rationale.
  const handleEditChange = useCallback((clips, captions, sources, textOverlays) => {
    const newState = {
      clips,
      captions,
      sources,
      textOverlays: textOverlays ?? editStateRef.current?.textOverlays ?? [],
    };
    const actorLabel = role === 'creator' ? 'Creator' : 'Helper';
    const changeSummary = summarizeEditStateChange(editStateRef.current, newState, actorLabel);
    const sceneStamp = buildEditChangeSceneStamp(editStateRef.current, newState, {
      fallbackSceneId: currentSegment?.id,
    });
    if (sceneStamp?.sceneId) {
      setEditedScenes((prev) => ({
        ...prev,
        [sceneStamp.sceneId]: {
          text: sceneStamp.text,
          actor: role === 'creator' ? 'You' : 'Helper',
          timestamp: Date.now(),
        },
      }));
    }
    setEditState(newState);
    wsRelayService.sendData({
      type: 'EDIT_STATE_UPDATE',
      editState: newState,
      action: changeSummary.actionText,
      changeSummary,
      actor: role === 'creator' ? 'CREATOR' : 'HELPER',
    });
  }, [role, currentSegment?.id]);

  const handleSendTaskToHelper = useCallback((task) => {
    const taskId = `task-${Date.now()}`;
    const sentTask = {
      id: taskId,
      text: task.instruction,
      segment: task.segmentName,
      segmentId: task.segmentId,
    };
    sentHelperTasksRef.current.set(taskId, sentTask);
    wsRelayService.sendData({
      type: 'TASK_TO_HELPER',
      taskId,
      text: task.instruction,
      segment: task.segmentName,
      segmentId: task.segmentId,
      actor: 'CREATOR',
    });
  }, []);

  const handleHelperTaskStatus = useCallback((taskId, status) => {
    setFeedItems((prev) => prev.map((item) => item.id === taskId ? { ...item, status } : item));
    logEvent(EventTypes.HELPER_TASK_STATUS, Actors.HELPER, { taskId, status });
    wsRelayService.sendData({ type: 'TASK_STATUS_UPDATE', taskId, status, actor: 'HELPER' });
  }, [logEvent]);

  const handleAIReview = useCallback((item) => {
    logEvent(EventTypes.AI_EDIT_REVIEWED, Actors.HELPER, { text: item.text });
    announce(`Reviewing: ${item.text}`);
  }, [logEvent]);

  const handleAIUndo = useCallback((item) => {
    setFeedItems((prev) => prev.map((fi) => fi.id === item.id ? { ...fi, undone: true } : fi));
    logEvent(EventTypes.AI_EDIT_UNDONE, Actors.HELPER, { text: item.text });
    announce(`Undid AI edit: ${item.text}`);
  }, [logEvent]);

  // Engagement-only AWARENESS_VIEWED. The viewing role is attributed via
  // the standard `actor` field; the original entry's actor lives in the
  // payload's `entry_actor` field. RQ2: did the participant engage with
  // the awareness layer (versus just having data available)?
  const handleAwarenessViewed = useCallback((payload) => {
    const viewerActor = role === 'creator' ? Actors.CREATOR : Actors.HELPER;
    logEvent(EventTypes.AWARENESS_VIEWED, viewerActor, payload);
  }, [logEvent, role]);

  // --- Suggestion handlers (creator side) ---
  const handleSuggestionDismiss = useCallback(() => {
    if (!activeSuggestion) return;
    const timeToRespond = Date.now() - (suggestionDeployTimeRef.current[activeSuggestion.id] || Date.now());
    logEvent(EventTypes.SUGGESTION_DISMISSED, Actors.CREATOR, {
      suggestionId: activeSuggestion.id,
      timeToRespond,
    });
    setDeployedSuggestions((prev) => ({
      ...prev,
      [activeSuggestion.id]: { ...prev[activeSuggestion.id], response: 'dismissed' },
    }));
    setActiveSuggestion(null);
  }, [activeSuggestion, logEvent]);

  const handleSuggestionNote = useCallback(() => {
    if (!activeSuggestion) return;
    const timeToRespond = Date.now() - (suggestionDeployTimeRef.current[activeSuggestion.id] || Date.now());
    logEvent(EventTypes.SUGGESTION_NOTED, Actors.CREATOR, {
      suggestionId: activeSuggestion.id,
      timeToRespond,
    });
    setNotedSuggestions((prev) => [...prev, activeSuggestion]);
    setDeployedSuggestions((prev) => ({
      ...prev,
      [activeSuggestion.id]: { ...prev[activeSuggestion.id], response: 'noted' },
    }));
    setActiveSuggestion(null);
  }, [activeSuggestion, logEvent]);

  const handleSuggestionRouteToHelper = useCallback(() => {
    if (!activeSuggestion) return;
    const timeToRespond = Date.now() - (suggestionDeployTimeRef.current[activeSuggestion.id] || Date.now());
    logEvent(EventTypes.SUGGESTION_ROUTED, Actors.CREATOR, {
      suggestionId: activeSuggestion.id,
      timeToRespond,
    });
    // Send to helper via WebSocket
    wsRelayService.sendData({
      type: 'SUGGESTION_ROUTED_TO_HELPER',
      suggestion: activeSuggestion,
      actor: 'CREATOR',
    });
    setNotedSuggestions((prev) => [...prev, { ...activeSuggestion, routedToHelper: true }]);
    setDeployedSuggestions((prev) => ({
      ...prev,
      [activeSuggestion.id]: { ...prev[activeSuggestion.id], response: 'routed' },
    }));
    setActiveSuggestion(null);
  }, [activeSuggestion, logEvent]);

  const deploySuggestion = useCallback((suggestion, actor, source) => {
    const deployTime = Date.now();
    suggestionDeployTimeRef.current[suggestion.id] = deployTime;

    logEvent(EventTypes.SUGGESTION_DEPLOYED, actor, {
      suggestionId: suggestion.id,
      category: suggestion.category,
      text: suggestion.text,
      relatedScene: suggestion.relatedScene,
      creatorCurrentScene: currentSegment?.id,
      timestamp: deployTime,
      source,
    });

    setDeployedSuggestions((prev) => ({
      ...prev,
      [suggestion.id]: { deployedAt: deployTime, response: null, source },
    }));

    setActiveSuggestion(suggestion);
  }, [currentSegment, logEvent]);

  // Researcher deploys a suggestion
  const handleDeploySuggestion = useCallback((suggestion) => {
    deploySuggestion(suggestion, Actors.RESEARCHER, 'researcher');
  }, [deploySuggestion]);

  // Participant-triggered AI analysis sequence. Local-only — the
  // WS broadcast happens in handleTriggerAnalysis once on the side
  // that initiates. The other side calls runAnalysisSequence(false)
  // (no rebroadcast) when it receives the AI_ANALYSIS_TRIGGERED msg.
  const runAnalysisSequence = useCallback((triggerActor) => {
    if (analysisTriggered || analysisInProgress) return;
    setAnalysisInProgress(true);
    setAnalysisTriggeredBy(triggerActor);
    const intro = 'The AI is analysing your video. This may take a moment.';
    announce(intro);
    if (audioEnabled) ttsService.speak(intro, { rate: speechRate });

    // ~3s simulated thinking, then surface the curated bank
    setTimeout(() => {
      setAnalysisInProgress(false);
      setAnalysisTriggered(true);
      try { playEarcon(880, 200); } catch { /* ignore */ }
      const sceneCount = curatedSuggestions.length;
      const done = sceneCount > 0
        ? `AI analysis complete. ${sceneCount} suggestion${sceneCount === 1 ? '' : 's'} now available next to the relevant scenes.`
        : 'AI analysis complete. No suggestions surfaced for this video.';
      announce(done);
      if (audioEnabled) ttsService.speak(done, { rate: speechRate });

      // Focus + scroll the first suggested scene into view (creator only —
      // the helper view doesn't have scene blocks, the suggestions render
      // in the trigger-card list instead). Wait one paint so the badge +
      // ring decorations have rendered before focus lands.
      if (role === 'creator' && sceneCount > 0) {
        const firstIdx = (() => {
          for (const s of curatedSuggestions) {
            const i = Array.isArray(s.relatedScene) ? s.relatedScene[0] : s.relatedScene;
            if (typeof i === 'number') return i;
          }
          return null;
        })();
        if (firstIdx != null) {
          requestAnimationFrame(() => {
            const target = document.querySelector(`[data-scene-index="${firstIdx}"]`);
            if (target) {
              target.scrollIntoView({ behavior: 'auto', block: 'nearest' });
              target.focus({ preventScroll: true });
            }
          });
        }
      }
    }, 3000);
  }, [analysisTriggered, analysisInProgress, curatedSuggestions, audioEnabled, speechRate, role]);

  const handleTriggerAnalysis = useCallback(() => {
    if (analysisTriggered || analysisInProgress) return;
    const triggerActor = role; // 'creator' or 'helper'
    // Broadcast first so the peer's animation lines up with ours.
    wsRelayService.sendData({
      type: 'AI_ANALYSIS_TRIGGERED',
      triggerActor,
      triggeredAt: Date.now(),
    });
    logEvent(EventTypes.AI_ANALYSIS_TRIGGERED, role === 'creator' ? Actors.CREATOR : Actors.HELPER, {
      bankSize: videoSuggestions.length,        // full bank
      curatedSize: curatedSuggestions.length,   // surfaced to participant
    });
    runAnalysisSequence(triggerActor);
  }, [analysisTriggered, analysisInProgress, role, videoSuggestions.length, curatedSuggestions.length, logEvent, runAnalysisSequence]);

  // (Removed) Legacy auto-deploy effect. It drip-fed suggestions from the full
  // bank as the creator's current scene changed, ungated by analysisTriggered
  // and using a 1-based scene number where relatedScene is a 0-based index.
  // In the v2 participant-triggered design the surfaced suggestions come from
  // curatedSuggestions via Probe3SceneActions (gated by analysisTriggered);
  // this effect only emitted spurious, wrong-scene SUGGESTION_DEPLOYED events
  // that corrupted the study log, so it has been removed.

  // WebSocket setup
  const unsubscribeRef = useRef({ data: null, connected: null, disconnected: null });

  const clearSubscriptions = useCallback(() => {
    unsubscribeRef.current.data?.();
    unsubscribeRef.current.connected?.();
    unsubscribeRef.current.disconnected?.();
    unsubscribeRef.current = { data: null, connected: null, disconnected: null };
  }, []);

  const setupHandlers = useCallback((currentRole) => {
    clearSubscriptions();

    unsubscribeRef.current.data = wsRelayService.onData((msg) => {
      switch (msg.type) {
        case 'AI_ANALYSIS_TRIGGERED':
          // Peer triggered the analysis sequence — mirror it locally
          // without re-broadcasting (would loop). The triggerActor field
          // is the role that initiated, not the side receiving.
          runAnalysisSequence(msg.triggerActor || 'creator');
          break;
        case 'PLAY':
          if (currentRole === 'helper') playerRef.current?.play();
          setCreatorActivities((prev) => [...prev, { timestamp: Date.now(), actor: 'CREATOR', action: 'play', data: `Played at ${formatTime(msg.time)}` }]);
          break;
        case 'PAUSE':
          if (currentRole === 'helper') playerRef.current?.pause();
          setCreatorActivities((prev) => [...prev, { timestamp: Date.now(), actor: 'CREATOR', action: 'pause', data: `Paused at ${formatTime(msg.time)}` }]);
          break;
        case 'SEEK':
          if (currentRole === 'helper') playerRef.current?.seek(msg.time);
          setCreatorActivities((prev) => [...prev, { timestamp: Date.now(), actor: 'CREATOR', action: 'seek', data: `Seeked to ${formatTime(msg.time)}` }]);
          break;
        case 'STATE_UPDATE':
          break;
        case 'ACTIVITY':
          if (currentRole === 'creator') {
            setHelperActivities((prev) => [...prev, { timestamp: msg.timestamp, actor: msg.actor, action: msg.action, data: msg.data }]);
          }
          break;
        case 'EDIT_STATE_UPDATE': {
          const previousState = editStateRef.current;
          setEditState(msg.editState);
          const peerLabel = labelEditActor(msg.actor);
          const changeSummary = msg.changeSummary || summarizeEditStateChange(previousState, msg.editState, peerLabel);
          const sceneStamp = buildEditChangeSceneStamp(previousState, msg.editState, {
            fallbackSceneId: currentSegmentRef.current?.id,
          });
          if (sceneStamp?.sceneId) {
            setEditedScenes((prev) => ({
              ...prev,
              [sceneStamp.sceneId]: {
                text: sceneStamp.text,
                actor: peerLabel,
                timestamp: Date.now(),
              },
            }));
          }
          // Suppress empty-summary toasts (snapshots sent on
          // REQUEST_EDIT_STATE / pair-up replay carry empty text).
          const hasSummaryText = !!(changeSummary.shortText || changeSummary.announcement);
          if (currentRole === 'creator') {
            if (hasSummaryText) {
              setProjectUpdate({ ...changeSummary, id: Date.now() });
              announce(changeSummary.announcement);
            }
          } else if (hasSummaryText) {
            setPeerEditNotification({ text: changeSummary.shortText, id: Date.now() });
          }
          // Helper bootstrap: take canonical sources from the broadcast
          // editState if we still haven't resolved selectedVideos to full
          // objects. Without this, the helper sits in 'library' forever
          // when its allVideos pool doesn't include the creator's IDs
          // (pipeline videos still loading, dyad-assignment mismatch, late
          // join, etc.). Mirrors the Probe 2b fix.
          const sv = selectedVideosRef.current;
          const helperNeedsBootstrap = currentRole === 'helper'
            && msg.editState?.sources?.length > 0
            && (sv == null
                || (Array.isArray(sv) && sv.length > 0 && typeof sv[0] === 'string')
                || phaseRef.current !== 'active');
          if (helperNeedsBootstrap) {
            const sources = msg.editState.sources;
            const clipsBySource = new Map();
            for (const clip of msg.editState.clips || []) {
              if (!clipsBySource.has(clip.sourceId)) clipsBySource.set(clip.sourceId, []);
              clipsBySource.get(clip.sourceId).push({
                id: clip.id,
                name: clip.name,
                color: clip.color,
                start_time: clip.startTime,
                end_time: clip.endTime,
              });
            }
            // EDIT_STATE_UPDATE only carries source/clip metadata, not the
            // suggestion bank. Look each source up in allVideos (the rich
            // pool loaded from sample data + pipeline assignments) so the
            // helper inherits the same `suggestions` the creator sees,
            // otherwise AIAnalysisTriggerCard reports "No suggestions
            // surfaced" even when the creator has them.
            const knownById = new Map((allVideosRef.current || []).map((v) => [v.id, v]));
            const videos = sources.map((s) => {
              const known = knownById.get(s.id);
              return {
                id: s.id,
                title: s.name,
                src: s.src,
                duration: s.duration,
                segments: clipsBySource.get(s.id) || [],
                suggestions: known?.suggestions || [],
              };
            });
            setSelectedVideos(videos);
            setSessionGuide(buildProjectStats({
              projectData: { videos },
              editState: msg.editState,
              role: 'helper',
            }));
            if (phaseRef.current !== 'active') {
              setPhase('active');
              announce('Creator started the project. Entering session.');
            }
          }
          break;
        }
        case 'VIDEO_SELECT':
          setLibrarySelection((prev) => {
            const next = new Set(prev);
            if (msg.isSelected) next.add(msg.videoId);
            else next.delete(msg.videoId);
            return next;
          });
          break;
        case 'PROJECT_CREATED':
          setSelectedVideos(msg.videoIds);
          break;
        case 'TASK_TO_HELPER': {
          const item = {
            id: msg.taskId || `task-${Date.now()}`,
            type: 'helper_task',
            text: msg.text,
            segment: msg.segment,
            segmentId: msg.segmentId,
            status: 'pending',
            timestamp: Date.now(),
          };
          setFeedItems((prev) => [item, ...prev]);
          logEvent(EventTypes.HELPER_TASK_RECEIVED, Actors.HELPER, { taskId: item.id, text: msg.text, segment: msg.segment });
          announce(`Creator sent you a task: ${msg.text}`);
          break;
        }
        case 'TASK_STATUS_UPDATE': {
          const task = sentHelperTasksRef.current.get(msg.taskId);
          if (currentRole === 'creator') {
            const update = buildHelperTaskStatusUpdate(task || { id: msg.taskId }, msg.status, 'Helper');
            setProjectUpdate(update);
            announce(update.announcement);
          }
          if (typeof window.__taskStatusUpdate === 'function') {
            window.__taskStatusUpdate(msg.taskId, msg.status);
          }
          logEvent(EventTypes.HELPER_TASK_STATUS, Actors.HELPER, { taskId: msg.taskId, status: msg.status });
          break;
        }
        case 'AI_EDIT_NOTIFY': {
          const item = {
            id: `ai-${Date.now()}`,
            type: 'ai_edit',
            text: msg.text,
            responseType: msg.responseType,
            timestamp: Date.now(),
            undone: false,
          };
          setFeedItems((prev) => [item, ...prev]);
          logEvent(EventTypes.AI_EDIT_RESPONSE, Actors.AI, { text: msg.text, responseType: msg.responseType });
          announce(`AI edit: ${msg.text}`);
          break;
        }

        // --- Suggestion system messages ---
        case 'SUGGESTION_PUSH':
          // Creator receives a deployed suggestion
          if (currentRole === 'creator' && msg.suggestion) {
            setActiveSuggestion(msg.suggestion);
          }
          break;

        case 'SUGGESTION_ROUTED_TO_HELPER':
          // Helper receives a routed suggestion. Push to the activity feed AND
          // surface a visible toast via peerEditNotification so the helper
          // doesn't have to scan the feed to notice the new task.
          if (currentRole === 'helper' && msg.suggestion) {
            const item = {
              id: `sug-task-${Date.now()}`,
              type: 'suggestion_task',
              suggestion: msg.suggestion,
              text: msg.suggestion.text,
              status: 'pending',
              timestamp: Date.now(),
            };
            setFeedItems((prev) => [item, ...prev]);
            setPeerEditNotification({
              text: `Creator routed an AI suggestion: "${msg.suggestion.text}"`,
              id: Date.now(),
            });
            announce(`AI suggestion routed from Creator: ${msg.suggestion.text}`);
          }
          break;

        case 'HELPER_SUGGESTION_RESPONSE':
          // Creator receives helper's response to a suggestion
          if (currentRole === 'creator') {
            const { suggestionId, response } = msg;
            setNotedSuggestions((prev) => prev.map((s) =>
              s.id === suggestionId ? { ...s, helperResponse: response } : s
            ));
            // Day 1 fix #8: update the persistent resolution log so the
            // SuggestionItem badge flips from pending → applied/failed.
            setSuggestionResolutions((prev) => {
              const cur = prev[suggestionId] || { routedTo: 'helper', timestamp: Date.now() };
              const outcome = response === 'done' || response === 'completed' ? 'applied'
                : response === 'cant_do' || response === 'failed' ? 'failed'
                : 'pending';
              return { ...prev, [suggestionId]: { ...cur, outcomeStatus: outcome } };
            });
            logEvent(EventTypes.HELPER_SUGGESTION_RESPONSE, Actors.HELPER, { suggestionId, response });
            announce(`Helper responded to suggestion: ${response}`);

            // Log chain complete
            const deployTime = suggestionDeployTimeRef.current[suggestionId];
            if (deployTime) {
              logEvent(EventTypes.SUGGESTION_CHAIN_COMPLETE, Actors.SYSTEM, {
                suggestionId,
                totalDuration: Date.now() - deployTime,
              });
            }
          }
          break;

        case 'AI_EDIT_REQUEST': {
          if (isResearcher) setPendingAIRequest(msg.request || null);
          break;
        }
        case 'COLOUR_UPDATE': {
          // Mirror peer / WoZ slider movement onto our local CSS filter.
          if (typeof msg.property === 'string' && typeof msg.value === 'number') {
            setColourValues((prev) => ({ ...prev, [msg.property]: msg.value }));
            const peer = labelEditActor(msg.actor, 'Peer');
            const sceneId = msg.sceneId || currentSegmentRef.current?.id;
            if (sceneId) {
              setEditedScenes((prev) => ({
                ...prev,
                [sceneId]: {
                  text: describeEditOp(msg.property, { value: msg.value }),
                  actor: peer,
                  timestamp: Date.now(),
                },
              }));
            }
            // Debounce announcement + toast/banner per (actor, property) so a
            // slider drag only reports its final value once. The CSS filter
            // above still updates every tick for live visual feedback.
            const key = `${msg.actor}:${msg.property}`;
            if (colourAnnounceTimersRef.current[key]) {
              clearTimeout(colourAnnounceTimersRef.current[key]);
            }
            colourAnnounceTimersRef.current[key] = setTimeout(() => {
              const finalSummary = summarizeVisualAdjustment(msg.property, msg.value, peer);
              announce(finalSummary.announcement);
              if (currentRole === 'creator') {
                setProjectUpdate({ ...finalSummary, id: Date.now() });
              } else {
                setPeerEditNotification({ text: finalSummary.shortText, id: Date.now() });
              }
              delete colourAnnounceTimersRef.current[key];
            }, 500);
          }
          break;
        }
        case 'REQUEST_EDIT_STATE': {
          // Researcher dashboard joined late; creator answers with snapshot.
          if (currentRole === 'creator' && editStateRef.current) {
            wsRelayService.sendData({
              type: 'EDIT_STATE_UPDATE',
              editState: editStateRef.current,
              action: 'snapshot',
              changeSummary: { announcement: '', shortText: '' },
              actor: 'CREATOR',
            });
          }
          break;
        }
        case 'AI_EDIT_RESPONSE': {
          if (!isResearcher) {
            // Resolve the parked promise from the legacy "Ask AI to edit"
            // flow if it's waiting (Probe 2/2b path).
            if (aiEditResolverRef.current) {
              aiEditResolverRef.current({
                description: msg.text,
                text: msg.text,
                operation: msg.responseType || 'researcher_response',
              });
              aiEditResolverRef.current = null;
            }
            // Announce + surface the response on the creator side regardless
            // of whether a resolver was parked. Suggestion-route 'ai' picks
            // this path: the request was sent without parking a resolver, so
            // the response would otherwise arrive silently.
            if (msg.text && currentRole === 'creator') {
              announce(`AI response: ${msg.text}`);
              setFeedItems((prev) => [{
                id: `ai-resp-${Date.now()}`,
                type: 'ai_edit',
                text: msg.text,
                responseType: msg.responseType,
                timestamp: Date.now(),
                undone: false,
              }, ...prev]);
              // Flip the routed-to-AI suggestion's badge from pending →
              // applied so the resolution log reflects the WoZ outcome.
              if (msg.suggestionId) {
                setSuggestionResolutions((prev) => {
                  const cur = prev[msg.suggestionId];
                  if (!cur) return prev;
                  return {
                    ...prev,
                    [msg.suggestionId]: { ...cur, outcomeStatus: 'applied' },
                  };
                });
              }
            }
          }
          break;
        }

        default:
          break;
      }
    });

    unsubscribeRef.current.disconnected = wsRelayService.onDisconnected(() => {
      setConnected(false);
      logEvent(EventTypes.DEVICE_DISCONNECTED, Actors.SYSTEM, { role: currentRole });
      announce('Device disconnected');
    });

    unsubscribeRef.current.connected = wsRelayService.onConnected(() => {
      setConnected(true);
      logEvent(EventTypes.DEVICE_CONNECTED, Actors.SYSTEM, { role: currentRole });
      // M7: name the peer so the creator knows who joined; "Loading shared
      // session" tells them the page is about to advance.
      const peer = currentRole === 'creator' ? 'Helper' : 'Creator';
      announce(`${peer} joined. Loading shared session.`);
      // Helper-side state recovery: ask the creator for a snapshot in case
      // we paired late and missed PROJECT_CREATED / EDIT_STATE_UPDATE.
      // Idempotent; creator's REQUEST_EDIT_STATE handler short-circuits
      // when no project exists yet.
      if (currentRole === 'helper') {
        wsRelayService.sendData({ type: 'REQUEST_EDIT_STATE' });
      }
      // Creator-side replay: if we already have a project, push a fresh
      // snapshot proactively so a helper that paired late bootstraps
      // straight into 'active'.
      if (currentRole === 'creator' && editStateRef.current?.sources?.length > 0) {
        wsRelayService.sendData({
          type: 'EDIT_STATE_UPDATE',
          editState: editStateRef.current,
          action: 'snapshot',
          changeSummary: { announcement: '', shortText: '' },
          actor: 'CREATOR',
        });
      }
    });
  }, [clearSubscriptions, logEvent, runAnalysisSequence]);

  useEffect(() => {
    if (phase === 'waiting' && connected) setPhase('library');
  }, [phase, connected]);

  // Helper-side: if we bootstrapped from EDIT_STATE_UPDATE before allVideos
  // had loaded (pipeline fetch still pending), the resulting video objects
  // have empty `suggestions` and AIAnalysisTriggerCard reports "No
  // suggestions surfaced". When allVideos later resolves, retroactively
  // merge the suggestion bank in by id so the helper's view matches the
  // creator's. No-op for the creator (whose selectedVideos always come
  // from the rich allVideos pool).
  useEffect(() => {
    if (role !== 'helper') return;
    if (!Array.isArray(selectedVideos) || selectedVideos.length === 0) return;
    if (typeof selectedVideos[0] === 'string') return;
    if (!allVideos || allVideos.length === 0) return;
    const knownById = new Map(allVideos.map((v) => [v.id, v]));
    let mutated = false;
    const next = selectedVideos.map((v) => {
      const existing = Array.isArray(v.suggestions) ? v.suggestions : [];
      if (existing.length > 0) return v;
      const known = knownById.get(v.id);
      const incoming = known?.suggestions;
      if (!incoming || incoming.length === 0) return v;
      mutated = true;
      return { ...v, suggestions: incoming };
    });
    if (mutated) setSelectedVideos(next);
  }, [role, selectedVideos, allVideos]);

  // Resolve video IDs from PROJECT_CREATED
  useEffect(() => {
    if (selectedVideos && Array.isArray(selectedVideos) && typeof selectedVideos[0] === 'string') {
      if (allVideos.length > 0) {
        const resolved = allVideos.filter((v) => selectedVideos.includes(v.id));
        if (resolved.length > 0) {
          const SOURCE_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#84CC16'];
          const sources = [];
          const clips = [];
          resolved.forEach((v, srcIdx) => {
            const color = SOURCE_COLORS[srcIdx % SOURCE_COLORS.length];
            sources.push({ id: v.id, name: v.title || 'Untitled', src: v.src, duration: v.duration });
            const segs = v.segments || [];
            if (segs.length > 0) {
              segs.forEach((seg) => {
                clips.push({ id: seg.id, sourceId: v.id, name: seg.name, startTime: seg.start_time, endTime: seg.end_time, color: seg.color || color, trimStart: 0, trimEnd: 0 });
              });
            } else {
              clips.push({ id: `clip-${v.id}`, sourceId: v.id, name: v.title || 'Untitled', startTime: 0, endTime: v.duration || 0, color, trimStart: 0, trimEnd: 0 });
            }
          });
          const nextEditState = {
            clips,
            captions: [],
            sources,
            textOverlays: editStateRef.current?.textOverlays || [],
          };
          setEditState(nextEditState);
          setSelectedVideos(resolved);
          setSessionGuide(buildProjectStats({
            projectData: { videos: resolved },
            editState: nextEditState,
            role,
          }));
          setProjectUpdate(null);
          setPhase('active');
          announce('Creator started the project. Entering session.');
        }
      }
    }
  }, [selectedVideos, allVideos, role]);

  const handleRoleSelect = useCallback((selectedRole) => {
    setRole(selectedRole);
    setPhase('waiting');
    logEvent(EventTypes.SESSION_START, Actors.SYSTEM, { role: selectedRole, probe: 'probe3' });
    // M7: confirm the role choice and explain the wait — see Probe2bPage.jsx.
    const otherRole = selectedRole === 'creator' ? 'helper' : 'creator';
    announce(`Role selected: ${selectedRole}. Waiting for ${otherRole} to join.`);
  }, [logEvent]);

  // WS handler registration. setupHandlers' identity changes whenever
  // runAnalysisSequence does (analysis state / audio / speech-rate changes), so
  // this effect re-registers the data/connect handlers with the fresh closure —
  // but it does NOT touch the socket. Declared before the connection effect so
  // handlers are registered before connect() runs on mount.
  useEffect(() => {
    if (!role) return;
    setupHandlers(role);
    return () => clearSubscriptions();
  }, [role, setupHandlers, clearSubscriptions]);

  // Connection lifecycle — keyed on role ONLY, so the socket connects/disconnects
  // exactly once per role. Previously this also depended on setupHandlers, which
  // meant every analysis-state or accessibility-setting change tore down and
  // re-established the WebSocket mid-session, unpairing creator/helper.
  // See Probe2bPage.jsx for the rationale; same StrictMode-safe pattern.
  // docs/walkthrough_findings_2026-04-25_spotcheck.md NF2.
  useEffect(() => {
    if (!role) return;
    wsRelayService.connect(role);
    return () => {
      wsRelayService.disconnect();
    };
  }, [role]);

  // WoZ AI edit. Participant parks a resolver via handleAskAIEdit; the
  // researcher tab resolves it by sending AI_EDIT_RESPONSE over WS.
  const handleAskAIEdit = useCallback(async (instruction, scene) => {
    if (aiEditResolverRef.current) {
      aiEditResolverRef.current({
        description: 'Cancelled by a newer request.',
        text: '',
        operation: 'superseded',
      });
      aiEditResolverRef.current = null;
    }
    const prepared = scene?.ai_edits_prepared;
    if (prepared) {
      for (const [key, val] of Object.entries(prepared)) {
        if (instruction.toLowerCase().includes(key.replace('_', ' '))) {
          logEvent(EventTypes.AI_EDIT_PROPOSED, Actors.AI, {
            instruction, segmentId: scene?.id, source: 'prepared', operation: key,
          });
          return { description: val.response || val.partial, operation: key, text: val.response };
        }
      }
    }
    const request = {
      instruction,
      segment: scene?.name,
      segmentId: scene?.id,
      timestamp: Date.now(),
    };
    setPendingAIRequest(request);
    wsRelayService.sendData({ type: 'AI_EDIT_REQUEST', request });
    announce('AI is preparing the edit.');
    return new Promise((resolve) => {
      aiEditResolverRef.current = resolve;
    });
  }, [logEvent]);

  // Day 1 fix #7: route a suggestion through self / AI / helper. The AI
  // path applies the suggestion's fix_template via the same primitives the
  // WoZ override buffer uses (COLOUR_UPDATE for visual sliders, scene mute
  // for the audio half), then stamps the scene as edited so the description
  // reflects the change. helper-only suggestions hide the AI button so this
  // path only ever runs for fix_template-bearing suggestions; we still
  // defensively check before applying.
  const applyFixTemplate = useCallback((suggestion) => {
    const tpl = suggestion?.fix_template;
    if (!tpl) return false;
    // Resolve which scene the fix targets. relatedScene may be a single
    // index or an array; we apply to the first scene in the list.
    const sceneIdx = Array.isArray(suggestion.relatedScene)
      ? suggestion.relatedScene[0]
      : suggestion.relatedScene;
    const sceneArr = orderedScenes.length > 0 ? orderedScenes : segments;
    const targetScene = typeof sceneIdx === 'number' ? sceneArr[sceneIdx] : null;
    const action = String(tpl.action || '').toLowerCase();
    const value = typeof tpl.value === 'number' ? tpl.value : null;
    if (['brightness', 'contrast', 'saturation', 'zoom', 'rotate'].includes(action) && value != null) {
      // Visual slider — broadcast as COLOUR_UPDATE so peer + local mirror.
      setColourValues((prev) => ({ ...prev, [action]: value }));
      wsRelayService.sendData({ type: 'COLOUR_UPDATE', property: action, value, actor: 'AI', sceneId: targetScene?.id || null });
      if (targetScene?.id) stampSceneEdit(targetScene.id, action, { value, actor: 'AI' });
      return true;
    }
    if (action === 'mute' || action === 'unmute') {
      if (!targetScene) return false;
      const op = action === 'mute' ? 'mute' : 'unmute';
      const current = editStateRef.current;
      if (!current) return false;
      const next = applyOperation(current, targetScene.id, op, {});
      if (next === current) return false;
      handleEditChange(next.clips, next.captions, next.sources, next.textOverlays);
      stampSceneEdit(targetScene.id, op, { actor: 'AI' });
      return true;
    }
    return false;
  }, [orderedScenes, segments, stampSceneEdit, handleEditChange]);

  // Tracks the suggestion id whose routing badge should receive focus on the
  // very next render — set synchronously inside handleSuggestionRoute and
  // cleared after the badge has consumed it. Prevents the badge from re-
  // grabbing focus on subsequent ambient re-renders (e.g. when AI/helper
  // applies the fix and only outcomeStatus flips). The user wants those
  // updates to be readout-only, not focus-stealing.
  const [justRoutedSuggestionId, setJustRoutedSuggestionId] = useState(null);

  const consumeJustRouted = useCallback((id) => {
    setJustRoutedSuggestionId((cur) => (cur === id ? null : cur));
  }, []);

  const handleSuggestionRoute = useCallback((suggestion, channel) => {
    if (!suggestion) return;
    // Resolve target scene (relatedScene is zero-based index, single int or array)
    const sceneIdx = Array.isArray(suggestion.relatedScene)
      ? suggestion.relatedScene[0]
      : suggestion.relatedScene;
    const sceneArr = orderedScenes.length > 0 ? orderedScenes : segments;
    const targetScene = typeof sceneIdx === 'number' ? sceneArr[sceneIdx] : null;

    // Mark this suggestion as "just routed" so the badge focuses ONCE on the
    // next render and never again on outcome updates.
    setJustRoutedSuggestionId(suggestion.id);

    if (channel === 'self') {
      setNotedSuggestions((prev) => [...prev, suggestion]);
      setSuggestionResolutions((prev) => ({
        ...prev,
        [suggestion.id]: { routedTo: 'self', outcomeStatus: 'pending', timestamp: Date.now() },
      }));
      // Jump to the related scene's "Edit by Myself" button so the creator
      // lands in the right edit context. One paint delay so the resolution
      // badge has rendered before focus moves away.
      if (targetScene?.id) {
        requestAnimationFrame(() => {
          const btn = document.querySelector(`[data-edit-self-toggle="${targetScene.id}"]`);
          if (btn) {
            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            btn.focus({ preventScroll: true });
          }
        });
      }
      announce(`Edit by myself opened for ${targetScene?.name || 'this scene'}.`);
    } else if (channel === 'helper') {
      wsRelayService.sendData({ type: 'SUGGESTION_ROUTED_TO_HELPER', suggestion, actor: 'CREATOR' });
      setNotedSuggestions((prev) => [...prev, { ...suggestion, routedToHelper: true }]);
      setSuggestionResolutions((prev) => ({
        ...prev,
        [suggestion.id]: { routedTo: 'helper', outcomeStatus: 'pending', timestamp: Date.now() },
      }));
      announce('Suggestion sent to helper.');
    } else if (channel === 'ai') {
      // Route to the researcher panel via WoZ instead of auto-applying. The
      // researcher's ResearcherAIEditPanel picks up pendingRequest and either
      // sends a prepared response or applies a slider/edit override.
      const request = {
        instruction: suggestion.text,
        segment: targetScene?.name,
        segmentId: targetScene?.id,
        suggestionId: suggestion.id,
        timestamp: Date.now(),
      };
      setPendingAIRequest(request);
      wsRelayService.sendData({ type: 'AI_EDIT_REQUEST', request });
      setSuggestionResolutions((prev) => ({
        ...prev,
        [suggestion.id]: {
          routedTo: 'ai',
          outcomeStatus: 'pending',
          timestamp: Date.now(),
        },
      }));
      announce('AI is preparing the fix.');
    }
    setDeployedSuggestions((prev) => ({
      ...prev,
      [suggestion.id]: { ...prev[suggestion.id], response: channel },
    }));
    setActiveSuggestion(null);
  }, [orderedScenes, segments]);

  // Apply an operation key (AI accept OR self-edit button) against editState.
  // Reuses handleEditChange so the control-owner check + EDIT_STATE_UPDATE
  // broadcast logic stays in one place. See Probe2bPage for the same pattern.
  const handleApplySceneEdit = useCallback((scene, operation) => {
    if (!scene || !operation) return;
    const current = editStateRef.current;
    if (!current) return;
    const next = applyOperation(current, scene.id, operation, {
      currentTime,
      captionText: scene.descriptions?.level_1 || 'AI-added caption',
    });
    if (next === current) {
      announce(`Could not apply ${operation} on this scene.`);
      logEvent(EventTypes.EDIT_ACTION, Actors.CREATOR, {
        action: operation, segmentId: scene.id, applied: false, reason: 'no-op',
      });
      return;
    }
    logEvent(EventTypes.EDIT_ACTION, Actors.CREATOR, {
      action: operation, segmentId: scene.id, applied: true,
    });
    handleEditChange(next.clips, next.captions, next.sources, next.textOverlays);
    stampSceneEdit(scene.id, operation, {
      actor: role === 'creator' ? 'You' : 'Helper',
    });
  }, [currentTime, handleEditChange, logEvent, stampSceneEdit, role]);

  const handleAIEditResponse = useCallback((responseText, responseType) => {
    // Capture the suggestionId from the pending request before clearing — the
    // creator side uses it to flip the routed-to-AI suggestion's resolution
    // badge from "pending" to "applied" when the response arrives.
    const suggestionId = pendingAIRequest?.suggestionId || null;
    setPendingAIRequest(null);
    logEvent(EventTypes.AI_EDIT_PROPOSED, Actors.RESEARCHER, {
      source: 'researcher_woz', response: responseText, responseType,
    });
    if (aiEditResolverRef.current) {
      aiEditResolverRef.current({
        description: responseText,
        text: responseText,
        operation: responseType || 'researcher_response',
      });
      aiEditResolverRef.current = null;
    }
    wsRelayService.sendData({
      type: 'AI_EDIT_RESPONSE',
      text: responseText,
      responseType,
      suggestionId,
    });
  }, [logEvent, pendingAIRequest]);

  const handleManualSync = useCallback((action) => {
    if (!playerRef.current) return;
    switch (action) {
      case 'play': playerRef.current.play(); break;
      case 'pause': playerRef.current.pause(); break;
      case 'sync_time':
        wsRelayService.sendData({ type: 'SEEK', time: currentTime, actor: 'RESEARCHER' });
        break;
    }
  }, [currentTime]);

  // Helper suggestion response handler
  const handleHelperSuggestionResponse = useCallback((suggestionId, response) => {
    logEvent(EventTypes.HELPER_SUGGESTION_RESPONSE, Actors.HELPER, { suggestionId, response });
    wsRelayService.sendData({
      type: 'HELPER_SUGGESTION_RESPONSE',
      suggestionId,
      response,
      actor: 'HELPER',
    });
    // Update feed item status
    setFeedItems((prev) => prev.map((item) =>
      item.suggestion?.id === suggestionId ? { ...item, status: response } : item
    ));
  }, [logEvent]);

  const modeLabel = role
    ? `${role.charAt(0).toUpperCase() + role.slice(1)} Device${connected ? ' (Connected)' : ''}`
    : '';

  // Role Selection
  if (phase === 'roleSelect') {
    return (
      <DecoupledRoleSelector
        condition="probe3"
        accentColor={COLORS.purple}
        onRoleSelect={handleRoleSelect}
      />
    );
  }

  // Waiting
  if (phase === 'waiting') {
    return (
      <DecoupledWaitingScreen
        condition="probe3"
        accentColor={COLORS.purple}
        role={role}
        modeLabel={modeLabel}
      />
    );
  }

  // Library
  if (phase === 'library') {
    const isCreator = role === 'creator';
    return (
      <div className="min-h-screen bg-white">
        <ConditionHeader condition="probe3" modeLabel={`${role.charAt(0).toUpperCase() + role.slice(1)} — Select Videos`} />
        <OnboardingBrief
          pageTitle="Probe 3: Proactive AI — Video Library"
          description="This is the video library. The creator selects the clips to work on. Once imported, both devices will load the same footage. Browse the list and tap Import when ready."
        />
        <VideoLibrary
          videos={allVideos}
          onImport={handleImport}
          showPreview={!isCreator}
          controlledSelection={librarySelection}
          onSelectionChange={isCreator ? handleSelectionChange : undefined}
          readOnly={!isCreator}
        />
      </div>
    );
  }

  // Active Session
  return (
    <div className="fixed inset-0 bg-white flex flex-col overflow-hidden">
      <ProjectUpdateToast
        update={role === 'creator' ? projectUpdate : null}
        onDismiss={() => setProjectUpdate(null)}
        accentColor={COLORS.purple}
      />
      {role === 'creator' ? (
        <div className="flex flex-col flex-1 min-h-0 max-w-lg mx-auto w-full">
          <ConditionHeader condition="probe3" modeLabel={modeLabel} />
          <OnboardingBrief
            initialOpen={false}
            pageTitle="Probe 3: Proactive AI — Creator"
            description="This works like the previous two-phone setup, but now you can ask the AI to analyse the video and suggest improvements. Tap Analyse with AI when you're ready. When suggestions appear inside scenes, you must choose who handles each one: tap I'll Do It to handle it yourself, Ask AI to Fix to let AI do it, Send to Helper to assign it, or Dismiss to ignore it. You cannot apply suggestions directly — you must route them. All other editing tools work the same as before."
          />
          <AIAnalysisTriggerCard
            analysisTriggered={analysisTriggered}
            analysisInProgress={analysisInProgress}
            onTrigger={handleTriggerAnalysis}
            suggestionCount={curatedSuggestions.length}
            triggeredBy={analysisTriggeredBy}
            selfRole="creator"
          />
          {/* Day 1 fix #1: video pinned at top via flex layout. Outer is
              `h-[100dvh] flex flex-col overflow-hidden`; this wrapper is
              `flex-shrink-0` so it keeps its natural 16:9 height while the
              SceneBlockList below takes remaining space with its own
              internal scroll. Scenes scroll inside their own box, video
              stays put — no sticky banner, no overlap. */}
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
          <SceneBlockList
            scenes={orderedScenes}
            playerRef={playerRef}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onSeek={handleSeek}
            onPlay={() => {
              setPlayingSegmentEnd(null);
              playerRef.current?.play();
              wsRelayService.sendData({ type: 'PLAY', time: currentTime, actor: 'CREATOR' });
            }}
            onPause={() => {
              setPlayingSegmentEnd(null);
              playerRef.current?.pause();
              wsRelayService.sendData({ type: 'PAUSE', time: currentTime, actor: 'CREATOR' });
            }}
            disableAutoFollow={playingSegmentEnd != null}
            accentColor={COLORS.purple}
            videoCount={selectedVideos?.length || 1}
            summaryFocusToken={projectSummaryFocusToken}
            editedScenes={editedScenes}
            editState={editState}
            vqaHistories={vqaHistories}
            awarenessData={awarenessData}
            keptScenes={keptScenes}
            sceneIndicesWithSuggestions={sceneIndicesWithSuggestions}
            onSceneClose={(sceneId) => {
              setVqaHistories((prev) => {
                if (!(sceneId in prev)) return prev;
                const next = { ...prev };
                delete next[sceneId];
                return next;
              });
            }}
            onAwarenessViewed={handleAwarenessViewed}
            renderSceneActions={({ scene, index, currentLevel, onLevelChange, currentTime: ct, isPlaying: ip, onSeek: os, onPlay: op, onPause: opp }) => (
              <Probe3SceneActions
                scene={scene}
                index={index}
                playerRef={playerRef}
                currentTime={ct}
                isPlaying={ip}
                onSeek={os}
                onPlay={op}
                onPause={opp}
                onPlaySegment={handlePlaySegment}
                currentLevel={currentLevel}
                onLevelChange={onLevelChange}
                suggestions={analysisTriggered ? curatedSuggestions : []}
                helperName="helper"
                onSuggestionRoute={(suggestion, channel) => handleSuggestionRoute(suggestion, channel)}
                onSuggestionDismiss={(suggestion) => {
                  setSuggestionResolutions((prev) => ({
                    ...prev,
                    [suggestion.id]: {
                      routedTo: 'dismissed',
                      outcomeStatus: 'applied',
                      timestamp: Date.now(),
                    },
                  }));
                  setDeployedSuggestions((prev) => ({
                    ...prev,
                    [suggestion.id]: { ...prev[suggestion.id], response: 'dismissed' },
                  }));
                  setActiveSuggestion(null);
                }}
                suggestionResolutions={suggestionResolutions}
                justRoutedSuggestionId={justRoutedSuggestionId}
                onConsumeJustRouted={consumeJustRouted}
                onAskAI={async (question, s) => {
                  setVqaHistories((prev) => ({
                    ...prev,
                    [s.id]: [...(prev[s.id] || []), { role: 'user', text: question }],
                  }));
                  const videoEl = playerRef.current?.video;
                  if (videoEl) {
                    try {
                      const frame = captureFrame(videoEl);
                      const answer = await askGemini(frame, question, { segmentDescription: s.descriptions?.level_1 || '' });
                      setVqaHistories((prev) => ({
                        ...prev,
                        [s.id]: [...(prev[s.id] || []), { role: 'ai', text: answer, source: 'gemini' }],
                      }));
                      logEvent(EventTypes.VQA_ANSWER, Actors.AI, { answer, source: 'gemini' });
                      if (audioEnabled) ttsService.speak(answer, { rate: speechRate });
                    } catch { /* WoZ fallback */ }
                  }
                }}
                onAskAIEdit={(instruction, s) => handleAskAIEdit(instruction, s)}
                onSendToHelper={handleSendTaskToHelper}
                onEditSelf={handleApplySceneEdit}
                isKept={keptScenes[scene.id] !== false}
                onToggleKeep={(id) => setKeptScenes((prev) => ({ ...prev, [id]: prev[id] === false }))}
                accentColor={COLORS.purple}
              />
            )}
          />
        </div>
      ) : (
        <div className="fixed inset-0 flex flex-col bg-white overflow-hidden">
          <div className="flex-1 flex flex-col min-h-0 max-w-lg mx-auto w-full p-3">
            <HelperDevice
              videoRef={playerRef}
              videoData={projectData}
              webrtcService={wsRelayService}
              creatorActivities={creatorActivities}
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
              currentSegment={currentSegment}
              onTimeUpdate={handleTimeUpdate}
              onSegmentChange={handleSegmentChange}
              onSeek={handleSeek}
              editState={editState}
              playbackEditState={playbackEditState}
              videoFilter={videoFilter}
              videoTransform={videoTransform}
              colourValues={colourValues}
              onColourAdjust={handleColourAdjust}
              onEditChange={handleEditChange}
              initialSources={initialSources}
              feedItems={feedItems}
              onTaskStatus={handleHelperTaskStatus}
              onAIReview={handleAIReview}
              onAIUndo={handleAIUndo}
              onAwarenessViewed={handleAwarenessViewed}
              peerEditNotification={peerEditNotification}
              onSuggestionResponse={handleHelperSuggestionResponse}
            >
              <AIAnalysisTriggerCard
                analysisTriggered={analysisTriggered}
                analysisInProgress={analysisInProgress}
                onTrigger={handleTriggerAnalysis}
                suggestionCount={curatedSuggestions.length}
                triggeredBy={analysisTriggeredBy}
                selfRole="helper"
                curatedSuggestions={curatedSuggestions}
              />
            </HelperDevice>
          </div>
        </div>
      )}

      {/* Researcher WoZ panels */}
      {isResearcher && (
        <div className="max-w-7xl mx-auto px-4 pb-4 space-y-4">
          <ResearcherVQAPanel segment={currentSegment} pendingQuestion={pendingQuestion} />
          <ResearcherAIEditPanel
            segment={currentSegment}
            pendingRequest={pendingAIRequest}
            onSendResponse={handleAIEditResponse}
          />
          <ResearcherSuggestionPanel
            suggestions={videoSuggestions}
            deployedSuggestions={deployedSuggestions}
            onDeploy={handleDeploySuggestion}
          />
          {/* Manual sync fallback */}
          <div className="border-2 rounded-lg p-4 shadow-sm" style={{ borderColor: '#F0AD4E', backgroundColor: '#FFFBF0' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: '#F0AD4E' }} aria-hidden="true" />
              <h3 className="font-bold text-sm" style={{ color: COLORS.navy }}>Sync Controls (Researcher)</h3>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => handleManualSync('play')} className="px-3 py-1.5 rounded text-sm font-medium text-white focus:outline-2 focus:outline-offset-2" style={{ backgroundColor: '#5CB85C' }} aria-label="Force play">Force Play</button>
              <button onClick={() => handleManualSync('pause')} className="px-3 py-1.5 rounded text-sm font-medium text-white focus:outline-2 focus:outline-offset-2" style={{ backgroundColor: '#D9534F' }} aria-label="Force pause">Force Pause</button>
              <button onClick={() => handleManualSync('sync_time')} className="px-3 py-1.5 rounded text-sm font-medium text-white focus:outline-2 focus:outline-offset-2" style={{ backgroundColor: COLORS.blue }} aria-label="Sync time to peer">Sync Time to Peer</button>
            </div>
            <p className="text-xs text-gray-500 mt-2">Connection: {connected ? 'Active' : 'Not connected'} | Role: {role || 'none'}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
