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
  onAskAI,
  currentLevel,
  onLevelChange,
  accentColor = '#2B579A',
}) {
  const [thinking, setThinking] = useState(false);
  const [showAskAI, setShowAskAI] = useState(false);
  const { logEvent } = useEventLogger();

  const handlePlaySegment = useCallback(() => {
    if (onSeek) onSeek(scene.start_time);
    if (onPlay) onPlay();
    logEvent(EventTypes.PLAY, Actors.CREATOR, {
      segmentId: scene.id,
      action: 'play_segment',
    });
    // No announce here. The button's accessible name flips from
    // "Play from here" to "Pause from here" on activation; TalkBack
    // re-reads the focused button, which is sufficient feedback. Lan
    // 2026-04-26: keep playback minimal so the video audio isn't
    // talked over.
  }, [scene, index, onSeek, onPlay, logEvent]);

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

      {/* Play / Pause segment.
          data-scene-play-button: SceneBlock looks for this on auto-follow
          expand to keep AT focus on the play/pause button instead of
          jumping to the actions region. */}
      <button
        onClick={isSegmentPlaying ? handlePauseSegment : handlePlaySegment}
        data-scene-play-button="true"
        className="w-full py-3 text-sm font-medium rounded bg-gray-100 hover:bg-gray-200 text-gray-800 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500 transition-colors"
        style={{ minHeight: '48px' }}
        aria-label={isSegmentPlaying ? 'Pause from here' : 'Play from here'}
      >
        {isSegmentPlaying ? 'Pause' : 'Play from here'}
      </button>

      {/* Ask AI — toggle button */}
      <div>
        <button
          onClick={() => setShowAskAI(!showAskAI)}
          aria-expanded={showAskAI}
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
