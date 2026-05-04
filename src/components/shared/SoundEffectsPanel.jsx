import { useCallback, useMemo } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';
import { SOUND_LIBRARY, setClipSound } from '../../utils/sceneEditOps.js';
import { previewSound } from '../../services/sampleSounds.js';

/**
 * Helper-side audio placeholder. Mirrors the creator's "Add sound" Section
 * inside EditByMyselfPanel — same library, same op, same event types — so
 * either party can attach a sample track to the scene currently under the
 * playhead. Real audio playback is intentionally out of scope; this is a
 * research probe surface for studying the conversation around sound, not
 * a production audio pipeline.
 *
 * `actor` defaults to HELPER but is parameterised so a future creator-side
 * variant can reuse the component.
 */
export default function SoundEffectsPanel({
  editState,
  onEditChange,
  currentSegment,
  segments = [],
  currentTime = 0,
  actor = Actors.HELPER,
  // When true, render without the outer card chrome (rounded border,
  // header bar, margins). The host wraps it in a shared container so
  // sound sits under the same Adjustments header as colour controls.
  embedded = false,
}) {
  const { logEvent } = useEventLogger();

  // Pick the active scene: prefer explicit currentSegment, otherwise fall
  // back to whichever segment contains the playhead, otherwise the first.
  const activeScene = useMemo(() => {
    if (currentSegment?.id) return currentSegment;
    if (Array.isArray(segments) && segments.length) {
      return segments.find((s) => currentTime >= s.start_time && currentTime < s.end_time)
        || segments[0];
    }
    return null;
  }, [currentSegment, segments, currentTime]);

  const activeIndex = useMemo(() => {
    if (!activeScene || !Array.isArray(segments)) return -1;
    return segments.findIndex((s) => s.id === activeScene.id);
  }, [activeScene, segments]);

  // Find existing sound on the active scene's clip (covers split-derived ids).
  const currentSound = useMemo(() => {
    if (!activeScene || !editState?.clips) return null;
    const clip = editState.clips.find(
      (c) => c.id === activeScene.id
        || (typeof c.id === 'string' && c.id.startsWith(`${activeScene.id}-split-`))
    );
    return clip?.sound || null;
  }, [activeScene, editState]);

  const editsAvailable = !!editState && !!activeScene && typeof onEditChange === 'function';

  const apply = useCallback((mutator) => {
    if (!editsAvailable) return null;
    const next = mutator(editState);
    if (next === editState) return null;
    onEditChange(next.clips, next.captions, next.sources, next.textOverlays);
    return next;
  }, [editsAvailable, editState, onEditChange]);

  const handleAdd = useCallback((sound) => {
    apply((s) => setClipSound(s, activeScene.id, { ...sound, addedBy: actor.toLowerCase() }));
    if (logEvent) {
      logEvent(EventTypes.ADD_SOUND, actor, {
        segmentId: activeScene.id,
        soundId: sound.id,
        soundName: sound.name,
      });
    }
    // Audible feedback so the helper hears what they attached without
    // having to scrub to the clip first.
    previewSound(sound.id);
    const sceneLabel = activeIndex >= 0 ? `scene ${activeIndex + 1}` : 'this scene';
    announce(`${sound.name} added to ${sceneLabel}.`);
  }, [apply, activeScene, activeIndex, logEvent, actor]);

  const handlePreview = useCallback((soundId) => {
    previewSound(soundId);
  }, []);

  const handleRemove = useCallback(() => {
    if (!currentSound) return;
    apply((s) => setClipSound(s, activeScene.id, null));
    if (logEvent) {
      logEvent(EventTypes.REMOVE_SOUND, actor, {
        segmentId: activeScene.id,
        soundId: currentSound.id,
      });
    }
    const sceneLabel = activeIndex >= 0 ? `scene ${activeIndex + 1}` : 'this scene';
    announce(`Sound removed from ${sceneLabel}.`);
  }, [apply, activeScene, activeIndex, currentSound, logEvent, actor]);

  // When embedded under a shared Adjustments card, drop the outer
  // border/header chrome — the host provides them. Standalone mode keeps
  // the original card so older mounts still look right.
  const Wrapper = embedded
    ? ({ children }) => (
        <div role="group" aria-label="Sound" className="space-y-3 pt-3 mt-1 border-t border-gray-100">
          <h3 className="text-xs font-bold tracking-wider text-[#6b21a8] uppercase">Sound</h3>
          {children}
        </div>
      )
    : ({ children }) => (
        <div
          role="region"
          aria-label="Audio adjustments"
          className="rounded-2xl overflow-hidden mt-4 mb-4"
          style={{ border: '1px solid #dfe4ea', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
        >
          <div className="px-4 py-2.5" style={{ background: '#faf5ff', borderBottom: '1px solid #ead7ff' }}>
            <h2 className="text-xs font-bold tracking-wider text-[#6b21a8] uppercase">Audio Adjustments</h2>
          </div>
          <div className="p-4 bg-white space-y-3">{children}</div>
        </div>
      );

  return (
    <Wrapper>
        <p className="text-sm text-gray-700">
          Apply a placeholder sound to the scene currently in view. Sample
          assets only — useful for talking through what the creator wants.
        </p>

        <div
          className="text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded px-3 py-2"
          aria-label={
            activeScene
              ? `Active scene: scene ${activeIndex >= 0 ? activeIndex + 1 : ''} ${activeScene.name || ''}.${currentSound ? ` Sound attached: ${currentSound.name}.` : ' No sound attached.'}`
              : 'No scene selected.'
          }
        >
          <div className="font-medium">
            {activeScene
              ? `Scene${activeIndex >= 0 ? ` ${activeIndex + 1}` : ''}${activeScene.name ? `: ${activeScene.name}` : ''}`
              : 'No scene selected'}
          </div>
          {currentSound ? (
            <div className="text-xs text-purple-700 mt-1">
              <span aria-hidden="true">🎶 </span>{currentSound.name} attached
            </div>
          ) : (
            <div className="text-xs text-gray-500 mt-1">No sound attached</div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {SOUND_LIBRARY.map((sound) => {
            const active = currentSound?.id === sound.id;
            return (
              <button
                key={sound.id}
                type="button"
                onClick={() => handleAdd(sound)}
                disabled={!editsAvailable}
                aria-pressed={active}
                aria-label={`Add ${sound.name}${active ? ', already added' : ''}`}
                className={`py-2 text-sm font-medium rounded border focus:outline-2 focus:outline-offset-2 focus:outline-blue-500 ${
                  active
                    ? 'bg-purple-600 text-white border-purple-700'
                    : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
                } disabled:opacity-50`}
                style={{ minHeight: '44px' }}
              >
                {sound.label}
              </button>
            );
          })}
        </div>

        {currentSound && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handlePreview(currentSound.id)}
              className="py-2 text-sm font-medium rounded bg-white border border-gray-300 hover:bg-gray-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
              style={{ minHeight: '44px' }}
              aria-label={`Preview ${currentSound.name}`}
            >
              <span aria-hidden="true">▶ </span>Preview
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={!editsAvailable}
              className="py-2 text-sm font-medium rounded bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
              style={{ minHeight: '44px' }}
              aria-label="Remove sound from this scene"
            >
              Remove
            </button>
          </div>
        )}

        {!editsAvailable && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2" role="status">
            Sound tools become available once the project is loaded.
          </p>
        )}
    </Wrapper>
  );
}
