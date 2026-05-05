import { useState, useCallback, useRef, useEffect } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import ttsService from '../../services/ttsService.js';
import { announce } from '../../utils/announcer.js';
import GlobalControlsBar from './GlobalControlsBar.jsx';
import SceneBlock from './SceneBlock.jsx';
import { LEVELS } from '../../utils/detailLevels.js';
import { buildSceneDescriptionAddendum } from '../../utils/descriptionAddenda.js';

const FOCUS_SCROLL_GUARD_MS = 350;
const FOCUS_SCROLL_RESTORE_DELAYS = [0, 16, 64, 160, 320];
const VISIBILITY_TOLERANCE_PX = 2;
const HORIZONTAL_SWIPE_THRESHOLD_PX = 10;
const HORIZONTAL_SWIPE_LOCK_MS = 550;
const MANUAL_SCROLL_ALLOW_MS = 600;

function getContentTop(container, target) {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  return targetRect.top - containerRect.top + container.scrollTop;
}

function isFullyVisibleAtScrollTop(container, target, scrollTop) {
  const top = getContentTop(container, target) - scrollTop;
  const bottom = top + target.getBoundingClientRect().height;
  return (
    top >= -VISIBILITY_TOLERANCE_PX
    && bottom <= container.clientHeight + VISIBILITY_TOLERANCE_PX
  );
}

