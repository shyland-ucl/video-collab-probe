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
import ResearcherAIEditPanel from '../components/probe3/ResearcherAIEditPanel.jsx';

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

  // Task routing state (Layer 3)
  const [feedItems, setFeedItems] = useState([]);
  const [pendingAIRequest, setPendingAIRequest] = useState(null);

  // Sync state
  const [helperActivities, setHelperActivities] = useState([]);
  const [creatorActivities, setCreatorActivities] = useState([]);
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

  // --- Task routing callbacks (Layer 3) ---
  const handleHelperTaskStatus = useCallback((taskId, status) => {
    setFeedItems((prev) => prev.map((item) =>
      item.id === taskId ? { ...item, status } : item
    ));
    logEvent(EventTypes.HELPER_TASK_STATUS, Actors.HELPER, { taskId, status });
    // Notify creator via WebSocket
    wsRelayService.sendData({
      type: 'TASK_STATUS_UPDATE',
      taskId,
      status,
      actor: 'HELPER',
    });
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
          if (currentRole === 'helper') {
            playerRef.current?.play();
          }
          setCreatorActivities((prev) => [
            ...prev,
            { timestamp: Date.now(), actor: 'CREATOR', action: 'play', data: `Played at ${formatTime(msg.time)}` },
          ]);
          break;

        case 'PAUSE':
          if (currentRole === 'helper') {
            playerRef.current?.pause();
          }
          setCreatorActivities((prev) => [
            ...prev,
            { timestamp: Date.now(), actor: 'CREATOR', action: 'pause', data: `Paused at ${formatTime(msg.time)}` },
          ]);
          break;

        case 'SEEK':
          if (currentRole === 'helper') {
            playerRef.current?.seek(msg.time);
          }
          setCreatorActivities((prev) => [
            ...prev,
            { timestamp: Date.now(), actor: 'CREATOR', action: 'seek', data: `Seeked to ${formatTime(msg.time)}` },
          ]);
          break;

        case 'STATE_UPDATE':
          // No longer tracked (independent mode removed)
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
          if (currentRole === 'creator') {
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

        // Task routing message types (Layer 3)
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
          logEvent(EventTypes.HELPER_TASK_RECEIVED, Actors.HELPER, {
            taskId: item.id, text: msg.text, segment: msg.segment,
          });
          announce(`Creator sent you a task: ${msg.text}`);
          break;
        }

        case 'TASK_STATUS_UPDATE': {
          // Forward to CreatorDevice's recentTasks via same-page callback
          if (typeof window.__taskStatusUpdate === 'function') {
            window.__taskStatusUpdate(msg.taskId, msg.status);
          }
          logEvent(EventTypes.HELPER_TASK_STATUS, Actors.HELPER, {
            taskId: msg.taskId, status: msg.status,
          });
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
          logEvent(EventTypes.AI_EDIT_RESPONSE, Actors.AI, {
            text: msg.text, responseType: msg.responseType,
          });
          announce(`AI edit: ${msg.text}`);
          break;
        }

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

  // Register WoZ AI edit receive callback (researcher panel writes to this)
  useEffect(() => {
    window.__aiEditReceive = (request) => {
      setPendingAIRequest(request);
    };
    return () => { delete window.__aiEditReceive; };
  }, []);

  const handleAIEditResponse = useCallback((responseText, responseType) => {
    setPendingAIRequest(null);
    // The response is delivered to creator via window.__aiEditResponse
    // (registered in CreatorDevice)
    if (typeof window.__aiEditResponse === 'function') {
      window.__aiEditResponse(responseText, responseType);
    }
  }, []);

  const handleApplyEdit = useCallback((editAction) => {
    // Researcher wants to actually modify edit state
    logEvent(EventTypes.AI_EDIT_APPLIED, Actors.RESEARCHER, { action: editAction });
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
          <ResearcherVQAPanel
            segment={currentSegment}
            pendingQuestion={pendingQuestion}
          />
          <ResearcherAIEditPanel
            segment={currentSegment}
            pendingRequest={pendingAIRequest}
            onSendResponse={handleAIEditResponse}
            onApplyEdit={handleApplyEdit}
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
              Connection: {connected ? 'Active' : 'Not connected'} | Role: {role || 'none'}
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
