const STORAGE_KEY = 'probe2a_project_state';

/**
 * Serialises the current project state for handoff from Phase 2a to 2b.
 * Captures edits, marks, selected video IDs, and description level preferences.
 */
export function serialiseProjectState({
  editState = null,
  marks = [],
  selectedVideoIds = [],
  descriptionLevel = 1,
} = {}) {
  const state = {
    editState,
    marks: marks.map((m) => ({
      segmentId: m.segmentId || m.id,
      segmentName: m.segmentName || m.name,
      hasVoiceNote: !!m.voiceNote || !!m.audioBlob,
      timestamp: m.timestamp,
    })),
    selectedVideoIds,
    descriptionLevel,
    exportedAt: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

/**
 * Loads the serialised project state from Phase 2a.
 * Returns null if no state is available.
 */
export function loadProjectState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Clears the stored project state.
 */
export function clearProjectState() {
  localStorage.removeItem(STORAGE_KEY);
}
