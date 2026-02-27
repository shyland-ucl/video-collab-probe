import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { buildAllSegments, getTotalDuration } from '../../utils/buildInitialSources.js';
import VideoPlayer from '../shared/VideoPlayer.jsx';
import TransportControls from '../shared/TransportControls.jsx';
import Timeline from '../shared/Timeline.jsx';
import SegmentMarkerPanel from '../shared/SegmentMarkerPanel.jsx';
import AccessibilityToolbar from '../shared/AccessibilityToolbar.jsx';
import MockEditor from '../shared/MockEditor.jsx';
import GranularityController from '../probe1/GranularityController.jsx';
import DescriptionPanel from '../probe1/DescriptionPanel.jsx';
import FlagButton from '../probe1/FlagButton.jsx';
import VQAPanel from '../probe1/VQAPanel.jsx';
import WorkspaceAwareness from './WorkspaceAwareness.jsx';

const COLORS = {
  navy: '#1F3864',
  purple: '#9B59B6',
  blue: '#2B579A',
};

export default function CreatorDevice({
  videoRef,
  videoData,
  webrtcService,
  onQuestion,
  helperActivities,
  currentTime,
  duration,
  isPlaying,
  currentSegment,
  onTimeUpdate,
  onSegmentChange,
  onSeek,
  editState,
  onEditChange,
  initialSources = [],
}) {
  const { logEvent } = useEventLogger();
  const [level, setLevel] = useState(1);
  const [messageInput, setMessageInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [controlRequest, setControlRequest] = useState(null);
  const messagesEndRef = useRef(null);

  const segments = useMemo(() => buildAllSegments(videoData), [videoData]);
  const videoDuration = useMemo(() => getTotalDuration(videoData), [videoData]);

  // Sync transport to helper via WebRTC on play/pause/seek
  const prevTimeRef = useRef(currentTime);
  const prevPlayingRef = useRef(isPlaying);

  useEffect(() => {
    if (!webrtcService) return;

    // Detect play/pause changes
    if (prevPlayingRef.current !== isPlaying) {
      prevPlayingRef.current = isPlaying;
      webrtcService.sendData({
        type: isPlaying ? 'PLAY' : 'PAUSE',
        time: currentTime,
        actor: 'CREATOR',
      });
      webrtcService.sendData({
        type: 'STATE_UPDATE',
        state: { isPlaying, currentTime, level, segmentId: currentSegment?.id },
      });
    }
  }, [isPlaying, currentTime, webrtcService, level, currentSegment]);

  // Send periodic state updates
  useEffect(() => {
    if (!webrtcService) return;
    const interval = setInterval(() => {
      webrtcService.sendData({
        type: 'STATE_UPDATE',
        state: { isPlaying, currentTime, level, segmentId: currentSegment?.id },
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [webrtcService, isPlaying, currentTime, level, currentSegment]);

  // Handle seek sync
  const handleSeek = useCallback((time) => {
    onSeek(time);
    if (webrtcService) {
      webrtcService.sendData({
        type: 'SEEK',
        time,
        actor: 'CREATOR',
      });
    }
  }, [onSeek, webrtcService]);

  // Listen for incoming messages and control requests
  useEffect(() => {
    if (!webrtcService) return;
    const handleData = (data) => {
      if (data.type === 'MESSAGE') {
        setMessages((prev) => [...prev, { from: 'helper', text: data.text, timestamp: Date.now() }]);
      } else if (data.type === 'CONTROL_REQUEST') {
        setControlRequest(data);
      }
    };
    const unsubscribe = webrtcService.onData(handleData);
    return unsubscribe;
  }, [webrtcService]);

  // Send message to helper
  const handleSendMessage = useCallback(() => {
    const text = messageInput.trim();
    if (!text || !webrtcService) return;
    webrtcService.sendData({ type: 'MESSAGE', text, actor: 'CREATOR' });
    setMessages((prev) => [...prev, { from: 'creator', text, timestamp: Date.now() }]);
    logEvent(EventTypes.MESSAGE_SENT, Actors.CREATOR, { text });
    setMessageInput('');
  }, [messageInput, webrtcService, logEvent]);

  // Handle control request response
  const handleControlResponse = useCallback((accepted) => {
    if (!webrtcService || !controlRequest) return;
    webrtcService.sendData({
      type: 'CONTROL_RESPONSE',
      accepted,
      actor: 'CREATOR',
    });
    logEvent(EventTypes.SYNC_EVENT, Actors.CREATOR, {
      action: accepted ? 'control_granted' : 'control_denied',
    });
    setControlRequest(null);
  }, [webrtcService, controlRequest, logEvent]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Left column: Video + Transport */}
      <div className="lg:w-3/5 flex flex-col gap-2">
        <VideoPlayer
          ref={videoRef}
          src={videoData?.video?.src || null}
          segments={segments}
          onTimeUpdate={onTimeUpdate}
          onSegmentChange={onSegmentChange}
          editState={editState}
        />
        <TransportControls
          playerRef={videoRef}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration || videoDuration}
        />
        <Timeline
          segments={segments}
          currentTime={currentTime}
          duration={duration || videoDuration}
          onSeek={handleSeek}
        />
        <SegmentMarkerPanel segment={currentSegment} />

        {/* Message channel */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="px-3 py-2 rounded-t-lg" style={{ backgroundColor: COLORS.navy }}>
            <h3 className="text-white font-semibold text-sm">Messages to Helper</h3>
          </div>
          <div className="max-h-32 overflow-y-auto p-2 space-y-1">
            {messages.map((msg, i) => (
              <div key={i} className={`text-xs px-2 py-1 rounded ${msg.from === 'creator' ? 'bg-blue-50 text-right' : 'bg-purple-50'}`}>
                <span className="font-semibold" style={{ color: msg.from === 'creator' ? COLORS.blue : COLORS.purple }}>
                  {msg.from === 'creator' ? 'You' : 'Helper'}:
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
              placeholder="Send a message to helper..."
              className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-blue-500"
              aria-label="Message to helper"
            />
            <button
              onClick={handleSendMessage}
              disabled={!messageInput.trim()}
              className="px-3 py-1.5 rounded text-white text-sm font-medium transition-colors disabled:opacity-50 focus:outline-2 focus:outline-offset-2"
              style={{ backgroundColor: COLORS.blue }}
              aria-label="Send message to helper"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Right column: Tools */}
      <div className="lg:w-2/5 flex flex-col gap-4">
        {/* Control Request Banner */}
        {controlRequest && (
          <div
            className="p-4 rounded-lg border-2 animate-pulse"
            style={{ borderColor: COLORS.purple, backgroundColor: '#F5EEFF' }}
            role="alert"
            aria-label="Helper is requesting control"
          >
            <p className="font-semibold text-sm mb-2" style={{ color: COLORS.navy }}>
              Helper is requesting temporary control
            </p>
            {controlRequest.reason && (
              <p className="text-xs text-gray-600 mb-3">Reason: {controlRequest.reason}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => handleControlResponse(true)}
                className="px-4 py-2 rounded text-white text-sm font-medium focus:outline-2 focus:outline-offset-2"
                style={{ backgroundColor: '#5CB85C' }}
                aria-label="Accept control request"
              >
                Accept
              </button>
              <button
                onClick={() => handleControlResponse(false)}
                className="px-4 py-2 rounded text-white text-sm font-medium focus:outline-2 focus:outline-offset-2"
                style={{ backgroundColor: '#D9534F' }}
                aria-label="Deny control request"
              >
                Deny
              </button>
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Accessibility
          </h2>
          <AccessibilityToolbar />
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Description Level
          </h2>
          <GranularityController level={level} onLevelChange={setLevel} />
        </div>

        <div className="flex items-start gap-2">
          <div className="flex-1">
            <DescriptionPanel segment={currentSegment} level={level} />
          </div>
          {currentSegment && (
            <div className="pt-1">
              <FlagButton segmentId={currentSegment.id} level={level} />
            </div>
          )}
        </div>

        <VQAPanel onQuestion={onQuestion} />

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Editor
          </h2>
          <MockEditor
            segments={segments}
            initialSources={initialSources}
            currentTime={currentTime}
            onSeek={onSeek}
            onEditChange={onEditChange}
          />
        </div>

        <WorkspaceAwareness
          activities={helperActivities}
          title="Helper Activity"
        />
      </div>
    </div>
  );
}
