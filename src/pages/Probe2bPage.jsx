import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadDescriptions } from '../data/sampleDescriptions.js';
import { useEventLogger } from '../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../utils/eventTypes.js';
import { announce } from '../utils/announcer.js';
import { buildInitialSources, buildAllSegments, getTotalDuration } from '../utils/buildInitialSources.js';
import { buildProjectStats, buildSessionGuide, summarizeEditStateChange } from '../utils/projectOverview.js';
import { wsRelayService } from '../services/wsRelayService.js';
import { loadProjectState } from '../utils/projectState.js';
import ConditionHeader from '../components/shared/ConditionHeader.jsx';
import OnboardingBrief from '../components/shared/OnboardingBrief.jsx';
import VideoLibrary from '../components/probe1/VideoLibrary.jsx';
import ResearcherVQAPanel from '../components/probe1/ResearcherVQAPanel.jsx';
import ResearcherAIEditPanel from '../components/probe3/ResearcherAIEditPanel.jsx';
import DecoupledRoleSelector from '../components/decoupled/DecoupledRoleSelector.jsx';
import DecoupledWaitingScreen from '../components/decoupled/DecoupledWaitingScreen.jsx';
import DecoupledCreatorDevice from '../components/decoupled/DecoupledCreatorDevice.jsx';
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
  const [showOnboarding, setShowOnboarding] = useState(true);
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

  const [helperActivities, setHelperActivities] = useState([]);
  const [creatorActivities, setCreatorActivities] = useState([]);
  const [connected, setConnected] = useState(false);
  const [projectUpdate, setProjectUpdate] = useState(null);

  useEffect(() => {
    setCondition('probe2b');
    logEvent(EventTypes.CONDITION_START, Actors.SYSTEM, { condition: 'probe2b' });
    loadDescriptions().then(setData).catch(console.error);
  }, [setCondition, logEvent]);

  // Try loading project state from Phase 2a
  useEffect(() => {
    const savedState = loadProjectState();
    if (savedState && data) {
      // Apply saved state
      if (savedState.editState) {
        setEditState(savedState.editState);
      }
      if (savedState.selectedVideoIds && data.videos) {
        const resolved = data.videos.filter((v) => savedState.selectedVideoIds.includes(v.id));
        if (resolved.length > 0) {
          setSelectedVideos(resolved);
        }
      }
      announce('Project state loaded from Phase 2a');
    }
  }, [data]);

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
  const sessionGuideBrief = useMemo(() => (
    sessionGuide ? buildSessionGuide({ condition: 'probe2b', projectStats: sessionGuide }) : null
  ), [sessionGuide]);

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

  const handleTimeUpdate = useCallback((time) => setCurrentTime(time), []);
  const handleSegmentChange = useCallback((seg) => setCurrentSegment(seg), []);
  const handleSeek = useCallback((time) => playerRef.current?.seek(time), []);
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
    setPhase('active');
  }, [logEvent]);

  // Edit state sync
  const editStateRef = useRef(editState);
  useEffect(() => { editStateRef.current = editState; }, [editState]);
  const [peerEditNotification, setPeerEditNotification] = useState(null);

  const detectEditAction = useCallback((prevState, newState) => {
    if (!prevState || !newState) return 'made an edit';
    const prevClips = prevState.clips?.length || 0;
    const newClips = newState.clips?.length || 0;
    const prevCaptions = prevState.captions?.length || 0;
    const newCaptions = newState.captions?.length || 0;
    if (newClips > prevClips) return 'split a clip';
    if (newClips < prevClips) return 'deleted a clip';
    if (newCaptions > prevCaptions) return 'added a caption';
    if (newCaptions < prevCaptions) return 'removed a caption';
    if (prevClips === newClips && prevClips > 0) {
      const prevIds = prevState.clips.map((c) => c.id).join(',');
      const newIds = newState.clips.map((c) => c.id).join(',');
      if (prevIds !== newIds) return 'reordered clips';
    }
    return 'made an edit';
  }, []);

  const handleEditChange = useCallback((clips, captions, sources, textOverlays) => {
    const newState = {
      clips,
      captions,
      sources,
      textOverlays: textOverlays ?? editStateRef.current?.textOverlays ?? [],
    };
    const action = detectEditAction(editStateRef.current, newState);
    const actorLabel = role === 'creator' ? 'Creator' : 'Helper';
    const changeSummary = summarizeEditStateChange(editStateRef.current, newState, actorLabel);
    setEditState(newState);
    wsRelayService.sendData({
      type: 'EDIT_STATE_UPDATE', editState: newState, action, changeSummary,
      actor: role === 'creator' ? 'CREATOR' : 'HELPER',
    });
  }, [role, detectEditAction]);

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
        case 'PROJECT_STATE_EXPORT': {
          // Receive project state from Phase 2a via researcher transition
          if (msg.projectState) {
            if (msg.projectState.editState) setEditState(msg.projectState.editState);
            announce('Project state received from Phase 2a');
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
      announce('Device connected');
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
    setupHandlers(selectedRole);
    wsRelayService.connect(selectedRole);
  }, [logEvent, setupHandlers]);

  const didAutoConnect = useRef(false);
  useEffect(() => {
    if (validRoleParam && !didAutoConnect.current) {
      didAutoConnect.current = true;
      setupHandlers(validRoleParam);
      wsRelayService.connect(validRoleParam);
    }
  }, [validRoleParam, setupHandlers]);

  useEffect(() => () => {
    clearSubscriptions();
    wsRelayService.disconnect();
  }, [clearSubscriptions]);

  // WoZ AI edit callbacks
  useEffect(() => {
    window.__aiEditReceive = (request) => setPendingAIRequest(request);
    return () => { delete window.__aiEditReceive; };
  }, []);

  const handleAIEditResponse = useCallback((responseText, responseType) => {
    setPendingAIRequest(null);
    if (typeof window.__aiEditResponse === 'function') {
      window.__aiEditResponse(responseText, responseType);
    }
  }, []);

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
        showOnboarding={showOnboarding}
        onDismissOnboarding={() => setShowOnboarding(false)}
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
        showOnboarding={showOnboarding}
        onDismissOnboarding={() => setShowOnboarding(false)}
      />
    );
  }

  // Library
  if (phase === 'library') {
    const isCreator = role === 'creator';
    return (
      <div className="min-h-screen bg-white">
        <ConditionHeader condition="probe2b" modeLabel={`${role.charAt(0).toUpperCase() + role.slice(1)} — Select Videos`} />
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
      {sessionGuideBrief && (
        <OnboardingBrief
          condition="probe2b"
          guide={sessionGuideBrief}
          onDismiss={() => setSessionGuide(null)}
        />
      )}
      <ConditionHeader condition="probe2b" modeLabel={modeLabel} />
      <div className="p-3 max-w-lg mx-auto">
        {role === 'creator' ? (
          <DecoupledCreatorDevice
            condition="probe2b"
            accentColor={COLORS.green}
            videoRef={playerRef}
            videoData={projectData}
            webrtcService={wsRelayService}
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
            projectUpdate={projectUpdate}
          />
        ) : (
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
            onEditChange={handleEditChange}
            initialSources={initialSources}
            feedItems={feedItems}
            onTaskStatus={handleHelperTaskStatus}
            onAIReview={handleAIReview}
            onAIUndo={handleAIUndo}
            peerEditNotification={peerEditNotification}
          />
        )}
      </div>

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
