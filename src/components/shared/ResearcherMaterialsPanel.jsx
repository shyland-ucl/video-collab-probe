import { useState, useEffect, useCallback } from 'react';
import { listProjects, generateDescriptions, deleteProject, getWorkspaceUrl } from '../../services/pipelineApi.js';

const STATUS_LABELS = {
  uploaded: { label: 'Uploaded', color: 'bg-gray-200 text-gray-700' },
  segmented: { label: 'Segmented', color: 'bg-blue-100 text-blue-700' },
  reviewed: { label: 'Reviewed', color: 'bg-amber-100 text-amber-700' },
  descriptions_generated: { label: 'Descriptions', color: 'bg-purple-100 text-purple-700' },
  ready_for_probe: { label: 'Ready', color: 'bg-green-100 text-green-700' },
};

function getAssignments() {
  try {
    return JSON.parse(localStorage.getItem('pipelineAssignments') || '{}');
  } catch {
    return {};
  }
}

function saveAssignments(assignments) {
  localStorage.setItem('pipelineAssignments', JSON.stringify(assignments));
}

/**
 * ResearcherMaterialsPanel — manage pipeline projects and assign to dyads.
 */
export default function ResearcherMaterialsPanel() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState(getAssignments);
  const [assigningDyad, setAssigningDyad] = useState({});
  const [generating, setGenerating] = useState({});
  const [deleting, setDeleting] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const list = await listProjects();
      setProjects(list);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Assign a project to a dyad
  const handleAssign = useCallback((projectId, dyadId) => {
    if (!dyadId.trim()) return;
    const updated = { ...assignments };
    if (!updated[dyadId]) updated[dyadId] = [];
    if (!updated[dyadId].includes(projectId)) {
      updated[dyadId].push(projectId);
    }
    setAssignments(updated);
    saveAssignments(updated);
    setAssigningDyad((prev) => ({ ...prev, [projectId]: '' }));
  }, [assignments]);

  // Remove assignment
  const handleUnassign = useCallback((projectId, dyadId) => {
    const updated = { ...assignments };
    if (updated[dyadId]) {
      updated[dyadId] = updated[dyadId].filter((id) => id !== projectId);
      if (updated[dyadId].length === 0) delete updated[dyadId];
    }
    setAssignments(updated);
    saveAssignments(updated);
  }, [assignments]);

  // Get dyads assigned to a project
  const getDyadsForProject = useCallback((projectId) => {
    const dyads = [];
    for (const [dyadId, projectIds] of Object.entries(assignments)) {
      if (projectIds.includes(projectId)) dyads.push(dyadId);
    }
    return dyads;
  }, [assignments]);

  // Generate descriptions for a project
  const handleGenerate = useCallback(async (projectId) => {
    setGenerating((prev) => ({ ...prev, [projectId]: true }));
    setError('');
    try {
      await generateDescriptions(projectId);
      await refresh();
    } catch (err) {
      setError(`${projectId}: ${err.message}`);
    } finally {
      setGenerating((prev) => ({ ...prev, [projectId]: false }));
    }
  }, [refresh]);

  // Delete a project
  const handleDelete = useCallback(async (projectId) => {
    setDeleting((prev) => ({ ...prev, [projectId]: true }));
    setError('');
    try {
      await deleteProject(projectId);
      // Remove from all dyad assignments
      const updated = { ...assignments };
      for (const dyadId of Object.keys(updated)) {
        updated[dyadId] = updated[dyadId].filter((id) => id !== projectId);
        if (updated[dyadId].length === 0) delete updated[dyadId];
      }
      setAssignments(updated);
      saveAssignments(updated);
      setConfirmDelete(null);
      await refresh();
    } catch (err) {
      setError(`Delete ${projectId}: ${err.message}`);
    } finally {
      setDeleting((prev) => ({ ...prev, [projectId]: false }));
    }
  }, [assignments, refresh]);

  if (loading) {
    return <p className="text-sm text-gray-500 py-4">Loading projects...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm text-gray-900">
          Footage Projects ({projects.length})
        </h3>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            className="px-3 py-1.5 text-xs border rounded-md hover:bg-gray-50 transition-colors"
          >
            Refresh
          </button>
          <a
            href="/pipeline"
            className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
          >
            Upload New
          </a>
        </div>
      </div>

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400 border-2 border-dashed rounded-lg">
          No footage projects yet. <a href="/pipeline" className="text-purple-600 underline">Upload footage</a> to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => {
            const dyads = getDyadsForProject(project.project_id);
            const dyadInput = assigningDyad[project.project_id] || '';
            const isGenerating = generating[project.project_id];
            const hasDescriptions = project.status.descriptions_generated;
            const segCount = project.segments.length;
            const descCount = project.segments.filter(
              (s) => s.descriptions?.level_1
            ).length;

            return (
              <div
                key={project.project_id}
                className="bg-white border rounded-lg p-4 space-y-3"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-sm text-gray-900">
                      {project.project_id}
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {project.source.duration_seconds?.toFixed(1)}s
                      &middot; {segCount} segments
                      {hasDescriptions && ` \u00b7 ${descCount}/${segCount} described`}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {Object.entries(STATUS_LABELS).map(([key, { label, color }]) => (
                      <span
                        key={key}
                        className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                          project.status[key] ? color : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-wrap">
                  <a
                    href={`/pipeline/review/${project.project_id}`}
                    className="px-3 py-1.5 text-xs border rounded-md hover:bg-gray-50 text-blue-600 transition-colors"
                  >
                    Review Segments
                  </a>
                  {!hasDescriptions && project.status.segmented && (
                    <button
                      onClick={() => handleGenerate(project.project_id)}
                      disabled={isGenerating}
                      className="px-3 py-1.5 text-xs border rounded-md hover:bg-purple-50 text-purple-600 disabled:opacity-50 transition-colors"
                    >
                      {isGenerating ? 'Generating...' : 'Generate Descriptions'}
                    </button>
                  )}
                  {confirmDelete === project.project_id ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-xs text-red-600 font-medium">Delete?</span>
                      <button
                        onClick={() => handleDelete(project.project_id)}
                        disabled={deleting[project.project_id]}
                        className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        {deleting[project.project_id] ? 'Deleting...' : 'Yes'}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(project.project_id)}
                      className="px-3 py-1.5 text-xs border border-red-200 rounded-md hover:bg-red-50 text-red-600 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>

                {/* Dyad Assignments */}
                <div className="border-t pt-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Assigned to Dyads
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {dyads.length === 0 ? (
                      <span className="text-xs text-gray-400 italic">Not assigned</span>
                    ) : (
                      dyads.map((dyadId) => (
                        <span
                          key={dyadId}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full"
                        >
                          {dyadId}
                          <button
                            onClick={() => handleUnassign(project.project_id, dyadId)}
                            className="hover:text-red-600 font-bold"
                            aria-label={`Remove ${dyadId} assignment`}
                          >
                            &times;
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={dyadInput}
                      onChange={(e) =>
                        setAssigningDyad((prev) => ({
                          ...prev,
                          [project.project_id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleAssign(project.project_id, dyadInput);
                        }
                      }}
                      placeholder="Dyad ID (e.g. D01)"
                      className="flex-1 px-2 py-1.5 border rounded text-xs focus:outline-2 focus:outline-blue-500"
                    />
                    <button
                      onClick={() => handleAssign(project.project_id, dyadInput)}
                      disabled={!dyadInput.trim()}
                      className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      Assign
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assignment Summary */}
      {Object.keys(assignments).length > 0 && (
        <div className="border-t pt-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Assignment Summary
          </h4>
          <div className="space-y-1">
            {Object.entries(assignments).map(([dyadId, projectIds]) => (
              <div key={dyadId} className="text-xs text-gray-600">
                <span className="font-medium text-gray-900">{dyadId}</span>
                {' \u2192 '}
                {projectIds.join(', ')}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
