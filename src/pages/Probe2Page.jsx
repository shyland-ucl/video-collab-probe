import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadDescriptions } from '../data/sampleDescriptions.js';
import { loadPipelineVideos } from '../services/pipelineApi.js';
import { useEventLogger } from '../contexts/EventLoggerContext.jsx';
import { useAccessibility } from '../contexts/AccessibilityContext.jsx';
import { EventTypes, Actors } from '../utils/eventTypes.js';
import { announce, setAnnouncerMuted } from '../utils/announcer.js';
import { buildAllSegments, buildInitialSources, getTotalDuration } from '../utils/buildInitialSources.js';
import { filterClipsByKept, colourValuesToFilter } from '../utils/editStateView.js';
import { applyOperation } from '../utils/sceneEditOps.js';
import { captureFrame, askGemini } from '../services/geminiService.js';
import ttsService from '../services/ttsService.js';
import { wsRelayService } from '../services/wsRelayService.js';
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
import ResearcherAIEditPanel from '../components/probe3/ResearcherAIEditPanel.jsx';

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
  // WoZ: when "Ask AI to Edit" finds no canned match, the request is parked
  // here so the researcher panel can craft a response. The promise from
  // handleAskAIEdit waits on `aiEditResolverRef` until the researcher sends.
  const [pendingAIRequest, setPendingAIRequest] = useState(null);
  const aiEditResolverRef = useRef(null);

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
  // Bounded history stack of editStates so the creator can undo the most
  // recent self-edit (Split, Move, Add caption). Cap at 20 to avoid leaks
  // during long sessions; the helper-mode editor doesn't push to this.
  const [editHistory, setEditHistory] = useState([]);
  const [tasks, setTasks] = useState([]); // Intent-locked tasks for helper
  const [vqaHistories, setVqaHistories] = useState({});
  const [keptScenes, setKeptScenes] = useState({}); // sceneId → boolean
  // Helper-mode colour adjustments. Lives at the page so the visual filter
  // persists when the device is handed back to the creator (the helper's
  // change should be visible in the creator's playback too).
  const [colourValues, setColourValues] = useState({ brightness: 0, contrast: 0, saturation: 0 });

  useEffect(() => {
    setCondition('probe2a');
    logEvent(EventTypes.CONDITION_START, Actors.SYSTEM, { condition: 'probe2a' });
    loadDescriptions().then(setData).catch(console.error);
    loadPipelineVideos().then(setPipelineVideos).catch(() => {});
    // Always restore the announcer on unmount in case the participant
    // navigates away while the device is still in helper mode.
    return () => { setAnnouncerMuted(false); };
  }, [setCondition, logEvent]);

  // WS relay for cross-device WoZ. The participant device joins as
  // 'participant' and broadcasts AI_EDIT_REQUEST when no canned match is
  // found; the researcher device (same URL with ?mode=researcher) joins as
  // 'researcher' and replies with AI_EDIT_RESPONSE. Same-tab use (the
  // participant URL with ?mode=researcher appended) bypasses the relay
  // entirely — the local resolver handles it.
  useEffect(() => {
    const role = isResearcher ? 'researcher' : 'participant';
    wsRelayService.connect(role);
    const unsub = wsRelayService.onData((msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'AI_EDIT_REQUEST' && isResearcher) {
        // Surface the participant's request in this researcher tab's panel.
        setPendingAIRequest(msg.request || null);
      } else if (msg.type === 'AI_EDIT_RESPONSE' && !isResearcher) {
        // Resolve the parked promise with the researcher's response.
        if (aiEditResolverRef.current) {
          aiEditResolverRef.current({
            description: msg.text,
            text: msg.text,
            operation: msg.responseType || 'researcher_response',
          });
          aiEditResolverRef.current = null;
        }
        logEvent(EventTypes.AI_EDIT_PROPOSED, Actors.RESEARCHER, {
          source: 'researcher_woz_relay',
          response: msg.text,
          responseType: msg.responseType,
        });
      } else if (msg.type === 'EDIT_STATE_UPDATE' && !isResearcher && msg.editState) {
        // Researcher Editor on the dashboard pushed an edit. Apply directly.
        setEditState(msg.editState);
        if (msg.changeSummary?.announcement) announce(msg.changeSummary.announcement);
      } else if (msg.type === 'REQUEST_EDIT_STATE' && !isResearcher) {
        // Dashboard joined late; reply with current snapshot if we have one.
        if (editStateRef.current) {
          wsRelayService.sendData({
            type: 'EDIT_STATE_UPDATE',
            editState: editStateRef.current,
            action: 'snapshot',
            changeSummary: { announcement: '', shortText: '' },
            actor: 'CREATOR',
          });
        }
      }
    });
    return () => {
      unsub();
      wsRelayService.disconnect();
    };
  }, [isResearcher, logEvent]);

  // Pipeline-video assignment filter for the current dyad — same convention
  // as Probes 1, 2b, 3.
  const sessionDyadId = useMemo(() => {
    try {
      const stored = localStorage.getItem('sessionConfig');
      return stored ? JSON.parse(stored).dyadId : null;
    } catch { return null; }
  }, []);

  const assignedProjectIds = useMemo(() => {
    try {
      const assignments = JSON.parse(localStorage.getItem('pipelineAssignments') || '{}');
      return assignments[sessionDyadId] || [];
    } catch { return []; }
  }, [sessionDyadId]);

  // Library candidates: pipeline (filtered by assignment) + sample.
  const libraryVideos = useMemo(() => {
    const sampleVideos = data ? (data.videos || (data.video ? [data.video] : [])) : [];
    let filteredPipeline = pipelineVideos;
    if (sessionDyadId && assignedProjectIds.length > 0) {
      filteredPipeline = pipelineVideos.filter(
        (v) => assignedProjectIds.includes(v._projectId)
          || assignedProjectIds.includes(`pipeline-${v._projectId}`)
      );
    }
    return [...filteredPipeline, ...sampleVideos];
  }, [data, pipelineVideos, sessionDyadId, assignedProjectIds]);

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
    const initialEditState = { clips, captions: [], sources, textOverlays: [] };
    setEditState(initialEditState);
    setPhase('exploring');
    logEvent(EventTypes.IMPORT_VIDEO, Actors.CREATOR, { videoIds: videos.map((v) => v.id), count: videos.length });
    announce(`Project created with ${videos.length} video${videos.length > 1 ? 's' : ''}. Explore scenes below.`);
    // Broadcast the initial editState so the researcher dashboard's Live Edit
    // Mirror populates without waiting for the first edit.
    wsRelayService.sendData({
      type: 'EDIT_STATE_UPDATE',
      editState: initialEditState,
      action: 'project initialised',
      changeSummary: { announcement: '', shortText: '' },
      actor: 'CREATOR',
    });
  }, [logEvent]);

  const handleTimeUpdate = useCallback((time) => setCurrentTime(time), []);
  const handleSegmentChange = useCallback((seg) => setCurrentSegment(seg), []);
  const handleSeek = useCallback((time) => playerRef.current?.seek(time), []);
  const handlePlay = useCallback(() => playerRef.current?.play(), []);
  const handlePause = useCallback(() => playerRef.current?.pause(), []);

  const editStateRef = useRef(null);
  useEffect(() => { editStateRef.current = editState; }, [editState]);

  const handleEditChange = useCallback((clips, captions, sources, textOverlays) => {
    const prev = editStateRef.current;
    const nextState = { clips, captions, sources, textOverlays: textOverlays ?? prev?.textOverlays ?? [] };
    if (prev) {
      // Push prev onto history so Undo can restore it. Cap at 20 entries.
      setEditHistory((h) => {
        const next = [...h, prev];
        return next.length > 20 ? next.slice(next.length - 20) : next;
      });
    }
    setEditState(nextState);
    // Broadcast to the researcher dashboard so its Live Edit Mirror stays
    // in sync. Same WS relay used for the AI WoZ flow.
    wsRelayService.sendData({
      type: 'EDIT_STATE_UPDATE',
      editState: nextState,
      action: 'edit',
      changeSummary: { announcement: '', shortText: 'Edit' },
      actor: 'CREATOR',
    });
  }, []);

  const handleUndoEdit = useCallback(() => {
    setEditHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      // Restore the previous editState without pushing onto history again
      // (otherwise undo itself would become undoable, which surprises users).
      setEditState(prev);
      logEvent(EventTypes.EDIT_ACTION, Actors.CREATOR, { action: 'undo' });
      announce('Undid last edit.');
      return h.slice(0, -1);
    });
  }, [logEvent]);

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
    // Drop any earlier in-flight resolver — the participant has issued a new
    // request, so the previous one (if still parked in the panel) is stale.
    if (aiEditResolverRef.current) {
      aiEditResolverRef.current({
        description: 'Cancelled by a newer request.',
        text: '',
        operation: 'superseded',
      });
      aiEditResolverRef.current = null;
    }
    // First try the project's prepared canned responses.
    const prepared = scene.ai_edits_prepared;
    if (prepared) {
      for (const [key, val] of Object.entries(prepared)) {
        if (instruction.toLowerCase().includes(key.replace('_', ' '))) {
          logEvent(EventTypes.AI_EDIT_PROPOSED, Actors.AI, { instruction, segmentId: scene.id, source: 'prepared', operation: key });
          return { description: val.response || val.partial, operation: key, text: val.response };
        }
      }
    }
    // No canned match → park in the researcher's WoZ panel and wait. We
    // keep a local copy (so a same-tab researcher view sees it without
    // needing the WS relay) AND broadcast (so a separate researcher device
    // on ?mode=researcher receives it via the relay).
    const request = {
      instruction,
      segment: scene.name,
      segmentId: scene.id,
      timestamp: Date.now(),
    };
    setPendingAIRequest(request);
    wsRelayService.sendData({ type: 'AI_EDIT_REQUEST', request });
    announce('AI is preparing the edit. Researcher is reviewing.');
    return new Promise((resolve) => {
      aiEditResolverRef.current = resolve;
    });
  }, [logEvent]);

  const handleAIEditResponse = useCallback((responseText, responseType) => {
    setPendingAIRequest(null);
    logEvent(EventTypes.AI_EDIT_PROPOSED, Actors.RESEARCHER, { source: 'researcher_woz', response: responseText, responseType });
    // Same-tab path: resolve any local resolver immediately.
    if (aiEditResolverRef.current) {
      aiEditResolverRef.current({
        description: responseText,
        text: responseText,
        operation: responseType || 'researcher_response',
      });
      aiEditResolverRef.current = null;
    }
    // Cross-device path: broadcast so a participant on a separate device
    // can resolve their own resolver. The relay only forwards researcher
    // messages to participants/creator/helper, never back to the sender,
    // so this is safe even when the researcher is also a participant.
    wsRelayService.sendData({ type: 'AI_EDIT_RESPONSE', text: responseText, responseType });
  }, [logEvent]);

  const handleApplyEdit = useCallback((editAction) => {
    logEvent(EventTypes.AI_EDIT_APPLIED, Actors.RESEARCHER, { action: editAction });
  }, [logEvent]);

  // Applies an operation key (AI accept OR self-edit button) against the
  // current editState. Maps the key to a real edit op via applyOperation
  // and pushes the prior state onto editHistory so Undo works.
  const handleEditSelf = useCallback((scene, action) => {
    if (!scene || !action) return;
    setEditState((prev) => {
      if (!prev) return prev;
      const next = applyOperation(prev, scene.id, action, {
        currentTime,
        captionText: scene.descriptions?.level_1 || 'AI-added caption',
      });
      if (next === prev) {
        announce(`Could not apply ${action} on this scene.`);
        logEvent(EventTypes.EDIT_ACTION, Actors.CREATOR, {
          action, segmentId: scene.id, applied: false, reason: 'no-op',
        });
        return prev;
      }
      setEditHistory((h) => {
        const nxt = [...h, prev];
        return nxt.length > 20 ? nxt.slice(nxt.length - 20) : nxt;
      });
      logEvent(EventTypes.EDIT_ACTION, Actors.CREATOR, {
        action, segmentId: scene.id, applied: true,
      });
      return next;
    });
  }, [currentTime, logEvent]);

  const handleToggleKeep = useCallback((sceneId) => {
    setKeptScenes((prev) => ({ ...prev, [sceneId]: prev[sceneId] === false ? true : false }));
  }, []);

  const handleColourAdjust = useCallback((property, value) => {
    setColourValues((prev) => ({ ...prev, [property]: value }));
  }, []);

  // Derived: editState filtered to kept clips only (Removed scenes are
  // skipped during playback). Memoised so VideoPlayer's playback engine
  // doesn't tear down whenever an unrelated render fires.
  const playbackEditState = useMemo(
    () => filterClipsByKept(editState, keptScenes),
    [editState, keptScenes]
  );
  const videoFilter = useMemo(() => colourValuesToFilter(colourValues), [colourValues]);

  // Derive the scene block order from editState.clips so reorders/deletes
  // pushed by the researcher dashboard visually appear in the participant's
  // scene list (not just in the playback engine). When the clip's id matches
  // a segment id we use the segment's descriptions; if a clip was split and
  // its id has a `-split-…` suffix, we fall back to the parent segment.
  const sceneIdToSegment = useMemo(() => {
    const m = new Map();
    for (const s of segments) m.set(s.id, s);
    return m;
  }, [segments]);

  const orderedScenes = useMemo(() => {
    if (!editState?.clips || editState.clips.length === 0) return segments;
    const seen = new Set();
    const out = [];
    for (const clip of editState.clips) {
      const baseId = typeof clip.id === 'string' && clip.id.includes('-split-')
        ? clip.id.slice(0, clip.id.lastIndexOf('-split-'))
        : clip.id;
      const seg = sceneIdToSegment.get(baseId);
      if (!seg || seen.has(seg.id)) continue;
      seen.add(seg.id);
      out.push(seg);
    }
    return out.length > 0 ? out : segments;
  }, [editState, segments, sceneIdToSegment]);

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
      // Speak the announcement first, *then* mute. The helper sees an on-screen
      // banner with the same instruction, so silencing the live region after
      // hand-off prevents VoiceOver/TalkBack from interrupting them while they
      // edit. Restored when the device returns.
      announce('Switched to Helper mode. Phone handed to helper.');
      setTimeout(() => setAnnouncerMuted(true), 800);
    } else {
      setAnnouncerMuted(false);
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
          <ConditionHeader condition="probe2" modeLabel="Creator — Select Videos" />
          <OnboardingBrief
            pageTitle="Probe 2a: Shared Device — Video Library"
            description="You and your helper will share one phone. First, choose the video you want to work on together. Tap one or more videos and then tap Create Project to start. After that, you'll explore scenes and decide which ones to keep, discard, edit yourself, ask AI to edit, or hand over to your helper."
          />
          <VideoLibrary videos={libraryVideos} onImport={handleImport} />
        </>
      ) : mode === 'creator' ? (
        <div className="flex flex-col flex-1 max-w-lg mx-auto w-full">
          <ConditionHeader condition="probe2" modeLabel={modeLabel} />
          <OnboardingBrief
            pageTitle="Probe 2a: Shared Device — Creator"
            description="You and your helper share one phone. Below is a list of scenes from your video. Tap a scene to expand it. Inside each scene you have three choices: Edit by Myself to remove, split, move, or caption the scene (with Undo if you change your mind); Ask AI to Edit to speak an instruction and confirm the result; or Ask Helper to tell your helper out loud what you want and hand the phone over. When the helper is done, they will return the device to you."
          />
          {/* Video player — hidden from screen readers */}
          <div aria-hidden="true" className="px-3 pt-3">
            <VideoPlayer
              ref={playerRef}
              src={projectData?.video?.src || projectData?.videos?.[0]?.src || null}
              segments={segments}
              onTimeUpdate={handleTimeUpdate}
              onSegmentChange={handleSegmentChange}
              editState={playbackEditState}
              videoFilter={videoFilter}
            />
          </div>

          {/* Linear Scene Block List — Creator Mode. Uses orderedScenes so
              the researcher's reorder/delete edits show up here, not just in
              the playback engine. */}
          <SceneBlockList
            scenes={orderedScenes}
            playerRef={playerRef}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onSeek={handleSeek}
            onPlay={handlePlay}
            onPause={handlePause}
            accentColor="#5CB85C"
            videoCount={selectedVideos?.length || 1}
            vqaHistories={vqaHistories}
            keptScenes={keptScenes}
            onSceneClose={(sceneId) => {
              setVqaHistories((prev) => {
                if (!(sceneId in prev)) return prev;
                const next = { ...prev };
                delete next[sceneId];
                return next;
              });
            }}
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
                onUndoEdit={handleUndoEdit}
                canUndoEdit={editHistory.length > 0}
              />
            )}
          />
        </div>
      ) : (
        <div className="p-3 max-w-lg mx-auto w-full">
          <ConditionHeader condition="probe2" modeLabel={modeLabel} />
          <OnboardingBrief
            pageTitle="Probe 2a: Shared Device — Helper"
            description="The creator has handed you the phone with a task. Check the task description at the top to see what they want. Use the video editor, colour sliders, and framing tools below to make changes. When you are done, tap Return Device and describe what you did."
          />
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
            playbackEditState={playbackEditState}
            videoFilter={videoFilter}
            colourValues={colourValues}
            onColourAdjust={handleColourAdjust}
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
          <ResearcherAIEditPanel
            segment={currentSegment}
            pendingRequest={pendingAIRequest}
            onSendResponse={handleAIEditResponse}
            onApplyEdit={handleApplyEdit}
          />
          <ResearcherHandoverPanel onTriggerSuggestion={handleTriggerSuggestion} currentMode={mode} />
        </div>
      )}
    </div>
  );
}
