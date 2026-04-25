export function getSessionDyadId() {
  try {
    const stored = localStorage.getItem('sessionConfig');
    return stored ? JSON.parse(stored).dyadId || null : null;
  } catch {
    return null;
  }
}

export function getAssignedPipelineProjectIds(dyadId) {
  if (!dyadId) return [];

  try {
    const assignments = JSON.parse(localStorage.getItem('pipelineAssignments') || '{}');
    const assigned = assignments[dyadId];
    return Array.isArray(assigned) ? assigned : [];
  } catch {
    return [];
  }
}

export function filterAssignedPipelineVideos(pipelineVideos, assignedProjectIds) {
  if (!Array.isArray(pipelineVideos) || assignedProjectIds.length === 0) {
    return [];
  }

  const assigned = new Set(assignedProjectIds);
  return pipelineVideos.filter((video) => (
    assigned.has(video._projectId)
    || assigned.has(`pipeline-${video._projectId}`)
    || assigned.has(video.id)
  ));
}
