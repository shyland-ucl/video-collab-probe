import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
  const {
    textOverlays, activeOverlay, activeOverlayId, textToolActive,
    handleTextTool, handleTextMove, handleTextChange, handleTextApply, handleTextRemove,
  } = useTextOverlay();
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

    </div>
  );
}
