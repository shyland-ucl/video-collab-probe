import { useState, useEffect, useCallback, useRef } from 'react';
import SwipeHandler from '../shared/SwipeHandler.jsx';
import { announce } from '../../utils/announcer.js';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { useAccessibility } from '../../contexts/AccessibilityContext.jsx';
import ttsService from '../../services/ttsService.js';

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
 * @param {number} frequency - Hz value for the tone
 * @param {number} duration - milliseconds
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
    // Clean up after tone finishes
    osc.onended = () => ctx.close();
  } catch {
    // Web Audio not available — silently ignore
  }
}

const textSizeClasses = {
  small: 'text-base',
  medium: 'text-lg',
  large: 'text-xl',
};

/**
 * Visual Exploration Mode overlay for Probe 1.
 * When active the video is paused and users navigate scene descriptions
 * via keyboard arrows, swipe gestures, or on-screen buttons.
 */
export default function ExplorationMode({
  active,
  segments,
  videoTitle,
  onExit,
  onMark,
  onAskQuestion,
  playerRef,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentLevel, setCurrentLevel] = useState(1);
  const hasAnnouncedSummary = useRef(false);
  const { logEvent } = useEventLogger();
  const { textSize, audioEnabled, speechRate } = useAccessibility();

  const total = segments?.length ?? 0;
  const segment = segments?.[currentIndex];

  // ---------------------------------------------------------------------------
  // Announce description helper
  // ---------------------------------------------------------------------------
  const announceDescription = useCallback(
    (seg, level) => {
      if (!seg) return;
      const key = `level_${level}`;
      const text = seg.descriptions?.[key] ?? '';
      announce(text);
      if (audioEnabled) {
        ttsService.speak(text, { rate: speechRate });
      }
    },
    [audioEnabled, speechRate],
  );

  // ---------------------------------------------------------------------------
  // Activation: pause video, announce summary on first open
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!active) {
      hasAnnouncedSummary.current = false;
      return;
    }

    // Pause the video
    playerRef?.current?.pause?.();

    // Reset to first segment, level 1
    setCurrentIndex(0);
    setCurrentLevel(1);

    // Announce summary once
    if (!hasAnnouncedSummary.current && segments?.length) {
      hasAnnouncedSummary.current = true;
      const summary = `Video: ${videoTitle}. ${segments.length} scenes detected. Swipe left and right to browse scenes, swipe up and down to change detail level.`;
      announce(summary);
      if (audioEnabled) {
        ttsService.speak(summary, { rate: speechRate });
      }
      logEvent(EventTypes.PLAY_SUMMARY, Actors.SYSTEM, { videoTitle, sceneCount: segments.length });
    }

    logEvent(EventTypes.ENTER_EXPLORATION, Actors.CREATOR);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Navigation callbacks
  // ---------------------------------------------------------------------------
  const goToPrevSegment = useCallback(() => {
    if (!total) return;
    setCurrentIndex((prev) => {
      const next = (prev - 1 + total) % total;
      playTone(880);
      const seg = segments[next];
      announce(`Scene ${next + 1} of ${total}, detail level ${currentLevel}`);
      announceDescription(seg, currentLevel);
      logEvent(EventTypes.NAVIGATE_SEGMENT, Actors.CREATOR, {
        segmentId: seg.id,
        segmentIndex: next,
        direction: 'previous',
      });
      return next;
    });
  }, [total, segments, currentLevel, announceDescription, logEvent]);

  const goToNextSegment = useCallback(() => {
    if (!total) return;
    setCurrentIndex((prev) => {
      const next = (prev + 1) % total;
      playTone(880);
      const seg = segments[next];
      announce(`Scene ${next + 1} of ${total}, detail level ${currentLevel}`);
      announceDescription(seg, currentLevel);
      logEvent(EventTypes.NAVIGATE_SEGMENT, Actors.CREATOR, {
        segmentId: seg.id,
        segmentIndex: next,
        direction: 'next',
      });
      return next;
    });
  }, [total, segments, currentLevel, announceDescription, logEvent]);

  const increaseLevel = useCallback(() => {
    setCurrentLevel((prev) => {
      if (prev >= 3) return prev;
      const next = prev + 1;
      playTone(440);
      announce(`Scene ${currentIndex + 1} of ${total}, detail level ${next}`);
      announceDescription(segment, next);
      logEvent(EventTypes.CHANGE_GRANULARITY, Actors.CREATOR, { from: prev, to: next });
      return next;
    });
  }, [currentIndex, total, segment, announceDescription, logEvent]);

  const decreaseLevel = useCallback(() => {
    setCurrentLevel((prev) => {
      if (prev <= 1) return prev;
      const next = prev - 1;
      playTone(440);
      announce(`Scene ${currentIndex + 1} of ${total}, detail level ${next}`);
      announceDescription(segment, next);
      logEvent(EventTypes.CHANGE_GRANULARITY, Actors.CREATOR, { from: prev, to: next });
      return next;
    });
  }, [currentIndex, total, segment, announceDescription, logEvent]);

  const handleAskQuestion = useCallback(() => {
    if (segment) onAskQuestion?.(segment.id);
  }, [segment, onAskQuestion]);

  const handleMark = useCallback(() => {
    if (segment) onMark?.(segment.id, segment.name);
  }, [segment, onMark]);

  const handleExit = useCallback(() => {
    logEvent(EventTypes.EXIT_EXPLORATION, Actors.CREATOR);
    ttsService.stop();
    onExit?.();
  }, [logEvent, onExit]);

  // ---------------------------------------------------------------------------
  // Keyboard handling
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!active) return;

    function onKeyDown(e) {
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
        case 'Escape':
          e.preventDefault();
          handleExit();
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, goToPrevSegment, goToNextSegment, increaseLevel, decreaseLevel, handleAskQuestion, handleMark, handleExit]);

  // ---------------------------------------------------------------------------
  // Don't render when inactive
  // ---------------------------------------------------------------------------
  if (!active || !segment) return null;

  const descriptionKey = `level_${currentLevel}`;
  const descriptionText = segment.descriptions?.[descriptionKey] ?? 'No description available.';

  return (
    <SwipeHandler
      onSwipeLeft={goToNextSegment}
      onSwipeRight={goToPrevSegment}
      onSwipeUp={increaseLevel}
      onSwipeDown={decreaseLevel}
      onDoubleTap={handleAskQuestion}
      onLongPress={handleMark}
      className="w-full"
    >
      <div
        role="region"
        aria-label="Visual Exploration Mode"
        aria-live="polite"
        className="w-full border-t-2 border-[#2B579A] bg-slate-50 shadow-[0_-2px_12px_rgba(43,87,154,0.15)]"
      >
        {/* Top banner */}
        <div className="flex items-center justify-between bg-[#2B579A] px-4 py-2 text-white">
          <span className="font-semibold" aria-label={`Exploring scene ${currentIndex + 1} of ${total}`}>
            Exploring scene {currentIndex + 1}/{total}
          </span>
          <span className="text-sm opacity-80">
            {formatTime(segment.start_time)} &ndash; {formatTime(segment.end_time)}
          </span>
        </div>

        {/* Description area */}
        <div className="px-4 py-5">
          {/* Segment name */}
          <h3 className="mb-1 text-sm font-medium text-[#2B579A]">
            {segment.name}
          </h3>

          {/* Description text */}
          <p className={`${textSizeClasses[textSize] ?? 'text-lg'} leading-relaxed text-gray-800`}>
            {descriptionText}
          </p>

          {/* Level indicator pills */}
          <div className="mt-4 flex items-center gap-2" role="group" aria-label={`Detail level ${currentLevel} of 3`}>
            <span className="mr-1 text-xs font-medium text-gray-500 uppercase">Detail</span>
            {[1, 2, 3].map((lvl) => (
              <span
                key={lvl}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  lvl === currentLevel
                    ? 'bg-[#2B579A] text-white ring-2 ring-offset-1 ring-[#2B579A]'
                    : 'bg-gray-200 text-gray-500'
                }`}
                aria-current={lvl === currentLevel ? 'true' : undefined}
                aria-label={`Level ${lvl}${lvl === currentLevel ? ' (current)' : ''}`}
              >
                {lvl}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom action bar */}
        <div className="flex items-center gap-3 border-t border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={handleMark}
            aria-label="Mark this segment"
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2"
            style={{ minHeight: '44px', minWidth: '44px' }}
          >
            Mark
          </button>

          <button
            type="button"
            onClick={handleAskQuestion}
            aria-label="Ask a question about this segment"
            className="rounded-md bg-[#2B579A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e3f6f] focus:outline-none focus:ring-2 focus:ring-[#2B579A] focus:ring-offset-2"
            style={{ minHeight: '44px', minWidth: '44px' }}
          >
            Ask
          </button>

          <div className="flex-1" />

          <button
            type="button"
            onClick={handleExit}
            aria-label="Resume video playback (Escape)"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#2B579A] focus:ring-offset-2"
            style={{ minHeight: '44px' }}
          >
            Resume Playback
          </button>
        </div>
      </div>
    </SwipeHandler>
  );
}
