import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadDescriptions } from '../data/sampleDescriptions.js';
import { useEventLogger } from '../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../utils/eventTypes.js';
import { announce } from '../utils/announcer.js';
import { buildAllSegments, buildInitialSources, getTotalDuration } from '../utils/buildInitialSources.js';
import { buildProjectStats, buildSessionGuide } from '../utils/projectOverview.js';
import ConditionHeader from '../components/shared/ConditionHeader.jsx';
import OnboardingBrief from '../components/shared/OnboardingBrief.jsx';
import ResearcherVQAPanel from '../components/probe1/ResearcherVQAPanel.jsx';
import CreatorMode from '../components/probe2/CreatorMode.jsx';
import HelperMode from '../components/probe2/HelperMode.jsx';
import HandoverModeSelector from '../components/probe2/HandoverModeSelector.jsx';
import HandoverTransition from '../components/probe2/HandoverTransition.jsx';
import HandoverSuggestion from '../components/probe2/HandoverSuggestion.jsx';
import ResearcherHandoverPanel from '../components/probe2/ResearcherHandoverPanel.jsx';

export default function Probe2Page() {
  const { setCondition, logEvent } = useEventLogger();
  const playerRef = useRef(null);
  const [searchParams] = useSearchParams();
  const isResearcher = searchParams.get('mode') === 'researcher';

  // Video state
  const [data, setData] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState(null);
  const [pendingQuestion, setPendingQuestion] = useState(null);

  // Handover state
  const [mode, setMode] = useState('creator'); // 'creator' | 'helper'
  const [handoverMode, setHandoverMode] = useState(null); // 'tasks' | 'live' | null
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState(null);
  const [pendingSuggestion, setPendingSuggestion] = useState(null);
  const [editState, setEditState] = useState(null);

  // Onboarding
  const [showOnboarding, setShowOnboarding] = useState(true);

  // Marks (voice notes + segment markers)
  const [marks, setMarks] = useState([]);

  useEffect(() => {
    setCondition('probe2a');
    logEvent(EventTypes.CONDITION_START, Actors.SYSTEM, { condition: 'probe2a' });
    loadDescriptions().then(setData).catch(console.error);
  }, [setCondition, logEvent]);

  useEffect(() => {
    if (!data || editState) return;

    const SOURCE_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#84CC16'];
    const sources = buildInitialSources(data).map((source) => ({
      id: source.id,
      name: source.name,
      src: source.src,
      duration: source.duration,
    }));
    const clips = buildAllSegments(data).map((segment, index) => ({
      id: segment.id,
      sourceId: segment.sourceId || 'default',
      name: segment.name,
      startTime: segment.start_time,
      endTime: segment.end_time,
      color: segment.color || SOURCE_COLORS[index % SOURCE_COLORS.length],
      trimStart: 0,
      trimEnd: 0,
    }));

    setEditState({
      clips,
      captions: [],
      sources,
      textOverlays: [],
    });
  }, [data, editState]);

  const videoDuration = useMemo(() => getTotalDuration(data), [data]);
  const initialSources = useMemo(() => buildInitialSources(data), [data]);
  const onboardingGuide = useMemo(() => {
    if (!data) return null;
    return buildSessionGuide({
      condition: 'probe2',
      projectStats: buildProjectStats({
        projectData: data,
        editState,
        role: mode === 'helper' ? 'helper' : 'creator',
      }),
    });
  }, [data, editState, mode]);

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

  const handleEditChange = useCallback((clips, captions, sources, textOverlays) => {
    setEditState((prev) => ({
      clips,
      captions,
      sources,
      textOverlays: textOverlays ?? prev?.textOverlays ?? [],
    }));
  }, []);

  // Track play/pause state and duration
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

  // --- Marks management ---
  const handleAddMark = useCallback((mark) => {
    setMarks((prev) => [...prev, mark]);
  }, []);

  const handleDeleteMark = useCallback((markId) => {
    setMarks((prev) => prev.filter((m) => m.id !== markId));
  }, []);

  // --- Handover flow ---
  const handleInitiateHandover = useCallback(() => {
    logEvent(EventTypes.HANDOVER_INITIATED, Actors.CREATOR, { fromMode: 'creator', markCount: marks.length });
    setShowModeSelector(true);
  }, [logEvent, marks.length]);

  const handleSelectHandoverMode = useCallback((selectedMode) => {
    setShowModeSelector(false);
    setHandoverMode(selectedMode);

    if (selectedMode === 'tasks') {
      logEvent(EventTypes.HANDOVER_TASKS, Actors.CREATOR, { taskCount: marks.length });
    } else {
      logEvent(EventTypes.HANDOVER_LIVE, Actors.CREATOR);
    }

    // Start transition animation
    setTransitionDirection('toHelper');
    setIsTransitioning(true);
  }, [logEvent, marks.length]);

  const handleTransitionComplete = useCallback(() => {
    setIsTransitioning(false);
    if (transitionDirection === 'toHelper') {
      setMode('helper');
      setShowOnboarding(true);
      logEvent(EventTypes.HANDOVER_COMPLETED, Actors.SYSTEM, { toMode: 'helper', handoverMode });
      announce('Switched to Helper mode');
    } else {
      setMode('creator');
      setHandoverMode(null);
      logEvent(EventTypes.HANDOVER_COMPLETED, Actors.SYSTEM, { toMode: 'creator' });
      announce('Switched to Creator mode');
    }
    setTransitionDirection(null);
  }, [transitionDirection, handoverMode, logEvent]);

  const handleReturnDevice = useCallback((summary) => {
    logEvent(EventTypes.HELPER_ACTION, Actors.HELPER, { action: 'return_device', summary });
    setTransitionDirection('toCreator');
    setIsTransitioning(true);
  }, [logEvent]);

  const handleTaskComplete = useCallback((taskId, status) => {
    // Logged in TaskQueue component
  }, []);

  // --- WoZ suggestion flow ---
  const handleTriggerSuggestion = useCallback((text) => {
    setPendingSuggestion(text);
  }, []);

  const handleSuggestionAccept = useCallback(() => {
    setPendingSuggestion(null);
    handleInitiateHandover();
  }, [handleInitiateHandover]);

  const handleSuggestionDismiss = useCallback(() => {
    setPendingSuggestion(null);
  }, []);

  const modeLabel = mode === 'creator' ? 'Creator Mode' : `Helper Mode (${handoverMode || 'live'})`;

  return (
    <div className="min-h-screen bg-white">
      {showOnboarding && onboardingGuide && (
        <OnboardingBrief
          condition="probe2"
          guide={onboardingGuide}
          onDismiss={() => setShowOnboarding(false)}
        />
      )}
      <ConditionHeader condition="probe2" modeLabel={modeLabel} />

      <div className="p-3 max-w-lg mx-auto">
        {mode === 'creator' ? (
          <CreatorMode
            playerRef={playerRef}
            videoData={data}
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            currentSegment={currentSegment}
            onTimeUpdate={handleTimeUpdate}
            onSegmentChange={handleSegmentChange}
            onSeek={handleSeek}
            onQuestion={handleQuestion}
            onInitiateHandover={handleInitiateHandover}
            marks={marks}
            onAddMark={handleAddMark}
            onDeleteMark={handleDeleteMark}
            editState={editState}
            onEditChange={handleEditChange}
            initialSources={initialSources}
          />
        ) : (
          <HelperMode
            playerRef={playerRef}
            videoData={data}
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            currentSegment={currentSegment}
            handoverMode={handoverMode}
            tasks={marks}
            onTimeUpdate={handleTimeUpdate}
            onSegmentChange={handleSegmentChange}
            onSeek={handleSeek}
            onReturnDevice={handleReturnDevice}
            onTaskComplete={handleTaskComplete}
            editState={editState}
            onEditChange={handleEditChange}
            initialSources={initialSources}
          />
        )}
      </div>

      {/* Handover Mode Selector */}
      {showModeSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <HandoverModeSelector
            onSelectMode={handleSelectHandoverMode}
            onCancel={() => setShowModeSelector(false)}
            markCount={marks.length}
          />
        </div>
      )}

      {/* Handover Suggestion (slides in from top-right) */}
      {mode === 'creator' && (
        <HandoverSuggestion
          suggestion={pendingSuggestion}
          onAccept={handleSuggestionAccept}
          onDismiss={handleSuggestionDismiss}
        />
      )}

      {/* Transition animation */}
      {isTransitioning && transitionDirection && (
        <HandoverTransition
          direction={transitionDirection}
          onComplete={handleTransitionComplete}
        />
      )}

      {/* Researcher WoZ panels */}
      {isResearcher && (
        <div className="max-w-7xl mx-auto px-4 pb-4 space-y-4">
          <ResearcherVQAPanel
            segment={currentSegment}
            pendingQuestion={pendingQuestion}
          />
          <ResearcherHandoverPanel
            onTriggerSuggestion={handleTriggerSuggestion}
            currentMode={mode}
          />
        </div>
      )}
    </div>
  );
}
