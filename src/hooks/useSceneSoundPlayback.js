import { useEffect } from 'react';
import { startSoundLoop, stopSoundLoop } from '../services/sampleSounds.js';

/**
 * Plays the sound attached to the clip currently under the playhead, and
 * stops it when playback pauses, the clip changes, or the attached sound
 * is removed.
 *
 * Mounted alongside the VideoPlayer (helper variants currently). Safe to
 * mount in multiple places — `startSoundLoop` is idempotent on the
 * (soundId, sceneId) pair, but to avoid duplicate scheduling we should
 * still mount once per playback surface.
 */
export default function useSceneSoundPlayback({ editState, currentTime, isPlaying, segments }) {
  useEffect(() => {
    if (!isPlaying || !Array.isArray(segments) || segments.length === 0) {
      stopSoundLoop();
      return undefined;
    }

    const segment = segments.find((s) => currentTime >= s.start_time && currentTime < s.end_time);
    if (!segment) {
      stopSoundLoop();
      return undefined;
    }

    const clip = (editState?.clips || []).find(
      (c) => c.id === segment.id
        || (typeof c.id === 'string' && c.id.startsWith(`${segment.id}-split-`))
    );
    const sound = clip?.sound;
    if (!sound?.id) {
      stopSoundLoop();
      return undefined;
    }

    startSoundLoop(sound.id, segment.id);
    return () => {
      // Don't stop on every render — only when the deps below change to a
      // state where no sound should play. The branches above handle stop
      // explicitly. Cleanup runs before the next effect, so omitting stop
      // here lets a continuous music loop survive small currentTime ticks.
    };
  }, [editState, currentTime, isPlaying, segments]);

  // Stop on unmount
  useEffect(() => () => stopSoundLoop(), []);
}
