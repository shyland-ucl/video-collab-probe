/**
 * View-derived helpers that shape an editState for *playback* without mutating
 * the underlying authoring state.
 *
 * Two concerns:
 * 1. The creator's "Remove this scene" toggle stores its state in keptScenes
 *    (sceneId → boolean), kept separate from editState so undo/restore work
 *    on the same scene id even after the underlying clips have been split or
 *    moved. `filterClipsByKept` returns a new editState that drops clips
 *    whose originating scene is unkept, so the EDL playback engine skips
 *    over them.
 * 2. The helper's MockColourControls produce numeric brightness/contrast/
 *    saturation values in the range [-100, +100] (0 = neutral). VideoPlayer
 *    accepts a CSS `filter` string. `colourValuesToFilter` maps the slider
 *    range into a sensible CSS filter, returning undefined when everything
 *    is neutral so the player doesn't carry an unnecessary style.
 */

function clipBaseSceneId(clipId) {
  if (typeof clipId !== 'string') return clipId;
  // splitClip in sceneEditOps inserts new clips with id `${parent}-split-${ts}`
  const idx = clipId.lastIndexOf('-split-');
  return idx >= 0 ? clipId.slice(0, idx) : clipId;
}

export function filterClipsByKept(editState, keptScenes) {
  if (!editState || !Array.isArray(editState.clips)) return editState;
  if (!keptScenes) return editState;
  // Fast-path: if no scenes are flagged removed, return the original reference
  // so memoisation downstream doesn't re-fire.
  let anyRemoved = false;
  for (const v of Object.values(keptScenes)) {
    if (v === false) { anyRemoved = true; break; }
  }
  if (!anyRemoved) return editState;
  const filtered = editState.clips.filter((c) => keptScenes[clipBaseSceneId(c.id)] !== false);
  if (filtered.length === editState.clips.length) return editState;
  return { ...editState, clips: filtered };
}

export function colourValuesToFilter(values) {
  if (!values) return undefined;
  const { brightness = 0, contrast = 0, saturation = 0 } = values;
  if (brightness === 0 && contrast === 0 && saturation === 0) return undefined;
  // Slider range -100..+100 → CSS multipliers
  //   brightness/contrast: 0.5..1..1.5 (conservative; extremes still readable)
  //   saturation: 0..1..2 (saturate(0) = grayscale, useful B&W feel)
  const b = (1 + brightness / 200).toFixed(3);
  const c = (1 + contrast / 200).toFixed(3);
  const s = (1 + saturation / 100).toFixed(3);
  return `brightness(${b}) contrast(${c}) saturate(${s})`;
}
