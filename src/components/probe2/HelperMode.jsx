import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';
import { buildAllSegments, getTotalDuration } from '../../utils/buildInitialSources.js';
import VideoPlayer from '../shared/VideoPlayer.jsx';
import TransportControls from '../shared/TransportControls.jsx';
import SegmentMarkerPanel from '../shared/SegmentMarkerPanel.jsx';
import MockEditorVisual from '../shared/MockEditorVisual.jsx';
import TaskQueue from './TaskQueue.jsx';
import TextOverlay from '../shared/TextOverlay.jsx';
import TextOverlaySettings from '../shared/TextOverlaySettings.jsx';
import useTextOverlay from '../../hooks/useTextOverlay.js';

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
  onReturnDevice,
  onTaskComplete,
  editState,
  onEditChange,
  initialSources = [],
}) {
  const { logEvent } = useEventLogger();
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
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnSummary, setReturnSummary] = useState('');
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

      {/* Mode Bar Card */}
      <div role="region" aria-label="Helper mode" className="rounded-2xl overflow-hidden mb-4" style={{ border: '1px solid rgba(230,126,34,0.25)', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.03)' }}>
        <div
          className="flex items-center gap-2.5 px-4 py-3"
          style={{ background: 'linear-gradient(135deg, #E67E22, #D35400)' }}
          role="status"
          aria-label="Helper mode active"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          <span className="text-white font-bold text-sm tracking-wide">
            Helper Mode {handoverMode === 'tasks' ? '— Task List' : '— Live'}
          </span>
        </div>
        <div className="px-4 py-3" style={{ background: '#fffcf8' }}>
          <button
            onClick={handleReturnClick}
            className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all duration-150 active:scale-[0.98] focus:outline-2 focus:outline-offset-2 focus:outline-blue-400"
            style={{ background: 'linear-gradient(135deg, #2B579A, #1e3f73)', boxShadow: '0 2px 8px rgba(43,87,154,0.3)', minHeight: '44px' }}
            aria-label="Return device to creator"
          >
            ↩ Return Device
          </button>
        </div>
      </div>

      {/* Task Queue Card */}
      {handoverMode === 'tasks' && tasks && tasks.length > 0 && (
        <div
          role="region"
          aria-label="Task queue from creator"
          className="rounded-2xl overflow-hidden mb-4"
          style={{ border: '1px solid rgba(230,126,34,0.2)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
        >
          <div className="px-4 py-2.5" style={{ background: '#fff8f1', borderBottom: '1px solid #fde8d0' }}>
            <span className="text-xs font-bold tracking-wider text-[#c2410c] uppercase">
              Creator's Tasks ({tasks.length})
            </span>
          </div>
          <div className="p-4 bg-white">
            <TaskQueue
              tasks={tasks}
              onTaskComplete={onTaskComplete}
              onPlayVoiceNote={handlePlayVoiceNote}
            />
          </div>
        </div>
      )}

      {/* Live Collaboration Card */}
      {handoverMode === 'live' && (
        <div
          role="region"
          aria-label="Live collaboration"
          className="rounded-2xl overflow-hidden mb-4"
          style={{ border: '1px solid rgba(43,87,154,0.15)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
        >
          <div className="px-4 py-2.5" style={{ background: '#f0f6ff', borderBottom: '1px solid #dbe9fe' }}>
            <span className="text-xs font-bold tracking-wider text-[#2B579A] uppercase">Live Collaboration</span>
          </div>
          <div className="p-4 bg-white">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" style={{ boxShadow: '0 0 6px rgba(16,185,129,0.4)' }} aria-hidden="true" />
              <p className="text-sm font-medium text-[#1e3a5f]">
                Creator is guiding you. Use the editor to make changes.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Video Editor Card */}
      <div role="region" aria-label="Video editor" className="rounded-2xl overflow-hidden" style={{ border: '1px solid #dfe4ea', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.03)' }}>
        <div className="px-4 py-2.5" style={{ background: '#f8f9fb', borderBottom: '1px solid #eef2f7' }}>
          <span className="text-xs font-bold tracking-wider text-[#64748b] uppercase">Video Editor</span>
        </div>
        <div className="flex flex-col">
          <div className="relative">
            <VideoPlayer
              ref={playerRef}
              src={videoData?.video?.src || null}
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
            playerRef={playerRef}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration || videoDuration}
          />
          <MockEditorVisual
            segments={segments}
            initialSources={initialSources}
            currentTime={currentTime}
            onSeek={onSeek}
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

      {/* Return Device Modal */}
      {showReturnModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}
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
          <div className="bg-white rounded-2xl w-full max-w-md mx-4 overflow-hidden" style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.1)' }}>
            <div
              className="px-6 py-5 rounded-t-2xl"
              style={{ background: 'linear-gradient(135deg, #1a2d4d, #152240)' }}
            >
              <h2 className="text-white font-bold text-lg">Return to Creator</h2>
              <p className="text-white/60 text-sm mt-1">Add a summary of what you did</p>
            </div>
            <div className="px-6 py-5">
              <textarea
                ref={returnModalFirstFocusRef}
                value={returnSummary}
                onChange={(e) => setReturnSummary(e.target.value)}
                placeholder="Describe what changes you made..."
                className="w-full px-3.5 py-2.5 rounded-xl text-sm resize-none transition-colors focus:outline-none focus:ring-2 focus:ring-[#2B579A]"
                style={{ border: '1px solid #e2e8f0', background: '#f8f9fb' }}
                rows={6}
                aria-label="Summary of actions taken"
              />
            </div>
            <div className="px-6 py-4 flex justify-end gap-3" style={{ borderTop: '1px solid #eef2f7' }}>
              <button
                onClick={() => {
                  setShowReturnModal(false);
                  setTimeout(() => { returnModalTriggerRef.current?.focus(); }, 50);
                }}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 transition-all duration-150 active:scale-[0.97] hover:bg-gray-100 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
                style={{ minHeight: '44px', minWidth: '44px', border: '1px solid #e2e8f0' }}
                aria-label="Cancel return"
              >
                Cancel
              </button>
              <button
                onClick={handleReturnConfirm}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-150 active:scale-[0.97] focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
                style={{ background: 'linear-gradient(135deg, #2B579A, #1e3f73)', boxShadow: '0 2px 8px rgba(43,87,154,0.3)', minHeight: '44px', minWidth: '44px' }}
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
