import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';
import { buildAllSegments, getTotalDuration, buildInitialSources } from '../../utils/buildInitialSources.js';
import VideoPlayer from '../shared/VideoPlayer.jsx';
import ExplorationMode from '../probe1/ExplorationMode.jsx';
import VoiceNoteRecorder from './VoiceNoteRecorder.jsx';
// MarkList removed — marks still logged but no longer shown in UI

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
  const computedSources = useMemo(() => buildInitialSources(videoData), [videoData]);
  const audioPlayerRef = useRef(null);

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
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onInitiateHandover]);

  const handleMarkFromExploration = useCallback((segmentId, segmentName) => {
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

  return (
    <div>
      {/* Hidden audio player for voice note playback */}
      <audio ref={audioPlayerRef} className="hidden" />

      {/* Mode Bar Card */}
      <div role="region" aria-label="Creator mode" className="border-2 border-[#2B579A] rounded-xl overflow-hidden mb-4">
        <div
          className="flex items-center gap-2 px-4 py-2.5"
          style={{ backgroundColor: '#2B579A' }}
        >
          <span className="text-white font-semibold text-sm" aria-hidden="true">Creator Mode</span>
          <button
            onClick={onInitiateHandover}
            className="ml-auto px-4 py-1.5 rounded font-bold text-sm text-white transition-colors hover:brightness-110 focus:outline-2 focus:outline-offset-2 focus:outline-orange-400"
            style={{ backgroundColor: '#E67E22', minHeight: '44px' }}
            aria-label="Hand over to helper"
          >
            Handover
          </button>
        </div>
      </div>

      {/* Voice Note Card (when marking a segment) */}
      {recordingForSegment && (
        <div role="region" aria-label="Voice note" className="border-2 border-[#f59e0b] rounded-xl overflow-hidden mb-4 bg-white">
          <div className="bg-[#fef3c7] px-3 py-2.5 border-b border-[#fde68a]">
            <span className="text-xs font-bold tracking-wide text-[#92400e] uppercase">Voice Note</span>
          </div>
          <div className="p-4">
            <h3 className="font-bold text-sm mb-2" style={{ color: '#1F3864' }}>
              {recordingForSegment.segmentName}
            </h3>
            <p className="text-xs text-gray-600 mb-3">
              Record a voice note explaining what needs to change, or skip to mark without audio.
            </p>
            <div className="flex items-center gap-3">
              <VoiceNoteRecorder onRecordingComplete={handleRecordingComplete} />
              <button
                onClick={handleMarkWithoutVoice}
                className="px-3 py-2 text-xs font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-gray-400"
                style={{ minHeight: '44px', minWidth: '44px' }}
                aria-label="Mark without voice note"
              >
                Skip
              </button>
              <button
                onClick={() => setRecordingForSegment(null)}
                className="px-3 py-2 text-xs font-medium rounded text-red-600 hover:bg-red-50 transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-red-400"
                style={{ minHeight: '44px', minWidth: '44px' }}
                aria-label="Cancel marking"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video player — visual only, not navigable */}
      <div aria-hidden="true">
        <VideoPlayer
          ref={playerRef}
          src={videoData?.video?.src || videoData?.videos?.[0]?.src || null}
          segments={segments}
          onTimeUpdate={onTimeUpdate}
          onSegmentChange={onSegmentChange}
          editState={editState}
        />
      </div>

      {/* Exploration Mode — always active */}
      <ExplorationMode
        active={true}
        segments={segments}
        videoTitle={videoData?.video?.title || videoData?.videos?.[0]?.title || 'Untitled Video'}
        onExit={() => {}}
        onMark={handleMarkFromExploration}
        onEdit={() => {
          logEvent(EventTypes.OPEN_EDITOR, Actors.CREATOR);
        }}
        isPlaying={isPlaying}
        playerRef={playerRef}
        editState={editState}
        currentTime={currentTime}
        onSeek={onSeek}
        onEditChange={onEditChange}
      />
    </div>
  );
}
