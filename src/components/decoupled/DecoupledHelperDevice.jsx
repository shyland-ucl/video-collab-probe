import { useState, useCallback, useEffect, useMemo } from 'react';
import { buildAllSegments, getTotalDuration } from '../../utils/buildInitialSources.js';
import { Actors } from '../../utils/eventTypes.js';
import VideoPlayer from '../shared/VideoPlayer.jsx';
import TransportControls from '../shared/TransportControls.jsx';
import SegmentMarkerPanel from '../shared/SegmentMarkerPanel.jsx';
import MockEditorVisual from '../shared/MockEditorVisual.jsx';
import MockColourControls from '../shared/MockColourControls.jsx';
import ActivityFeed from '../probe3/ActivityFeed.jsx';
import TextOverlay from '../shared/TextOverlay.jsx';
import TextOverlaySettings from '../shared/TextOverlaySettings.jsx';
import useTextOverlay from '../../hooks/useTextOverlay.js';

export default function DecoupledHelperDevice({
  condition = 'probe2b',
  accentColor = '#5CB85C',
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
  playbackEditState,
  videoFilter,
  colourValues,
  onColourAdjust,
  onEditChange,
  initialSources = [],
  feedItems = [],
  onTaskStatus,
  onAIReview,
  onAIUndo,
  peerEditNotification = null,
  onSuggestionResponse,
  children,
}) {
  const handleOverlayChange = useCallback((nextTextOverlays) => {
    onEditChange?.(
      editState?.clips || [],
      editState?.captions || [],
      editState?.sources || [],
      nextTextOverlays,
    );
  }, [editState, onEditChange]);

  const {
    textOverlays, activeOverlay, activeOverlayId, textToolActive,
    handleTextTool, handleTextMove, handleTextChange, handleTextApply, handleTextRemove,
  } = useTextOverlay({
    initialOverlays: editState?.textOverlays || [],
    onOverlaysChange: handleOverlayChange,
  });
  const segments = useMemo(() => buildAllSegments(videoData), [videoData]);
  const videoDuration = useMemo(() => getTotalDuration(videoData), [videoData]);

  // Visual toast for peer edits
  const [toastVisible, setToastVisible] = useState(false);
  const [toastText, setToastText] = useState('');
  useEffect(() => {
    if (!peerEditNotification) return;
    setToastText(peerEditNotification.text);
    setToastVisible(true);
    const timer = setTimeout(() => setToastVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [peerEditNotification]);

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
            background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
            maxWidth: '90vw',
            animation: 'slideDown 0.3s ease-out',
            boxShadow: `0 4px 16px ${accentColor}59`,
          }}
          role="status"
          aria-live="polite"
        >
          {toastText}
        </div>
      )}

      {/* Probe-specific extensions at top (e.g., suggestion routed tasks in Probe 3) */}
      {children}

      {/* Creator Intent Banner — shows most recent unfinished task from feed */}
      {feedItems.length > 0 && (() => {
        const activeTask = [...feedItems].reverse().find((t) => t.type === 'task' && (!t.status || t.status === 'pending' || t.status === 'sent'));
        if (!activeTask) return null;
        return (
          <div
            role="region"
            aria-label="Creator's current request"
            className="rounded-xl px-4 py-3 mb-4 border-l-4"
            style={{ borderColor: '#E67E22', backgroundColor: '#FFF8F1' }}
          >
            <p className="text-xs font-bold text-orange-700 uppercase tracking-wider mb-1">Creator's Intent</p>
            <p className="text-sm text-gray-800 font-medium">{activeTask.instruction || activeTask.text || activeTask.segmentName || 'Task from creator'}</p>
            {activeTask.category && (
              <div className="flex gap-2 mt-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{activeTask.category}</span>
                {activeTask.priority && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{activeTask.priority}</span>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Activity Feed Card */}
      <div role="region" aria-label="Tasks and activity" className="rounded-2xl overflow-hidden mb-4" style={{ border: '1px solid rgba(230,126,34,0.2)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div className="px-4 py-2.5" style={{ background: '#fff8f1', borderBottom: '1px solid #fde8d0' }}>
          <h2 className="text-xs font-bold tracking-wider text-[#c2410c] uppercase">
            Activity Feed {feedItems.length > 0 ? `(${feedItems.length})` : ''}
          </h2>
        </div>
        <ActivityFeed
          items={feedItems}
          creatorActivities={creatorActivities}
          onTaskStatus={onTaskStatus}
          onAIReview={onAIReview}
          onAIUndo={onAIUndo}
          onSuggestionResponse={onSuggestionResponse}
        />
      </div>

      {/* Video Editor Card */}
      <div role="region" aria-label="Video editor" className="rounded-2xl overflow-hidden" style={{ border: '1px solid #dfe4ea', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.03)' }}>
        <div className="px-4 py-2.5" style={{ background: '#f8f9fb', borderBottom: '1px solid #eef2f7' }}>
          <h2 className="text-xs font-bold tracking-wider text-[#64748b] uppercase">Video Editor</h2>
        </div>
        <div className="flex flex-col">
          <div className="relative">
            <VideoPlayer
              ref={videoRef}
              src={videoData?.video?.src || videoData?.videos?.[0]?.src || null}
              segments={segments}
              onTimeUpdate={onTimeUpdate}
              onSegmentChange={onSegmentChange}
              editState={playbackEditState || editState}
              videoFilter={videoFilter}
              actor={Actors.HELPER}
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
            actor={Actors.HELPER}
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

      {/* Colour & Framing Controls */}
      <div
        role="region"
        aria-label="Visual adjustments"
        className="rounded-2xl overflow-hidden mt-4 mb-4"
        style={{ border: '1px solid #dfe4ea', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
      >
        <div className="px-4 py-2.5" style={{ background: '#f8f9fb', borderBottom: '1px solid #eef2f7' }}>
          <h2 className="text-xs font-bold tracking-wider text-[#64748b] uppercase">Visual Adjustments</h2>
        </div>
        <div className="p-4 bg-white space-y-4">
          <MockColourControls values={colourValues} onAdjust={onColourAdjust} />
        </div>
      </div>
    </div>
  );
}
