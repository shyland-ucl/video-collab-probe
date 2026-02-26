import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadDescriptions } from '../data/sampleDescriptions.js';
import { useEventLogger } from '../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../utils/eventTypes.js';
import { announce } from '../utils/announcer.js';
import { buildInitialSources, buildAllSegments, getTotalDuration } from '../utils/buildInitialSources.js';
import ConditionHeader from '../components/shared/ConditionHeader.jsx';
import VideoPlayer from '../components/shared/VideoPlayer.jsx';
import TransportControls from '../components/shared/TransportControls.jsx';
import Timeline from '../components/shared/Timeline.jsx';
import SegmentMarkerPanel from '../components/shared/SegmentMarkerPanel.jsx';
import AccessibilityToolbar from '../components/shared/AccessibilityToolbar.jsx';
import MockEditor from '../components/shared/MockEditor.jsx';
import ExplorationMode from '../components/probe1/ExplorationMode.jsx';
import VQAPanel from '../components/probe1/VQAPanel.jsx';
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

  // Exploration mode state
  const [explorationActive, setExplorationActive] = useState(false);
  const [marks, setMarks] = useState([]);

  // VQA panel visibility (triggered from exploration mode)
  const [showVQA, setShowVQA] = useState(false);
  const [vqaSegmentId, setVqaSegmentId] = useState(null);

  useEffect(() => {
    setCondition('probe1');
    logEvent(EventTypes.CONDITION_START, Actors.SYSTEM, { condition: 'probe1' });
    loadDescriptions().then(setData).catch(console.error);
  }, [setCondition, logEvent]);

  const segments = useMemo(() => buildAllSegments(data), [data]);
  const videoDuration = useMemo(() => getTotalDuration(data), [data]);
  const initialSources = useMemo(() => buildInitialSources(data), [data]);

  // Build a project title from all video titles
  const projectTitle = useMemo(() => {
    if (!data) return 'Untitled Video';
    if (data.videos && data.videos.length > 0) {
      return data.videos.map((v) => v.title).join(' + ');
    }
    return data.video?.title || 'Untitled Video';
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

  const handleQuestion = useCallback((question) => {
    setPendingQuestion(question);
  }, []);

  // Exploration mode handlers
  const handleToggleExploration = useCallback(() => {
    if (explorationActive) {
      setExplorationActive(false);
      announce('Exploration mode ended. Resuming playback.');
    } else {
      setExplorationActive(true);
    }
  }, [explorationActive]);

  const handleExplorationExit = useCallback(() => {
    setExplorationActive(false);
    playerRef.current?.play();
    announce('Resuming playback.');
  }, []);

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

  const handleAskFromExploration = useCallback((segmentId) => {
    setVqaSegmentId(segmentId);
    setShowVQA(true);
    announce('Ask a question about this scene.');
  }, []);

  // E key to toggle exploration mode
  useEffect(() => {
    function handleKeyDown(e) {
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        handleToggleExploration();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleExploration]);

  // Track play/pause state and duration from video element
  useEffect(() => {
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
  }, [videoDuration]);

  return (
    <div className="min-h-screen bg-white">
      <ConditionHeader condition="probe1" />

      <div className="flex flex-col lg:flex-row gap-4 p-4 max-w-7xl mx-auto">
        {/* Left column: Video + Exploration */}
        <div className="lg:w-3/5 flex flex-col gap-2" role="region" aria-label="Video player area">
          {/* Video with exploration mode border glow */}
          <div className={explorationActive ? 'ring-2 ring-blue-500 rounded-lg' : ''}>
            <VideoPlayer
              ref={playerRef}
              src={data?.video?.src || null}
              segments={segments}
              onTimeUpdate={handleTimeUpdate}
              onSegmentChange={handleSegmentChange}
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
                onSeek={handleSeek}
              />
              <SegmentMarkerPanel segment={currentSegment} />
            </>
          )}

          {/* Exploration Mode Panel */}
          <ExplorationMode
            active={explorationActive}
            segments={segments}
            videoTitle={projectTitle}
            onExit={handleExplorationExit}
            onMark={handleMark}
            onAskQuestion={handleAskFromExploration}
            playerRef={playerRef}
          />

          {/* Explore button (when not in exploration mode) */}
          {!explorationActive && (
            <button
              onClick={handleToggleExploration}
              className="w-full py-3 rounded-lg font-bold text-sm text-white transition-colors hover:brightness-110 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
              style={{ backgroundColor: '#2B579A', minHeight: '44px' }}
              aria-label="Enter visual exploration mode (press E)"
            >
              Explore Scenes (E)
            </button>
          )}
        </div>

        {/* Right column: Tools */}
        <div className="lg:w-2/5 flex flex-col gap-4" role="region" aria-label="Editing tools">
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Accessibility
            </h2>
            <AccessibilityToolbar />
          </div>

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

          {/* VQA Panel */}
          <VQAPanel onQuestion={handleQuestion} />

          {/* Mock Editor */}
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
        </div>
      </div>

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
