import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getProject,
  updateSegments,
  markReviewed,
  generateDescriptions,
  updateSegmentDescriptions,
  exportForProbe,
  getWorkspaceUrl,
} from '../../services/pipelineApi.js';
import SegmentCard from '../../components/pipeline/SegmentCard.jsx';
import DescriptionEditor from '../../components/pipeline/DescriptionEditor.jsx';

export default function PipelineReviewPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [editingDescSeg, setEditingDescSeg] = useState(null);
  const cardRefs = useRef([]);

  // Load project
  useEffect(() => {
    async function load() {
      try {
        const p = await getProject(projectId);
        setProject(p);
        setSegments(p.segments);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectId]);

  // Keyboard navigation: j/k to move between segments
  useEffect(() => {
    function handleKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = Math.min(prev + 1, segments.length - 1);
          cardRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return next;
        });
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = Math.max(prev - 1, 0);
          cardRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return next;
        });
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [segments.length]);

  // Segment mutations
  const updateSeg = useCallback((index, updates) => {
    setSegments((prev) => prev.map((s, i) => (i === index ? { ...s, ...updates } : s)));
    setDirty(true);
  }, []);

  const adjustTime = useCallback((index, field, delta) => {
    setSegments((prev) => {
      const seg = prev[index];
      const newVal = Math.max(0, seg[field] + delta);
      return prev.map((s, i) =>
        i === index
          ? { ...s, [field]: parseFloat(newVal.toFixed(1)), duration_seconds: parseFloat((field === 'start_seconds' ? seg.end_seconds - newVal : newVal - seg.start_seconds).toFixed(3)) }
          : s
      );
    });
    setDirty(true);
  }, []);

  const mergeWithNext = useCallback((index) => {
    if (index >= segments.length - 1) return;
    setSegments((prev) => {
      const merged = {
        ...prev[index],
        end_seconds: prev[index + 1].end_seconds,
        duration_seconds: parseFloat((prev[index + 1].end_seconds - prev[index].start_seconds).toFixed(3)),
        label: `${prev[index].label} + ${prev[index + 1].label}`,
      };
      return [...prev.slice(0, index), merged, ...prev.slice(index + 2)];
    });
    setDirty(true);
  }, [segments.length]);

  const deleteSeg = useCallback((index) => {
    setSegments((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  }, []);

  const splitSeg = useCallback((index, splitTime) => {
    setSegments((prev) => {
      const seg = prev[index];
      const seg1 = {
        ...seg,
        end_seconds: splitTime,
        duration_seconds: parseFloat((splitTime - seg.start_seconds).toFixed(3)),
        label: `${seg.label} (A)`,
        id: `${seg.id}_a`,
      };
      const seg2 = {
        ...seg,
        start_seconds: splitTime,
        duration_seconds: parseFloat((seg.end_seconds - splitTime).toFixed(3)),
        label: `${seg.label} (B)`,
        id: `${seg.id}_b`,
        file: seg.file.replace('.mp4', '_b.mp4'),
        keyframe: seg.keyframe.replace('_kf.jpg', '_b_kf.jpg'),
      };
      return [...prev.slice(0, index), seg1, seg2, ...prev.slice(index + 1)];
    });
    setDirty(true);
  }, []);

  // Save segments
  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const updated = await updateSegments(projectId, segments);
      setProject(updated);
      setSegments(updated.segments);
      setDirty(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Mark as reviewed without changes
  async function handleMarkReviewed() {
    try {
      const updated = await markReviewed(projectId);
      setProject(updated);
    } catch (err) {
      setError(err.message);
    }
  }

  // Generate descriptions
  async function handleGenerate() {
    setGenerating(true);
    setGenResult(null);
    setError('');
    try {
      const result = await generateDescriptions(projectId);
      setGenResult(result);
      // Reload project to get updated descriptions
      const updated = await getProject(projectId);
      setProject(updated);
      setSegments(updated.segments);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  // Export
  async function handleExport() {
    try {
      const data = await exportForProbe(projectId);
      // Download as file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectId}_probe_export.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }

  // Save description edit
  async function handleDescriptionSave(segmentId, descriptions) {
    try {
      await updateSegmentDescriptions(projectId, segmentId, descriptions);
      const updated = await getProject(projectId);
      setProject(updated);
      setSegments(updated.segments);
      setEditingDescSeg(null);
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading project...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Project not found.'}</p>
          <button onClick={() => navigate('/pipeline')} className="text-blue-600 underline">
            Back to upload
          </button>
        </div>
      </div>
    );
  }

  const canGenerate = project.status.reviewed || project.status.segmented;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header bar */}
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm px-6 py-3 flex items-center justify-between">
        <div>
          <button onClick={() => navigate('/pipeline')} className="text-sm text-blue-600 hover:underline mr-4">
            &larr; Back
          </button>
          <span className="font-bold text-gray-900">{projectId}</span>
          <span className="ml-3 text-sm text-gray-500">{segments.length} segments</span>
          {dirty && <span className="ml-2 text-xs text-amber-600">(unsaved changes)</span>}
        </div>
        <div className="flex gap-2">
          {dirty ? (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          ) : !project.status.reviewed ? (
            <button
              onClick={handleMarkReviewed}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
            >
              Mark Reviewed
            </button>
          ) : null}

          <button
            onClick={handleGenerate}
            disabled={generating || !canGenerate}
            className="px-4 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate Descriptions'}
          </button>

          {project.status.descriptions_generated && (
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-md hover:bg-emerald-700"
            >
              Export for Probe
            </button>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="px-6 py-2 bg-gray-100 border-b flex gap-4 text-xs text-gray-600">
        {Object.entries(project.status).map(([key, val]) => (
          <span key={key} className={val ? 'text-green-700' : 'text-gray-400'}>
            {val ? '\u2713' : '\u25CB'} {key.replace(/_/g, ' ')}
          </span>
        ))}
      </div>

      {/* Error/result banners */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm" role="alert">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">dismiss</button>
        </div>
      )}
      {genResult && (
        <div className="mx-6 mt-4 p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm" role="status">
          Generated: {genResult.generated}, Failed: {genResult.failed}
          {genResult.failed_segment_ids.length > 0 && (
            <span className="ml-2">({genResult.failed_segment_ids.join(', ')})</span>
          )}
        </div>
      )}

      {/* Description editor overlay */}
      {editingDescSeg && (
        <DescriptionEditor
          segment={editingDescSeg}
          onSave={(descriptions) => handleDescriptionSave(editingDescSeg.id, descriptions)}
          onCancel={() => setEditingDescSeg(null)}
        />
      )}

      {/* Segment list */}
      <div className="px-6 py-4 space-y-4 max-w-6xl mx-auto">
        <p className="text-xs text-gray-500 mb-2">
          Keyboard: <kbd className="px-1 border rounded">j</kbd>/<kbd className="px-1 border rounded">k</kbd> to navigate segments
        </p>

        {segments.map((seg, i) => (
          <div key={seg.id} ref={(el) => (cardRefs.current[i] = el)}>
            <SegmentCard
              segment={seg}
              index={i}
              focused={i === focusedIndex}
              projectId={projectId}
              onAdjustTime={(field, delta) => adjustTime(i, field, delta)}
              onMerge={() => mergeWithNext(i)}
              onDelete={() => deleteSeg(i)}
              onSplit={(time) => splitSeg(i, time)}
              onLabelChange={(label) => updateSeg(i, { label })}
              onEditDescriptions={() => setEditingDescSeg(seg)}
              isLast={i === segments.length - 1}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
