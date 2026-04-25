import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadDescriptions } from '../data/sampleDescriptions.js';
import { loadPipelineVideos } from '../services/pipelineApi.js';
import { useEventLogger } from '../contexts/EventLoggerContext.jsx';
import { useAccessibility } from '../contexts/AccessibilityContext.jsx';
import { EventTypes, Actors } from '../utils/eventTypes.js';
import { announce } from '../utils/announcer.js';
import { buildAllSegments, buildInitialSources, getTotalDuration } from '../utils/buildInitialSources.js';
import { filterAssignedPipelineVideos, getAssignedPipelineProjectIds, getSessionDyadId } from '../utils/pipelineAssignments.js';
import { captureFrame, askGemini } from '../services/geminiService.js';
import ttsService from '../services/ttsService.js';
import ConditionHeader from '../components/shared/ConditionHeader.jsx';
import OnboardingBrief from '../components/shared/OnboardingBrief.jsx';
import VideoPlayer from '../components/shared/VideoPlayer.jsx';
import VideoLibrary from '../components/probe1/VideoLibrary.jsx';
import SceneBlockList from '../components/shared/SceneBlockList.jsx';
import Probe2aSceneActions from '../components/probe2/Probe2aSceneActions.jsx';
import HelperMode from '../components/probe2/HelperMode.jsx';
import HandoverTransition from '../components/probe2/HandoverTransition.jsx';
import HandoverSuggestion from '../components/probe2/HandoverSuggestion.jsx';
import ResearcherVQAPanel from '../components/probe1/ResearcherVQAPanel.jsx';
import ResearcherHandoverPanel from '../components/probe2/ResearcherHandoverPanel.jsx';

