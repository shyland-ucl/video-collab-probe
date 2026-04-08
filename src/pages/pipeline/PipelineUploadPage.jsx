import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadFootage, listProjects } from '../../services/pipelineApi.js';

export default function PipelineUploadPage() {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState('');
  const [segmentLength, setSegmentLength] = useState(3);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [projects, setProjects] = useState(null);

  const isValidId = /^[a-zA-Z0-9_-]{1,64}$/.test(projectId);

  async function loadProjects() {
    try {
      const list = await listProjects();
      setProjects(list);
    } catch {
      setProjects([]);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file || !isValidId) return;

    setUploading(true);
    setError('');
    setProgress('Uploading...');

    try {
      setProgress('Uploading and segmenting...');
      const result = await uploadFootage(file, projectId, segmentLength);
      setProgress(`Done! ${result.segments_count} segments created.`);
      setTimeout(() => navigate(`/pipeline/review/${projectId}`), 1000);
    } catch (err) {
      setError(err.message);
      setProgress('');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Footage Pipeline</h1>
        <p className="text-gray-600 mb-8">
          Upload participant footage for segmentation and AI description generation.
        </p>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border p-6 space-y-6">
          {/* Project ID */}
          <div>
            <label htmlFor="project-id" className="block text-sm font-medium text-gray-700 mb-1">
              Project ID
            </label>
            <input
              id="project-id"
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="e.g. P03_dyad_market_video"
              className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              maxLength={64}
              required
              aria-describedby="project-id-help"
            />
            <p id="project-id-help" className="mt-1 text-xs text-gray-500">
              Alphanumeric, underscores, hyphens. Max 64 characters.
            </p>
            {projectId && !isValidId && (
              <p className="mt-1 text-xs text-red-600">Invalid project ID format.</p>
            )}
          </div>

          {/* Segment Length */}
          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-2">
              Segment Length
            </legend>
            <div className="flex gap-4">
              {[3, 5].map((len) => (
                <label key={len} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="segment-length"
                    value={len}
                    checked={segmentLength === len}
                    onChange={() => setSegmentLength(len)}
                    className="text-blue-600"
                  />
                  <span>{len} seconds</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* File Upload */}
          <div>
            <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 mb-1">
              Video File (.mp4)
            </label>
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center hover:border-blue-400 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const dropped = e.dataTransfer.files[0];
                if (dropped?.name.endsWith('.mp4')) setFile(dropped);
              }}
            >
              {file ? (
                <div>
                  <p className="font-medium text-gray-900">{file.name}</p>
                  <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="mt-2 text-sm text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-gray-500 mb-2">Drag and drop an .mp4 file here, or</p>
                  <label
                    htmlFor="file-upload"
                    className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md cursor-pointer hover:bg-blue-700"
                  >
                    Choose File
                  </label>
                  <input
                    id="file-upload"
                    type="file"
                    accept=".mp4"
                    onChange={(e) => setFile(e.target.files[0])}
                    className="hidden"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm" role="alert">
              {error}
            </div>
          )}

          {/* Progress */}
          {progress && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-blue-700 text-sm" role="status">
              {progress}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={uploading || !file || !isValidId}
            className="w-full py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {uploading ? 'Processing...' : 'Upload and Segment'}
          </button>
        </form>

        {/* Existing Projects */}
        <div className="mt-8">
          <button
            onClick={loadProjects}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Show existing projects
          </button>
          {projects !== null && (
            <div className="mt-4 space-y-2">
              {projects.length === 0 ? (
                <p className="text-sm text-gray-500">No projects yet.</p>
              ) : (
                projects.map((p) => (
                  <button
                    key={p.project_id}
                    onClick={() => navigate(`/pipeline/review/${p.project_id}`)}
                    className="block w-full text-left p-3 bg-white border rounded-md hover:bg-gray-50"
                  >
                    <span className="font-medium">{p.project_id}</span>
                    <span className="text-sm text-gray-500 ml-2">
                      {p.segments.length} segments
                      {p.status.ready_for_probe && ' — Ready'}
                      {!p.status.segmented && ' — Uploading...'}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
