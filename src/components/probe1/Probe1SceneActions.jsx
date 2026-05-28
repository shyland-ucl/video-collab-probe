import { useState, useCallback } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';
import InlineVQAComposer from '../shared/InlineVQAComposer.jsx';
import DetailLevelSelector from '../shared/DetailLevelSelector.jsx';

export default function Probe1SceneActions({
  scene,
  index,
  playerRef,
  currentTime,
  isPlaying,
  onSeek,
  onPlay,
  onPause,
  // Day 1 fix #2: bounded "Play this scene" — pause at scene.end_time.
  onPlaySegment,
  onAskAI,
  currentLevel,
  onLevelChange,
  accentColor = '#2B579A',
}) {
  const [thinking, setThinking] = useState(false);
  const [showAskAI, setShowAskAI] = useState(false);
  const { logEvent } = useEventLogger();

  const handlePlayThisScene = useCallback(() => {
    if (onPlaySegment) {
      onPlaySegment(scene);
    } else {
      if (onSeek) onSeek(scene.start_time);
      if (onPlay) onPlay();
    }
    logEvent(EventTypes.PLAY, Actors.CREATOR, {
      segmentId: scene.id,
      action: 'play_this_scene',
    });
  }, [scene, onPlaySegment, onSeek, onPlay, logEvent]);

  // Day 1 fix: same button toggles pause when video is playing so the
  // focused button stays mounted through scene boundaries — TalkBack stays
  // silent (no focus change) while still letting double-tap pause.
  const handlePlayFromHereOrPause = useCallback(() => {
    if (isPlaying) {
      if (onPause) onPause();
      logEvent(EventTypes.PAUSE, Actors.CREATOR, {
        segmentId: scene.id,
        action: 'pause_via_play_from_here',
      });
      return;
    }
    if (onSeek) onSeek(scene.start_time);
    if (onPlay) onPlay();
    logEvent(EventTypes.PLAY, Actors.CREATOR, {
      segmentId: scene.id,
      action: 'play_from_here',
    });
  }, [scene, isPlaying, onSeek, onPlay, onPause, logEvent]);

  const handlePauseSegment = useCallback(() => {
    if (onPause) onPause();
  }, [onPause]);

  const handleAskAI = useCallback(
    async (question) => {
      setThinking(true);
      logEvent(EventTypes.VQA_QUESTION, Actors.CREATOR, {
        question,
        segmentId: scene.id,
      });
      if (onAskAI) {
        await onAskAI(question, scene);
      }
      setThinking(false);
    },
    [scene, onAskAI, logEvent]
  );

  const isSegmentPlaying =
    isPlaying && currentTime >= scene.start_time && currentTime < scene.end_time;

  return (
    <>
      {/* Detail level selector */}
      <DetailLevelSelector
        currentLevel={currentLevel}
        onLevelChange={onLevelChange}
        levelDescription={scene?.descriptions?.[`level_${currentLevel}`]}
      />

      {/* Day 1 fix #2: two distinct play actions.
          "Play this scene" stops at the scene boundary; "Play from here"
          continues into later scenes. The first is the primary action
          (data-scene-play-button so SceneBlock auto-focuses it). */}
      <button
        onClick={isSegmentPlaying ? handlePauseSegment : handlePlayThisScene}
        data-scene-play-button="true"
        className="w-full py-3 text-sm font-medium rounded bg-gray-100 hover:bg-gray-200 text-gray-800 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500 transition-colors"
        style={{ minHeight: '48px' }}
        aria-label={isSegmentPlaying ? 'Pause this scene' : `Play scene ${index + 1}, stops at the end of this scene`}
      >
        {isSegmentPlaying ? 'Pause' : 'Play this scene'}
      </button>
      <button
        type="button"
        onClick={handlePlayFromHereOrPause}
        className="w-full py-2 text-sm font-medium rounded bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500 transition-colors"
        style={{ minHeight: '44px' }}
        aria-label={isPlaying ? 'Double tap to pause' : 'Play the whole video from here'}
      >
        {isPlaying ? 'Pause' : 'Play from here'}
      </button>

      {/* Ask AI — toggle button */}
      <div>
        <button
          onClick={() => setShowAskAI(!showAskAI)}
          className="w-full py-3 text-sm font-medium rounded text-white transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ backgroundColor: accentColor, minHeight: '48px' }}
        >
          {showAskAI ? 'Close Ask AI' : 'Ask AI'}
        </button>
        {showAskAI && (
          <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <InlineVQAComposer
              onSubmit={handleAskAI}
              disabled={thinking}
              accentColor={accentColor}
            />
            {thinking && (
              <p className="text-sm text-gray-700 italic mt-1" role="status">Thinking...</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
