import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadDescriptions } from '../data/sampleDescriptions.js';
import { useEventLogger } from '../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../utils/eventTypes.js';
import { announce } from '../utils/announcer.js';
import { buildInitialSources, getTotalDuration } from '../utils/buildInitialSources.js';
import { wsRelayService } from '../services/wsRelayService.js';
import ConditionHeader from '../components/shared/ConditionHeader.jsx';
import ResearcherVQAPanel from '../components/probe1/ResearcherVQAPanel.jsx';
import CreatorDevice from '../components/probe3/CreatorDevice.jsx';
import HelperDevice from '../components/probe3/HelperDevice.jsx';

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

  // Phase: roleSelect -> waiting -> active
  const [phase, setPhase] = useState(roleParam ? 'waiting' : 'roleSelect');
  const [role, setRole] = useState(roleParam || null);

  // Video state
  const playerRef = useRef(null);
  const [data, setData] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState(null);
  const [pendingQuestion, setPendingQuestion] = useState(null);

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
  const [editState, setEditState] = useState(null);

  // Load descriptions on mount, set condition
  useEffect(() => {
    setCondition('probe3');
    logEvent(EventTypes.CONDITION_START, Actors.SYSTEM, { condition: 'probe3' });
    loadDescriptions().then(setData).catch(console.error);
  }, [setCondition, logEvent]);

  const videoDuration = useMemo(() => getTotalDuration(data), [data]);
  const initialSources = useMemo(() => buildInitialSources(data), [data]);

  // Track play/pause state and duration from video element
  useEffect(() => {
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
  }, [videoDuration]);

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

  const unsubscribeRef = useRef({
    data: null,
    connected: null,
    disconnected: null,
  });

  const clearSubscriptions = useCallback(() => {
    unsubscribeRef.current.data?.();
    unsubscribeRef.current.connected?.();
    unsubscribeRef.current.disconnected?.();
    unsubscribeRef.current = {
      data: null,
      connected: null,
      disconnected: null,
    };
  }, []);

  // Set up data + disconnect handlers (once, after role is chosen)
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

        case 'MESSAGE':
        case 'CONTROL_REQUEST':
        case 'CONTROL_RESPONSE':
          // Handled within device components
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
      setPhase('active');
    });
  }, [clearSubscriptions, logEvent]);

  // --- Role Selection → connect immediately ---
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
    if (roleParam && !didAutoConnect.current) {
      didAutoConnect.current = true;
      handleRoleSelect(roleParam);
    }
  }, [roleParam, handleRoleSelect]);

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
        <ConditionHeader condition="probe3" />
        <div className="max-w-lg mx-auto mt-16 px-4">
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

  // --- Active Session ---
  return (
    <div className="min-h-screen bg-white">
      <ConditionHeader condition="probe3" modeLabel={modeLabel} />

      <div className="p-4 max-w-7xl mx-auto">
        {role === 'creator' ? (
          <CreatorDevice
            videoRef={playerRef}
            videoData={data}
            webrtcService={wsRelayService}
            onQuestion={handleQuestion}
            helperActivities={helperActivities}
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            currentSegment={currentSegment}
            onTimeUpdate={handleTimeUpdate}
            onSegmentChange={handleSegmentChange}
            onSeek={handleSeek}
            editState={editState}
            onEditChange={(clips, captions, sources) => setEditState({ clips, captions, sources })}
            initialSources={initialSources}
          />
        ) : (
          <HelperDevice
            videoRef={playerRef}
            videoData={data}
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
            onEditChange={(clips, captions, sources) => setEditState({ clips, captions, sources })}
            initialSources={initialSources}
          />
        )}
      </div>

      {/* Researcher WoZ panel */}
      {isResearcher && (
        <div className="max-w-7xl mx-auto px-4 pb-4 space-y-4">
          <ResearcherVQAPanel
            segment={currentSegment}
            pendingQuestion={pendingQuestion}
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
