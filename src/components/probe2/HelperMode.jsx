import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';
import { buildAllSegments, getTotalDuration } from '../../utils/buildInitialSources.js';
import VideoPlayer from '../shared/VideoPlayer.jsx';
import TransportControls from '../shared/TransportControls.jsx';
import SegmentMarkerPanel from '../shared/SegmentMarkerPanel.jsx';
import MockEditorVisual from '../shared/MockEditorVisual.jsx';
import MockColourControls from '../shared/MockColourControls.jsx';
import MockFramingControls from '../shared/MockFramingControls.jsx';
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
  playbackEditState,
  videoFilter,
  colourValues,
  onColourAdjust,
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
  const returnModalTriggerRef = useRef(null);
  const returnModalFirstFocusRef = useRef(null);
  // Blocking dismiss-screen-reader modal — shown when HelperMode mounts so the
  // helper has to acknowledge before they can edit. We can't toggle the OS
  // screen reader from a web app; the modal coaches them through doing it.
  const [showDismissModal, setShowDismissModal] = useState(true);
  const dismissModalButtonRef = useRef(null);

  useEffect(() => {
    if (showReturnModal) {
      setTimeout(() => { returnModalFirstFocusRef.current?.focus(); }, 50);
    }
  }, [showReturnModal]);

  useEffect(() => {
    if (showDismissModal) {
      setTimeout(() => { dismissModalButtonRef.current?.focus(); }, 50);
    }
  }, [showDismissModal]);

  const segments = useMemo(() => buildAllSegments(videoData), [videoData]);
  const videoDuration = useMemo(() => getTotalDuration(videoData), [videoData]);

  const handleReturnClick = useCallback(() => {
    returnModalTriggerRef.current = document.activeElement;
    setShowReturnModal(true);
  }, []);

  const handleReturnConfirm = useCallback(() => {
    setShowReturnModal(false);
    // No typed summary — the helper tells the creator in person. We pass
    // a marker string so event logs still show that a return occurred.
    onReturnDevice('Spoken to creator in person');
  }, [onReturnDevice]);

  return (
    <div>

      {/* Minimal top bar: just the Return Device button. The mode title,
          Creator's Intent banner, and Task Queue are intentionally absent in
          2a — the creator already spoke the request to the helper, so on-
          screen task metadata is redundant. */}
      <div className="mb-4">
        <button
          onClick={handleReturnClick}
          className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all duration-150 active:scale-[0.98] focus:outline-2 focus:outline-offset-2 focus:outline-blue-400"
          style={{ background: 'linear-gradient(135deg, #2B579A, #1e3f73)', boxShadow: '0 2px 8px rgba(43,87,154,0.3)', minHeight: '48px' }}
          aria-label="Return device to creator"
        >
          <span aria-hidden="true">↩ </span>Return Device
        </button>
      </div>

      {/* Live Collaboration Card */}
      {handoverMode === 'live' && (
        <div
          role="region"
          aria-label="Live collaboration"
          className="rounded-2xl overflow-hidden mb-4"
          style={{ border: '1px solid rgba(43,87,154,0.15)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
        >
          <div className="px-4 py-2.5" style={{ background: '#f0f6ff', borderBottom: '1px solid #dbe9fe' }}>
            <h2 className="text-xs font-bold tracking-wider text-[#2B579A] uppercase">Live Collaboration</h2>
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
          <h2 className="text-xs font-bold tracking-wider text-[#64748b] uppercase">Video Editor</h2>
        </div>
        <div className="flex flex-col">
          <div className="relative">
            <VideoPlayer
              ref={playerRef}
              src={videoData?.video?.src || null}
              segments={segments}
              onTimeUpdate={onTimeUpdate}
              onSegmentChange={onSegmentChange}
              editState={playbackEditState || editState}
              videoFilter={videoFilter}
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
          <MockFramingControls />
        </div>
      </div>

      {/* Dismiss-screen-reader modal — blocks the helper UI until they
          confirm they've turned VoiceOver/TalkBack off (or chosen to keep
          using it). The web app cannot toggle the OS screen reader, so this
          is the only mechanism we have to nudge them. */}
      {showDismissModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dismiss-modal-title"
          aria-describedby="dismiss-modal-body"
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              dismissModalButtonRef.current?.focus();
            }
          }}
        >
          <div className="bg-white rounded-2xl w-full max-w-md mx-4 overflow-hidden" style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
            <div
              className="px-6 py-5"
              style={{ background: 'linear-gradient(135deg, #2B579A, #1e3f73)' }}
            >
              <h2 id="dismiss-modal-title" className="text-white font-bold text-lg">
                Helper: turn off the screen reader
              </h2>
              <p className="text-white/70 text-xs mt-1">Before you start editing</p>
            </div>
            <div id="dismiss-modal-body" className="px-6 py-5 space-y-3 text-sm text-gray-800">
              <p>
                <span className="font-bold">iPhone:</span> triple-click the side button (or home button on older models).
              </p>
              <p>
                <span className="font-bold">Android:</span> press and hold both volume keys for three seconds, or open Settings &rarr; Accessibility &rarr; TalkBack.
              </p>
              <p className="text-gray-600">
                When the screen reader is off, tap the button below to start editing.
              </p>
            </div>
            <div className="px-6 py-4" style={{ borderTop: '1px solid #eef2f7' }}>
              <button
                ref={dismissModalButtonRef}
                onClick={() => setShowDismissModal(false)}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all duration-150 active:scale-[0.98] focus:outline-2 focus:outline-offset-2 focus:outline-blue-400"
                style={{ background: 'linear-gradient(135deg, #2B579A, #1e3f73)', boxShadow: '0 2px 8px rgba(43,87,154,0.3)', minHeight: '48px' }}
                aria-label="Continue to editor"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Device Modal — symmetric to the handover. No typed summary;
          the helper tells the creator in person and turns the screen reader
          back on before passing the phone over. */}
      {showReturnModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="return-modal-title"
          aria-describedby="return-modal-body"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setShowReturnModal(false);
              setTimeout(() => { returnModalTriggerRef.current?.focus(); }, 50);
            }
            if (e.key === 'Tab') {
              const focusable = e.currentTarget.querySelectorAll('button, [tabindex]:not([tabindex="-1"])');
              if (focusable.length === 0) return;
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }
          }}
        >
          <div className="bg-white rounded-2xl w-full max-w-md mx-4 overflow-hidden" style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.1)' }}>
            <div
              className="px-6 py-5 rounded-t-2xl"
              style={{ background: 'linear-gradient(135deg, #1a2d4d, #152240)' }}
            >
              <h2 id="return-modal-title" className="text-white font-bold text-lg">Return phone to creator</h2>
              <p className="text-white/70 text-xs mt-1">Before you hand it back</p>
            </div>
            <div id="return-modal-body" className="px-6 py-5 space-y-3 text-sm text-gray-800">
              <p>Tell the creator out loud what you changed. Speak clearly so they can hear.</p>
              <p>
                Turn the screen reader back on before returning the phone:
              </p>
              <p>
                <span className="font-bold">iPhone:</span> triple-click the side button (or home button on older models).
              </p>
              <p>
                <span className="font-bold">Android:</span> press and hold both volume keys for three seconds, or open Settings &rarr; Accessibility &rarr; TalkBack.
              </p>
            </div>
            <div className="px-6 py-4 flex justify-end gap-3" style={{ borderTop: '1px solid #eef2f7' }}>
              <button
                onClick={() => {
                  setShowReturnModal(false);
                  setTimeout(() => { returnModalTriggerRef.current?.focus(); }, 50);
                }}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 transition-all duration-150 active:scale-[0.97] hover:bg-gray-100 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
                style={{ minHeight: '48px', minWidth: '44px', border: '1px solid #e2e8f0' }}
                aria-label="Cancel return"
              >
                Cancel
              </button>
              <button
                ref={returnModalFirstFocusRef}
                onClick={handleReturnConfirm}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-150 active:scale-[0.97] focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
                style={{ background: 'linear-gradient(135deg, #2B579A, #1e3f73)', boxShadow: '0 2px 8px rgba(43,87,154,0.3)', minHeight: '48px', minWidth: '44px' }}
                aria-label="Hand phone back to creator"
              >
                Hand back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
