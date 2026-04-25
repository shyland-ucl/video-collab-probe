import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadDescriptions } from '../data/sampleDescriptions.js';
import { loadPipelineVideos } from '../services/pipelineApi.js';
import { useEventLogger } from '../contexts/EventLoggerContext.jsx';
import { useAccessibility } from '../contexts/AccessibilityContext.jsx';
import { EventTypes, Actors } from '../utils/eventTypes.js';
import { announce } from '../utils/announcer.js';
import { buildAllSegments, getTotalDuration } from '../utils/buildInitialSources.js';
import { captureFrame, askGemini } from '../services/geminiService.js';
import ttsService from '../services/ttsService.js';
import ConditionHeader from '../components/shared/ConditionHeader.jsx';
import OnboardingBrief from '../components/shared/OnboardingBrief.jsx';
import VideoPlayer from '../components/shared/VideoPlayer.jsx';
import VideoLibrary from '../components/probe1/VideoLibrary.jsx';
import SceneBlockList from '../components/shared/SceneBlockList.jsx';
import Probe1SceneActions from '../components/probe1/Probe1SceneActions.jsx';
import ResearcherVQAPanel from '../components/probe1/ResearcherVQAPanel.jsx';

export default function Probe1Page() {
  const { setCondition, logEvent } = useEventLogger();
  const { audioEnabled, speechRate } = useAccessibility();
  const playerRef = useRef(null);
  const [searchParams] = useSearchParams();
  const isResearcher = searchParams.get('mode') === 'researcher';

  const [data, setData] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState(null);
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [editState, setEditState] = useState(null);

  // Phase: 'library' → 'exploring'
  const [phase, setPhase] = useState('library');
  const [selectedVideos, setSelectedVideos] = useState(null);
  const [vqaHistories, setVqaHistories] = useState({});

  const [pipelineVideos, setPipelineVideos] = useState([]);

  useEffect(() => {
    setCondition('probe1');
    logEvent(EventTypes.CONDITION_START, Actors.SYSTEM, { condition: 'probe1' });
    loadDescriptions().then(setData).catch(console.error);
    loadPipelineVideos().then(setPipelineVideos).catch(() => {});
  }, [setCondition, logEvent]);

  const projectData = useMemo(() => {
    if (selectedVideos) {
      // Use selectedVideos directly — they already contain segments + descriptions
      // (works for both sample and pipeline videos)
      return { videos: selectedVideos };
    }
    return data;
  }, [data, selectedVideos]);

  const segments = useMemo(() => buildAllSegments(projectData), [projectData]);
  const videoDuration = useMemo(() => getTotalDuration(projectData), [projectData]);

  const projectTitle = useMemo(() => {
    if (!projectData) return 'Untitled Video';
    if (projectData.videos?.length > 0) return projectData.videos.map((v) => v.title).join(' + ');
    return projectData.video?.title || 'Untitled Video';
  }, [projectData]);

  // Get dyad ID from session config for filtering assigned videos
  const sessionDyadId = useMemo(() => {
    try {
      const stored = localStorage.getItem('sessionConfig');
      return stored ? JSON.parse(stored).dyadId : null;
    } catch { return null; }
  }, []);

  // Get researcher-assigned project IDs for this dyad
  const assignedProjectIds = useMemo(() => {
    try {
      const assignments = JSON.parse(localStorage.getItem('pipelineAssignments') || '{}');
      return assignments[sessionDyadId] || [];
    } catch { return []; }
  }, [sessionDyadId]);

  const allVideos = useMemo(() => {
    const sampleVideos = data
      ? (data.videos || (data.video ? [data.video] : []))
      : [];

    // If researcher has assigned specific videos to this dyad, filter pipeline videos
    let filteredPipeline = pipelineVideos;
    if (sessionDyadId && assignedProjectIds.length > 0) {
      filteredPipeline = pipelineVideos.filter(
        (v) => assignedProjectIds.includes(v._projectId) || assignedProjectIds.includes(`pipeline-${v._projectId}`)
      );
    }

    return [...filteredPipeline, ...sampleVideos];
  }, [data, pipelineVideos, sessionDyadId, assignedProjectIds]);

  const handleTimeUpdate = useCallback((time) => setCurrentTime(time), []);
  const handleSegmentChange = useCallback((seg) => setCurrentSegment(seg), []);
  const handleSeek = useCallback((time) => playerRef.current?.seek(time), []);
  const handlePlay = useCallback(() => playerRef.current?.play(), []);
  const handlePause = useCallback(() => playerRef.current?.pause(), []);

  const handleImport = useCallback((videos) => {
    setSelectedVideos(videos);
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
    setEditState({ clips, captions: [], sources });
    setPhase('exploring');
    logEvent(EventTypes.IMPORT_VIDEO, Actors.CREATOR, { videoIds: videos.map((v) => v.id), count: videos.length });
    announce('Project created. Explore scenes below.');
  }, [logEvent]);

  // VQA handler — Gemini + WoZ override
  const answeredRef = useRef(false);
  useEffect(() => {
    window.__vqaReceiveAnswer = (answer) => {
      if (answeredRef.current) return;
      answeredRef.current = true;
      // Find which scene is expanded — append to its VQA history
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
    // Add user question to VQA history
    setVqaHistories((prev) => ({
      ...prev,
      [scene.id]: [...(prev[scene.id] || []), { role: 'user', text: question }],
    }));

    // Try Gemini
    const videoEl = playerRef.current?.video;
    if (videoEl) {
      try {
        const frame = captureFrame(videoEl);
        const segDesc = scene.descriptions?.level_1 || '';
        const answer = await askGemini(frame, question, { segmentDescription: segDesc });
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
        // Gemini failed — surface a visible "researcher is checking" status
        // so the participant knows their question wasn't dropped. The
        // researcher's WoZ override (window.__vqaReceiveAnswer) appends the
        // real answer later. Without this cue, the user previously saw the
        // Thinking spinner vanish with nothing replacing it (M7).
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

  // Track play/pause state
  useEffect(() => {
    if (phase !== 'exploring') return;
    const interval = setInterval(() => {
      const video = playerRef.current?.video;
      if (video) setIsPlaying(!video.paused);
    }, 250);
    return () => clearInterval(interval);
  }, [phase]);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {phase === 'library' && (
        <>
          <OnboardingBrief
            pageTitle="Probe 1: Solo Creator — Video Library"
            description="This is the video library. Browse the available clips, select one or more that you want to explore, then tap Import to begin. You can select multiple clips if you want to combine them."
          />
          <ConditionHeader condition="probe1" />
          <VideoLibrary videos={allVideos} onImport={handleImport} />
        </>
      )}

      {phase === 'exploring' && (
        <div className="flex flex-col flex-1 max-w-lg mx-auto w-full">
          <OnboardingBrief
            pageTitle="Probe 1: Solo Creator — Scene Explorer"
            description="Your video is shown as a list of scenes below. Swipe up and down to browse scenes. Tap a scene to expand it and hear its AI-generated description. Once expanded, you can change the detail level between Overview, Detailed, and Technical using the controls at the top. You can also ask AI a question about what is happening in a scene, or flag a description if it seems wrong. Use the Play All button to listen to every scene description in order."
          />
          <ConditionHeader condition="probe1" />
          {/* Video player — visual reference, hidden from screen readers */}
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

          {/* Linear Scene Block List */}
          <SceneBlockList
            scenes={segments}
            playerRef={playerRef}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onSeek={handleSeek}
            onPlay={handlePlay}
            onPause={handlePause}
            accentColor="#2B579A"
            videoCount={selectedVideos?.length || 1}
            vqaHistories={vqaHistories}
            renderSceneActions={({ scene, index, currentLevel, onLevelChange, currentTime: ct, isPlaying: ip, onSeek: os, onPlay: op, onPause: opp }) => (
              <Probe1SceneActions
                scene={scene}
                index={index}
                playerRef={playerRef}
                currentTime={ct}
                isPlaying={ip}
                onSeek={os}
                onPlay={op}
                onPause={opp}
                onAskAI={handleAskAI}
                currentLevel={currentLevel}
                onLevelChange={onLevelChange}
                accentColor="#2B579A"
              />
            )}
          />
        </div>
      )}

      {/* Researcher WoZ panel */}
      {isResearcher && (
        <div className="max-w-7xl mx-auto px-4 pb-4">
          <ResearcherVQAPanel segment={currentSegment} pendingQuestion={pendingQuestion} />
        </div>
      )}
    </div>
  );
}
