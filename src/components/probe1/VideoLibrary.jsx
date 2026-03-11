import { useState } from 'react';
import { announce } from '../../utils/announcer.js';

// Condensed summaries derived from each video's level_1 descriptions
const VIDEO_SUMMARIES = {
  'video-sample': 'You walk to the kitchen, make instant coffee, and take a sip.',
  'video-sample2': 'Coffee-making from first person, then a man introduces himself to camera.',
  'video-sample3': 'You open a backpack by a window, walk along a lake, then visit a gas station.',
};

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

export default function VideoLibrary({ videos, onImport }) {
  const [selected, setSelected] = useState(new Set());

  const toggleSelect = (videoId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        next.add(videoId);
      }
      return next;
    });
  };

  const handleCreateProject = () => {
    const selectedVideos = videos.filter((v) => selected.has(v.id));
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
      <p className="text-sm text-gray-600">Select the videos you want to explore and edit.</p>

      <div className="flex flex-col gap-3" role="listbox" aria-label="Available videos" aria-multiselectable="true">
        {videos.map((video) => {
          const isSelected = selected.has(video.id);
          const summary = VIDEO_SUMMARIES[video.id] || '';
          const dateTaken = MOCK_DATES[video.id] || '';
          const durationText = formatDuration(video.duration);

          return (
            <button
              key={video.id}
              role="option"
              aria-selected={isSelected}
              aria-label={`${video.title}. ${summary}. ${durationText}.`}
              onClick={() => toggleSelect(video.id)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-600 ${
                isSelected
                  ? 'border-[#2B579A] bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
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

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-base">{video.title}</h3>
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

      <button
        onClick={handleCreateProject}
        disabled={selected.size === 0}
        className="w-full py-4 rounded-xl font-bold text-base text-white shadow-lg transition-colors hover:brightness-110 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: '#2B579A', minHeight: '48px' }}
        aria-label={`Create project with ${selected.size} selected video${selected.size !== 1 ? 's' : ''}`}
      >
        Create Project ({selected.size} selected)
      </button>
    </div>
  );
}
