import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { loadDescriptions } from '../data/sampleDescriptions.js';
import { useEventLogger } from '../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../utils/eventTypes.js';
import { buildInitialSources, buildAllSegments, getTotalDuration } from '../utils/buildInitialSources.js';
import ConditionHeader from '../components/shared/ConditionHeader.jsx';
import VideoPlayer from '../components/shared/VideoPlayer.jsx';
import TransportControls from '../components/shared/TransportControls.jsx';
import Timeline from '../components/shared/Timeline.jsx';
import SegmentMarkerPanel from '../components/shared/SegmentMarkerPanel.jsx';
import AccessibilityToolbar from '../components/shared/AccessibilityToolbar.jsx';
import MockEditor from '../components/shared/MockEditor.jsx';

export default function BaselinePage() {
  const { setCondition, logEvent } = useEventLogger();
  const playerRef = useRef(null);

  const [data, setData] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState(null);
  const [editState, setEditState] = useState(null);

  useEffect(() => {
    setCondition('baseline');
    logEvent(EventTypes.CONDITION_START, Actors.SYSTEM, { condition: 'baseline' });
    loadDescriptions().then(setData).catch(console.error);
  }, [setCondition, logEvent]);

  const segments = useMemo(() => buildAllSegments(data), [data]);
  const videoDuration = useMemo(() => getTotalDuration(data), [data]);
  const initialSources = useMemo(() => buildInitialSources(data), [data]);

  const handleTimeUpdate = useCallback((time) => {
    setCurrentTime(time);
  }, []);

  const handleSegmentChange = useCallback((seg) => {
    setCurrentSegment(seg);
  }, []);

  const handleSeek = useCallback((time) => {
    playerRef.current?.seek(time);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const video = player.video;
      if (video) {
        setIsPlaying(!video.paused);
      }
      // Prefer EDL duration when engine is active
      const edlDur = player.edlDuration;
      if (edlDur && edlDur > 0) {
        setDuration(edlDur);
      } else if (video?.duration && isFinite(video.duration)) {
        setDuration(video.duration);
      } else if (videoDuration) {
        setDuration(videoDuration);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [videoDuration]);

  return (
    <div className="min-h-screen bg-white">
      <ConditionHeader condition="baseline" />

      <div className="flex flex-col lg:flex-row gap-4 p-4 max-w-7xl mx-auto">
        {/* Left column: Video */}
        <div className="lg:w-3/5 flex flex-col gap-2" role="region" aria-label="Video player area">
          <VideoPlayer
            ref={playerRef}
            src={data?.video?.src || null}
            segments={segments}
            onTimeUpdate={handleTimeUpdate}
            onSegmentChange={handleSegmentChange}
            editState={editState}
          />
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
            onSeek={handleSeek}
          />
          <SegmentMarkerPanel segment={currentSegment} />
        </div>

        {/* Right column: Tools */}
        <div className="lg:w-2/5 flex flex-col gap-4" role="region" aria-label="Editing tools">
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Accessibility
            </h2>
            <AccessibilityToolbar />
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Editor
            </h2>
            <MockEditor
              segments={segments}
              initialSources={initialSources}
              currentTime={currentTime}
              onSeek={handleSeek}
              onEditChange={(clips, captions, sources) => setEditState({ clips, captions, sources })}
            />
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
            <p className="font-medium mb-1">Baseline condition</p>
            <p>No AI descriptions available. This condition serves as a control, allowing the participant to work with the video using only the standard player controls and their own perception.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
