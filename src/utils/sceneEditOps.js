/**
 * Scene-level edit operations for Probe 2a's "Edit by Myself" panel.
 *
 * B2 fix: previously the Trim / Split / Move / Add Caption / Add Note buttons
 * fired a log event but produced no UI change, leaving participants confused
 * about whether their tap registered. These helpers produce real editState
 * mutations so each action has visible consequences in the timeline.
 *
 * Each function takes the current editState and returns a new editState
 * with the operation applied; pass the result to onEditChange. Functions
 * never mutate the input — they're safe to call from React renders.
 */

const TRIM_STEP_SECONDS = 0.5;

export function trimClipStart(editState, sceneId, direction) {
  // direction: +1 trims more from start (clip becomes shorter from the front),
  //            -1 untrims (clip recovers length up to original start).
  const delta = direction * TRIM_STEP_SECONDS;
  return mapClips(editState, sceneId, (c) => ({
    ...c,
    trimStart: Math.max(0, (c.trimStart || 0) + delta),
  }));
}

export function trimClipEnd(editState, sceneId, direction) {
  const delta = direction * TRIM_STEP_SECONDS;
  return mapClips(editState, sceneId, (c) => ({
    ...c,
    trimEnd: Math.max(0, (c.trimEnd || 0) + delta),
  }));
}

export function splitClip(editState, sceneId, splitTime) {
  const clips = editState.clips || [];
  const idx = clips.findIndex((c) => c.id === sceneId);
  if (idx === -1) return editState;
  const clip = clips[idx];
  // Default to mid-clip if no explicit time provided. We never split exactly
  // at a boundary (would create a zero-length clip).
  const epsilon = 0.05;
  const start = clip.startTime + (clip.trimStart || 0);
  const end = clip.endTime - (clip.trimEnd || 0);
  let at = typeof splitTime === 'number' ? splitTime : (start + end) / 2;
  at = Math.max(start + epsilon, Math.min(end - epsilon, at));
  const first = { ...clip, endTime: at, trimEnd: 0 };
  const second = {
    ...clip,
    id: `${clip.id}-split-${Date.now()}`,
    startTime: at,
    trimStart: 0,
  };
  return {
    ...editState,
    clips: [...clips.slice(0, idx), first, second, ...clips.slice(idx + 1)],
  };
}

export function moveClip(editState, sceneId, direction) {
  const clips = editState.clips || [];
  const idx = clips.findIndex((c) => c.id === sceneId);
  if (idx === -1) return editState;
  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= clips.length) return editState;
  const next = clips.slice();
  [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
  return { ...editState, clips: next };
}

export function addCaption(editState, sceneId, text) {
  const clean = (text || '').trim();
  if (!clean) return editState;
  const clip = (editState.clips || []).find((c) => c.id === sceneId);
  if (!clip) return editState;
  const caption = {
    id: `caption-${Date.now()}`,
    sceneId,
    text: clean,
    startTime: clip.startTime,
    endTime: clip.endTime,
  };
  return {
    ...editState,
    captions: [...(editState.captions || []), caption],
  };
}

export function addNote(editState, sceneId, text) {
  // Notes are scene-level annotations that don't render in the timeline —
  // they're for the creator's own memory or for the helper to read on
  // handover. Stored in editState.notes (a new array, optional).
  const clean = (text || '').trim();
  if (!clean) return editState;
  const note = {
    id: `note-${Date.now()}`,
    sceneId,
    text: clean,
    timestamp: Date.now(),
  };
  return {
    ...editState,
    notes: [...(editState.notes || []), note],
  };
}

export function getClipForScene(editState, sceneId) {
  return (editState?.clips || []).find((c) => c.id === sceneId) || null;
}

export function getCaptionsForScene(editState, sceneId) {
  return (editState?.captions || []).filter((c) => c.sceneId === sceneId);
}

export function getNotesForScene(editState, sceneId) {
  return (editState?.notes || []).filter((n) => n.sceneId === sceneId);
}

function mapClips(editState, sceneId, fn) {
  const clips = (editState.clips || []).map((c) => (c.id === sceneId ? fn(c) : c));
  return { ...editState, clips };
}
