import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { loadDescriptions } from '../data/sampleDescriptions.js';
import { loadPipelineVideos } from '../services/pipelineApi.js';
import { useEventLogger } from '../contexts/EventLoggerContext.jsx';
import { useAccessibility } from '../contexts/AccessibilityContext.jsx';
import { EventTypes, Actors } from '../utils/eventTypes.js';
import { announce } from '../utils/announcer.js';
import { buildAllSegments, getTotalDuration } from '../utils/buildInitialSources.js';
import { captureFrame, askGemini } from '../services/geminiService.js';
import { wsRelayService } from '../services/wsRelayService.js';
import ttsService from '../services/ttsService.js';
import ConditionHeader from '../components/shared/ConditionHeader.jsx';
import OnboardingBrief from '../components/shared/OnboardingBrief.jsx';
import VideoPlayer from '../components/shared/VideoPlayer.jsx';
import VideoLibrary from '../components/probe1/VideoLibrary.jsx';
import SceneBlockList from '../components/shared/SceneBlockList.jsx';
import Probe1SceneActions from '../components/probe1/Probe1SceneActions.jsx';

export default function Probe1Page() {
  const { setCondition, logEvent } = useEventLogger();
  const { audioEnabled, speechRate } = useAccessibility();
  const playerRef = useRef(null);

  const [data, setData] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
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

  // Connect as 'participant' so EventLoggerContext.logEvent broadcasts can
  // reach the researcher dashboard. Probe 1 has no peer to pair with — the
  // participant role exists for exactly this case.
  useEffect(() => {
    wsRelayService.connect('participant');
    return () => wsRelayService.disconnect();
  }, []);

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

  const handleAskAI = useCallback(async (question, scene) => {
    setVqaHistories((prev) => ({
      ...prev,
      [scene.id]: [...(prev[scene.id] || []), { role: 'user', text: question }],
    }));

    const videoEl = playerRef.current?.video;
    if (!videoEl) return;
    try {
      const frame = captureFrame(videoEl);
      const segDesc = scene.descriptions?.level_1 || '';
      const answer = await askGemini(frame, question, { segmentDescription: segDesc });
      setVqaHistories((prev) => ({
        ...prev,
        [scene.id]: [...(prev[scene.id] || []), { role: 'ai', text: answer, source: 'gemini' }],
      }));
      logEvent(EventTypes.VQA_ANSWER, Actors.AI, { answer, source: 'gemini' });
      if (audioEnabled) ttsService.speak(answer, { rate: speechRate });
    } catch (err) {
      const failMsg = 'AI could not answer right now. Try rephrasing your question.';
      setVqaHistories((prev) => ({
        ...prev,
        [scene.id]: [...(prev[scene.id] || []), { role: 'system', text: failMsg }],
      }));
      logEvent(EventTypes.VQA_ANSWER, Actors.SYSTEM, {
        error: err?.message || 'gemini_failure',
        source: 'gemini_failure',
      });
      announce(failMsg);
    }
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
          <ConditionHeader condition="probe1" />
          <OnboardingBrief
            pageTitle="Probe 1: Solo Creator — Video Library"
            description="This is the video library. Browse the available clips, select one or more that you want to explore, then tap Import to begin. You can select multiple clips if you want to combine them."
          />
          <VideoLibrary videos={allVideos} onImport={handleImport} />
        </>
      )}

      {phase === 'exploring' && (
        <div className="flex flex-col flex-1 max-w-lg mx-auto w-full">
          <ConditionHeader condition="probe1" />
          <OnboardingBrief
            pageTitle="Probe 1: Solo Creator — Scene Explorer"
            description="Your video is shown as a list of scenes below. Swipe up and down to browse scenes. Tap a scene to expand it and hear its AI-generated description. Once expanded, you can change the detail level between Overview, Detailed, and Technical using the controls at the top. You can also ask AI a question about what is happening in a scene, or flag a description if it seems wrong. Use the Play All button to listen to every scene description in order."
          />
          {/* Video player — visual reference, hidden from screen readers */}
          <div aria-hidden="true" className="px-3 pt-3">
            <VideoPlayer
              ref={playerRef}
              src={projectData?.video?.src || projectData?.videos?.[0]?.src || null}
              segments={segments}
              onTimeUpdate={handleTimeUpdate}
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
            onSceneClose={(sceneId) => {
              // Lan 2026-04-27: wipe chat history on full collapse so the
              // panel doesn't pile up Q+A bubbles across sessions.
              setVqaHistories((prev) => {
                if (!(sceneId in prev)) return prev;
                const next = { ...prev };
                delete next[sceneId];
                return next;
              });
            }}
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

    </div>
  );
}
