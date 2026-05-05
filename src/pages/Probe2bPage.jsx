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
import { buildProjectStats, summarizeEditStateChange, describeEditOp } from '../utils/projectOverview.js';
import { applyOperation, getClipMuted } from '../utils/sceneEditOps.js';
import { captureFrame, askGemini } from '../services/geminiService.js';
import ttsService from '../services/ttsService.js';
import { wsRelayService } from '../services/wsRelayService.js';
import { loadProjectState } from '../utils/projectState.js';
import ConditionHeader from '../components/shared/ConditionHeader.jsx';
import OnboardingBrief from '../components/shared/OnboardingBrief.jsx';
import VideoPlayer from '../components/shared/VideoPlayer.jsx';
import VideoLibrary from '../components/probe1/VideoLibrary.jsx';
import SceneBlockList from '../components/shared/SceneBlockList.jsx';
import Probe2bSceneActions from '../components/probe2/Probe2bSceneActions.jsx';
import ResearcherVQAPanel from '../components/probe1/ResearcherVQAPanel.jsx';
import ResearcherAIEditPanel from '../components/probe3/ResearcherAIEditPanel.jsx';
import DecoupledRoleSelector from '../components/decoupled/DecoupledRoleSelector.jsx';
import DecoupledWaitingScreen from '../components/decoupled/DecoupledWaitingScreen.jsx';
import DecoupledHelperDevice from '../components/decoupled/DecoupledHelperDevice.jsx';

const COLORS = {
  navy: '#1F3864',
  green: '#5CB85C',
  blue: '#2B579A',
};

