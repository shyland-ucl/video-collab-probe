import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';
import { buildAllSegments, getTotalDuration } from '../../utils/buildInitialSources.js';
import VideoPlayer from '../shared/VideoPlayer.jsx';
import TransportControls from '../shared/TransportControls.jsx';

import SegmentMarkerPanel from '../shared/SegmentMarkerPanel.jsx';
import MockEditor from '../shared/MockEditor.jsx';
import TaskQueue from './TaskQueue.jsx';
import DescriptionPanel from '../probe1/DescriptionPanel.jsx';

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

export default function HelperMode({
  playerRef,
  videoData,
  currentTime,
  duration,
  isPlaying,
  currentSegment,
  handoverMode, // 'tasks' | 'live'
  tasks, // marks with voice notes (for task mode)
  onTimeUpdate,
  onSegmentChange,
  onSeek,
  onNotifyCreator,
  onReturnDevice,
  onTaskComplete,
  editState,
  onEditChange,
  initialSources = [],
}) {
  const { logEvent } = useEventLogger();
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnSummary, setReturnSummary] = useState('');
  const [descExpanded, setDescExpanded] = useState(false);
  const returnModalTriggerRef = useRef(null);
  const returnModalFirstFocusRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (showReturnModal) {
      setTimeout(() => { returnModalFirstFocusRef.current?.focus(); }, 50);
    }
  }, [showReturnModal]);

  const segments = useMemo(() => buildAllSegments(videoData), [videoData]);
  const videoDuration = useMemo(() => getTotalDuration(videoData), [videoData]);

  const handleNotify = useCallback(() => {
    playNotifyChime();
    logEvent(EventTypes.HELPER_ACTION, Actors.HELPER, { action: 'notify_creator' });
    announce('Creator notified');
    if (onNotifyCreator) onNotifyCreator();
  }, [logEvent, onNotifyCreator]);

  const handleReturnClick = useCallback(() => {
    returnModalTriggerRef.current = document.activeElement;
    setReturnSummary('');
    setShowReturnModal(true);
  }, []);

  const handleReturnConfirm = useCallback(() => {
    setShowReturnModal(false);
    onReturnDevice(returnSummary);
  }, [returnSummary, onReturnDevice]);

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

      {/* Mode indicator */}
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
          Helper Mode {handoverMode === 'tasks' ? '— Task List' : '— Live'}
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
            aria-label="Return device to creator"
          >
            Return Device
          </button>
        </div>
      </div>

      {/* Task Queue (for task-based handover) */}
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
            onTaskComplete={onTaskComplete}
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

      {/* Video + Tools */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Left column: Video */}
        <div className="lg:w-3/5 flex flex-col gap-2">
          <VideoPlayer
            ref={playerRef}
            src={videoData?.video?.src || null}
            segments={segments}
            onTimeUpdate={onTimeUpdate}
            onSegmentChange={onSegmentChange}
            editState={editState}
          />
          <TransportControls
            playerRef={playerRef}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration || videoDuration}
          />
          <MockEditor
            segments={segments}
            initialSources={initialSources}
            currentTime={currentTime}
            onSeek={onSeek}
            onEditChange={onEditChange}
          />
          <SegmentMarkerPanel segment={currentSegment} />
        </div>

        {/* Right column: Tools */}
        <div className="lg:w-2/5 flex flex-col gap-4">
          {/* Collapsible Level 1 descriptions */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <button
              onClick={() => setDescExpanded(!descExpanded)}
              className="w-full px-4 py-3 flex items-center justify-between text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
              aria-expanded={descExpanded}
              aria-controls="helper-descriptions"
            >
              <span>Video Descriptions (Overview)</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`transform transition-transform ${descExpanded ? 'rotate-180' : ''}`}
                aria-hidden="true"
              >
                <path d="M4 6l4 4 4-4" />
              </svg>
            </button>
            {descExpanded && (
              <div id="helper-descriptions" className="px-4 pb-4">
                <DescriptionPanel segment={currentSegment} level={1} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Return Device Modal */}
      {showReturnModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-label="Return device summary"
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
              <h2 className="text-white font-bold text-lg">Return to Creator</h2>
              <p className="text-white/70 text-sm mt-1">Add a summary of what you did</p>
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
                aria-label="Cancel return"
              >
                Cancel
              </button>
              <button
                onClick={handleReturnConfirm}
                className="px-5 py-2 rounded text-sm font-bold text-white transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
                style={{ backgroundColor: '#2B579A', minHeight: '44px', minWidth: '44px' }}
                aria-label="Confirm return to creator"
              >
                Confirm Return
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
