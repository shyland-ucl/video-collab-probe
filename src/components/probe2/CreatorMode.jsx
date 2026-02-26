import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';
import { buildAllSegments, getTotalDuration } from '../../utils/buildInitialSources.js';
import VideoPlayer from '../shared/VideoPlayer.jsx';
import TransportControls from '../shared/TransportControls.jsx';
import Timeline from '../shared/Timeline.jsx';
import SegmentMarkerPanel from '../shared/SegmentMarkerPanel.jsx';
import AccessibilityToolbar from '../shared/AccessibilityToolbar.jsx';
import MockEditor from '../shared/MockEditor.jsx';
import ExplorationMode from '../probe1/ExplorationMode.jsx';
import VQAPanel from '../probe1/VQAPanel.jsx';
import VoiceNoteRecorder from './VoiceNoteRecorder.jsx';
import MarkList from './MarkList.jsx';

export default function CreatorMode({
  playerRef,
  videoData,
  currentTime,
  duration,
  isPlaying,
  currentSegment,
  onTimeUpdate,
  onSegmentChange,
  onSeek,
  onQuestion,
  onInitiateHandover,
  marks,
  onAddMark,
  onDeleteMark,
  editState,
  onEditChange,
  initialSources = [],
}) {
  const { logEvent } = useEventLogger();
  const segments = useMemo(() => buildAllSegments(videoData), [videoData]);
  const videoDuration = useMemo(() => getTotalDuration(videoData), [videoData]);
  const audioPlayerRef = useRef(null);

  // Exploration mode
  const [explorationActive, setExplorationActive] = useState(false);
  // Track which segment we're marking a voice note for
  const [recordingForSegment, setRecordingForSegment] = useState(null);

  // Keyboard shortcut: H for handover
  useEffect(() => {
    function handleKeyDown(e) {
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        onInitiateHandover();
      }
      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        setExplorationActive((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onInitiateHandover]);

  const handleExplorationExit = useCallback(() => {
    setExplorationActive(false);
    playerRef.current?.play();
    announce('Resuming playback.');
  }, [playerRef]);

  const handleMarkFromExploration = useCallback((segmentId, segmentName) => {
    // When marking from exploration, open voice note recorder
    setRecordingForSegment({ segmentId, segmentName });
    announce(`Recording voice note for ${segmentName}. Press the record button.`);
  }, []);

  const handleRecordingComplete = useCallback((blob, audioDuration) => {
    if (!recordingForSegment) return;
    const mark = {
      id: `mark-${Date.now()}`,
      segmentId: recordingForSegment.segmentId,
      segmentName: recordingForSegment.segmentName,
      audioBlob: blob,
      audioDuration,
      timestamp: Date.now(),
    };
    logEvent(EventTypes.RECORD_VOICE_NOTE, Actors.CREATOR, {
      segmentId: mark.segmentId,
      duration: audioDuration,
    });
    onAddMark(mark);
    setRecordingForSegment(null);
    announce(`Voice note saved for ${mark.segmentName}`);
  }, [recordingForSegment, logEvent, onAddMark]);

  const handleMarkWithoutVoice = useCallback(() => {
    if (!recordingForSegment) return;
    const mark = {
      id: `mark-${Date.now()}`,
      segmentId: recordingForSegment.segmentId,
      segmentName: recordingForSegment.segmentName,
      audioBlob: null,
      audioDuration: 0,
      timestamp: Date.now(),
    };
    onAddMark(mark);
    setRecordingForSegment(null);
    announce(`Marked ${mark.segmentName} without voice note`);
  }, [recordingForSegment, onAddMark]);

  const handlePlayVoiceNote = useCallback((mark) => {
    if (!mark.audioBlob) return;
    const url = URL.createObjectURL(mark.audioBlob);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.src = url;
      audioPlayerRef.current.play();
    }
    logEvent(EventTypes.PLAY_VOICE_NOTE, Actors.CREATOR, {
      markId: mark.id,
      segmentId: mark.segmentId,
    });
  }, [logEvent]);

  const handleDeleteMark = useCallback((markId) => {
    logEvent(EventTypes.DELETE_MARK, Actors.CREATOR, { markId });
    onDeleteMark(markId);
  }, [logEvent, onDeleteMark]);

  const handleAskFromExploration = useCallback((segmentId) => {
    announce('Ask a question about this scene.');
  }, []);

  return (
    <div>
      {/* Hidden audio player for voice note playback */}
      <audio ref={audioPlayerRef} className="hidden" />

      {/* Mode indicator */}
      <div
        className="flex items-center gap-2 px-4 py-2 mb-4 rounded-lg"
        style={{ backgroundColor: '#2B579A' }}
        role="status"
        aria-label="Creator mode active"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span className="text-white font-semibold text-sm">Creator Mode</span>
        <span className="ml-auto flex gap-2">
          <button
            onClick={() => setExplorationActive((prev) => !prev)}
            className="px-3 py-1.5 rounded font-medium text-sm text-white border border-white/50 hover:bg-white/20 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-white"
            style={{ minHeight: '44px' }}
            aria-label={explorationActive ? 'Exit exploration mode (E)' : 'Explore scenes (E)'}
          >
            {explorationActive ? 'Exit Explore' : 'Explore (E)'}
          </button>
          <button
            onClick={onInitiateHandover}
            className="px-4 py-1.5 rounded font-bold text-sm text-white transition-colors hover:brightness-110 focus:outline-2 focus:outline-offset-2 focus:outline-orange-400"
            style={{ backgroundColor: '#E67E22', minHeight: '44px' }}
            aria-label="Initiate handover to helper (press H)"
            title="Hand over to helper (H)"
          >
            Handover (H)
          </button>
        </span>
      </div>

      {/* Voice Note Recording overlay (when marking a segment) */}
      {recordingForSegment && (
        <div role="dialog" aria-modal="false" aria-label={`Voice note for ${recordingForSegment.segmentName}`} className="mb-4 p-4 border-2 border-amber-400 bg-amber-50 rounded-lg">
          <h3 className="font-bold text-sm mb-2" style={{ color: '#1F3864' }}>
            Voice Note for: {recordingForSegment.segmentName}
          </h3>
          <p className="text-xs text-gray-600 mb-3">
            Record a voice note explaining what needs to change, or skip to mark without audio.
          </p>
          <div className="flex items-center gap-3">
            <VoiceNoteRecorder onRecordingComplete={handleRecordingComplete} />
            <button
              onClick={handleMarkWithoutVoice}
              className="px-3 py-2 text-xs font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-gray-400"
              aria-label="Mark without voice note"
            >
              Skip
            </button>
            <button
              onClick={() => setRecordingForSegment(null)}
              className="px-3 py-2 text-xs font-medium rounded text-red-600 hover:bg-red-50 transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-red-400"
              aria-label="Cancel marking"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Left column: Video */}
        <div className="lg:w-3/5 flex flex-col gap-2">
          <div className={explorationActive ? 'ring-2 ring-blue-500 rounded-lg' : ''}>
            <VideoPlayer
              ref={playerRef}
              src={videoData?.video?.src || null}
              segments={segments}
              onTimeUpdate={onTimeUpdate}
              onSegmentChange={onSegmentChange}
              editState={editState}
            />
          </div>

          {!explorationActive && (
            <>
              <TransportControls
                playerRef={playerRef}
                isPlaying={isPlaying}
                currentTime={currentTime}
                duration={duration || videoDuration}
              />
              <Timeline
                segments={segments}
                currentTime={currentTime}
                duration={duration || videoDuration}
                onSeek={onSeek}
              />
              <SegmentMarkerPanel segment={currentSegment} />
            </>
          )}

          <ExplorationMode
            active={explorationActive}
            segments={segments}
            videoTitle={videoData?.video?.title || 'Untitled Video'}
            onExit={handleExplorationExit}
            onMark={handleMarkFromExploration}
            onAskQuestion={handleAskFromExploration}
            playerRef={playerRef}
          />
        </div>

        {/* Right column: Tools */}
        <div className="lg:w-2/5 flex flex-col gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Accessibility
            </h2>
            <AccessibilityToolbar />
          </div>

          {/* Marks */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wide mb-3">
              Marked Segments ({marks?.length || 0})
            </h2>
            <MarkList
              marks={marks || []}
              onDelete={handleDeleteMark}
              onPlayVoiceNote={handlePlayVoiceNote}
            />
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
        </div>
      </div>
    </div>
  );
}
