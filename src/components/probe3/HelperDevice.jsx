import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { buildAllSegments, getTotalDuration } from '../../utils/buildInitialSources.js';
import VideoPlayer from '../shared/VideoPlayer.jsx';
import TransportControls from '../shared/TransportControls.jsx';

import SegmentMarkerPanel from '../shared/SegmentMarkerPanel.jsx';
import MockEditor from '../shared/MockEditor.jsx';
import WorkspaceAwareness from './WorkspaceAwareness.jsx';

const COLORS = {
  navy: '#1F3864',
  purple: '#9B59B6',
  blue: '#2B579A',
};

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
}) {
  const { logEvent } = useEventLogger();
  const [showDescriptions, setShowDescriptions] = useState(false);
  const [controlRequestPending, setControlRequestPending] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef(null);

  const segments = useMemo(() => buildAllSegments(videoData), [videoData]);
  const videoDuration = useMemo(() => getTotalDuration(videoData), [videoData]);

  // Listen for incoming messages and control responses
  useEffect(() => {
    if (!webrtcService) return;
    const handleData = (data) => {
      if (data.type === 'MESSAGE') {
        setMessages((prev) => [...prev, { from: 'creator', text: data.text, timestamp: Date.now() }]);
      } else if (data.type === 'CONTROL_RESPONSE') {
        setControlRequestPending(false);
        if (data.accepted) {
          // Temporarily enable independent mode as "controlled" mode
          if (!independentMode) {
            onToggleIndependentMode();
          }
        }
      }
    };
    const unsubscribe = webrtcService.onData(handleData);
    return unsubscribe;
  }, [webrtcService, independentMode, onToggleIndependentMode]);

  // Send activity updates to creator
  const sendActivity = useCallback((action, data) => {
    if (!webrtcService) return;
    webrtcService.sendData({
      type: 'ACTIVITY',
      action,
      data,
      actor: 'HELPER',
      timestamp: Date.now(),
    });
  }, [webrtcService]);

  // Handle seek (in independent mode, does not sync to creator)
  const handleSeek = useCallback((time) => {
    onSeek(time);
    if (independentMode) {
      sendActivity('Seeked independently', `to ${Math.round(time)}s`);
    }
  }, [onSeek, independentMode, sendActivity]);

  // Request control from creator
  const handleRequestControl = useCallback(() => {
    if (!webrtcService) return;
    webrtcService.sendData({
      type: 'CONTROL_REQUEST',
      actor: 'HELPER',
      reason: 'Helper wants to navigate to a specific section',
    });
    setControlRequestPending(true);
    logEvent(EventTypes.SYNC_EVENT, Actors.HELPER, { action: 'control_requested' });
    sendActivity('Requested control', '');
  }, [webrtcService, logEvent, sendActivity]);

  // Send message to creator
  const handleSendMessage = useCallback(() => {
    const text = messageInput.trim();
    if (!text || !webrtcService) return;
    webrtcService.sendData({ type: 'MESSAGE', text, actor: 'HELPER' });
    setMessages((prev) => [...prev, { from: 'helper', text, timestamp: Date.now() }]);
    logEvent(EventTypes.MESSAGE_SENT, Actors.HELPER, { text });
    sendActivity('Sent message', text);
    setMessageInput('');
  }, [messageInput, webrtcService, logEvent, sendActivity]);

  // Toggle independent mode
  const handleToggleIndependent = useCallback(() => {
    onToggleIndependentMode();
    sendActivity(
      independentMode ? 'Returned to sync mode' : 'Entered independent mode',
      ''
    );
  }, [onToggleIndependentMode, independentMode, sendActivity]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Get Level 1 description for current segment
  const level1Description = currentSegment?.descriptions?.level_1 || null;

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Left column: Video + Transport */}
      <div className="lg:w-3/5 flex flex-col gap-2">
        <div className="relative">
          <VideoPlayer
            ref={videoRef}
            src={videoData?.video?.src || null}
            segments={segments}
            onTimeUpdate={onTimeUpdate}
            onSegmentChange={onSegmentChange}
            editState={editState}
          />
          {/* Description overlay */}
          {showDescriptions && level1Description && (
            <div
              className="absolute bottom-0 left-0 right-0 px-4 py-3 text-white text-sm"
              style={{ backgroundColor: 'rgba(31, 56, 100, 0.85)' }}
              aria-live="polite"
              aria-label="AI description overlay"
            >
              {level1Description}
            </div>
          )}
          {/* Sync/Independent indicator */}
          <div
            className="absolute top-2 right-2 px-2 py-1 rounded text-xs font-semibold text-white"
            style={{ backgroundColor: independentMode ? COLORS.purple : '#5CB85C' }}
            aria-label={independentMode ? 'Independent mode active' : 'Synced with creator'}
          >
            {independentMode ? 'Independent' : 'Synced'}
          </div>
        </div>

        <TransportControls
          playerRef={videoRef}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration || videoDuration}
        />
        <MockEditor
          segments={segments}
          initialSources={initialSources}
          currentTime={currentTime}
          onSeek={handleSeek}
          onEditChange={onEditChange}
        />
        <SegmentMarkerPanel segment={currentSegment} />
      </div>

      {/* Right column: Tools */}
      <div className="lg:w-2/5 flex flex-col gap-4">
        {/* Status Indicators */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Creator Status
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-600">Playback:</span>
              <span
                className="px-2 py-0.5 rounded text-xs font-semibold text-white"
                style={{ backgroundColor: creatorState?.isPlaying ? '#5CB85C' : '#6B7280' }}
              >
                {creatorState?.isPlaying ? 'Playing' : 'Paused'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-600">Time:</span>
              <span className="font-mono text-gray-800">
                {formatTime(creatorState?.currentTime || 0)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-600">Description Level:</span>
              <span className="font-semibold text-gray-800">
                {creatorState?.level || 1}
              </span>
            </div>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleToggleIndependent}
            className="px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors focus:outline-2 focus:outline-offset-2"
            style={{ backgroundColor: independentMode ? '#6B7280' : COLORS.purple }}
            aria-pressed={independentMode}
            aria-label={independentMode ? 'Return to synced mode' : 'Enter independent mode'}
          >
            {independentMode ? 'Return to Sync' : 'Independent Mode'}
          </button>
          <button
            onClick={handleRequestControl}
            disabled={controlRequestPending}
            className="px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-50 focus:outline-2 focus:outline-offset-2"
            style={{ backgroundColor: COLORS.blue }}
            aria-label="Request control from creator"
          >
            {controlRequestPending ? 'Request Pending...' : 'Request Control'}
          </button>
          <button
            onClick={() => setShowDescriptions(!showDescriptions)}
            className="px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-colors focus:outline-2 focus:outline-offset-2"
            style={{
              borderColor: COLORS.navy,
              backgroundColor: showDescriptions ? COLORS.navy : 'transparent',
              color: showDescriptions ? '#FFFFFF' : COLORS.navy,
            }}
            aria-pressed={showDescriptions}
            aria-label={showDescriptions ? 'Hide AI descriptions' : 'Show AI descriptions'}
          >
            {showDescriptions ? 'Hide Descriptions' : 'Show Descriptions'}
          </button>
        </div>

        {/* Creator Activity Feed */}
        <WorkspaceAwareness
          activities={creatorActivities}
          title="Creator Intent Feed"
        />

        {/* Message channel */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="px-3 py-2 rounded-t-lg" style={{ backgroundColor: COLORS.purple }}>
            <h3 className="text-white font-semibold text-sm">Messages to Creator</h3>
          </div>
          <div className="max-h-32 overflow-y-auto p-2 space-y-1">
            {messages.map((msg, i) => (
              <div key={i} className={`text-xs px-2 py-1 rounded ${msg.from === 'helper' ? 'bg-purple-50 text-right' : 'bg-blue-50'}`}>
                <span className="font-semibold" style={{ color: msg.from === 'helper' ? COLORS.purple : COLORS.blue }}>
                  {msg.from === 'helper' ? 'You' : 'Creator'}:
                </span>{' '}
                <span className="text-gray-700">{msg.text}</span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="border-t border-gray-200 p-2 flex gap-2">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSendMessage(); }}
              placeholder="Send a message to creator..."
              className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-blue-500"
              aria-label="Message to creator"
            />
            <button
              onClick={handleSendMessage}
              disabled={!messageInput.trim()}
              className="px-3 py-1.5 rounded text-white text-sm font-medium transition-colors disabled:opacity-50 focus:outline-2 focus:outline-offset-2"
              style={{ backgroundColor: COLORS.purple }}
              aria-label="Send message to creator"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
