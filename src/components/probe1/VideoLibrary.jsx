import { useState, useEffect, useCallback } from 'react';
import { announce } from '../../utils/announcer.js';
import VideoUpload from '../shared/VideoUpload.jsx';

// Condensed summaries derived from each video's level_1 descriptions
const VIDEO_SUMMARIES = {
  'video-sample': 'You walk to the kitchen, make instant coffee, and take a sip.',
  'video-sample2': 'Coffee-making from first person, then a man introduces himself to camera.',
  'video-sample3': 'You open a backpack by a window, walk along a lake, then visit a gas station.',
};

function getPipelineSummary(video) {
  if (video._summary) return video._summary;
  const segCount = video.segments?.length || 0;
  const hasDescs = video._status?.descriptions_generated;
  return `Your uploaded footage. ${segCount} segments${hasDescs ? ' with AI descriptions' : ''}.`;
}

function formatDate(isoString) {
  if (!isoString) return null;
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return null; }
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m > 0) return `${m} min ${s} sec`;
  return `${s} seconds`;
}

// Mock "date taken" for each video
const MOCK_DATES = {
  'video-sample': '12 Jan 2026',
  'video-sample2': '14 Jan 2026',
  'video-sample3': '18 Jan 2026',
};

/**
 * VideoLibrary — multi-select video picker.
 *
 * Props:
 *   videos          — array of { id, title, src, duration, segments }
 *   onImport        — called with selected videos array on "Create Project"
 *   showPreview     — show video thumbnail for sighted helpers (default false)
 *   controlledSelection — Set<string> of video ids controlled externally (for sync)
 *   onSelectionChange   — called with (videoId, isSelected) on each toggle (for sync)
 *   readOnly        — if true, disable toggling (helper watches creator select)
 */
export default function VideoLibrary({
  videos,
  onImport,
  showPreview = false,
  controlledSelection,
  onSelectionChange,
  readOnly = false,
}) {
  // Uploaded videos added by the participant
  const [uploadedVideos, setUploadedVideos] = useState([]);

  // Combine sample + uploaded videos
  const allVideos = [...videos, ...uploadedVideos];

  // Use internal state when not controlled, otherwise use controlled set
  const [internalSelected, setInternalSelected] = useState(new Set());
  const selected = controlledSelection || internalSelected;

  const handleUpload = useCallback((newVideos) => {
    setUploadedVideos((prev) => [...prev, ...newVideos]);
    // Auto-select newly uploaded videos
    if (!onSelectionChange) {
      setInternalSelected((prev) => {
        const next = new Set(prev);
        newVideos.forEach((v) => next.add(v.id));
        return next;
      });
    } else {
      newVideos.forEach((v) => onSelectionChange(v.id, true));
    }
  }, [onSelectionChange]);

  const toggleSelect = useCallback((videoId) => {
    if (readOnly) return;

    if (onSelectionChange) {
      // Controlled mode — notify parent, don't update internal state
      onSelectionChange(videoId, !selected.has(videoId));
    } else {
      // Uncontrolled mode — manage locally
      setInternalSelected((prev) => {
        const next = new Set(prev);
        if (next.has(videoId)) {
          next.delete(videoId);
        } else {
          next.add(videoId);
        }
        return next;
      });
    }
  }, [readOnly, onSelectionChange, selected]);

  const handleCreateProject = () => {
    const selectedVideos = allVideos.filter((v) => selected.has(v.id));
    if (selectedVideos.length === 0) {
      announce('No videos selected. Please select at least one video.');
      return;
    }
    announce(`Creating project with ${selectedVideos.length} video${selectedVideos.length > 1 ? 's' : ''}.`);
    onImport(selectedVideos);
  };

  return (
    <div className="flex flex-col gap-4 p-4 max-w-lg mx-auto" role="region" aria-label="Video library">
      <h2 className="text-lg font-bold text-gray-900">Your Videos</h2>
      <p className="text-sm text-gray-600">
        {readOnly
          ? 'Creator is selecting videos. Selections will appear here.'
          : 'Select the videos you want to explore and edit.'}
      </p>

      {/* Upload button — only for non-readonly participants */}
      {!readOnly && (
        <VideoUpload onUpload={handleUpload} />
      )}

      <div className="flex flex-col gap-3" role="listbox" aria-label="Available videos" aria-multiselectable="true">
        {allVideos.map((video) => {
          const isSelected = selected.has(video.id);
          const summary = video._pipeline
            ? getPipelineSummary(video)
            : VIDEO_SUMMARIES[video.id] || (video._uploaded ? `Uploaded from your device (${(video._fileSize / (1024 * 1024)).toFixed(1)} MB)` : '');
          const dateTaken = MOCK_DATES[video.id]
            || (video._pipeline && (formatDate(video._creationTime) || formatDate(video._uploadedAt)))
            || (video._uploaded ? 'Just now' : '');
          const durationText = formatDuration(video.duration);

          return (
            <button
              key={video.id}
              role="option"
              aria-selected={isSelected}
              aria-label={`${video.title}. ${summary}. ${durationText}.${readOnly ? ' Selected by creator.' : ''}`}
              onClick={() => toggleSelect(video.id)}
              disabled={readOnly}
              className={`w-full text-left p-4 rounded-xl border-2 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-600 ${
                isSelected
                  ? 'border-[#2B579A] bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              } ${readOnly ? 'cursor-default' : ''}`}
              style={{ minHeight: '48px' }}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox indicator */}
                <div
                  className={`flex-shrink-0 w-6 h-6 mt-0.5 rounded border-2 flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-[#2B579A] border-[#2B579A]'
                      : 'border-gray-400 bg-white'
                  }`}
                  aria-hidden="true"
                >
                  {isSelected && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5">
                      <path d="M2 7l3.5 3.5L12 3" />
                    </svg>
                  )}
                </div>

                {showPreview && (
                  <video
                    src={video.src}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-20 h-14 rounded object-cover bg-gray-200 shrink-0"
                    aria-hidden="true"
                    onLoadedMetadata={(e) => { e.target.currentTime = 1; }}
                  />
                )}

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-base">
                    {video.title}
                    {video._pipeline && (
                      <span className="ml-2 inline-block px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-full align-middle">
                        Your Footage
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-gray-600 mt-0.5 leading-snug">{summary}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    <span>{durationText}</span>
                    {dateTaken && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{dateTaken}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {!readOnly && (
        <button
          onClick={handleCreateProject}
          disabled={selected.size === 0}
          className="w-full py-4 rounded-xl font-bold text-base text-white shadow-lg transition-colors hover:brightness-110 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: '#2B579A', minHeight: '48px' }}
          aria-label={`Create project with ${selected.size} selected video${selected.size !== 1 ? 's' : ''}`}
        >
          Create Project ({selected.size} selected)
        </button>
      )}

      {readOnly && (
        <div
          className="w-full py-4 rounded-xl text-center text-sm font-medium text-gray-500 border-2 border-dashed border-gray-300"
          role="status"
          aria-live="polite"
        >
          {selected.size > 0
            ? `${selected.size} video${selected.size !== 1 ? 's' : ''} selected by creator`
            : 'Waiting for creator to select videos...'}
        </div>
      )}
    </div>
  );
}
