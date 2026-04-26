import { useState, useCallback, useRef, useEffect } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import ttsService from '../../services/ttsService.js';
import { announce } from '../../utils/announcer.js';
import GlobalControlsBar from './GlobalControlsBar.jsx';
import SceneBlock from './SceneBlock.jsx';

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
  // Render prop for probe-specific actions
  renderSceneActions,
}) {
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [currentLevel, setCurrentLevel] = useState(1);
  const listRef = useRef(null);
  const { logEvent } = useEventLogger();

  const totalDuration = scenes.reduce(
    (sum, s) => sum + ((s.end_time || 0) - (s.start_time || 0)),
    0
  );

  const handleExpand = useCallback(
    (index) => {
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
    },
    [currentLevel, logEvent]
  );

  // Auto-navigate to the scene matching current playback time. Setting
  // expandedIndex collapses the previous SceneBlock and expands the new one,
  // so the expanded options visibly follow playback. The announce gives
  // TalkBack a transition cue; the new SceneBlock's expand effect handles
  // focus.
  useEffect(() => {
    if (!isPlaying || expandedIndex === null) return;
    const activeIndex = scenes.findIndex(
      (s) => currentTime >= s.start_time && currentTime < s.end_time
    );
    if (activeIndex !== -1 && activeIndex !== expandedIndex) {
      setExpandedIndex(activeIndex);
      announce(`Now playing scene ${activeIndex + 1}: ${scenes[activeIndex].name}.`);
    }
  }, [currentTime, isPlaying, scenes, expandedIndex]);

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
        aria-label={`${scenes.length} scenes`}
      >
        {scenes.map((scene, i) => (
          <div key={scene.id || i} role="listitem">
            <SceneBlock
              scene={scene}
              index={i}
              total={scenes.length}
              currentLevel={currentLevel}
              isExpanded={expandedIndex === i}
              onExpand={handleExpand}
              onCollapse={handleCollapse}
              vqaHistory={vqaHistories[scene.id] || []}
              awareness={awarenessData[scene.id]}
              accentColor={accentColor}
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
        ))}
        {scenes.length === 0 && (
          <p className="text-center text-gray-400 py-8 text-sm">No scenes loaded.</p>
        )}
      </div>
    </div>
  );
}