export default function Probe2bPage() {
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
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [editState, setEditState] = useState(null);

  const [librarySelection, setLibrarySelection] = useState(new Set());
  const [feedItems, setFeedItems] = useState([]);
  const [pendingAIRequest, setPendingAIRequest] = useState(null);
  // Parked resolver for "Ask AI to edit": when no canned response matches we
  // broadcast AI_EDIT_REQUEST over the relay and wait for the researcher's
  // AI_EDIT_RESPONSE to resolve this promise. Mirrors Probe2Page.
  const aiEditResolverRef = useRef(null);

  const [helperActivities, setHelperActivities] = useState([]);
  const [creatorActivities, setCreatorActivities] = useState([]);
  const [connected, setConnected] = useState(false);
  const [projectUpdate, setProjectUpdate] = useState(null);
  const [vqaHistories, setVqaHistories] = useState({});
  const [awarenessData, setAwarenessData] = useState({});
  const [keptScenes, setKeptScenes] = useState({});
  // Day 1 fix #4: zoom + rotate live alongside colour values.
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
  // Bounded history for the creator's "Edit by Myself" undo. Capped at 20.
  // Pushed only by local edits (handleEditChange); peer edits arriving over
  // the WS relay don't push, so undo never reverts the helper's changes.
  const [editHistory, setEditHistory] = useState([]);
  const { audioEnabled, speechRate } = useAccessibility();

  // Server-side dyad assignments — see Probe1Page for rationale.
  const [serverAssignments, setServerAssignments] = useState(null);

  useEffect(() => {
    setCondition('probe2b');
    logEvent(EventTypes.CONDITION_START, Actors.SYSTEM, { condition: 'probe2b' });
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
  // as Probe 1).
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

  // Try loading project state from Phase 2a. Resolves against the merged
  // sample + pipeline pool so 2a sessions that used pipeline footage carry
  // forward; gated on selectedVideos === null so a later pipelineVideos
  // load doesn't overwrite the user's manual library selection in 2b.
  useEffect(() => {
    if (selectedVideos !== null) return;
    const savedState = loadProjectState();
    if (savedState && (data || pipelineVideos.length > 0)) {
      if (savedState.editState) {
        setEditState(savedState.editState);
      }
      if (savedState.selectedVideoIds) {
        const sampleVideos = data ? (data.videos || (data.video ? [data.video] : [])) : [];
        const pool = [...pipelineVideos, ...sampleVideos];
        const resolved = pool.filter((v) => savedState.selectedVideoIds.includes(v.id));
        if (resolved.length > 0) {
          setSelectedVideos(resolved);
        }
      }
      announce('Project state loaded from Phase 2a');
    }
  }, [data, pipelineVideos, selectedVideos]);

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

  // Derive the visible scene order from editState.clips so the creator's
  // scene block list reflects the helper's deletes/reorders/splits in real
  // time. Without this, the creator only saw the original `segments` list
  // and helper edits looked invisible. Same approach as Probe 2a.
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
  // Filter the playback EDL by Removed scenes, and derive a CSS filter from
  // the helper's colour sliders. Only used for VideoPlayer — the timeline
  // editor still sees the full editState so the helper can see what was cut.
  const playbackEditState = useMemo(() => filterClipsByKept(editState, keptScenes), [editState, keptScenes]);
  const videoFilter = useMemo(() => colourValuesToFilter(colourValues), [colourValues]);
  const videoTransform = useMemo(() => colourValuesToTransform(colourValues), [colourValues]);
  // Day 1 D4: per-scene original-audio mute, derived from the active clip.
  const audioMuted = useMemo(
    () => (currentSegment ? getClipMuted(editState, currentSegment.id) : false),
    [editState, currentSegment],
  );
  const handleColourAdjust = useCallback((property, value) => {
    setColourValues((prev) => ({ ...prev, [property]: value }));
    // Broadcast so the peer's VideoPlayer applies the same CSS filter live.
    // Without this, helper's brightness/contrast/saturation only affect the
    // helper's preview and the creator's video stays untouched.
    wsRelayService.sendData({
      type: 'COLOUR_UPDATE',
      property,
      value,
      actor: role === 'creator' ? 'CREATOR' : 'HELPER',
    });
    if (currentSegment?.id) {
      stampSceneEdit(currentSegment.id, property, {
        value,
        actor: role === 'creator' ? 'You' : 'Helper',
      });
    }
  }, [role, currentSegment, stampSceneEdit]);

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

  // Track play/pause state
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

  // Day 1 fix #2: when the creator taps "Play this scene", playback should
  // stop at the scene boundary instead of continuing. We park scene.end_time
  // here and clear it on any manual play/pause/seek so unbounded playback
  // ("Play from here", scrub, peer SEEK) is unaffected.
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
        // Keep stopAt set so disableAutoFollow holds — see Probe2Page.
        return stopAt;
      }
      return stopAt;
    });
  }, [role]);
  const handleSegmentChange = useCallback((seg) => setCurrentSegment(seg), []);
  const handlePlaySegment = useCallback((scene) => {
    if (!scene) return;
    playerRef.current?.seek(scene.start_time);
    playerRef.current?.play();
    setPlayingSegmentEnd(scene.end_time);
    // Broadcast so the peer follows the seek+play. PAUSE will fire from the
    // boundary check in handleTimeUpdate above.
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
  // Broadcast SEEK so the peer's player follows. Used both when creator
  // expands a scene block (SceneBlockList calls onSeek with scene.start_time)
  // and when "Play from here" runs (onSeek then onPlay).
  const handleSeek = useCallback((time) => {
    setPlayingSegmentEnd(null);
    playerRef.current?.seek(time);
    wsRelayService.sendData({
      type: 'SEEK',
      time,
      actor: role === 'creator' ? 'CREATOR' : 'HELPER',
    });
  }, [role]);
  const handleQuestion = useCallback((question) => setPendingQuestion(question), []);

  // Library selection sync
  const handleSelectionChange = useCallback((videoId, isSelected) => {
    setLibrarySelection((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(videoId);
      else next.delete(videoId);
      return next;
    });
    wsRelayService.sendData({
      type: 'VIDEO_SELECT', videoId, isSelected,
      actor: role === 'creator' ? 'CREATOR' : 'HELPER',
    });
  }, [role]);

  // Video Import
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
    const nextEditState = { clips, captions: [], sources, textOverlays: [] };
    setEditState(nextEditState);
    setSessionGuide(buildProjectStats({
      projectData: { videos },
      editState: nextEditState,
      role: 'creator',
    }));
    setProjectUpdate(null);
    logEvent(EventTypes.IMPORT_VIDEO, Actors.SYSTEM, { videoIds: videos.map((v) => v.id), count: videos.length });
    announce(`Project created with ${videos.length} video${videos.length > 1 ? 's' : ''}. Starting session.`);
    wsRelayService.sendData({ type: 'PROJECT_CREATED', videoIds: videos.map((v) => v.id), actor: 'CREATOR' });
    // Also broadcast the full initial editState so the researcher dashboard's
    // mirror populates immediately (without waiting for the first edit). The
    // helper will overwrite their locally-derived editState with this — same
    // shape, so it's a no-op visually.
    wsRelayService.sendData({
      type: 'EDIT_STATE_UPDATE',
      editState: nextEditState,
      action: 'project initialised',
      changeSummary: { announcement: '', shortText: '' },
      actor: 'CREATOR',
    });
    setPhase('active');
  }, [logEvent]);

  // Edit state sync
  const editStateRef = useRef(editState);
  useEffect(() => { editStateRef.current = editState; }, [editState]);
  const [peerEditNotification, setPeerEditNotification] = useState(null);

  // Refs the WS message handler reads to decide whether the helper still
  // needs bootstrapping (no role-resolved videos yet, or still on the
  // library screen). setupHandlers' onData callback closes over the page
  // at first mount, so reading state directly would always see the stale
  // initial values.
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const selectedVideosRef = useRef(selectedVideos);
  useEffect(() => { selectedVideosRef.current = selectedVideos; }, [selectedVideos]);

  // Both creator and helper edit freely; whichever side commits last wins.
  const handleEditChange = useCallback((clips, captions, sources, textOverlays) => {
    const prev = editStateRef.current;
    const newState = {
      clips,
      captions,
      sources,
      textOverlays: textOverlays ?? prev?.textOverlays ?? [],
    };
    if (prev) {
      setEditHistory((h) => {
        const next = [...h, prev];
        return next.length > 20 ? next.slice(next.length - 20) : next;
      });
    }
    const actorLabel = role === 'creator' ? 'Creator' : 'Helper';
    const changeSummary = summarizeEditStateChange(prev, newState, actorLabel);
    setEditState(newState);
    wsRelayService.sendData({
      type: 'EDIT_STATE_UPDATE',
      editState: newState,
      action: changeSummary.actionText,
      changeSummary,
      actor: role === 'creator' ? 'CREATOR' : 'HELPER',
    });
  }, [role]);

  const handleUndoEdit = useCallback(() => {
    setEditHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setEditState(prev);
      // Broadcast the restored state so the peer's editor reflects the undo.
      wsRelayService.sendData({
        type: 'EDIT_STATE_UPDATE',
        editState: prev,
        action: 'undo',
        changeSummary: { announcement: 'Edit undone.', shortText: 'Undo' },
        actor: role === 'creator' ? 'CREATOR' : 'HELPER',
      });
      logEvent(EventTypes.EDIT_ACTION, role === 'creator' ? Actors.CREATOR : Actors.HELPER, { action: 'undo' });
      announce('Undid last edit.');
      return h.slice(0, -1);
    });
  }, [role, logEvent]);

  // Task routing callbacks
  const handleHelperTaskStatus = useCallback((taskId, status) => {
    setFeedItems((prev) => prev.map((item) =>
      item.id === taskId ? { ...item, status } : item
    ));
    logEvent(EventTypes.HELPER_TASK_STATUS, Actors.HELPER, { taskId, status });
    wsRelayService.sendData({ type: 'TASK_STATUS_UPDATE', taskId, status, actor: 'HELPER' });
  }, [logEvent]);

  const handleAIReview = useCallback((item) => {
    logEvent(EventTypes.AI_EDIT_REVIEWED, Actors.HELPER, { text: item.text });
    announce(`Reviewing: ${item.text}`);
  }, [logEvent]);

  const handleAIUndo = useCallback((item) => {
    setFeedItems((prev) => prev.map((fi) =>
      fi.id === item.id ? { ...fi, undone: true } : fi
    ));
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
          const peerLabel = msg.actor === 'CREATOR' ? 'Creator' : 'Helper';
          const changeSummary = msg.changeSummary || summarizeEditStateChange(previousState, msg.editState, peerLabel);
          // Suppress the visible "peer made an edit" surface for empty
          // change summaries (snapshots sent on REQUEST_EDIT_STATE / pair-up
          // replay carry empty announcements/shortText) — an empty toast
          // for 3 seconds is just visual noise.
          const hasSummaryText = !!(changeSummary.shortText || changeSummary.announcement);
          if (currentRole === 'creator') {
            if (hasSummaryText) {
              setProjectUpdate({ ...changeSummary, id: Date.now() });
              announce(changeSummary.announcement);
            }
          } else if (hasSummaryText) {
            setPeerEditNotification({ text: changeSummary.shortText, id: Date.now() });
          }
          // Helper bootstrap: if we still haven't resolved selectedVideos
          // to full objects (PROJECT_CREATED arrived but our local
          // allVideos pool didn't contain the creator's IDs — pipeline
          // videos still loading, dyad assignments differing, or simply
          // not loaded yet), take the canonical sources straight from the
          // broadcast editState and advance to 'active'. Without this, the
          // helper sits in 'library' indefinitely waiting on a
          // resolution that may never happen, and edits the creator makes
          // never appear because the helper's view never mounts.
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
            const videos = sources.map((s) => ({
              id: s.id,
              title: s.name,
              src: s.src,
              duration: s.duration,
              segments: clipsBySource.get(s.id) || [],
            }));
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
        case 'TASK_STATUS_UPDATE':
          if (typeof window.__taskStatusUpdate === 'function') {
            window.__taskStatusUpdate(msg.taskId, msg.status);
          }
          logEvent(EventTypes.HELPER_TASK_STATUS, Actors.HELPER, { taskId: msg.taskId, status: msg.status });
          break;
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
        case 'PROJECT_STATE_EXPORT': {
          // Receive project state from Phase 2a via researcher transition
          if (msg.projectState) {
            if (msg.projectState.editState) setEditState(msg.projectState.editState);
            announce('Project state received from Phase 2a');
          }
          break;
        }
        case 'AI_EDIT_REQUEST': {
          // Surface in this researcher tab's panel (only relevant if this
          // tab joined as researcher via ?mode=researcher).
          if (isResearcher) setPendingAIRequest(msg.request || null);
          break;
        }
        case 'REQUEST_EDIT_STATE': {
          // The researcher dashboard joined late and wants the current state.
          // Only the creator answers, so the dashboard doesn't get two copies.
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
          // Resolve the parked Ask-AI promise on the participant device.
          if (!isResearcher && aiEditResolverRef.current) {
            aiEditResolverRef.current({
              description: msg.text,
              text: msg.text,
              operation: msg.responseType || 'researcher_response',
            });
            aiEditResolverRef.current = null;
          }
          break;
        }
        case 'COLOUR_UPDATE': {
          // Mirror peer's colour slider movement onto our local CSS filter,
          // and announce so a BLV creator hears that something changed (the
          // CSS filter at small step sizes is too subtle to detect visually
          // alone, and there's no slider on the creator's screen to flip).
          if (typeof msg.property === 'string' && typeof msg.value === 'number') {
            setColourValues((prev) => ({ ...prev, [msg.property]: msg.value }));
            const peer = msg.actor === 'CREATOR' ? 'Creator'
              : msg.actor === 'HELPER' ? 'Helper'
              : msg.actor === 'RESEARCHER' ? 'AI' : 'Peer';
            announce(`${peer} set ${msg.property} to ${msg.value}.`);
            // Day 1 fix #3: stamp the active scene so the badge shows up
            // for the BLV creator without needing the slider in their UI.
            if (currentSegment?.id) {
              setEditedScenes((prev) => ({
                ...prev,
                [currentSegment.id]: {
                  text: describeEditOp(msg.property, { value: msg.value }),
                  actor: peer,
                  timestamp: Date.now(),
                },
              }));
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
      // Helper-side state recovery. If the creator has already imported a
      // project before we paired (e.g. helper refreshed mid-session, or
      // joined late), the existing PROJECT_CREATED/EDIT_STATE_UPDATE
      // broadcasts have already gone out and we won't see them. Ask the
      // creator for a snapshot so the EDIT_STATE_UPDATE handler can boot us
      // straight into 'active'. Idempotent: when no project exists yet,
      // creator's REQUEST_EDIT_STATE handler short-circuits.
      if (currentRole === 'helper') {
        wsRelayService.sendData({ type: 'REQUEST_EDIT_STATE' });
      }
      // Creator-side replay. If the helper paired BEFORE we imported, no
      // re-broadcast is needed. But if we already have an editState (e.g.
      // we refreshed and our local state survived via React, OR the
      // helper paired late after we'd been editing), the helper may have
      // missed the original PROJECT_CREATED/EDIT_STATE_UPDATE pair. Push
      // a fresh snapshot proactively so the helper's bootstrap fires.
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
  }, [clearSubscriptions, logEvent]);

  useEffect(() => {
    if (phase === 'waiting' && connected) setPhase('library');
  }, [phase, connected]);

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
    logEvent(EventTypes.SESSION_START, Actors.SYSTEM, { role: selectedRole, probe: 'probe2b' });
    // M7: a BLV creator selecting their role hears nothing back from the
    // page chrome (the waiting spinner is aria-hidden). Confirm the choice
    // and explain the wait so they don't think the tap was lost.
    const otherRole = selectedRole === 'creator' ? 'helper' : 'creator';
    announce(`Role selected: ${selectedRole}. Waiting for ${otherRole} to join.`);
  }, [logEvent]);

  // Single source of truth for the WS connection lifecycle.
  // Runs setup on mount (and whenever role becomes non-null), with a matched
  // cleanup that closes the WS and unregisters callbacks. This pattern survives
  // React StrictMode's mount → cleanup → mount cycle, where the previous split
  // (setup-only + cleanup-only useEffects) silently dropped the connection
  // because a `didAutoConnect` guard prevented the second mount from reconnecting.
  // See docs/walkthrough_findings_2026-04-25_spotcheck.md NF2.
  useEffect(() => {
    if (!role) return;
    setupHandlers(role);
    wsRelayService.connect(role);
    return () => {
      clearSubscriptions();
      wsRelayService.disconnect();
    };
  }, [role, setupHandlers, clearSubscriptions]);

  // WoZ AI edit callbacks. The participant device parks a resolver via
  // handleAskAIEdit; the researcher device (any tab joined as 'researcher')
  // resolves it by sending AI_EDIT_RESPONSE over the WS relay.
  const handleAskAIEdit = useCallback(async (instruction, scene) => {
    // Cancel any older parked resolver — a new request supersedes the old.
    if (aiEditResolverRef.current) {
      aiEditResolverRef.current({
        description: 'Cancelled by a newer request.',
        text: '',
        operation: 'superseded',
      });
      aiEditResolverRef.current = null;
    }
    // Try canned responses first.
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
    // No canned match → broadcast to researcher and park the resolver.
    const request = {
      instruction,
      segment: scene?.name,
      segmentId: scene?.id,
      timestamp: Date.now(),
    };
    setPendingAIRequest(request);
    wsRelayService.sendData({ type: 'AI_EDIT_REQUEST', request });
    announce('AI is preparing the edit. Researcher is reviewing.');
    return new Promise((resolve) => {
      aiEditResolverRef.current = resolve;
    });
  }, [logEvent]);

  // Apply an operation key (from AI accept OR a self-edit button) against the
  // current editState. Reuses handleEditChange so the control-owner check
  // and EDIT_STATE_UPDATE broadcast logic stays in one place.
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
    setPendingAIRequest(null);
    logEvent(EventTypes.AI_EDIT_PROPOSED, Actors.RESEARCHER, {
      source: 'researcher_woz', response: responseText, responseType,
    });
    // Same-tab path: resolve a local resolver if the participant lives in
    // this tab (e.g. ?mode=researcher on a single-device setup).
    if (aiEditResolverRef.current) {
      aiEditResolverRef.current({
        description: responseText,
        text: responseText,
        operation: responseType || 'researcher_response',
      });
      aiEditResolverRef.current = null;
    }
    // Cross-device path: relay to the participant.
    wsRelayService.sendData({ type: 'AI_EDIT_RESPONSE', text: responseText, responseType });
  }, [logEvent]);

  const handleApplyEdit = useCallback((editAction) => {
    logEvent(EventTypes.AI_EDIT_APPLIED, Actors.RESEARCHER, { action: editAction });
  }, [logEvent]);

  const modeLabel = role
    ? `${role.charAt(0).toUpperCase() + role.slice(1)} Device${connected ? ' (Connected)' : ''}`
    : '';

  // Role Selection
  if (phase === 'roleSelect') {
    return (
      <DecoupledRoleSelector
        condition="probe2b"
        accentColor={COLORS.green}
        onRoleSelect={handleRoleSelect}
      />
    );
  }

  // Waiting
  if (phase === 'waiting') {
    return (
      <DecoupledWaitingScreen
        condition="probe2b"
        accentColor={COLORS.green}
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
        <ConditionHeader condition="probe2b" modeLabel={`${role.charAt(0).toUpperCase() + role.slice(1)} — Select Videos`} />
        <OnboardingBrief
          pageTitle="Probe 2b: Two Devices — Video Library"
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
      {role === 'creator' ? (
        <div className="flex flex-col flex-1 min-h-0 max-w-lg mx-auto w-full">
          <ConditionHeader condition="probe2b" modeLabel={modeLabel} />
          <OnboardingBrief
            pageTitle="Probe 2b: Two Devices — Creator"
            description="You and your helper each have a phone. Below is a list of scenes from your video. Tap a scene to expand it. Inside each scene you can edit by yourself, ask AI to edit, or send a task to your helper's device without handing over. Activity indicators show what your helper is working on. All changes sync between phones automatically."
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
            disableAutoFollow={playingSegmentEnd != null || isPlaying}
            accentColor={COLORS.green}
            videoCount={selectedVideos?.length || 1}
            vqaHistories={vqaHistories}
            awarenessData={awarenessData}
            keptScenes={keptScenes}
            editedScenes={editedScenes}
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
              <Probe2bSceneActions
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
                onSendToHelper={(task) => {
                  wsRelayService.sendData({
                    type: 'TASK_TO_HELPER',
                    taskId: `task-${Date.now()}`,
                    text: task.instruction,
                    segment: task.segmentName,
                    segmentId: task.segmentId,
                    actor: 'CREATOR',
                  });
                }}
                onEditSelf={handleApplySceneEdit}
                isKept={keptScenes[scene.id] !== false}
                onToggleKeep={(id) => setKeptScenes((prev) => ({ ...prev, [id]: prev[id] === false }))}
                helperName="helper"
                accentColor={COLORS.green}
                editState={editState}
                onEditChange={handleEditChange}
                onUndoEdit={handleUndoEdit}
                canUndoEdit={editHistory.length > 0}
              />
            )}
          />
        </div>
      ) : (
        <div className="p-3 max-w-lg mx-auto">
          <DecoupledHelperDevice
            condition="probe2b"
            accentColor={COLORS.green}
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
          />
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
            onApplyEdit={handleApplyEdit}
          />
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
