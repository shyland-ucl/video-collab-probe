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

function playNotifyChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.15].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(i === 0 ? 523 : 659, ctx.currentTime + offset);
      gain.gain.setValueAtTime(0.3, ctx.currentTime + offset);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + offset + 0.2);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.2);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch {
    // Audio not supported
  }
}

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
  // Handover props
  tasks = [],
  handoverMode = null,
  // Peer edit notification (visual toast)
  peerEditNotification = null,
}) {
  const { logEvent } = useEventLogger();
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

  // Handle seek (in independent mode, does not sync to creator)
  const handleSeek = useCallback((time) => {
    onSeek(time);
    if (independentMode) {
      sendActivity('Seeked independently', `to ${Math.round(time)}s`);
    }
  }, [onSeek, independentMode, sendActivity]);

  // Toggle independent mode
  const handleToggleIndependent = useCallback(() => {
    onToggleIndependentMode();
    sendActivity(
      independentMode ? 'Returned to sync mode' : 'Entered independent mode',
      ''
    );
  }, [onToggleIndependentMode, independentMode, sendActivity]);

  // Notify Creator via WebSocket
  const handleNotify = useCallback(() => {
    playNotifyChime();
    if (webrtcService) {
      webrtcService.sendData({ type: 'NOTIFY_CREATOR', actor: 'HELPER' });
    }
    logEvent(EventTypes.HELPER_ACTION, Actors.HELPER, { action: 'notify_creator' });
    announce('Creator notified');
  }, [logEvent, webrtcService]);

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

      {/* Mode indicator bar — matches Probe 2 HelperMode */}
      <div
        className="flex items-center gap-2 px-4 py-2 mb-4 rounded-lg"
        style={{ backgroundColor: '#E67E22' }}
        role="status"
        aria-label="Helper mode active"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" aria-hidden="true">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <span className="text-white font-semibold text-sm">
          Helper Mode {handoverMode === 'tasks' ? '— Task List' : handoverMode === 'live' ? '— Live' : ''}
        </span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={handleNotify}
            className="px-3 py-1.5 rounded font-medium text-sm text-white border border-white/50 hover:bg-white/20 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-white"
            style={{ minHeight: '44px' }}
            aria-label="Notify creator"
          >
            Notify Creator
          </button>
          <button
            onClick={handleReturnClick}
            className="px-4 py-1.5 rounded font-bold text-sm transition-colors hover:brightness-110 focus:outline-2 focus:outline-offset-2 focus:outline-blue-400"
            style={{ backgroundColor: '#2B579A', color: 'white', minHeight: '44px' }}
            aria-label="Send summary to creator"
          >
            Done
          </button>
        </div>
      </div>

      {/* Task Queue — when creator sent tasks */}
      {handoverMode === 'tasks' && tasks && tasks.length > 0 && (
        <div
          className="sticky top-0 z-10 border-2 rounded-lg p-4 mb-4 shadow-md"
          style={{ borderColor: '#E67E22', backgroundColor: '#FFF8F0' }}
          aria-label="Task queue from creator"
        >
          <h3 className="font-bold text-sm mb-3" style={{ color: '#1F3864' }}>
            Creator's Tasks ({tasks.length})
          </h3>
          <TaskQueue
            tasks={tasks}
            onTaskComplete={() => {}}
            onPlayVoiceNote={handlePlayVoiceNote}
          />
        </div>
      )}

      {/* Live mode info banner */}
      {handoverMode === 'live' && (
        <div
          className="border-2 rounded-lg p-4 mb-4 shadow-md"
          style={{ borderColor: '#2B579A', backgroundColor: '#F0F4FF' }}
          aria-label="Live collaboration active"
        >
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse" aria-hidden="true" />
            <p className="text-sm font-medium" style={{ color: '#1F3864' }}>
              Live collaboration — Creator is guiding you. Use the editor to make changes.
            </p>
          </div>
        </div>
      )}

      {/* Sync/Independent toggle + status */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={handleToggleIndependent}
          className="px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors focus:outline-2 focus:outline-offset-2"
          style={{ backgroundColor: independentMode ? '#6B7280' : '#9B59B6', minHeight: '44px' }}
          aria-pressed={independentMode}
          aria-label={independentMode ? 'Return to synced mode' : 'Enter independent mode'}
        >
          {independentMode ? 'Return to Sync' : 'Independent Mode'}
        </button>
        <div
          className="ml-auto px-2 py-1 rounded text-xs font-semibold text-white"
          style={{ backgroundColor: independentMode ? '#9B59B6' : '#5CB85C' }}
          aria-label={independentMode ? 'Independent mode active' : 'Synced with creator'}
        >
          {independentMode ? 'Independent' : 'Synced'}
        </div>
      </div>

      {/* Video + Editor — mobile stacked layout */}
      <div className="flex flex-col gap-2">
        <VideoPlayer
          ref={videoRef}
          src={videoData?.video?.src || videoData?.videos?.[0]?.src || null}
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
        <MockEditorVisual
          segments={segments}
          initialSources={initialSources}
          currentTime={currentTime}
          onSeek={handleSeek}
          onEditChange={onEditChange}
          editState={editState}
        />
        <SegmentMarkerPanel segment={currentSegment} />
      </div>

      {/* Creator Activity Feed */}
      <div className="mt-4">
        <WorkspaceAwareness
          activities={creatorActivities}
          title="Creator Activity"
        />
      </div>

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
