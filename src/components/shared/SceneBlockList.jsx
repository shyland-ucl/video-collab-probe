import { useState, useCallback, useRef, useEffect } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import ttsService from '../../services/ttsService.js';
import { announce } from '../../utils/announcer.js';
import GlobalControlsBar from './GlobalControlsBar.jsx';
import SceneBlock from './SceneBlock.jsx';
import { LEVELS } from '../../utils/detailLevels.js';

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
}) {
  const [expandedIndex, setExpandedIndex] = useState(null);
  // Where the latest expansion came from. Drives focus behavior in SceneBlock:
  //   'user' — manual tap → focus the actions region (default landing).
  //   'auto' — playback auto-follow → focus the new scene's Play/Pause button
  //            so the user stays on the button they were just using.
  const [expandSource, setExpandSource] = useState('user');
  const [currentLevel, setCurrentLevel] = useState(1);
  const listRef = useRef(null);
  // Refs to each SceneBlock's collapsed-header button. Used to restore
  // focus when a scene is fully collapsed — otherwise the browser drops
  // focus to <body> and TalkBack/VoiceOver swipe-navigates from page top
  // (Lan 2026-04-27 regression).
  const headerRefs = useRef([]);
  const prevExpandedRef = useRef(null);
  const { logEvent } = useEventLogger();

  const totalDuration = scenes.reduce(
    (sum, s) => sum + ((s.end_time || 0) - (s.start_time || 0)),
    0
  );

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
      const desc = expandedScene?.descriptions?.[`level_${level}`];
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
    [currentLevel, logEvent, expandedIndex, scenes]
  );

  // Auto-navigate to the scene matching current playback time. Setting
  // expandedIndex collapses the previous SceneBlock and expands the new one,
  // so the expanded options visibly follow playback. We deliberately do NOT
  // announce a boundary cue here — Lan 2026-04-26 wants playback to stay
  // quiet so the video audio isn't talked over. Focus still moves to the
  // new scene's play button (via SceneBlock's expand effect with
  // autoFollowed=true), and TalkBack reads the focused button on its own.
  useEffect(() => {
    if (!isPlaying || expandedIndex === null) return;
    const activeIndex = scenes.findIndex(
      (s) => currentTime >= s.start_time && currentTime < s.end_time
    );
    if (activeIndex !== -1 && activeIndex !== expandedIndex) {
      setExpandSource('auto');
      setExpandedIndex(activeIndex);
    }
  }, [currentTime, isPlaying, scenes, expandedIndex]);

  // Pause read-out: when playback transitions playing → paused while a
  // scene is expanded, announce the current scene's description so the
  // user hears what they just paused on. Uses announce() (live region),
  // never ttsService.speak — per memory `feedback_scene_block_a11y.md`,
  // active TTS fights TalkBack.
  const wasPlayingRef = useRef(isPlaying);
  useEffect(() => {
    const wasPlaying = wasPlayingRef.current;
    wasPlayingRef.current = isPlaying;
    if (wasPlaying && !isPlaying && expandedIndex !== null) {
      const scene = scenes[expandedIndex];
      const desc = scene?.descriptions?.[`level_${currentLevel}`];
      if (desc) {
        // Assertive: pause flips the scene-play button's aria-label from
        // "Pause from here" back to "Play from here", and Android
        // TalkBack re-reads the activated button. A polite announce here
        // gets dropped, which is exactly the case the BLV creator needs
        // to hear ("which scene did I just pause on?"). Assertive
        // interrupts the re-read so the description lands.
        announce(`Paused on scene ${expandedIndex + 1}, ${scene.name}. ${desc}`, { assertive: true });
      }
    }
  }, [isPlaying, expandedIndex, scenes, currentLevel]);

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
        headerRefs.current[prev]?.focus();
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
    <div ref={listRef} className="flex flex-col min-h-0">
      <GlobalControlsBar
        sceneCount={scenes.length}
        videoCount={videoCount}
        totalDuration={totalDuration}
      />

      <div
        className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
        role="list"
        aria-label={`${scenes.filter((s) => keptScenes[s.id] !== false).length} scenes`}
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
            <div key={scene.id || i} role="listitem">
              <SceneBlock
                scene={scene}
                index={i}
                total={scenes.length}
                currentLevel={currentLevel}
                isExpanded={expandedIndex === i}
                autoFollowed={expandedIndex === i && expandSource === 'auto'}
                onExpand={handleExpand}
                onCollapse={handleCollapse}
                vqaHistory={vqaHistories[scene.id] || []}
                awareness={awarenessData[scene.id]}
                accentColor={accentColor}
                isRemoved={false}
                headerRef={(el) => { headerRefs.current[i] = el; }}
                onAwarenessViewed={onAwarenessViewed}
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
