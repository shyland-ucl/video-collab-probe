import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadDescriptions } from '../data/sampleDescriptions.js';
import { loadPipelineVideos } from '../services/pipelineApi.js';
import { useEventLogger } from '../contexts/EventLoggerContext.jsx';
import { useAccessibility } from '../contexts/AccessibilityContext.jsx';
import { EventTypes, Actors } from '../utils/eventTypes.js';
import { announce } from '../utils/announcer.js';
import { buildInitialSources, buildAllSegments, getTotalDuration } from '../utils/buildInitialSources.js';
import { filterClipsByKept } from '../utils/editStateView.js';
import { buildProjectStats, summarizeEditStateChange } from '../utils/projectOverview.js';
import { applyOperation } from '../utils/sceneEditOps.js';
import { captureFrame, askGemini } from '../services/geminiService.js';
import ttsService from '../services/ttsService.js';
import { wsRelayService } from '../services/wsRelayService.js';
import ConditionHeader from '../components/shared/ConditionHeader.jsx';
import OnboardingBrief from '../components/shared/OnboardingBrief.jsx';
import VideoPlayer from '../components/shared/VideoPlayer.jsx';
import VideoLibrary from '../components/probe1/VideoLibrary.jsx';
import SceneBlockList from '../components/shared/SceneBlockList.jsx';
import Probe3SceneActions from '../components/probe3/Probe3SceneActions.jsx';
import HelperDevice from '../components/probe3/HelperDevice.jsx';
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
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [editState, setEditState] = useState(null);

  const [librarySelection, setLibrarySelection] = useState(new Set());
  const [feedItems, setFeedItems] = useState([]);
  const [pendingAIRequest, setPendingAIRequest] = useState(null);
  // Parked resolver for "Ask AI to edit"; see Probe2bPage for rationale.
  const aiEditResolverRef = useRef(null);

  const [helperActivities, setHelperActivities] = useState([]);
  const [creatorActivities, setCreatorActivities] = useState([]);
  const [connected, setConnected] = useState(false);
  const [projectUpdate, setProjectUpdate] = useState(null);
  const [vqaHistories, setVqaHistories] = useState({});
  const [awarenessData, setAwarenessData] = useState({});
  const [keptScenes, setKeptScenes] = useState({});
  const [pipelineVideos, setPipelineVideos] = useState([]);
  const { audioEnabled, speechRate } = useAccessibility();

  // Suggestion system state
  const [activeSuggestion, setActiveSuggestion] = useState(null);
  const [notedSuggestions, setNotedSuggestions] = useState([]);
  const [deployedSuggestions, setDeployedSuggestions] = useState({});
  const [showSuggestionHistory, setShowSuggestionHistory] = useState(false);
  const suggestionDeployTimeRef = useRef({});
  const autoSuggestionTimeoutRef = useRef(null);

  useEffect(() => {
    setCondition('probe3');
    logEvent(EventTypes.CONDITION_START, Actors.SYSTEM, { condition: 'probe3' });
    loadDescriptions().then(setData).catch(console.error);
    loadPipelineVideos().then(setPipelineVideos).catch(() => {});
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
  // Filter the playback EDL by Removed scenes so the creator's VideoPlayer
  // skips scenes the participant has marked for removal.
  const playbackEditState = useMemo(() => filterClipsByKept(editState, keptScenes), [editState, keptScenes]);

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

    let filteredPipeline = pipelineVideos;
    if (sessionDyadId && assignedProjectIds.length > 0) {
      filteredPipeline = pipelineVideos.filter(
        (v) => assignedProjectIds.includes(v._projectId)
          || assignedProjectIds.includes(`pipeline-${v._projectId}`)
      );
    }

    return [...filteredPipeline, ...sampleVideos];
  }, [data, pipelineVideos, sessionDyadId, assignedProjectIds]);

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

  const handleTimeUpdate = useCallback((time) => setCurrentTime(time), []);
  const handleSegmentChange = useCallback((seg) => setCurrentSegment(seg), []);
  const handleSeek = useCallback((time) => {
    playerRef.current?.seek(time);
    wsRelayService.sendData({
      type: 'SEEK',
      time,
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
    setSessionGuide(buildProjectStats({
      projectData: { videos },
      editState: nextEditState,
      role: 'creator',
    }));
    setProjectUpdate(null);
    logEvent(EventTypes.IMPORT_VIDEO, Actors.SYSTEM, { videoIds: videos.map((v) => v.id), count: videos.length });
    announce(`Project created with ${videos.length} video${videos.length > 1 ? 's' : ''}. Starting session.`);
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
    setEditState(newState);
    wsRelayService.sendData({
      type: 'EDIT_STATE_UPDATE',
      editState: newState,
      action: changeSummary.actionText,
      changeSummary,
      actor: role === 'creator' ? 'CREATOR' : 'HELPER',
    });
  }, [role]);

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

  useEffect(() => {
    if (role !== 'creator' || phase !== 'active' || !currentSegment || activeSuggestion) return undefined;

    const currentSceneNumber = segments.findIndex((segment) => segment.id === currentSegment.id) + 1;
    if (currentSceneNumber <= 0) return undefined;

    const nextSuggestion = videoSuggestions.find((suggestion) => {
      if (deployedSuggestions[suggestion.id]) return false;
      const relatedScenes = Array.isArray(suggestion.relatedScene)
        ? suggestion.relatedScene
        : [suggestion.relatedScene];
      return relatedScenes.includes(currentSceneNumber);
    });

    if (!nextSuggestion) return undefined;

    autoSuggestionTimeoutRef.current = setTimeout(() => {
      deploySuggestion(nextSuggestion, Actors.AI, 'auto');
    }, 1200);

    return () => {
      clearTimeout(autoSuggestionTimeoutRef.current);
      autoSuggestionTimeoutRef.current = null;
    };
  }, [activeSuggestion, deployedSuggestions, currentSegment, deploySuggestion, phase, role, segments, videoSuggestions]);

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
          if (currentRole === 'creator') {
            setProjectUpdate({ ...changeSummary, id: Date.now() });
            announce(changeSummary.announcement);
          } else {
            setPeerEditNotification({ text: changeSummary.shortText, id: Date.now() });
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

        // --- Suggestion system messages ---
        case 'SUGGESTION_PUSH':
          // Creator receives a deployed suggestion
          if (currentRole === 'creator' && msg.suggestion) {
            setActiveSuggestion(msg.suggestion);
          }
          break;

        case 'SUGGESTION_ROUTED_TO_HELPER':
          // Helper receives a routed suggestion
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
            announce(`AI observation routed from Creator: ${msg.suggestion.text}`);
          }
          break;

        case 'HELPER_SUGGESTION_RESPONSE':
          // Creator receives helper's response to a suggestion
          if (currentRole === 'creator') {
            const { suggestionId, response } = msg;
            setNotedSuggestions((prev) => prev.map((s) =>
              s.id === suggestionId ? { ...s, helperResponse: response } : s
            ));
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

  // Single source of truth for the WS connection lifecycle.
  // See Probe2bPage.jsx for the rationale; same StrictMode-safe pattern.
  // docs/walkthrough_findings_2026-04-25_spotcheck.md NF2.
  useEffect(() => {
    if (!role) return;
    setupHandlers(role);
    wsRelayService.connect(role);
    return () => {
      clearSubscriptions();
      wsRelayService.disconnect();
    };
  }, [role, setupHandlers, clearSubscriptions]);

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
    announce('AI is preparing the edit. Researcher is reviewing.');
    return new Promise((resolve) => {
      aiEditResolverRef.current = resolve;
    });
  }, [logEvent]);

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
  }, [currentTime, handleEditChange, logEvent]);

  const handleAIEditResponse = useCallback((responseText, responseType) => {
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
    wsRelayService.sendData({ type: 'AI_EDIT_RESPONSE', text: responseText, responseType });
  }, [logEvent]);

  const handleApplyEdit = useCallback((editAction) => {
    logEvent(EventTypes.AI_EDIT_APPLIED, Actors.RESEARCHER, { action: editAction });
  }, [logEvent]);

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
    <div className="min-h-screen bg-white">
      {role === 'creator' ? (
        <div className="flex flex-col flex-1 max-w-lg mx-auto w-full">
          <ConditionHeader condition="probe3" modeLabel={modeLabel} />
          <OnboardingBrief
            pageTitle="Probe 3: Proactive AI — Creator"
            description="This works like the previous two-phone setup, but now AI will suggest improvements inside relevant scenes as you edit. When a suggestion appears, you must choose who handles it: tap I'll Do It to handle it yourself, Ask AI to Fix to let AI do it, Send to Helper to assign it, or Dismiss to ignore it. You cannot apply suggestions directly — you must route them. All other editing tools work the same as before."
          />
          <div aria-hidden="true" className="px-3 pt-3">
            <VideoPlayer
              ref={playerRef}
              src={projectData?.video?.src || projectData?.videos?.[0]?.src || null}
              segments={segments}
              onTimeUpdate={handleTimeUpdate}
              onSegmentChange={handleSegmentChange}
              editState={playbackEditState}
            />
          </div>
          <SceneBlockList
            scenes={orderedScenes}
            playerRef={playerRef}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onSeek={handleSeek}
            onPlay={() => {
              playerRef.current?.play();
              wsRelayService.sendData({ type: 'PLAY', time: currentTime, actor: 'CREATOR' });
            }}
            onPause={() => {
              playerRef.current?.pause();
              wsRelayService.sendData({ type: 'PAUSE', time: currentTime, actor: 'CREATOR' });
            }}
            accentColor={COLORS.purple}
            videoCount={selectedVideos?.length || 1}
            vqaHistories={vqaHistories}
            awarenessData={awarenessData}
            keptScenes={keptScenes}
            onSceneClose={(sceneId) => {
              setVqaHistories((prev) => {
                if (!(sceneId in prev)) return prev;
                const next = { ...prev };
                delete next[sceneId];
                return next;
              });
            }}
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
                currentLevel={currentLevel}
                onLevelChange={onLevelChange}
                suggestions={videoSuggestions.filter(
                  (s) => deployedSuggestions[s.id] && !deployedSuggestions[s.id].response
                )}
                helperName="helper"
                onSuggestionRoute={(suggestion, channel) => {
                  const timeToRespond = Date.now() - (suggestionDeployTimeRef.current[suggestion.id] || Date.now());
                  if (channel === 'self') {
                    logEvent(EventTypes.SUGGESTION_ROUTE_SELF, Actors.CREATOR, { suggestionId: suggestion.id, timeToRespond });
                    setNotedSuggestions((prev) => [...prev, suggestion]);
                  } else if (channel === 'ai') {
                    logEvent(EventTypes.SUGGESTION_ROUTE_AI, Actors.CREATOR, { suggestionId: suggestion.id, timeToRespond });
                  } else if (channel === 'helper') {
                    logEvent(EventTypes.SUGGESTION_ROUTED, Actors.CREATOR, { suggestionId: suggestion.id, timeToRespond });
                    wsRelayService.sendData({ type: 'SUGGESTION_ROUTED_TO_HELPER', suggestion, actor: 'CREATOR' });
                    setNotedSuggestions((prev) => [...prev, { ...suggestion, routedToHelper: true }]);
                  }
                  setDeployedSuggestions((prev) => ({
                    ...prev,
                    [suggestion.id]: { ...prev[suggestion.id], response: channel },
                  }));
                  setActiveSuggestion(null);
                }}
                onSuggestionDismiss={(suggestion) => {
                  handleSuggestionDismiss();
                }}
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
                accentColor={COLORS.purple}
              />
            )}
          />
        </div>
      ) : (
        <div className="p-3 max-w-lg mx-auto">
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
            onEditChange={handleEditChange}
            initialSources={initialSources}
            feedItems={feedItems}
            onTaskStatus={handleHelperTaskStatus}
            onAIReview={handleAIReview}
            onAIUndo={handleAIUndo}
            peerEditNotification={peerEditNotification}
            onSuggestionResponse={handleHelperSuggestionResponse}
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