export default function SceneBlockList({
  scenes = [],
  playerRef,
  currentTime = 0,
  isPlaying = false,
  onSeek,
  onPlay,
  onPause,
  accentColor = '#2B579A',
  videoCount = 1,
  summaryFocusToken = 0,
  // Per-scene data
  vqaHistories = {},
  awarenessData = {},
  // sceneId → boolean. When `keptScenes[id] === false`, the scene is marked
  // removed and the block renders dimmed with a "Removed" badge so the
  // participant gets visible confirmation that Remove worked. Playback
  // filtering happens upstream via filterClipsByKept.
  keptScenes = {},
  // Render prop for probe-specific actions
  renderSceneActions,
  // Fired when a scene is FULLY collapsed (close button, header tap, or
  // browser-back) — NOT on auto-follow boundary moves. Pages use this to
  // wipe per-scene chat history so re-opening starts fresh and TalkBack
  // doesn't have to swipe past N stale Q+A bubbles (Lan 2026-04-27).
  onSceneClose,
  // Engagement-only AWARENESS_VIEWED. Forwarded to each SceneBlock so the
  // page (which knows the viewer's role) can attribute the event correctly.
  onAwarenessViewed,
  // Set<number> of scene array-indices that have an AI suggestion attached.
  // SceneBlock renders a small "✨ AI" badge in the header and adds an aria
  // hint so a TalkBack creator can find suggestion-bearing scenes by swiping
  // the list. Empty set = no decoration (default before analysis trigger).
  sceneIndicesWithSuggestions,
  // When the page is doing single-segment playback ("Play from here"), it
  // sets this true so we skip the auto-expand-next-scene effect. Without
  // it, a video timeUpdate tick that lands a few ms past the segment end
  // (the player's tick can be ~100-200ms wide) lets us expand the next
  // block before the page-level pause takes effect.
  disableAutoFollow = false,
  // Day 1 fix #3: { [sceneId]: { text, actor, timestamp } } map of scenes
  // that were edited recently. Drives the amber "Edited" badge + the
  // "What changed" line prepended to the description.
  editedScenes = {},
  editState = null,
}) {
  const [expandedIndex, setExpandedIndex] = useState(null);
  // Where the latest expansion came from. Drives focus behavior in SceneBlock:
  //   'user' — manual tap → focus the actions region (default landing).
  //   'auto' — playback auto-follow → focus the new scene's Play/Pause button
  //            so the user stays on the button they were just using.
  const [expandSource, setExpandSource] = useState('user');
  const [playbackFocusToken, setPlaybackFocusToken] = useState(0);
  const [currentLevel, setCurrentLevel] = useState(1);
  const listRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const stableScrollTopRef = useRef(0);
  const focusScrollGuardRef = useRef(null);
  const focusRestoreTimersRef = useRef([]);
  const touchScrollLockRef = useRef(null);
  const manualScrollAllowedUntilRef = useRef(0);
  // Refs to each SceneBlock's collapsed-header button. Used to restore
  // focus when a scene is fully collapsed — otherwise the browser drops
  // focus to <body> and TalkBack/VoiceOver swipe-navigates from page top
  // (Lan 2026-04-27 regression).
  const headerRefs = useRef([]);
  const prevExpandedRef = useRef(null);
  const wasPlayingForFocusRef = useRef(false);
  const playbackPauseButtonRef = useRef(null);
  const { logEvent } = useEventLogger();

  const clearFocusRestoreTimers = useCallback(() => {
    focusRestoreTimersRef.current.forEach((timer) => clearTimeout(timer));
    focusRestoreTimersRef.current = [];
  }, []);

  const restoreGuardedScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    const activeTouchLock = touchScrollLockRef.current?.horizontal ? touchScrollLockRef.current : null;
    const guard = activeTouchLock || focusScrollGuardRef.current;
    if (!container || !guard) return;
    if (performance.now() > guard.expiresAt) {
      if (touchScrollLockRef.current === guard) touchScrollLockRef.current = null;
      if (focusScrollGuardRef.current === guard) focusScrollGuardRef.current = null;
      stableScrollTopRef.current = container.scrollTop;
      return;
    }
    if (Math.abs(container.scrollTop - guard.scrollTop) > VISIBILITY_TOLERANCE_PX) {
      container.scrollTop = guard.scrollTop;
    }
    stableScrollTopRef.current = guard.scrollTop;
  }, []);

  const scheduleGuardedScrollRestore = useCallback(() => {
    clearFocusRestoreTimers();
    focusRestoreTimersRef.current = FOCUS_SCROLL_RESTORE_DELAYS.map((delay) => (
      setTimeout(restoreGuardedScroll, delay)
    ));
  }, [clearFocusRestoreTimers, restoreGuardedScroll]);

  const allowManualScroll = useCallback(() => {
    manualScrollAllowedUntilRef.current = performance.now() + MANUAL_SCROLL_ALLOW_MS;
  }, []);

  const shouldPinFocusedSceneScroll = useCallback((container, scrollTop) => {
    const active = document.activeElement;
    if (!(active instanceof Element) || !container.contains(active)) return false;

    const header = active.closest('[data-scene-index]');
    if (!header || !container.contains(header)) return false;

    return isFullyVisibleAtScrollTop(container, header, scrollTop);
  }, []);

  useEffect(() => clearFocusRestoreTimers, [clearFocusRestoreTimers]);

  useEffect(() => {
    stableScrollTopRef.current = scrollContainerRef.current?.scrollTop || 0;
  }, [scenes.length]);

  const handleListFocusCapture = useCallback((event) => {
    const container = scrollContainerRef.current;
    const target = event.target;
    if (!container || !(target instanceof Element)) return;

    const sceneHeader = target.closest('[data-scene-index]');
    if (!sceneHeader || !container.contains(sceneHeader)) return;

    const stableScrollTop = touchScrollLockRef.current?.scrollTop ?? stableScrollTopRef.current;
    if (!isFullyVisibleAtScrollTop(container, sceneHeader, stableScrollTop)) {
      focusScrollGuardRef.current = null;
      return;
    }

    focusScrollGuardRef.current = {
      scrollTop: stableScrollTop,
      expiresAt: performance.now() + FOCUS_SCROLL_GUARD_MS,
    };
    scheduleGuardedScrollRestore();
  }, [scheduleGuardedScrollRestore]);

  const handleListScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    const activeTouchLock = touchScrollLockRef.current?.horizontal ? touchScrollLockRef.current : null;
    const guard = activeTouchLock || focusScrollGuardRef.current;
    if (!container) return;
    const now = performance.now();

    if (guard && now <= guard.expiresAt) {
      restoreGuardedScroll();
      return;
    }

    const manualScrollAllowed = now <= manualScrollAllowedUntilRef.current;
    if (!manualScrollAllowed && shouldPinFocusedSceneScroll(container, stableScrollTopRef.current)) {
      if (Math.abs(container.scrollTop - stableScrollTopRef.current) > VISIBILITY_TOLERANCE_PX) {
        container.scrollTop = stableScrollTopRef.current;
      }
      return;
    }

    focusScrollGuardRef.current = null;
    touchScrollLockRef.current = null;
    stableScrollTopRef.current = container.scrollTop;
  }, [restoreGuardedScroll, shouldPinFocusedSceneScroll]);

  const handleTouchStart = useCallback((event) => {
    const container = scrollContainerRef.current;
    const touch = event.touches?.[0];
    if (!container || !touch) return;
    if (event.touches.length > 1) allowManualScroll();
    touchScrollLockRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      scrollTop: container.scrollTop,
      horizontal: false,
      expiresAt: performance.now() + HORIZONTAL_SWIPE_LOCK_MS,
    };
  }, []);

  const handleTouchMove = useCallback((event) => {
    const container = scrollContainerRef.current;
    const touch = event.touches?.[0];
    const lock = touchScrollLockRef.current;
    if (!container || !touch || !lock) return;

    const dx = touch.clientX - lock.startX;
    const dy = touch.clientY - lock.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (!lock.horizontal && absDy > HORIZONTAL_SWIPE_THRESHOLD_PX && absDy > absDx) {
      allowManualScroll();
      touchScrollLockRef.current = null;
      return;
    }

    if (lock.horizontal || (absDx > HORIZONTAL_SWIPE_THRESHOLD_PX && absDx > absDy)) {
      lock.horizontal = true;
      lock.expiresAt = performance.now() + HORIZONTAL_SWIPE_LOCK_MS;
      if (event.cancelable) event.preventDefault();
      if (Math.abs(container.scrollTop - lock.scrollTop) > VISIBILITY_TOLERANCE_PX) {
        container.scrollTop = lock.scrollTop;
      }
      stableScrollTopRef.current = lock.scrollTop;
    }
  }, [allowManualScroll]);

  const handleTouchEnd = useCallback(() => {
    const lock = touchScrollLockRef.current;
    if (!lock) return;
    if (!lock.horizontal) {
      touchScrollLockRef.current = null;
      return;
    }
    lock.expiresAt = performance.now() + HORIZONTAL_SWIPE_LOCK_MS;
    scheduleGuardedScrollRestore();
  }, [scheduleGuardedScrollRestore]);

  const handleWheel = useCallback(() => {
    allowManualScroll();
  }, [allowManualScroll]);

  const totalDuration = scenes.reduce(
    (sum, s) => sum + ((s.end_time || 0) - (s.start_time || 0)),
    0
  );

  const getSceneDescription = useCallback((scene, level) => {
    const base = scene?.descriptions?.[`level_${level}`] || '';
    const addendum = buildSceneDescriptionAddendum({
      scene,
      currentLevel: level,
      editState,
      editSummary: editedScenes[scene?.id],
    });
    return [base, addendum].filter(Boolean).join(' ');
  }, [editState, editedScenes]);

  const handleExpand = useCallback(
    (index) => {
      setExpandSource('user');
      setExpandedIndex(index);
      const scene = scenes[index];
      logEvent(EventTypes.NAVIGATE_SEGMENT, Actors.CREATOR, {
        segmentId: scene?.id,
        segmentName: scene?.name,
        action: 'expand',
      });
      if (onSeek && scene) {
        onSeek(scene.start_time);
      }
    },
    [scenes, logEvent, onSeek]
  );

  const handleCollapse = useCallback(() => {
    setExpandedIndex(null);
    ttsService.stop();
    announce('Scene closed.');
  }, []);

  const handleLevelChange = useCallback(
    (level) => {
      logEvent(EventTypes.DESCRIPTION_LEVEL_CHANGE, Actors.CREATOR, {
        fromLevel: currentLevel,
        toLevel: level,
      });
      setCurrentLevel(level);
      // Announce the new level *and* the description for the currently
      // expanded scene so the user immediately hears what changed
      // (2026-04-26 Lan request — the level name alone doesn't tell them
      // what's now in the description). Falls back to the level name only
      // when no scene is open. announce() is queued, never speak() — see
      // memory `feedback_scene_block_a11y.md`.
      //
      // Avoid the phrase "detailed description" — it's a recognised
      // assistive-tech term (long-description / aria-describedby) and
      // TalkBack on Android sometimes filters or mis-routes it. Phrasing
      // the level as "{label} view" sidesteps the collision.
      const label = LEVELS.find((l) => l.value === level)?.label;
      const expandedScene = expandedIndex !== null ? scenes[expandedIndex] : null;
      const desc = expandedScene ? getSceneDescription(expandedScene, level) : '';
      // Assertive carries BOTH the level label and the description. We
      // tried trimming this to just `${label}.` and relying on the chip's
      // aria-label being read on focus move — but on Android TalkBack the
      // programmatic focus to the chip's `tabIndex={-1}` <span> doesn't
      // reliably trigger a re-read, so the description disappeared
      // (Lan-confirmed regression, 2026-04-26). The chip's accessible
      // name is now just the visible level word (no duplication risk),
      // so we put the description back into the assertive announce
      // — that's the only channel Android can hear.
      const text = expandedScene && desc ? `${label}. ${desc}` : `${label}.`;
      announce(text, { assertive: true });
    },
    [currentLevel, logEvent, expandedIndex, scenes, getSceneDescription]
  );

  // Auto-navigate to the scene matching current playback time. Setting
  // expandedIndex collapses the previous SceneBlock and expands the new one,
  // so the expanded options visibly follow playback. We deliberately do NOT
  // announce a boundary cue here — Lan 2026-04-26 wants playback to stay
  // quiet so the video audio isn't talked over. Focus still moves to the
  // new scene's play button (via SceneBlock's expand effect with
  // autoFollowed=true), and TalkBack reads the focused button on its own.
  useEffect(() => {
    const wasPlaying = wasPlayingForFocusRef.current;
    wasPlayingForFocusRef.current = isPlaying;
    if (wasPlaying || !isPlaying || disableAutoFollow) return;

    const activeIndex = scenes.findIndex(
      (s) => currentTime >= s.start_time && currentTime < s.end_time
    );
    if (activeIndex === -1) return;

    setExpandSource('auto');
    setExpandedIndex(activeIndex);
    setPlaybackFocusToken((token) => token + 1);
    requestAnimationFrame(() => {
      playbackPauseButtonRef.current?.focus({ preventScroll: true });
    });
  }, [isPlaying, disableAutoFollow, scenes, currentTime]);

  useEffect(() => {
    if (!isPlaying) return;
    if (disableAutoFollow) return;
    const activeIndex = scenes.findIndex(
      (s) => currentTime >= s.start_time && currentTime < s.end_time
    );
    if (activeIndex !== -1 && activeIndex !== expandedIndex) {
      setExpandSource('auto');
      setExpandedIndex(activeIndex);
    }
  }, [currentTime, isPlaying, scenes, expandedIndex, disableAutoFollow]);

  // Pause read-out: when playback transitions playing → paused while a
  // scene is expanded, announce the current scene's description so the
  // user hears what they just paused on. Uses announce() (live region),
  // never ttsService.speak — per memory `feedback_scene_block_a11y.md`,
  // active TTS fights TalkBack.
  const wasPlayingRef = useRef(isPlaying);
  useEffect(() => {
    const wasPlaying = wasPlayingRef.current;
    wasPlayingRef.current = isPlaying;
    let firstFrame = null;
    let secondFrame = null;
    if (wasPlaying && !isPlaying && expandedIndex !== null) {
      const activeIndex = scenes.findIndex(
        (s) => currentTime >= s.start_time && currentTime < s.end_time
      );
      const pausedIndex = activeIndex !== -1 ? activeIndex : expandedIndex;
      const scene = scenes[pausedIndex];
      const desc = scene ? getSceneDescription(scene, currentLevel) : '';
      if (pausedIndex !== expandedIndex) {
        setExpandSource('auto');
        setExpandedIndex(pausedIndex);
      }
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          const target = headerRefs.current[pausedIndex];
          target?.scrollIntoView?.({ behavior: 'auto', block: 'nearest' });
          target?.focus({ preventScroll: true });
        });
      });
      if (desc) {
        // Assertive: pause flips the scene-play button's aria-label from
        // "Pause from here" back to "Play from here", and Android
        // TalkBack re-reads the activated button. A polite announce here
        // gets dropped, which is exactly the case the BLV creator needs
        // to hear ("which scene did I just pause on?"). Assertive
        // interrupts the re-read so the description lands.
        announce(`Paused on scene ${pausedIndex + 1}, ${scene.name}. ${desc}`, { assertive: true });
      }
    }
    return () => {
      if (firstFrame !== null) cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) cancelAnimationFrame(secondFrame);
    };
  }, [isPlaying, expandedIndex, scenes, currentLevel, currentTime, getSceneDescription]);

  // Full-collapse side effects: when expandedIndex transitions from N to
  // null (Close button, header re-tap, or browser-back), restore focus to
  // scene N's collapsed-header button AND fire onSceneClose so the page
  // can wipe per-scene chat history. Auto-follow (N → M) is excluded
  // because the new SceneBlock's expand effect already lands focus on
  // its play button.
  useEffect(() => {
    const prev = prevExpandedRef.current;
    prevExpandedRef.current = expandedIndex;
    if (prev !== null && expandedIndex === null) {
      const sceneId = scenes[prev]?.id;
      // Focus restoration runs in a rAF so React has finished unmounting
      // the actions region before we move focus back to the header —
      // otherwise the unmount races and focus snaps to <body>.
      const raf = requestAnimationFrame(() => {
        // Day 1 Android fix: preventScroll so the browser doesn't trigger
        // a scroll-into-view animation that competes with TalkBack's own
        // scroll behaviour, producing the "scroll past then snap back"
        // jitter on focus restoration.
        headerRefs.current[prev]?.focus({ preventScroll: true });
      });
      if (sceneId && onSceneClose) onSceneClose(sceneId);
      return () => cancelAnimationFrame(raf);
    }
  }, [expandedIndex, scenes, onSceneClose]);

  // If the currently-expanded scene gets removed (keptScenes[id] === false),
  // collapse it so the actions region doesn't linger as a stranded panel.
  // Without this, the user marks Remove → block disappears from the list →
  // expanded actions region is still mounted but now belongs to nothing.
  useEffect(() => {
    if (expandedIndex === null) return;
    const scene = scenes[expandedIndex];
    if (scene && keptScenes[scene.id] === false) {
      setExpandedIndex(null);
    }
  }, [keptScenes, expandedIndex, scenes]);

  // Single push/pop tied to "is any scene expanded" so the browser back
  // button closes the open scene without inflating history. Putting this
  // here instead of in each SceneBlock avoids the auto-follow regression
  // where block N's cleanup history.back() collapsed block N+1 via
  // async popstate.
  const anyExpanded = expandedIndex !== null;
  useEffect(() => {
    if (!anyExpanded) return;
    let triggeredByBack = false;
    const handlePopState = () => {
      triggeredByBack = true;
      setExpandedIndex(null);
      ttsService.stop();
      announce('Scene closed.');
    };
    window.history.pushState({ sceneBlock: true }, '');
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (!triggeredByBack && window.history.state?.sceneBlock === true) {
        window.history.back();
      }
    };
  }, [anyExpanded]);

  return (
    <div ref={listRef} className="flex flex-col flex-1 min-h-0">
      <GlobalControlsBar
        sceneCount={scenes.length}
        videoCount={videoCount}
        totalDuration={totalDuration}
        focusToken={summaryFocusToken}
      />

      {isPlaying && !disableAutoFollow && (
        <div className="px-4 py-2 bg-white border-b border-gray-200">
          <button
            ref={playbackPauseButtonRef}
            type="button"
            onClick={onPause}
            className="w-full py-2 text-sm font-medium rounded bg-gray-100 hover:bg-gray-200 text-gray-800 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500 transition-colors"
            style={{ minHeight: '44px' }}
            aria-label="Pause video and hear the current scene description"
          >
            Pause
          </button>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2"
        role="group"
        aria-label={`${scenes.filter((s) => keptScenes[s.id] !== false).length} scenes`}
        onFocusCapture={handleListFocusCapture}
        onScroll={handleListScroll}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        // Day 1 Android fix: prevent the "swipe right scrolls past target
        // and snaps back" jitter Gemini's report described.
        //   - `scrollBehavior: auto` disables smooth-scroll animation, so
        //     TalkBack's scroll-into-view is instant.
        //   - `overscrollBehavior: contain` prevents scroll chaining to
        //     the outer layout (which would expose Chrome's address bar
        //     and cause the "whole interface scrolls" symptom).
        //   - `overflowAnchor: none` disables Chrome's automatic scroll
        //     anchoring, which can re-position the scroll target
        //     mid-animation when scene-block heights re-measure (the
        //     overshoot-then-snap-back pattern reported).
        //   - `scrollPaddingTop` gives focus-into-view a small buffer so
        //     the focused scene header lands just below the video, not
        //     glued to the very top of the scroll viewport.
        style={{
          scrollBehavior: 'auto',
          overscrollBehavior: 'contain',
          overflowAnchor: 'none',
          scrollPaddingTop: '12px',
          scrollPaddingBottom: '12px',
          touchAction: 'pan-y',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {scenes.map((scene, i) => {
          // Removed scenes are dropped from the rendered list entirely so
          // they don't take screen-reader focus or visual space. Restoration
          // happens via the Edit-by-Myself panel's Undo button (the most
          // recent Remove). Auto-follow still uses the original `scenes`
          // array, but playbackEditState already filters removed clips so
          // the engine never lands on a removed scene's time range.
          if (keptScenes[scene.id] === false) return null;
          return (
            <div key={scene.id || i}>
              <SceneBlock
                scene={scene}
                index={i}
                total={scenes.length}
                currentLevel={currentLevel}
                isExpanded={expandedIndex === i}
                isPlaying={isPlaying}
                autoFollowed={expandedIndex === i && expandSource === 'auto'}
                playbackFocusToken={expandedIndex === i ? playbackFocusToken : 0}
                onExpand={handleExpand}
                onCollapse={handleCollapse}
                onPausePlayback={onPause}
                vqaHistory={vqaHistories[scene.id] || []}
                awareness={awarenessData[scene.id]}
                accentColor={accentColor}
                isRemoved={false}
                headerRef={(el) => { headerRefs.current[i] = el; }}
                onAwarenessViewed={onAwarenessViewed}
                hasSuggestion={sceneIndicesWithSuggestions?.has(i) || false}
                editSummary={editedScenes[scene.id] || null}
                descriptionOverride={getSceneDescription(scene, currentLevel)}
              >
                {renderSceneActions && renderSceneActions({
                  scene,
                  index: i,
                  currentLevel,
                  onLevelChange: handleLevelChange,
                  isExpanded: expandedIndex === i,
                  playerRef,
                  currentTime,
                  isPlaying,
                  onSeek,
                  onPlay,
                  onPause,
                })}
              </SceneBlock>
            </div>
          );
        })}
        {scenes.length === 0 && (
          <p className="text-center text-gray-400 py-8 text-sm">No scenes loaded.</p>
        )}
      </div>
    </div>
  );
}
