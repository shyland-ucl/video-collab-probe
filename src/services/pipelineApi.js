/**
 * Client-side API wrapper for the pipeline.
 * Routes are served by the Vite dev server plugin — same origin, no separate port.
 */

async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `API error ${res.status}`);
  }
  return res.json();
}

export async function listProjects() {
  return request('/api/pipeline/projects');
}

export async function getProject(projectId) {
  return request(`/api/pipeline/projects/${projectId}`);
}

export async function uploadFootage(file, projectId, segmentLength) {
  const form = new FormData();
  form.append('file', file);
  form.append('project_id', projectId);
  form.append('segment_length', String(segmentLength));

  const res = await fetch('/api/pipeline/upload', { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Upload error ${res.status}`);
  }
  return res.json();
}

export async function updateSegments(projectId, segments) {
  return request(`/api/pipeline/projects/${projectId}/segments`, {
    method: 'PUT',
    body: JSON.stringify({ segments }),
  });
}

export async function markReviewed(projectId) {
  return request(`/api/pipeline/projects/${projectId}/mark-reviewed`, { method: 'POST' });
}

export async function generateDescriptions(projectId) {
  return request(`/api/pipeline/projects/${projectId}/generate_descriptions`, { method: 'POST' });
}

export async function updateSegmentDescriptions(projectId, segmentId, descriptions) {
  return request(`/api/pipeline/projects/${projectId}/segments/${segmentId}/descriptions`, {
    method: 'PUT',
    body: JSON.stringify(descriptions),
  });
}

export async function deleteProject(projectId) {
  return request(`/api/pipeline/projects/${projectId}`, { method: 'DELETE' });
}

export async function exportForProbe(projectId) {
  return request(`/api/pipeline/projects/${projectId}/export`);
}

export function getWorkspaceUrl(relativePath) {
  return `/pipeline-workspace/${relativePath}`;
}

/**
 * Load all pipeline projects as probe-compatible video objects.
 * Returns an array of { id, title, src, duration, segments, _pipeline: true }.
 */
export async function loadPipelineVideos() {
  const COLORS = [
    '#E74C3C', '#F0AD4E', '#5BC0DE', '#5CB85C', '#D9534F',
    '#337AB7', '#9B59B6', '#E67E22', '#1ABC9C', '#34495E',
  ];

  try {
    const projects = await listProjects();
    return projects
      .filter((p) => p.status.segmented)
      .map((p) => ({
        id: `pipeline-${p.project_id}`,
        title: p.project_id.replace(/[_-]/g, ' '),
        src: `/pipeline-workspace/${p.project_id}/original/source.mp4`,
        duration: p.source.duration_seconds,
        _pipeline: true,
        _projectId: p.project_id,
        _status: p.status,
        segments: p.segments.map((seg, i) => ({
          id: seg.id.replace('_', '-'),
          start_time: seg.start_seconds,
          end_time: seg.end_seconds,
          name: seg.label,
          color: COLORS[i % COLORS.length],
          descriptions: {
            level_1: seg.descriptions.level_1 || '',
            level_2: seg.descriptions.level_2 || '',
            level_3: seg.descriptions.level_3 || '',
          },
          vqa_prepared: {},
          ai_edits_prepared: {},
        })),
      }));
  } catch {
    return [];
  }
}

/**
 * Upload a video file through the pipeline backend, segment it, and
 * generate descriptions. Returns a probe-compatible video object.
 */
export async function uploadAndProcess(file, segmentLength = 3, onProgress) {
  const projectId = `upload_${Date.now()}`;

  if (onProgress) onProgress('uploading', 10);
  await uploadFootage(file, projectId, segmentLength);

  if (onProgress) onProgress('generating', 50);
  await generateDescriptions(projectId);

  if (onProgress) onProgress('finalizing', 90);
  const project = await getProject(projectId);

  if (onProgress) onProgress('done', 100);

  const COLORS = [
    '#E74C3C', '#F0AD4E', '#5BC0DE', '#5CB85C', '#D9534F',
    '#337AB7', '#9B59B6', '#E67E22', '#1ABC9C', '#34495E',
  ];

  return {
    id: `pipeline-${projectId}`,
    title: file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
    src: `/pipeline-workspace/${projectId}/original/source.mp4`,
    duration: project.source.duration_seconds,
    _pipeline: true,
    _projectId: projectId,
    _uploaded: true,
    _fileName: file.name,
    _fileSize: file.size,
    segments: project.segments.map((seg, i) => ({
      id: seg.id.replace('_', '-'),
      start_time: seg.start_seconds,
      end_time: seg.end_seconds,
      name: seg.label,
      color: COLORS[i % COLORS.length],
      descriptions: {
        level_1: seg.descriptions.level_1 || '',
        level_2: seg.descriptions.level_2 || '',
        level_3: seg.descriptions.level_3 || '',
      },
      vqa_prepared: {},
      ai_edits_prepared: {},
    })),
  };
}
