import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadDescriptions } from '../data/sampleDescriptions.js';
import { useEventLogger } from '../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../utils/eventTypes.js';
import { announce } from '../utils/announcer.js';
import { buildInitialSources, buildAllSegments, getTotalDuration } from '../utils/buildInitialSources.js';
import ConditionHeader from '../components/shared/ConditionHeader.jsx';
import OnboardingBrief from '../components/shared/OnboardingBrief.jsx';
import VideoPlayer from '../components/shared/VideoPlayer.jsx';
import VideoLibrary from '../components/probe1/VideoLibrary.jsx';
import ExplorationMode from '../components/probe1/ExplorationMode.jsx';
import ResearcherVQAPanel from '../components/probe1/ResearcherVQAPanel.jsx';

export default function Probe1Page() {
  const { setCondition, logEvent } = useEventLogger();
  const playerRef = useRef(null);
  const [searchParams] = useSearchParams();
  const isResearcher = searchParams.get('mode') === 'researcher';

  const [data, setData] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState(null);
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [editState, setEditState] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(true);

  // Phase: 'library' → 'exploring'
  const [phase, setPhase] = useState('library');
  const [selectedVideos, setSelectedVideos] = useState(null);
  const [marks, setMarks] = useState([]);

  useEffect(() => {
    setCondition('probe1');
    logEvent(EventTypes.CONDITION_START, Actors.SYSTEM, { condition: 'probe1' });
    loadDescriptions().then(setData).catch(console.error);
  }, [setCondition, logEvent]);

  // Build segments/sources from selected videos or full data
  const projectData = useMemo(() => {
    if (selectedVideos && data) {
      // Build a filtered data object with only selected videos
      return {
        videos: data.videos
          ? data.videos.filter((v) => selectedVideos.some((sv) => sv.id === v.id))
          : [data.video],
      };
    }
    return data;
  }, [data, selectedVideos]);

  const segments = useMemo(() => buildAllSegments(projectData), [projectData]);
  const videoDuration = useMemo(() => getTotalDuration(projectData), [projectData]);
  const initialSources = useMemo(() => buildInitialSources(projectData), [projectData]);

  const projectTitle = useMemo(() => {
    if (!projectData) return 'Untitled Video';
    if (projectData.videos && projectData.videos.length > 0) {
      return projectData.videos.map((v) => v.title).join(' + ');
    }
    return projectData.video?.title || 'Untitled Video';
  }, [projectData]);

  // All videos for the library
  const allVideos = useMemo(() => {
    if (!data) return [];
    if (data.videos) return data.videos;
    if (data.video) return [data.video];
    return [];
  }, [data]);

  const handleTimeUpdate = useCallback((time) => {
    setCurrentTime(time);
  }, []);

  const handleSegmentChange = useCallback((seg) => {
    setCurrentSegment(seg);
  }, []);

  const handleSeek = useCallback((time) => {
    playerRef.current?.seek(time);
  }, []);

  const handleImport = useCallback((videos) => {
    setSelectedVideos(videos);
    // Seed editState with sources and clips so VideoPlayer loads all videos immediately
    const SOURCE_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#84CC16'];
    const sources = [];
    const clips = [];
    videos.forEach((v, srcIdx) => {
      const color = SOURCE_COLORS[srcIdx % SOURCE_COLORS.length];
      sources.push({
        id: v.id,
        name: v.title || v.src?.split('/').pop() || 'Untitled',
        src: v.src,
        duration: v.duration,
      });
      const segs = v.segments || [];
      if (segs.length > 0) {
        segs.forEach((seg) => {
          clips.push({
            id: seg.id,
            sourceId: v.id,
            name: seg.name,
            startTime: seg.start_time,
            endTime: seg.end_time,
            color: seg.color || color,
            trimStart: 0,
            trimEnd: 0,
          });
        });
      } else {
        clips.push({
          id: `clip-${v.id}`,
          sourceId: v.id,
          name: v.title || 'Untitled',
          startTime: 0,
          endTime: v.duration || 0,
          color,
          trimStart: 0,
          trimEnd: 0,
        });
      }
    });
    setEditState({ clips, captions: [], sources });
    setPhase('exploring');
    logEvent(EventTypes.IMPORT_VIDEO, Actors.CREATOR, {
      videoIds: videos.map((v) => v.id),
      count: videos.length,
    });
    announce(`Project created with ${videos.length} video${videos.length > 1 ? 's' : ''}. Entering exploration mode.`);
  }, [logEvent]);

  const handleMark = useCallback((segmentId, segmentName) => {
    setMarks((prev) => {
      if (prev.some((m) => m.segmentId === segmentId)) {
        announce(`Mark removed from ${segmentName}`);
        return prev.filter((m) => m.segmentId !== segmentId);
      }
      announce(`Marked ${segmentName}`);
      return [...prev, { segmentId, segmentName, timestamp: Date.now() }];
    });
  }, []);

  // Track play/pause state and duration from video element
  useEffect(() => {
    if (phase !== 'exploring') return;
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const video = player.video;
      if (video) {
        setIsPlaying(!video.paused);
      }
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
  }, [phase, videoDuration]);

  return (
    <div className="min-h-screen bg-white">
      {showOnboarding && (
        <OnboardingBrief condition="probe1" onDismiss={() => setShowOnboarding(false)} />
      )}
      <ConditionHeader condition="probe1" />

      {phase === 'library' && (
        <VideoLibrary videos={allVideos} onImport={handleImport} />
      )}

      {phase === 'exploring' && (
        <div className="flex flex-col gap-3 p-3 max-w-lg mx-auto">
          {/* Video player — visual reference only, not navigable */}
          <div aria-hidden="true">
            <VideoPlayer
              ref={playerRef}
              src={projectData?.video?.src || projectData?.videos?.[0]?.src || null}
              segments={segments}
              onTimeUpdate={handleTimeUpdate}
              onSegmentChange={handleSegmentChange}
              editState={editState}
            />
          </div>

          {/* Exploration Mode — always active */}
          <ExplorationMode
            active={true}
            segments={segments}
            videoTitle={projectTitle}
            onExit={() => {}} // No exit in new flow
            onMark={handleMark}
            onEdit={() => {
              logEvent(EventTypes.OPEN_EDITOR, Actors.CREATOR);
            }}
            isPlaying={isPlaying}
            playerRef={playerRef}
            editState={editState}
            currentTime={currentTime}
            onSeek={handleSeek}
            onEditChange={(clips, captions, sources) => setEditState({ clips, captions, sources })}
          />

          {/* Marks list */}
          {marks.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wide mb-2">
                Marked Segments ({marks.length})
              </h2>
              <ul className="space-y-1" aria-label="Marked segments">
                {marks.map((mark) => (
                  <li key={mark.segmentId} className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true" />
                    {mark.segmentName}
                    <button
                      onClick={() => handleMark(mark.segmentId, mark.segmentName)}
                      className="ml-auto text-xs text-red-500 hover:text-red-700 focus:outline-2 focus:outline-red-400 px-2 py-1"
                      style={{ minHeight: '44px', minWidth: '44px' }}
                      aria-label={`Remove mark from ${mark.segmentName}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Researcher WoZ panel */}
      {isResearcher && (
        <div className="max-w-7xl mx-auto px-4 pb-4">
          <ResearcherVQAPanel
            segment={currentSegment}
            pendingQuestion={pendingQuestion}
          />
        </div>
      )}
    </div>
  );
}