export default function Probe2Page() {
  const { setCondition, logEvent } = useEventLogger();
  const { audioEnabled, speechRate } = useAccessibility();
  const playerRef = useRef(null);
  const [searchParams] = useSearchParams();
  const isResearcher = searchParams.get('mode') === 'researcher';

  const [data, setData] = useState(null);
  const [pipelineVideos, setPipelineVideos] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState(null);
  const [pendingQuestion, setPendingQuestion] = useState(null);

  // Phase: 'library' (creator picks footage) → 'exploring' (rest of probe)
  // Library phase mirrors Probes 1 / 2b / 3 so the dyad chooses what to edit
  // before the handover flow begins. B3-with-library / M5 fix.
  const [phase, setPhase] = useState('library');
  const [selectedVideos, setSelectedVideos] = useState(null);

  // Handover state
  const [mode, setMode] = useState('creator');
  const [handoverMode, setHandoverMode] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState(null);
  const [pendingSuggestion, setPendingSuggestion] = useState(null);
  const [editState, setEditState] = useState(null);
  const [tasks, setTasks] = useState([]); // Intent-locked tasks for helper
  const [vqaHistories, setVqaHistories] = useState({});
  const [keptScenes, setKeptScenes] = useState({}); // sceneId → boolean

  useEffect(() => {
    setCondition('probe2a');
    logEvent(EventTypes.CONDITION_START, Actors.SYSTEM, { condition: 'probe2a' });
    loadDescriptions().then(setData).catch(console.error);
    loadPipelineVideos().then(setPipelineVideos).catch(() => {});
  }, [setCondition, logEvent]);

  // Pipeline-video assignment filter for the current dyad — same convention
  // as Probes 1, 2b, 3.
  const sessionDyadId = useMemo(() => {
    return getSessionDyadId();
  }, []);

  const assignedProjectIds = useMemo(() => {
    return getAssignedPipelineProjectIds(sessionDyadId);
  }, [sessionDyadId]);

  // Library candidates: pipeline (filtered by assignment) + sample.
  const libraryVideos = useMemo(() => {
    const sampleVideos = data ? (data.videos || (data.video ? [data.video] : [])) : [];
    const filteredPipeline = filterAssignedPipelineVideos(pipelineVideos, assignedProjectIds);
    return [...filteredPipeline, ...sampleVideos];
  }, [data, pipelineVideos, assignedProjectIds]);

  // The "active" project data — once a selection has been imported, narrow
  // to it; otherwise use the full sample dataset (used during the library
  // phase for thumbnails and metadata).
  const projectData = useMemo(() => {
    if (selectedVideos) return { videos: selectedVideos };
    return data;
  }, [data, selectedVideos]);

  const segments = useMemo(() => buildAllSegments(projectData), [projectData]);
  const initialSources = useMemo(() => buildInitialSources(projectData), [projectData]);
  const videoDuration = useMemo(() => getTotalDuration(projectData), [projectData]);
  const projectTitle = useMemo(() => {
    if (!projectData) return 'Untitled Video';
    if (projectData.videos?.length > 0) return projectData.videos.map((v) => v.title).join(' + ');
    return projectData.video?.title || 'Untitled Video';
  }, [projectData]);

  // Build editState from the imported selection. Runs once when selectedVideos
  // is first set; subsequent edits flow through handleEditChange.
  const handleImport = useCallback((videos) => {
    const SOURCE_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];
    const sources = [];
    const clips = [];
    videos.forEach((v, srcIdx) => {
      const color = SOURCE_COLORS[srcIdx % SOURCE_COLORS.length];
      sources.push({ id: v.id, name: v.title || 'Untitled', src: v.src, duration: v.duration });
      const segs = v.segments || [];
      if (segs.length > 0) {
        segs.forEach((seg) => {
          clips.push({
            id: seg.id, sourceId: v.id, name: seg.name,
            startTime: seg.start_time, endTime: seg.end_time,
            color: seg.color || color, trimStart: 0, trimEnd: 0,
          });
        });
      } else {
        clips.push({
          id: `clip-${v.id}`, sourceId: v.id, name: v.title || 'Untitled',
          startTime: 0, endTime: v.duration || 0, color, trimStart: 0, trimEnd: 0,
        });
      }
    });
    setSelectedVideos(videos);
    setEditState({ clips, captions: [], sources, textOverlays: [] });
    setPhase('exploring');
    logEvent(EventTypes.IMPORT_VIDEO, Actors.CREATOR, { videoIds: videos.map((v) => v.id), count: videos.length });
    announce(`Project created with ${videos.length} video${videos.length > 1 ? 's' : ''}. Explore scenes below.`);
  }, [logEvent]);

  const handleTimeUpdate = useCallback((time) => setCurrentTime(time), []);
  const handleSegmentChange = useCallback((seg) => setCurrentSegment(seg), []);
  const handleSeek = useCallback((time) => playerRef.current?.seek(time), []);
  const handlePlay = useCallback(() => playerRef.current?.play(), []);
  const handlePause = useCallback(() => playerRef.current?.pause(), []);

  const handleEditChange = useCallback((clips, captions, sources, textOverlays) => {
    setEditState((prev) => ({ clips, captions, sources, textOverlays: textOverlays ?? prev?.textOverlays ?? [] }));
  }, []);

  // Track play/pause
  useEffect(() => {
    const interval = setInterval(() => {
      const video = playerRef.current?.video;
      if (video) setIsPlaying(!video.paused);
    }, 250);
    return () => clearInterval(interval);
  }, []);

  // VQA handler
  const answeredRef = useRef(false);
  useEffect(() => {
    window.__vqaReceiveAnswer = (answer) => {
      if (answeredRef.current) return;
      answeredRef.current = true;
      if (currentSegment) {
        setVqaHistories((prev) => ({
          ...prev,
          [currentSegment.id]: [...(prev[currentSegment.id] || []), { role: 'ai', text: answer, source: 'researcher' }],
        }));
      }
      logEvent(EventTypes.VQA_ANSWER, Actors.RESEARCHER, { answer, source: 'researcher_override' });
      if (audioEnabled) ttsService.speak(answer, { rate: speechRate });
    };
    return () => { delete window.__vqaReceiveAnswer; };
  }, [currentSegment, logEvent, audioEnabled, speechRate]);

  const handleAskAI = useCallback(async (question, scene) => {
    answeredRef.current = false;
    setPendingQuestion(question);
    setVqaHistories((prev) => ({
      ...prev,
      [scene.id]: [...(prev[scene.id] || []), { role: 'user', text: question }],
    }));
    const videoEl = playerRef.current?.video;
    if (videoEl) {
      try {
        const frame = captureFrame(videoEl);
        const answer = await askGemini(frame, question, { segmentDescription: scene.descriptions?.level_1 || '' });
        if (!answeredRef.current) {
          answeredRef.current = true;
          setVqaHistories((prev) => ({
            ...prev,
            [scene.id]: [...(prev[scene.id] || []), { role: 'ai', text: answer, source: 'gemini' }],
          }));
          logEvent(EventTypes.VQA_ANSWER, Actors.AI, { answer, source: 'gemini' });
          if (audioEnabled) ttsService.speak(answer, { rate: speechRate });
        }
      } catch (err) {
        // M7: surface a visible "researcher is checking" status when Gemini
        // fails so the question doesn't appear to vanish into the void.
        if (!answeredRef.current) {
          setVqaHistories((prev) => ({
            ...prev,
            [scene.id]: [...(prev[scene.id] || []), {
              role: 'system',
              text: 'AI could not answer right now. Researcher is checking your question.',
            }],
          }));
          logEvent(EventTypes.VQA_ANSWER, Actors.SYSTEM, {
            error: err?.message || 'gemini_failure',
            source: 'fallback_pending_woz',
          });
          announce('AI could not answer. Researcher is checking your question.');
        }
      }
    }
    setPendingQuestion(null);
  }, [logEvent, audioEnabled, speechRate]);

  const handleAskAIEdit = useCallback(async (instruction, scene) => {
    // Check prepared AI edits first
    const prepared = scene.ai_edits_prepared;
    if (prepared) {
      for (const [key, val] of Object.entries(prepared)) {
        if (instruction.toLowerCase().includes(key.replace('_', ' '))) {
          return { description: val.response || val.partial, operation: key, text: val.response };
        }
      }
    }
    return { description: `I can't do "${instruction}" directly. Send to helper?`, text: instruction };
  }, []);

  const handleEditSelf = useCallback((scene, action) => {
    logEvent(EventTypes.EDIT_ACTION, Actors.CREATOR, { action, segmentId: scene.id });
  }, [logEvent]);

  const handleToggleKeep = useCallback((sceneId) => {
    setKeptScenes((prev) => ({ ...prev, [sceneId]: prev[sceneId] === false ? true : false }));
  }, []);

  // Intent Locker → Handover
  const handleHandover = useCallback((task) => {
    setTasks((prev) => [...prev, { ...task, id: `task-${Date.now()}`, timestamp: Date.now() }]);
    logEvent(EventTypes.HANDOVER_INITIATED, Actors.CREATOR, { task });
    // Transition to helper mode
    setTransitionDirection('toHelper');
    setHandoverMode('tasks');
    setIsTransitioning(true);
  }, [logEvent]);

  const handleTransitionComplete = useCallback(() => {
    setIsTransitioning(false);
    if (transitionDirection === 'toHelper') {
      setMode('helper');
      logEvent(EventTypes.HANDOVER_COMPLETED, Actors.SYSTEM, { toMode: 'helper', handoverMode });
      announce('Switched to Helper mode. Phone handed to helper.');
    } else {
      setMode('creator');
      setHandoverMode(null);
      logEvent(EventTypes.HANDOVER_COMPLETED, Actors.SYSTEM, { toMode: 'creator' });
      announce('Switched to Creator mode.');
    }
    setTransitionDirection(null);
  }, [transitionDirection, handoverMode, logEvent]);

  const handleReturnDevice = useCallback((summary) => {
    logEvent(EventTypes.HELPER_ACTION, Actors.HELPER, { action: 'return_device', summary });
    setTransitionDirection('toCreator');
    setIsTransitioning(true);
  }, [logEvent]);

  // m12: cancel a toHelper handover during the transition window. Reverts
  // mode/handoverMode/tasks to the pre-handover state so the creator stays
  // in control. The most recently queued task is removed because that's the
  // one the creator just changed their mind about.
  const handleCancelHandover = useCallback(() => {
    setIsTransitioning(false);
    setTransitionDirection(null);
    setHandoverMode(null);
    setTasks((prev) => prev.slice(0, -1));
    logEvent(EventTypes.HANDOVER_CANCELLED, Actors.CREATOR, {});
    announce('Handover cancelled. You are still the creator.');
  }, [logEvent]);

  // WoZ suggestion
  const handleTriggerSuggestion = useCallback((text) => setPendingSuggestion(text), []);
  const handleSuggestionAccept = useCallback(() => {
    setPendingSuggestion(null);
    // Open Intent Locker for handover
    announce('Suggestion accepted. Prepare handover instruction.');
  }, []);
  const handleSuggestionDismiss = useCallback(() => setPendingSuggestion(null), []);

  const modeLabel = mode === 'creator' ? 'Creator Mode' : `Helper Mode (${handoverMode || 'live'})`;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {phase === 'library' ? (
        <>
          <OnboardingBrief
            pageTitle="Probe 2a: Shared Device — Video Library"
            description="You and your helper will share one phone. First, choose the video you want to work on together. Tap one or more videos and then tap Create Project to start. After that, you'll explore scenes and decide which ones to keep, discard, edit yourself, ask AI to edit, or hand over to your helper."
          />
          <ConditionHeader condition="probe2" modeLabel="Creator — Select Videos" />
          <VideoLibrary videos={libraryVideos} onImport={handleImport} />
        </>
      ) : mode === 'creator' ? (
        <div className="flex flex-col flex-1 max-w-lg mx-auto w-full">
          <OnboardingBrief
            pageTitle="Probe 2a: Shared Device — Creator"
            description="You and your helper share one phone. Below is a list of scenes from your video. Tap a scene to expand it. Inside each scene you have three choices: Edit by Myself to keep, discard, trim, split, or move the scene; Ask AI to Edit to speak an instruction and confirm the result; or Ask Helper to describe a task with a category and priority, then hand the phone over. When the helper is done, they will return the device to you."
          />
          <ConditionHeader condition="probe2" modeLabel={modeLabel} />
          {/* Video player — hidden from screen readers */}
          <div aria-hidden="true" className="px-3 pt-3">
            <VideoPlayer
              ref={playerRef}
              src={projectData?.video?.src || projectData?.videos?.[0]?.src || null}
              segments={segments}
              onTimeUpdate={handleTimeUpdate}
              onSegmentChange={handleSegmentChange}
              editState={editState}
            />
          </div>

          {/* Linear Scene Block List — Creator Mode */}
          <SceneBlockList
            scenes={segments}
            playerRef={playerRef}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onSeek={handleSeek}
            onPlay={handlePlay}
            onPause={handlePause}
            accentColor="#5CB85C"
            videoCount={selectedVideos?.length || 1}
            vqaHistories={vqaHistories}
            renderSceneActions={({ scene, index, currentLevel, onLevelChange, currentTime: ct, isPlaying: ip, onSeek: os, onPlay: op, onPause: opp }) => (
              <Probe2aSceneActions
                scene={scene}
                index={index}
                playerRef={playerRef}
                currentTime={ct}
                isPlaying={ip}
                onSeek={os}
                onPlay={op}
                onPause={opp}
                onAskAI={handleAskAI}
                onAskAIEdit={handleAskAIEdit}
                onHandover={handleHandover}
                onEditSelf={handleEditSelf}
                isKept={keptScenes[scene.id] !== false}
                onToggleKeep={handleToggleKeep}
                currentLevel={currentLevel}
                onLevelChange={onLevelChange}
                accentColor="#5CB85C"
                editState={editState}
                onEditChange={handleEditChange}
              />
            )}
          />
        </div>
      ) : (
        <div className="p-3 max-w-lg mx-auto w-full">
          <OnboardingBrief
            pageTitle="Probe 2a: Shared Device — Helper"
            description="The creator has handed you the phone with a task. Check the task description at the top to see what they want. Use the video editor, colour sliders, and framing tools below to make changes. When you are done, tap Return Device and describe what you did."
          />
          <ConditionHeader condition="probe2" modeLabel={modeLabel} />
          <HelperMode
            playerRef={playerRef}
            videoData={projectData}
            currentTime={currentTime}
            duration={videoDuration}
            isPlaying={isPlaying}
            currentSegment={currentSegment}
            handoverMode={handoverMode}
            tasks={tasks}
            onTimeUpdate={handleTimeUpdate}
            onSegmentChange={handleSegmentChange}
            onSeek={handleSeek}
            onReturnDevice={handleReturnDevice}
            onTaskComplete={() => {}}
            editState={editState}
            onEditChange={handleEditChange}
            initialSources={initialSources}
          />
        </div>
      )}

      {/* Handover Suggestion */}
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
          onCancel={transitionDirection === 'toHelper' ? handleCancelHandover : undefined}
        />
      )}

      {/* Researcher WoZ panels */}
      {isResearcher && (
        <div className="max-w-7xl mx-auto px-4 pb-4 space-y-4">
          <ResearcherVQAPanel segment={currentSegment} pendingQuestion={pendingQuestion} />
          <ResearcherHandoverPanel onTriggerSuggestion={handleTriggerSuggestion} currentMode={mode} />
        </div>
      )}
    </div>
  );
}
