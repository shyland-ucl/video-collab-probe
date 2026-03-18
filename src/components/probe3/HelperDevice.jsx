import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';
import { buildAllSegments, getTotalDuration } from '../../utils/buildInitialSources.js';
import VideoPlayer from '../shared/VideoPlayer.jsx';
import TransportControls from '../shared/TransportControls.jsx';
import SegmentMarkerPanel from '../shared/SegmentMarkerPanel.jsx';
import MockEditorVisual from '../shared/MockEditorVisual.jsx';
import TaskQueue from '../probe2/TaskQueue.jsx';
import WorkspaceAwareness from './WorkspaceAwareness.jsx';
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
  // Handover props
  tasks = [],
  handoverMode = null,
  // Peer edit notification (visual toast)
  peerEditNotification = null,
}) {
  const { logEvent } = useEventLogger();
  const {
    textOverlays, activeOverlay, activeOverlayId, textToolActive,
    handleTextTool, handleTextMove, handleTextChange, handleTextApply, handleTextRemove,
  } = useTextOverlay();
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnSummary, setReturnSummary] = useState('');
  const returnModalTriggerRef = useRef(null);
  const returnModalFirstFocusRef = useRef(null);
  const audioRef = useRef(null);

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

  useEffect(() => {
    if (showReturnModal) {
      setTimeout(() => { returnModalFirstFocusRef.current?.focus(); }, 50);
    }
  }, [showReturnModal]);

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

  // Done / Return summary
  const handleReturnClick = useCallback(() => {
    returnModalTriggerRef.current = document.activeElement;
    setReturnSummary('');
    setShowReturnModal(true);
  }, []);

  const handleReturnConfirm = useCallback(() => {
    setShowReturnModal(false);
    if (webrtcService) {
      webrtcService.sendData({ type: 'RETURN_SUMMARY', summary: returnSummary, actor: 'HELPER' });
    }
    logEvent(EventTypes.HELPER_ACTION, Actors.HELPER, { action: 'return_device', summary: returnSummary });
    announce('Summary sent to creator');
  }, [returnSummary, webrtcService, logEvent]);

  // Play voice note from task
  const handlePlayVoiceNote = useCallback((task) => {
    if (!task.audioBlob) return;
    const url = URL.createObjectURL(task.audioBlob);
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.play();
    }
  }, []);

  const hasTasks = handoverMode === 'tasks' && tasks && tasks.length > 0;

  return (
    <div>
      {/* Hidden audio player */}
      <audio ref={audioRef} className="hidden" />

      {/* Peer edit toast notification */}
      {toastVisible && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white"
          style={{
            backgroundColor: '#2B579A',
            maxWidth: '90vw',
            animation: 'slideDown 0.3s ease-out',
          }}
          role="status"
          aria-live="polite"
        >
          {toastText}
        </div>
      )}

      {/* Mode Bar Card */}
      <div role="region" aria-label="Helper device" className="border-2 border-[#E67E22] rounded-xl overflow-hidden mb-4">
        <div
          className="flex items-center gap-2 px-4 py-2.5"
          style={{ backgroundColor: '#E67E22' }}
          role="status"
          aria-label="Helper device active"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" aria-hidden="true">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          <span className="text-white font-semibold text-sm">
            Helper Device {handoverMode === 'tasks' ? '— Tasks' : handoverMode === 'live' ? '— Live' : ''}
          </span>
        </div>
        <div className="px-4 py-3 bg-[#fff7ed]">
          <button
            onClick={handleReturnClick}
            className="w-full py-2.5 rounded-lg font-bold text-sm transition-colors hover:brightness-110 focus:outline-2 focus:outline-offset-2 focus:outline-blue-400"
            style={{ backgroundColor: '#2B579A', color: 'white', minHeight: '44px' }}
            aria-label="Send summary to creator"
          >
            ↩ Done
          </button>
        </div>
      </div>

      {/* Task Queue + Creator Activity Card */}
      <div role="region" aria-label="Tasks and creator activity" className="border-2 border-[#E67E22] rounded-xl overflow-hidden mb-4">
        {hasTasks && (
          <>
            <div className="bg-[#fff7ed] px-3 py-2.5 border-b border-[#fed7aa]">
              <span className="text-xs font-bold tracking-wide text-[#c2410c] uppercase">
                Creator's Tasks ({tasks.length})
              </span>
            </div>
            <div className="p-4">
              <TaskQueue
                tasks={tasks}
                onTaskComplete={() => {}}
                onPlayVoiceNote={handlePlayVoiceNote}
              />
            </div>
          </>
        )}
        {/* Creator Activity — folded into bottom of this card */}
        <div className={`px-4 py-3 bg-[#f3e8ff] ${hasTasks ? 'border-t border-[#fed7aa]' : ''}`}>
          <div className="font-semibold text-[#7c3aed] text-xs uppercase tracking-wide mb-2">Creator Activity</div>
          <WorkspaceAwareness
            activities={creatorActivities}
            title=""
          />
        </div>
      </div>

      {/* Live Collaboration Card */}
      {handoverMode === 'live' && (
        <div
          role="region"
          aria-label="Live collaboration"
          className="border-2 border-[#2B579A] rounded-xl overflow-hidden mb-4"
        >
          <div className="bg-[#eff6ff] px-3 py-2.5 border-b border-[#bfdbfe]">
            <span className="text-xs font-bold tracking-wide text-[#2B579A] uppercase">Live Collaboration</span>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse" aria-hidden="true" />
              <p className="text-sm font-medium" style={{ color: '#1F3864' }}>
                Creator is guiding you. Use the editor to make changes.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Video Editor Card */}
      <div role="region" aria-label="Video editor" className="border-2 border-[#64748b] rounded-xl overflow-hidden">
        <div className="bg-[#f1f5f9] px-3 py-2.5 border-b border-[#cbd5e1]">
          <span className="text-xs font-bold tracking-wide text-[#475569] uppercase">Video Editor</span>
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

      {/* Done / Return Summary Modal */}
      {showReturnModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-label="Send summary to creator"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setShowReturnModal(false);
              setTimeout(() => { returnModalTriggerRef.current?.focus(); }, 50);
            }
          }}
        >
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md mx-4">
            <div
              className="px-6 py-4 rounded-t-lg"
              style={{ backgroundColor: '#1F3864' }}
            >
              <h2 className="text-white font-bold text-lg">Done — Send Summary</h2>
              <p className="text-white/70 text-sm mt-1">Let the creator know what you did</p>
            </div>
            <div className="px-6 py-4">
              <textarea
                ref={returnModalFirstFocusRef}
                value={returnSummary}
                onChange={(e) => setReturnSummary(e.target.value)}
                placeholder="Describe what changes you made..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-none focus:outline-2 focus:outline-blue-500"
                rows={6}
                aria-label="Summary of actions taken"
              />
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowReturnModal(false);
                  setTimeout(() => { returnModalTriggerRef.current?.focus(); }, 50);
                }}
                className="px-4 py-2 rounded text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
                style={{ minHeight: '44px', minWidth: '44px' }}
                aria-label="Cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleReturnConfirm}
                className="px-5 py-2 rounded text-sm font-bold text-white transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
                style={{ backgroundColor: '#2B579A', minHeight: '44px', minWidth: '44px' }}
                aria-label="Send summary to creator"
              >
                Send Summary
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
