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

const COLORS = {
  navy: '#1F3864',
  purple: '#9B59B6',
  blue: '#2B579A',
};

export default function Probe3Page() {
  const { setCondition, logEvent } = useEventLogger();
  const [searchParams] = useSearchParams();
  const isResearcher = searchParams.get('mode') === 'researcher';
  const roleParam = searchParams.get('role'); // 'creator' | 'helper' | null
  const validRoleParam = roleParam === 'creator' || roleParam === 'helper'
    ? roleParam
    : null;

  // Phase: roleSelect -> waiting -> library -> active
  const [phase, setPhase] = useState(validRoleParam ? 'waiting' : 'roleSelect');
  const [role, setRole] = useState(validRoleParam || null);
  const [showOnboarding, setShowOnboarding] = useState(true);

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

  // Synced library selection — both devices see the same set
  const [librarySelection, setLibrarySelection] = useState(new Set());

  // Marks (voice notes + segment markers) — creator side
  const [marks, setMarks] = useState([]);

  // Handover state
  const [handoverMode, setHandoverMode] = useState(null);
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState(null);
  const [pendingSuggestion, setPendingSuggestion] = useState(null);

  // Helper-received tasks (sent via WebSocket from creator)
  const [helperTasks, setHelperTasks] = useState([]);
  const [helperHandoverMode, setHelperHandoverMode] = useState(null);

  // Sync state
  const [independentMode, setIndependentMode] = useState(false);
  const [helperActivities, setHelperActivities] = useState([]);
  const [creatorActivities, setCreatorActivities] = useState([]);
  const [creatorState, setCreatorState] = useState({
    isPlaying: false,
    currentTime: 0,
    level: 1,
    segmentId: null,
  });
  const [connected, setConnected] = useState(false);

  // Load descriptions on mount, set condition
  useEffect(() => {
    setCondition('probe3');
    logEvent(EventTypes.CONDITION_START, Actors.SYSTEM, { condition: 'probe3' });
    loadDescriptions().then(setData).catch(console.error);
  }, [setCondition, logEvent]);

  // Build project data from selected videos
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

  // Track play/pause state and duration from video element
  useEffect(() => {
    if (phase !== 'active') return;
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const video = player.video;
      if (video) {
        setIsPlaying(!video.paused);
      }
      const edlDur = player.edlDuration;
      if (edlDur && edlDur > 0) {
        setDuration(edlDur);
      } else if (video?.duration && isFinite(video.duration)) {
        setDuration(video.duration);
      } else if (videoDuration) {
        setDuration(videoDuration);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [phase, videoDuration]);

  const handleTimeUpdate = useCallback((time) => {
    setCurrentTime(time);
  }, []);

  const handleSegmentChange = useCallback((seg) => {
    setCurrentSegment(seg);
  }, []);

  const handleSeek = useCallback((time) => {
    playerRef.current?.seek(time);
  }, []);

  const handleQuestion = useCallback((question) => {
    setPendingQuestion(question);
  }, []);

  // Use a ref to track independentMode so the onData handler always sees current value
  const independentModeRef = useRef(independentMode);
  useEffect(() => {
    independentModeRef.current = independentMode;
  }, [independentMode]);

  // --- Library selection sync ---
  const handleSelectionChange = useCallback((videoId, isSelected) => {
    setLibrarySelection((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(videoId);
      else next.delete(videoId);
      return next;
    });
    // Broadcast selection change to peer
    wsRelayService.sendData({
      type: 'VIDEO_SELECT',
      videoId,
      isSelected,
      actor: role === 'creator' ? 'CREATOR' : 'HELPER',
    });
  }, [role]);

  // --- Video Import (creator only, triggers both devices) ---
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

    logEvent(EventTypes.IMPORT_VIDEO, Actors.SYSTEM, {
      videoIds: videos.map((v) => v.id), count: videos.length,
    });
    announce(`Project created with ${videos.length} video${videos.length > 1 ? 's' : ''}. Starting session.`);

    // Tell the peer to also move to active
    wsRelayService.sendData({
      type: 'PROJECT_CREATED',
      videoIds: videos.map((v) => v.id),
      actor: 'CREATOR',
    });

    setPhase('active');
  }, [logEvent]);

  // --- Edit state sync ---
  const editStateRef = useRef(editState);
  useEffect(() => { editStateRef.current = editState; }, [editState]);

  // Peer edit notification state (for helper's visual toast)
  const [peerEditNotification, setPeerEditNotification] = useState(null);

  // Detect what changed between old and new edit states
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
    // Check if clips were reordered (same count, different order)
    if (prevClips === newClips && prevClips > 0) {
      const prevIds = prevState.clips.map((c) => c.id).join(',');
      const newIds = newState.clips.map((c) => c.id).join(',');
      if (prevIds !== newIds) return 'reordered clips';
    }
    return 'made an edit';
  }, []);

  // handleEditChange is only called by MockEditorVisual for LOCAL edits
  // (peer-driven prop changes are suppressed inside MockEditorVisual via syncFromPropsRef)
  const handleEditChange = useCallback((clips, captions, sources) => {
    const newState = { clips, captions, sources };
    const action = detectEditAction(editStateRef.current, newState);
    setEditState(newState);
    wsRelayService.sendData({
      type: 'EDIT_STATE_UPDATE',
      editState: newState,
      action,
      actor: role === 'creator' ? 'CREATOR' : 'HELPER',
    });
  }, [role, detectEditAction]);

  // --- Marks management ---
  const handleAddMark = useCallback((mark) => {
    setMarks((prev) => [...prev, mark]);
  }, []);

  const handleDeleteMark = useCallback((markId) => {
    setMarks((prev) => prev.filter((m) => m.id !== markId));
  }, []);

  // --- Handover flow ---
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

  // --- WoZ suggestion flow ---
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

  // --- WebSocket setup ---
  const unsubscribeRef = useRef({
    data: null,
    connected: null,
    disconnected: null,
  });

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
          if (currentRole === 'helper' && !independentModeRef.current) {
            playerRef.current?.play();
          }
          setCreatorActivities((prev) => [
            ...prev,
            { timestamp: Date.now(), actor: 'CREATOR', action: 'play', data: `Played at ${formatTime(msg.time)}` },
          ]);
          break;

        case 'PAUSE':
          if (currentRole === 'helper' && !independentModeRef.current) {
            playerRef.current?.pause();
          }
          setCreatorActivities((prev) => [
            ...prev,
            { timestamp: Date.now(), actor: 'CREATOR', action: 'pause', data: `Paused at ${formatTime(msg.time)}` },
          ]);
          break;

        case 'SEEK':
          if (currentRole === 'helper' && !independentModeRef.current) {
            playerRef.current?.seek(msg.time);
          }
          setCreatorActivities((prev) => [
            ...prev,
            { timestamp: Date.now(), actor: 'CREATOR', action: 'seek', data: `Seeked to ${formatTime(msg.time)}` },
          ]);
          break;

        case 'STATE_UPDATE':
          setCreatorState(msg.state);
          break;

        case 'ACTIVITY':
          if (currentRole === 'creator') {
            setHelperActivities((prev) => [
              ...prev,
              { timestamp: msg.timestamp, actor: msg.actor, action: msg.action, data: msg.data },
            ]);
          }
          break;

        // Edit state sync — apply peer's edits locally
        // MockEditorVisual will sync from the editState prop and suppress onEditChange
        case 'EDIT_STATE_UPDATE': {
          setEditState(msg.editState);
          const peerLabel = msg.actor === 'CREATOR' ? 'Creator' : 'Helper';
          const actionDesc = msg.action || 'made an edit';
          if (role === 'creator') {
            // BLV creator gets audio announcement via screen reader
            announce(`${peerLabel} ${actionDesc}`);
          } else {
            // Sighted helper gets visual toast
            setPeerEditNotification({ text: `${peerLabel} ${actionDesc}`, id: Date.now() });
          }
          break;
        }

        // Library selection sync
        case 'VIDEO_SELECT':
          setLibrarySelection((prev) => {
            const next = new Set(prev);
            if (msg.isSelected) next.add(msg.videoId);
            else next.delete(msg.videoId);
            return next;
          });
          break;

        // Creator created project — helper follows
        case 'PROJECT_CREATED':
          // Build selectedVideos from the IDs the creator sent
          setSelectedVideos((prev) => {
            // We need access to allVideos data, so we'll use a ref-based approach
            return msg.videoIds;
          });
          break;

        // Handover message types
        case 'HANDOVER_TASKS':
          setHelperTasks(msg.marks || []);
          setHelperHandoverMode('tasks');
          announce('Creator sent you tasks to complete');
          break;

        case 'HANDOVER_LIVE':
          setHelperHandoverMode('live');
          announce('Creator started live collaboration');
          break;

        case 'NOTIFY_CREATOR':
          announce('Helper is trying to reach you');
          break;

        case 'RETURN_SUMMARY':
          announce(`Helper finished: ${msg.summary || 'No summary provided'}`);
          logEvent(EventTypes.HELPER_ACTION, Actors.HELPER, { action: 'return_device', summary: msg.summary });
          setTransitionDirection('toCreator');
          setIsTransitioning(true);
          break;

        case 'MESSAGE':
        case 'CONTROL_REQUEST':
        case 'CONTROL_RESPONSE':
          break;

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

  // When connected and still on waiting, move to library
  useEffect(() => {
    if (phase === 'waiting' && connected) {
      setPhase('library');
    }
  }, [phase, connected]);

  // Handle PROJECT_CREATED from peer — resolve videoIds to video objects and enter active
  useEffect(() => {
    if (selectedVideos && Array.isArray(selectedVideos) && typeof selectedVideos[0] === 'string') {
      // selectedVideos is an array of IDs from WebSocket, resolve to video objects
      if (allVideos.length > 0) {
        const resolved = allVideos.filter((v) => selectedVideos.includes(v.id));
        if (resolved.length > 0) {
          // Build editState
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
          setEditState({ clips, captions: [], sources });
          setSelectedVideos(resolved);
          setPhase('active');
          announce('Creator started the project. Entering session.');
        }
      }
    }
  }, [selectedVideos, allVideos]);

  // --- Role Selection ---
  const handleRoleSelect = useCallback((selectedRole) => {
    setRole(selectedRole);
    setPhase('waiting');
    logEvent(EventTypes.SESSION_START, Actors.SYSTEM, { role: selectedRole, probe: 'probe3' });

    setupHandlers(selectedRole);
    wsRelayService.connect(selectedRole);
  }, [logEvent, setupHandlers]);

  // If role came from URL param, auto-connect on mount
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

  // Toggle independent mode for helper
  const handleToggleIndependentMode = useCallback(() => {
    setIndependentMode((prev) => {
      const newVal = !prev;
      logEvent(EventTypes.INDEPENDENT_MODE_TOGGLE, Actors.HELPER, { enabled: newVal });
      wsRelayService.sendData({
        type: 'ACTIVITY',
        action: newVal ? 'Entered independent mode' : 'Returned to sync mode',
        data: '',
        actor: 'HELPER',
        timestamp: Date.now(),
      });
      return newVal;
    });
  }, [logEvent]);

  // Researcher manual sync fallback
  const handleManualSync = useCallback((action) => {
    if (!playerRef.current) return;
    switch (action) {
      case 'play':
        playerRef.current.play();
        break;
      case 'pause':
        playerRef.current.pause();
        break;
      case 'sync_time':
        wsRelayService.sendData({
          type: 'SEEK',
          time: currentTime,
          actor: 'RESEARCHER',
        });
        break;
      default:
        break;
    }
  }, [currentTime]);

  const modeLabel = role
    ? `${role.charAt(0).toUpperCase() + role.slice(1)} Device${connected ? ' (Connected)' : ''}`
    : '';

  // --- Role Selection Screen ---
  if (phase === 'roleSelect') {
    return (
      <div className="min-h-screen bg-white">
        {showOnboarding && (
          <OnboardingBrief condition="probe3" onDismiss={() => setShowOnboarding(false)} />
        )}
        <ConditionHeader condition="probe3" />
        <div className="max-w-lg mx-auto mt-8 px-4">
          <h2 className="text-2xl font-bold text-center mb-2" style={{ color: COLORS.navy }}>
            Select Your Role
          </h2>
          <p className="text-gray-500 text-center mb-8">
            Each person uses their own device. Choose which role this device is for.
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => handleRoleSelect('creator')}
              className="flex-1 py-6 rounded-xl border-2 text-center transition-colors hover:shadow-lg focus:outline-2 focus:outline-offset-2"
              style={{ borderColor: COLORS.blue }}
              aria-label="Select creator role"
            >
              <div className="text-3xl mb-2" aria-hidden="true">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={COLORS.blue} strokeWidth="2" className="mx-auto">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
              </div>
              <div className="font-bold text-lg" style={{ color: COLORS.blue }}>Creator</div>
              <p className="text-xs text-gray-500 mt-1 px-3">
                Audio/text-optimised interface. Primary playback control.
              </p>
            </button>
            <button
              onClick={() => handleRoleSelect('helper')}
              className="flex-1 py-6 rounded-xl border-2 text-center transition-colors hover:shadow-lg focus:outline-2 focus:outline-offset-2"
              style={{ borderColor: COLORS.purple }}
              aria-label="Select helper role"
            >
              <div className="text-3xl mb-2" aria-hidden="true">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={COLORS.purple} strokeWidth="2" className="mx-auto">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  <path d="M16 3l2 2-2 2" />
                </svg>
              </div>
              <div className="font-bold text-lg" style={{ color: COLORS.purple }}>Helper</div>
              <p className="text-xs text-gray-500 mt-1 px-3">
                Visual-optimised interface. Can request control or work independently.
              </p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Waiting for peer ---
  if (phase === 'waiting') {
    return (
      <div className="min-h-screen bg-white">
        {showOnboarding && (
          <OnboardingBrief condition="probe3" onDismiss={() => setShowOnboarding(false)} />
        )}
        <ConditionHeader condition="probe3" modeLabel={modeLabel} />
        <div className="max-w-lg mx-auto mt-16 px-4 text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center animate-pulse" style={{ backgroundColor: '#F0E6FF' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={COLORS.purple} strokeWidth="2" className="animate-spin" style={{ animationDuration: '3s' }}>
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: COLORS.navy }}>
            Waiting for {role === 'creator' ? 'helper' : 'creator'}...
          </h2>
          <p className="text-gray-500 text-sm">
            Ask the other person to open this page and select their role.
          </p>
        </div>
      </div>
    );
  }

  // --- Video Library (synced between devices) ---
  if (phase === 'library') {
    const isCreator = role === 'creator';
    return (
      <div className="min-h-screen bg-white">
        <ConditionHeader condition="probe3" modeLabel={`${role.charAt(0).toUpperCase() + role.slice(1)} — Select Videos`} />
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

  // --- Active Session ---
  return (
    <div className="min-h-screen bg-white">
      <ConditionHeader condition="probe3" modeLabel={modeLabel} />

      <div className="p-3 max-w-lg mx-auto">
        {role === 'creator' ? (
          <CreatorDevice
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
            onInitiateHandover={handleInitiateHandover}
            marks={marks}
            onAddMark={handleAddMark}
            onDeleteMark={handleDeleteMark}
            editState={editState}
            onEditChange={handleEditChange}
            initialSources={initialSources}
          />
        ) : (
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
            independentMode={independentMode}
            onToggleIndependentMode={handleToggleIndependentMode}
            creatorState={creatorState}
            editState={editState}
            onEditChange={handleEditChange}
            initialSources={initialSources}
            tasks={helperTasks}
            handoverMode={helperHandoverMode}
            peerEditNotification={peerEditNotification}
          />
        )}
      </div>

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

      {/* Researcher WoZ panels */}
      {isResearcher && (
        <div className="max-w-7xl mx-auto px-4 pb-4 space-y-4">
          <ResearcherVQAPanel
            segment={currentSegment}
            pendingQuestion={pendingQuestion}
          />
          <ResearcherHandoverPanel
            onTriggerSuggestion={handleTriggerSuggestion}
            currentMode={role}
          />
          {/* Manual sync fallback controls */}
          <div
            className="border-2 rounded-lg p-4 shadow-sm"
            style={{ borderColor: '#F0AD4E', backgroundColor: '#FFFBF0' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: '#F0AD4E' }}
                aria-hidden="true"
              />
              <h3 className="font-bold text-sm" style={{ color: COLORS.navy }}>
                Sync Controls (Researcher)
              </h3>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => handleManualSync('play')}
                className="px-3 py-1.5 rounded text-sm font-medium text-white focus:outline-2 focus:outline-offset-2"
                style={{ backgroundColor: '#5CB85C' }}
                aria-label="Force play on this device"
              >
                Force Play
              </button>
              <button
                onClick={() => handleManualSync('pause')}
                className="px-3 py-1.5 rounded text-sm font-medium text-white focus:outline-2 focus:outline-offset-2"
                style={{ backgroundColor: '#D9534F' }}
                aria-label="Force pause on this device"
              >
                Force Pause
              </button>
              <button
                onClick={() => handleManualSync('sync_time')}
                className="px-3 py-1.5 rounded text-sm font-medium text-white focus:outline-2 focus:outline-offset-2"
                style={{ backgroundColor: COLORS.blue }}
                aria-label="Broadcast current time to other device"
              >
                Sync Time to Peer
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Connection: {connected ? 'Active' : 'Not connected'} | Role: {role || 'none'} | Independent: {independentMode ? 'Yes' : 'No'}
            </p>
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
