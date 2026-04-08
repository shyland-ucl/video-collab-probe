import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { announce } from '../../utils/announcer.js';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { useAccessibility } from '../../contexts/AccessibilityContext.jsx';
import ttsService from '../../services/ttsService.js';
import VQAPanel from './VQAPanel.jsx';

/**
 * Format seconds into m:ss display.
 */
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Play a short audio cue using the Web Audio API.
 */
function playTone(frequency, duration = 50) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = frequency;
    osc.type = 'sine';
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration / 1000);
    osc.onended = () => ctx.close();
  } catch {
    // Web Audio not available
  }
}

const textSizeClasses = {
  small: 'text-base',
  medium: 'text-lg',
  large: 'text-xl',
};

/**
 * Exploration Mode — primary interface for Probe 1.
 * Users navigate scene descriptions via buttons and keyboard.
 * Includes Ask (VQA popup), Edit (slide-up editor), and Play/Pause controls.
 */
export default function ExplorationMode({
  active,
  segments,
  videoTitle,
  onExit,
  onMark,
  onEdit,
  isPlaying,
  playerRef,
  // For clip editing
  editState,
  currentTime,
  onSeek,
  onEditChange,
  accentColor = '#2B579A',
  // Probe 3 Layer 3 props
  actionMode,       // 'probe1' | 'probe2' | 'probe3'
  onAskAI,          // (taskText, segment) => void
  onAskHelper,      // (taskText, segment) => void
}) {
  // Accent color theming — derive light variants for card headers/badges
  const accentStyles = useMemo(() => {
    const isBlue = accentColor === '#2B579A';
    return {
      border: accentColor,
      headerBg: isBlue ? '#eff6ff' : '#f3e8ff',
      headerBorder: isBlue ? '#bfdbfe' : '#d8b4fe',
      headerText: accentColor,
      badgeBg: isBlue ? '#dbeafe' : '#e9d5ff',
      badgeText: isBlue ? '#1e40af' : '#6b21a8',
      navBtnBg: isBlue ? '#dbeafe' : '#e9d5ff',
      navBtnText: isBlue ? '#1e40af' : '#6b21a8',
    };
  }, [accentColor]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentLevel, setCurrentLevel] = useState(1);
  const [showVQA, setShowVQA] = useState(false);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [showCaptionInput, setShowCaptionInput] = useState(false);
  const [captionText, setCaptionText] = useState('');
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const hasAnnouncedSummary = useRef(false);
  const speakingTimerRef = useRef(null);
  const modalRef = useRef(null);
  const preModalFocusRef = useRef(null);
  const descriptionRef = useRef(null);
  const { logEvent } = useEventLogger();
  const { textSize, audioEnabled, speechRate } = useAccessibility();

  // When a modal is open, mark the app root as inert for VoiceOver focus trap
  // Modals are portalled to document.body, so we inert the #root element
  const isModalOpen = showVQA || showEditPanel;
  useEffect(() => {
    if (!isModalOpen) return;
    const root = document.getElementById('root');
    if (root) root.setAttribute('inert', '');
    // Focus the first focusable element in the modal
    setTimeout(() => {
      const focusable = modalRef.current?.querySelector('button, input, textarea, [tabindex]');
      focusable?.focus();
    }, 100);
    return () => {
      if (root) root.removeAttribute('inert');
      // Restore focus to the element that triggered the modal
      preModalFocusRef.current?.focus();
      preModalFocusRef.current = null;
    };
  }, [isModalOpen]);

  const total = segments?.length ?? 0;
  const segment = segments?.[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex >= total - 1;

  // Sync currentIndex with video playback time
  useEffect(() => {
    if (!isPlaying || !segments?.length) return;
    const matchIdx = segments.findIndex(
      (seg) => currentTime >= seg.start_time && currentTime < seg.end_time,
    );
    if (matchIdx !== -1 && matchIdx !== currentIndex) {
      setCurrentIndex(matchIdx);
    }
  }, [currentTime, isPlaying, segments, currentIndex]);

  // ---------------------------------------------------------------------------
  // Announce description helper
  // ---------------------------------------------------------------------------
  const stopSpeaking = useCallback(() => {
    ttsService.stop();
    setIsSpeaking(false);
    if (speakingTimerRef.current) {
      clearInterval(speakingTimerRef.current);
      speakingTimerRef.current = null;
    }
    announce('Stopped reading.');
  }, []);

  const focusDescription = useCallback(() => {
    descriptionRef.current?.focus();
  }, []);

  const announceDescription = useCallback(
    (seg, level) => {
      if (!seg) return;
      const key = `level_${level}`;
      const rawText = seg.descriptions?.[key] ?? '';
      const timePrefix = `${formatTime(seg.start_time)} - ${formatTime(seg.end_time)}`;
      const text = `Detail level ${level}. ${timePrefix}. ${rawText}`;
      announce(text);
      if (audioEnabled) {
        ttsService.speak(text, { rate: speechRate });
        setIsSpeaking(true);
        // Poll to detect when speech ends
        if (speakingTimerRef.current) clearInterval(speakingTimerRef.current);
        speakingTimerRef.current = setInterval(() => {
          if (!ttsService.isSpeaking) {
            setIsSpeaking(false);
            clearInterval(speakingTimerRef.current);
            speakingTimerRef.current = null;
          }
        }, 250);
      }
    },
    [audioEnabled, speechRate],
  );

  // Clean up speaking timer on unmount
  useEffect(() => {
    return () => {
      if (speakingTimerRef.current) clearInterval(speakingTimerRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Activation: pause video, announce summary on first open
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!active) {
      hasAnnouncedSummary.current = false;
      return;
    }

    playerRef?.current?.pause?.();
    if (segments?.[0]) {
      if (onSeek) onSeek(segments[0].start_time);
      else playerRef?.current?.seek?.(segments[0].start_time);
    }

    setCurrentIndex(0);
    setCurrentLevel(1);

    if (!hasAnnouncedSummary.current && segments?.length) {
      hasAnnouncedSummary.current = true;
      logEvent(EventTypes.PLAY_SUMMARY, Actors.SYSTEM, { videoTitle, sceneCount: segments.length });
    }

    logEvent(EventTypes.ENTER_EXPLORATION, Actors.CREATOR);

    // Focus the description and read it aloud via TTS
    setTimeout(() => {
      focusDescription();
    }, 300);
  }, [active, focusDescription]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Navigation callbacks (no wrapping — clamp at boundaries)
  // ---------------------------------------------------------------------------
  const goToPrevSegment = useCallback(() => {
    if (!total || currentIndex <= 0) return;
    const nextIdx = currentIndex - 1;
    setCurrentIndex(nextIdx);
    const seg = segments[nextIdx];
    if (seg) {
      playTone(880);
      if (onSeek) onSeek(seg.start_time);
      else playerRef?.current?.seek?.(seg.start_time);
      announce(`Scene ${nextIdx + 1} of ${total}. ${seg.name}.`);
      announceDescription(seg, currentLevel);
      logEvent(EventTypes.NAVIGATE_SEGMENT, Actors.CREATOR, {
        segmentId: seg.id,
        segmentIndex: nextIdx,
        direction: 'previous',
      });
    }
  }, [total, segments, currentIndex, currentLevel, announceDescription, logEvent, playerRef, onSeek]);

  const goToNextSegment = useCallback(() => {
    if (!total || currentIndex >= total - 1) return;
    const nextIdx = currentIndex + 1;
    setCurrentIndex(nextIdx);
    const seg = segments[nextIdx];
    if (seg) {
      playTone(880);
      if (onSeek) onSeek(seg.start_time);
      else playerRef?.current?.seek?.(seg.start_time);
      announce(`Scene ${nextIdx + 1} of ${total}. ${seg.name}.`);
      announceDescription(seg, currentLevel);
      logEvent(EventTypes.NAVIGATE_SEGMENT, Actors.CREATOR, {
        segmentId: seg.id,
        segmentIndex: nextIdx,
        direction: 'next',
      });
    }
  }, [total, segments, currentIndex, currentLevel, announceDescription, logEvent, playerRef, onSeek]);

  const increaseLevel = useCallback(() => {
    if (currentLevel >= 3) return;
    const next = currentLevel + 1;
    setCurrentLevel(next);
    playTone(440);
    announceDescription(segment, next);
    logEvent(EventTypes.CHANGE_GRANULARITY, Actors.CREATOR, { from: currentLevel, to: next });
  }, [currentLevel, segment, announceDescription, logEvent]);

  const decreaseLevel = useCallback(() => {
    if (currentLevel <= 1) return;
    const next = currentLevel - 1;
    setCurrentLevel(next);
    playTone(440);
    announceDescription(segment, next);
    logEvent(EventTypes.CHANGE_GRANULARITY, Actors.CREATOR, { from: currentLevel, to: next });
  }, [currentLevel, segment, announceDescription, logEvent]);

  const handleAskQuestion = useCallback(() => {
    preModalFocusRef.current = document.activeElement;
    setShowVQA(true);
    announce('Ask a question about this scene.');
  }, []);

  const handleMark = useCallback(() => {
    if (segment) onMark?.(segment.id, segment.name);
  }, [segment, onMark]);

  const handleEditOpen = useCallback(() => {
    preModalFocusRef.current = document.activeElement;
    setShowEditPanel(true);
    announce('Edit panel opened.');
    onEdit?.(segment);  // pass segment so parent knows which clip
  }, [onEdit, segment]);

  const handleEditClose = useCallback(() => {
    setShowEditPanel(false);
    announce('Edit panel closed.');
  }, []);

  // ---------------------------------------------------------------------------
  // Clip editing helpers
  // ---------------------------------------------------------------------------
  const clips = editState?.clips || [];
  const captions = editState?.captions || [];
  const sources = editState?.sources || [];
  const currentClipIndex = clips.findIndex((c) => c.id === segment?.id);
  const currentClip = currentClipIndex >= 0 ? clips[currentClipIndex] : null;
  const canMoveEarlier = currentClipIndex > 0;
  const canMoveLater = currentClipIndex >= 0 && currentClipIndex < clips.length - 1;
  const canSplit = currentClip && currentTime > currentClip.startTime + currentClip.trimStart && currentTime < currentClip.endTime - currentClip.trimEnd;

  const saveSnapshot = useCallback(() => {
    setUndoStack((prev) => [...prev, { clips: clips.map((c) => ({ ...c })), captions: captions.map((c) => ({ ...c })), sources: sources.map((s) => ({ ...s })) }]);
    setRedoStack([]);
  }, [clips, captions, sources]);

  const handleSplitClip = useCallback(() => {
    if (!canSplit || !editState) return;
    saveSnapshot();
    const clip = currentClip;
    const clipA = { ...clip, endTime: currentTime, trimEnd: 0, id: clip.id + '-a' };
    const clipB = { ...clip, startTime: currentTime, trimStart: 0, id: clip.id + '-b' };
    const newClips = [...clips];
    newClips.splice(currentClipIndex, 1, clipA, clipB);
    onEditChange?.(newClips, captions, sources);
    logEvent(EventTypes.SPLIT, Actors.CREATOR, { clipId: clip.id, clipName: clip.name, splitTime: currentTime });
    announce(`Split ${clip.name} at ${currentTime.toFixed(1)} seconds`);
  }, [canSplit, currentClip, currentClipIndex, clips, captions, sources, currentTime, editState, saveSnapshot, onEditChange, logEvent]);

  const handleDeleteClip = useCallback(() => {
    if (currentClipIndex < 0 || !editState) return;
    saveSnapshot();
    const newClips = clips.filter((_, i) => i !== currentClipIndex);
    onEditChange?.(newClips, captions, sources);
    logEvent(EventTypes.DELETE_CLIP, Actors.CREATOR, { clipId: currentClip.id, clipName: currentClip.name });
    announce(`Deleted clip: ${currentClip.name}`);
    setShowEditPanel(false);
  }, [currentClipIndex, clips, captions, sources, editState, saveSnapshot, onEditChange, logEvent, currentClip]);

  const handleMoveEarlier = useCallback(() => {
    if (!canMoveEarlier || !editState) return;
    saveSnapshot();
    const newClips = [...clips];
    [newClips[currentClipIndex - 1], newClips[currentClipIndex]] = [newClips[currentClipIndex], newClips[currentClipIndex - 1]];
    onEditChange?.(newClips, captions, sources);
    logEvent(EventTypes.REORDER, Actors.CREATOR, { clipId: currentClip.id, clipName: currentClip.name, direction: 'earlier' });
    announce(`Moved ${currentClip.name} earlier`);
  }, [canMoveEarlier, clips, captions, sources, currentClipIndex, editState, saveSnapshot, onEditChange, logEvent, currentClip]);

  const handleMoveLater = useCallback(() => {
    if (!canMoveLater || !editState) return;
    saveSnapshot();
    const newClips = [...clips];
    [newClips[currentClipIndex], newClips[currentClipIndex + 1]] = [newClips[currentClipIndex + 1], newClips[currentClipIndex]];
    onEditChange?.(newClips, captions, sources);
    logEvent(EventTypes.REORDER, Actors.CREATOR, { clipId: currentClip.id, clipName: currentClip.name, direction: 'later' });
    announce(`Moved ${currentClip.name} later`);
  }, [canMoveLater, clips, captions, sources, currentClipIndex, editState, saveSnapshot, onEditChange, logEvent, currentClip]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, { clips: clips.map((c) => ({ ...c })), captions: captions.map((c) => ({ ...c })), sources: sources.map((s) => ({ ...s })) }]);
    setUndoStack((u) => u.slice(0, -1));
    onEditChange?.(prev.clips, prev.captions, prev.sources);
    logEvent(EventTypes.UNDO, Actors.CREATOR, {});
    announce('Undo');
  }, [undoStack, clips, captions, sources, onEditChange, logEvent]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, { clips: clips.map((c) => ({ ...c })), captions: captions.map((c) => ({ ...c })), sources: sources.map((s) => ({ ...s })) }]);
    setRedoStack((r) => r.slice(0, -1));
    onEditChange?.(next.clips, next.captions, next.sources);
    logEvent(EventTypes.REDO, Actors.CREATOR, {});
    announce('Redo');
  }, [redoStack, clips, captions, sources, onEditChange, logEvent]);

  const handleAddCaption = useCallback(() => {
    const text = captionText.trim();
    if (!text || !segment || !editState) return;
    saveSnapshot();
    const newCaption = {
      id: `cap-${Date.now()}`,
      text,
      startTime: segment.start_time,
      endTime: segment.end_time,
    };
    const newCaptions = [...captions, newCaption];
    onEditChange?.(clips, newCaptions, sources);
    logEvent(EventTypes.ADD_CAPTION, Actors.CREATOR, { captionId: newCaption.id, text, startTime: segment.start_time, endTime: segment.end_time });
    announce(`Added caption: "${text}"`);
    setCaptionText('');
    setShowCaptionInput(false);
  }, [captionText, segment, editState, clips, captions, sources, saveSnapshot, onEditChange, logEvent]);

  const handlePlayPause = useCallback(() => {
    if (!playerRef?.current) return;
    if (isPlaying) {
      playerRef.current.pause();
      // Return focus to the description and read it aloud
      setTimeout(() => {
        focusDescription();
      }, 150);
    } else {
      if (segment) {
        if (onSeek) onSeek(segment.start_time);
        else playerRef.current.seek(segment.start_time);
      }
      playerRef.current.play();
      announce('Playing.');
    }
  }, [playerRef, isPlaying, segment, onSeek, focusDescription]);

  // ---------------------------------------------------------------------------
  // Keyboard handling
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!active) return;

    function onKeyDown(e) {
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.target.isContentEditable || e.target.getAttribute('role') === 'textbox') return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          goToPrevSegment();
          break;
        case 'ArrowRight':
          e.preventDefault();
          goToNextSegment();
          break;
        case 'ArrowUp':
          e.preventDefault();
          increaseLevel();
          break;
        case 'ArrowDown':
          e.preventDefault();
          decreaseLevel();
          break;
        case 'Enter':
          e.preventDefault();
          handleAskQuestion();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          handleMark();
          break;
        case ' ':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'Escape':
          e.preventDefault();
          if (showVQA) setShowVQA(false);
          else if (showEditPanel) setShowEditPanel(false);
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, goToPrevSegment, goToNextSegment, increaseLevel, decreaseLevel, handleAskQuestion, handleMark, handlePlayPause, showVQA, showEditPanel]);

  // ---------------------------------------------------------------------------
  // Don't render when inactive
  // ---------------------------------------------------------------------------
  if (!active || !segment) return null;

  const descriptionKey = `level_${currentLevel}`;
  const rawDescription = segment.descriptions?.[descriptionKey] ?? 'No description available.';

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Scene Description Card */}
      <div
        role="region"
        aria-label="Scene description"
        className="rounded-2xl overflow-hidden bg-white"
        style={{ border: `1px solid ${accentStyles.headerBorder}`, boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04)' }}
      >
        {/* Card header */}
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)` }}
        >
          <span className="text-xs font-bold tracking-wider uppercase text-white/90">Scene Description</span>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/20 text-white backdrop-blur-sm">
            {currentIndex + 1} / {total}
          </span>
        </div>

        {/* Detail level controls */}
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: '1px solid #eef2f7', background: '#fafbfc' }}>
          <span className="text-xs font-bold text-[#64748b] whitespace-nowrap tracking-wide" role="status" aria-live="polite" aria-label={`Detail level ${currentLevel} of 3`}>
            Detail {currentLevel}/3
          </span>
          <div className="flex-1 flex items-center gap-1.5">
            {[1, 2, 3].map((lvl) => (
              <div
                key={lvl}
                className="flex-1 h-1 rounded-full transition-all duration-300"
                style={{ backgroundColor: lvl <= currentLevel ? accentColor : '#e2e8f0' }}
                aria-hidden="true"
              />
            ))}
          </div>
          <button
            type="button"
            onClick={decreaseLevel}
            disabled={currentLevel <= 1}
            aria-label={`Less detail, currently level ${currentLevel} of 3`}
            className="py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-35 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-1"
            style={{ minHeight: '48px', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', '--tw-ring-color': accentColor }}
          >
            − Less
          </button>
          <button
            type="button"
            onClick={increaseLevel}
            disabled={currentLevel >= 3}
            aria-label={`More detail, currently level ${currentLevel} of 3`}
            className="py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-35 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-1"
            style={{ minHeight: '48px', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', '--tw-ring-color': accentColor }}
          >
            + More
          </button>
        </div>

        {/* Stop Reading banner — shown while TTS is active */}
        {isSpeaking && (
          <button
            type="button"
            onClick={stopSpeaking}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all duration-150 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white/50"
            style={{ background: accentColor, color: 'white', minHeight: '44px' }}
            aria-label="Stop reading description"
          >
            <span className="w-3 h-3 rounded-sm bg-white" aria-hidden="true" />
            Tap to Stop Reading
          </button>
        )}

        {/* Description body */}
        <div className="px-4 py-4">
          <p
            ref={descriptionRef}
            tabIndex={-1}
            className={`${textSizeClasses[textSize] ?? 'text-lg'} leading-relaxed text-gray-800 focus:outline-none`}
            aria-label={`Scene ${currentIndex + 1} of ${total}. ${segment.name}. ${formatTime(segment.start_time)} to ${formatTime(segment.end_time)}. Detail level ${currentLevel} of 3. ${rawDescription}`}
          >
            <span className="block text-sm font-bold mb-0.5" style={{ color: accentColor }} aria-hidden="true">
              {segment.name}
            </span>
            <span className="block text-xs text-gray-400 mb-3 font-medium tracking-wide" aria-hidden="true">
              {formatTime(segment.start_time)} – {formatTime(segment.end_time)}
            </span>
            <span className="text-[#334155]" aria-hidden="true">{rawDescription}</span>
          </p>
        </div>

        {/* Navigation row */}
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderTop: '1px solid #eef2f7', background: '#fafbfc' }}>
          <button
            type="button"
            onClick={goToPrevSegment}
            disabled={isFirst}
            aria-label={isFirst ? 'Previous scene, at first scene' : `Previous scene: ${segments[currentIndex - 1]?.name}`}
            className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-35 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-1"
            style={{ minHeight: '48px', backgroundColor: accentStyles.navBtnBg, color: accentStyles.navBtnText, '--tw-ring-color': accentColor }}
          >
            ◀ Prev
          </button>
          <button
            type="button"
            onClick={handlePlayPause}
            aria-label={isPlaying ? 'Pause playback' : 'Play from scene start'}
            className="flex-none px-5 py-3 rounded-xl text-sm font-bold text-white transition-all duration-150 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-1"
            style={{ minHeight: '48px', backgroundColor: accentColor, boxShadow: `0 2px 8px ${accentColor}40`, '--tw-ring-color': accentColor }}
          >
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <button
            type="button"
            onClick={goToNextSegment}
            disabled={isLast}
            aria-label={isLast ? 'Next scene, at last scene' : `Next scene: ${segments[currentIndex + 1]?.name}`}
            className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-35 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-1"
            style={{ minHeight: '48px', backgroundColor: accentStyles.navBtnBg, color: accentStyles.navBtnText, '--tw-ring-color': accentColor }}
          >
            Next ▶
          </button>
        </div>
      </div>

      {/* Actions Card — hidden for probe1 */}
      {actionMode !== 'probe1' && (
        <div
          role="region"
          aria-label="Actions"
          className="rounded-2xl overflow-hidden bg-white"
          style={{ border: '1px solid #e8ecf1', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.03)' }}
        >
          <div className="px-4 py-2.5" style={{ background: '#f8f9fb', borderBottom: '1px solid #eef2f7' }}>
            <span className="text-xs font-bold tracking-wider text-[#64748b] uppercase">Actions</span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-3">
            <button
              type="button"
              onClick={handleEditOpen}
              aria-label="Edit this clip yourself"
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all duration-150 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              style={{ minHeight: '48px', background: 'linear-gradient(135deg, #374151, #1f2937)', boxShadow: '0 2px 6px rgba(55,65,81,0.3)' }}
            >
              <span aria-hidden="true">✏️ </span>Edit Myself
            </button>
            <button
              type="button"
              onClick={() => onAskAI ? onAskAI(segment) : handleAskQuestion()}
              aria-label="Ask AI to edit this clip"
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all duration-150 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-1"
              style={{ minHeight: '48px', background: 'linear-gradient(135deg, #7D3C98, #6C3483)', boxShadow: '0 2px 6px rgba(125,60,152,0.35)', '--tw-ring-color': '#7D3C98' }}
            >
              <span aria-hidden="true">🤖 </span>Ask AI
            </button>
            <button
              type="button"
              onClick={() => onAskHelper?.(segment)}
              aria-label="Ask helper to edit this clip"
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all duration-150 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-1"
              style={{ minHeight: '48px', background: 'linear-gradient(135deg, #B85C14, #A04000)', boxShadow: '0 2px 6px rgba(184,92,20,0.35)', '--tw-ring-color': '#B85C14' }}
            >
              <span aria-hidden="true">🙋 </span>Ask Helper
            </button>
          </div>
        </div>
      )}

      {/* VQA Modal — portalled to document.body for VoiceOver focus trap */}
      {showVQA && createPortal(
        <div
          ref={modalRef}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-label="Ask about this scene"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowVQA(false);
          }}
        >
          <div className="w-full max-w-lg bg-white rounded-t-2xl shadow-2xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="font-bold text-sm text-gray-900">Ask About This Scene</h3>
              <button
                onClick={() => setShowVQA(false)}
                className="px-3 py-1.5 rounded text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-2 focus:outline-blue-500"
                style={{ minHeight: '44px', minWidth: '44px' }}
                aria-label="Close ask panel"
              >
                Done
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <VQAPanel playerRef={playerRef} currentSegment={segment} />
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Edit Actions — portalled to document.body for VoiceOver focus trap */}
      {showEditPanel && createPortal(
        <div
          ref={modalRef}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-label={`Edit clip: ${currentClip?.name || 'current scene'}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleEditClose();
          }}
        >
          <div className="w-full max-w-lg bg-white rounded-t-2xl shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="font-bold text-sm text-gray-900">
                Edit: {currentClip?.name || 'Current Scene'}
              </h3>
              <button
                onClick={handleEditClose}
                className="px-3 py-1.5 rounded text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-2 focus:outline-blue-500"
                style={{ minHeight: '44px', minWidth: '44px' }}
                aria-label="Close edit actions"
              >
                Done
              </button>
            </div>
            <div className="flex flex-col gap-2 p-4">
              {/* Split */}
              <button
                type="button"
                onClick={handleSplitClip}
                disabled={!canSplit}
                aria-label="Split this clip at the current playback position"
                className="w-full py-3 rounded-lg bg-[#2B579A] text-sm font-bold text-white hover:bg-[#1e3f6f] disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#2B579A] focus:ring-offset-1"
                style={{ minHeight: '48px' }}
              >
                Split
              </button>
              {/* Move Earlier / Move Later */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleMoveEarlier}
                  disabled={!canMoveEarlier}
                  aria-label="Move this clip earlier in the timeline"
                  className="flex-1 py-3 rounded-lg bg-gray-100 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#2B579A] focus:ring-offset-1"
                  style={{ minHeight: '48px' }}
                >
                  Move Earlier
                </button>
                <button
                  type="button"
                  onClick={handleMoveLater}
                  disabled={!canMoveLater}
                  aria-label="Move this clip later in the timeline"
                  className="flex-1 py-3 rounded-lg bg-gray-100 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#2B579A] focus:ring-offset-1"
                  style={{ minHeight: '48px' }}
                >
                  Move Later
                </button>
              </div>
              {/* Delete */}
              <button
                type="button"
                onClick={handleDeleteClip}
                disabled={!currentClip}
                aria-label="Delete this clip from the timeline"
                className="w-full py-3 rounded-lg bg-red-500 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2"
                style={{ minHeight: '48px' }}
              >
                Delete
              </button>
              {/* Undo / Redo */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  aria-label="Undo last edit"
                  className="flex-1 py-3 rounded-lg bg-gray-100 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#2B579A] focus:ring-offset-1"
                  style={{ minHeight: '48px' }}
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  aria-label="Redo last undone edit"
                  className="flex-1 py-3 rounded-lg bg-gray-100 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#2B579A] focus:ring-offset-1"
                  style={{ minHeight: '48px' }}
                >
                  Redo
                </button>
              </div>
              {/* Add Caption */}
              {!showCaptionInput ? (
                <button
                  type="button"
                  onClick={() => setShowCaptionInput(true)}
                  aria-label="Add a caption to this scene"
                  className="w-full py-3 rounded-lg bg-amber-500 text-sm font-bold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2"
                  style={{ minHeight: '48px' }}
                >
                  Add Caption
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={captionText}
                    onChange={(e) => setCaptionText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddCaption(); }}
                    placeholder="Enter caption text..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-2 focus:outline-[#2B579A]"
                    style={{ minHeight: '48px' }}
                    aria-label="Caption text"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleAddCaption}
                    disabled={!captionText.trim()}
                    aria-label="Save caption"
                    className="px-4 py-2 rounded-lg bg-amber-500 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1"
                    style={{ minHeight: '48px', minWidth: '48px' }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowCaptionInput(false); setCaptionText(''); }}
                    aria-label="Cancel adding caption"
                    className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1"
                    style={{ minHeight: '48px', minWidth: '48px' }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
