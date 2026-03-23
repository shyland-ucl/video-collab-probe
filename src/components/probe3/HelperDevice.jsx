import { useState, useCallback, useEffect, useMemo } from 'react';
import { buildAllSegments, getTotalDuration } from '../../utils/buildInitialSources.js';
import VideoPlayer from '../shared/VideoPlayer.jsx';
import TransportControls from '../shared/TransportControls.jsx';
import SegmentMarkerPanel from '../shared/SegmentMarkerPanel.jsx';
import MockEditorVisual from '../shared/MockEditorVisual.jsx';
import ActivityFeed from './ActivityFeed.jsx';
import TextOverlay from '../shared/TextOverlay.jsx';
import TextOverlaySettings from '../shared/TextOverlaySettings.jsx';
import useTextOverlay from '../../hooks/useTextOverlay.js';

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
  editState,
  onEditChange,
  initialSources = [],
  // Activity feed props
  feedItems = [],
  onTaskStatus,
  onAIReview,
  onAIUndo,
  // Peer edit notification (visual toast)
  peerEditNotification = null,
}) {
  const {
    textOverlays, activeOverlay, activeOverlayId, textToolActive,
    handleTextTool, handleTextMove, handleTextChange, handleTextApply, handleTextRemove,
  } = useTextOverlay();
  const segments = useMemo(() => buildAllSegments(videoData), [videoData]);
  const videoDuration = useMemo(() => getTotalDuration(videoData), [videoData]);

  // Visual toast for peer edits — auto-dismiss after 3 seconds
  const [toastVisible, setToastVisible] = useState(false);
  const [toastText, setToastText] = useState('');
  useEffect(() => {
    if (!peerEditNotification) return;
    setToastText(peerEditNotification.text);
    setToastVisible(true);
    const timer = setTimeout(() => setToastVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [peerEditNotification]);

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

  // Handle seek
  const handleSeek = useCallback((time) => {
    onSeek(time);
    sendActivity('Seeked', `to ${Math.round(time)}s`);
  }, [onSeek, sendActivity]);

  return (
    <div>
      {/* Peer edit toast notification */}
      {toastVisible && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-2xl text-sm font-semibold text-white"
          style={{
            background: 'linear-gradient(135deg, #2B579A, #1e3f73)',
            maxWidth: '90vw',
            animation: 'slideDown 0.3s ease-out',
            boxShadow: '0 4px 16px rgba(43,87,154,0.35)',
          }}
          role="status"
          aria-live="polite"
        >
          {toastText}
        </div>
      )}

      {/* Activity Feed Card */}
      <div role="region" aria-label="Tasks and activity" className="rounded-2xl overflow-hidden mb-4" style={{ border: '1px solid rgba(230,126,34,0.2)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div className="px-4 py-2.5" style={{ background: '#fff8f1', borderBottom: '1px solid #fde8d0' }}>
          <span className="text-xs font-bold tracking-wider text-[#c2410c] uppercase">
            Activity Feed {feedItems.length > 0 ? `(${feedItems.length})` : ''}
          </span>
        </div>
        <ActivityFeed
          items={feedItems}
          creatorActivities={creatorActivities}
          onTaskStatus={onTaskStatus}
          onAIReview={onAIReview}
          onAIUndo={onAIUndo}
        />
      </div>

      {/* Video Editor Card */}
      <div role="region" aria-label="Video editor" className="rounded-2xl overflow-hidden" style={{ border: '1px solid #dfe4ea', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.03)' }}>
        <div className="px-4 py-2.5" style={{ background: '#f8f9fb', borderBottom: '1px solid #eef2f7' }}>
          <span className="text-xs font-bold tracking-wider text-[#64748b] uppercase">Video Editor</span>
        </div>
        <div className="flex flex-col">
          <div className="relative">
            <VideoPlayer
              ref={videoRef}
              src={videoData?.video?.src || videoData?.videos?.[0]?.src || null}
              segments={segments}
              onTimeUpdate={onTimeUpdate}
              onSegmentChange={onSegmentChange}
              editState={editState}
            />
            {textOverlays.map(overlay => (
              <TextOverlay
                key={overlay.id}
                overlay={overlay}
                isEditing={overlay.id === activeOverlayId}
                onMove={handleTextMove}
              />
            ))}
          </div>
          <TransportControls
            playerRef={videoRef}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration || videoDuration}
          />
          <MockEditorVisual
            segments={segments}
            initialSources={initialSources}
            currentTime={currentTime}
            onSeek={handleSeek}
            onEditChange={onEditChange}
            editState={editState}
            onTextTool={handleTextTool}
            textToolActive={textToolActive}
            clipPerSource
          />
          <SegmentMarkerPanel segment={currentSegment} />
        </div>
      </div>

      {/* Text Overlay Settings */}
      {activeOverlay && (
        <TextOverlaySettings
          overlay={activeOverlay}
          onChange={handleTextChange}
          onApply={handleTextApply}
          onRemove={handleTextRemove}
        />
      )}

    </div>
  );
}
