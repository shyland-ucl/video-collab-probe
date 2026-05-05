import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { loadDescriptions } from '../data/sampleDescriptions.js';
import { loadPipelineVideos, fetchAssignments } from '../services/pipelineApi.js';
import { findAssignmentsForDyad } from '../utils/dyadId.js';
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
  const [projectSummaryFocusToken, setProjectSummaryFocusToken] = useState(0);
  const [vqaHistories, setVqaHistories] = useState({});

  const [pipelineVideos, setPipelineVideos] = useState([]);
  // Server-side dyad assignments. null = still loading / unfetched;
  // {} = fetched but no assignments. The library filter waits for this
  // before applying strict scoping so the first render doesn't briefly
  // show the wrong set.
  const [serverAssignments, setServerAssignments] = useState(null);

  useEffect(() => {
    setCondition('probe1');
    logEvent(EventTypes.CONDITION_START, Actors.SYSTEM, { condition: 'probe1' });
    loadDescriptions().then(setData).catch(console.error);
    loadPipelineVideos().then(setPipelineVideos).catch(() => {});
    fetchAssignments()
      .then((a) => setServerAssignments(a || {}))
      .catch(() => {
        // Server unreachable — fall back to local cache so library still
        // works in degraded mode.
        try {
          setServerAssignments(JSON.parse(localStorage.getItem('pipelineAssignments') || '{}'));
        } catch {
          setServerAssignments({});
        }
      });
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

  const allVideos = useMemo(() => {
    const sampleVideos = data
      ? (data.videos || (data.video ? [data.video] : []))
      : [];

    // Read sessionConfig fresh each time so dyadId picks up any change
    // since mount. Use the assignments fetched from the server (with
    // case-insensitive + trimmed key lookup so D01 / d01 / "D01 " all match).
    // While serverAssignments is null (still fetching), fall back to
    // unfiltered behaviour so the library isn't empty during the brief
    // load window.
    let dyadId = null;
    let assignedIds = [];
    try {
      const cfg = JSON.parse(localStorage.getItem('sessionConfig') || '{}');
      dyadId = (cfg.dyadId || '').trim() || null;
      if (dyadId && serverAssignments) {
        // findAssignmentsForDyad handles "2" ↔ "D02" ↔ "02" etc. so a
        // hurried session-setup typo doesn't empty the library.
        assignedIds = findAssignmentsForDyad(serverAssignments, dyadId);
      }
    } catch { /* fall through to unfiltered behaviour */ }

    let filteredPipeline = pipelineVideos;
    let filteredSamples = sampleVideos;
    if (dyadId && serverAssignments) {
      filteredPipeline = pipelineVideos.filter(
        (v) => assignedIds.includes(v._projectId)
          || assignedIds.includes(`pipeline-${v._projectId}`)
          || assignedIds.includes(v.id)
      );
      const chosen = sampleVideos.find((v) => v.id === 'video-sample');
      filteredSamples = chosen ? [chosen] : sampleVideos.slice(0, 1);
    }

    return [...filteredPipeline, ...filteredSamples];
  }, [data, pipelineVideos, serverAssignments]);

  // Day 1 fix #2: bounded "Play this scene" — pause at scene.end_time so
  // the participant doesn't hear the next scene's audio kick in unannounced.
  // Keep stopAt set after the boundary pause so disableAutoFollow stays on
  // until the user takes an explicit next action; otherwise the ~250ms
  // window before the isPlaying poll catches up lets auto-follow expand
  // the next scene.
  const [playingSegmentEnd, setPlayingSegmentEnd] = useState(null);
  const handleTimeUpdate = useCallback((time) => {
    setCurrentTime(time);
    setPlayingSegmentEnd((stopAt) => {
      if (stopAt != null && time >= stopAt - 0.05) {
        playerRef.current?.pause();
        return stopAt;
      }
      return stopAt;
    });
  }, []);
  const handleSeek = useCallback((time) => {
    setPlayingSegmentEnd(null);
    playerRef.current?.seek(time);
  }, []);
  const handlePlay = useCallback(() => {
    setPlayingSegmentEnd(null);
    playerRef.current?.play();
  }, []);
  const handlePause = useCallback(() => {
    setPlayingSegmentEnd(null);
    playerRef.current?.pause();
  }, []);
  const handlePlaySegment = useCallback((scene) => {
    if (!scene) return;
    playerRef.current?.seek(scene.start_time);
    playerRef.current?.play();
    setPlayingSegmentEnd(scene.end_time);
  }, []);

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
    setProjectSummaryFocusToken((token) => token + 1);
    setPhase('exploring');
    logEvent(EventTypes.IMPORT_VIDEO, Actors.CREATOR, { videoIds: videos.map((v) => v.id), count: videos.length });
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
        <div className="fixed inset-0 flex flex-col bg-white overflow-hidden">
          <div className="flex-1 flex flex-col min-h-0 max-w-lg mx-auto w-full">
          <ConditionHeader condition="probe1" />
          <OnboardingBrief
            pageTitle="Probe 1: Solo Creator — Scene Explorer"
            initialOpen={false}
            description="Your video is shown as a list of scenes below. Swipe up and down to browse scenes. Tap a scene to expand it and hear its AI-generated description. Once expanded, you can change the detail level between Overview, Detailed, and Technical using the controls at the top. You can also ask AI a question about what is happening in a scene, or flag a description if it seems wrong. Use the Play All button to listen to every scene description in order."
          />
          {/* Day 1 fix #1: video sits at the top in the page flex column.
              The container is `h-[100dvh] flex flex-col overflow-hidden`,
              so this wrapper takes its natural 16:9 height and the
              SceneBlockList below takes the remaining space with its own
              internal scroll. Result: video stays pinned at top because the
              scene list scrolls inside its own box, NOT at the window
              level — no sticky CSS, no banner overlap. */}
          <div aria-hidden="true" inert="" className="px-3 pt-3 flex-shrink-0 pointer-events-none">
            <VideoPlayer
              ref={playerRef}
              src={projectData?.video?.src || projectData?.videos?.[0]?.src || null}
              segments={segments}
              onTimeUpdate={handleTimeUpdate}
              editState={editState}
              maxHeight="32vh"
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
            disableAutoFollow={playingSegmentEnd != null}
            accentColor="#2B579A"
            videoCount={selectedVideos?.length || 1}
            summaryFocusToken={projectSummaryFocusToken}
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
                onPlaySegment={handlePlaySegment}
                onAskAI={handleAskAI}
                currentLevel={currentLevel}
                onLevelChange={onLevelChange}
                accentColor="#2B579A"
              />
            )}
          />
          </div>
        </div>
      )}

    </div>
  );
}
