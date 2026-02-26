import { useCallback } from 'react';
import { announce } from '../../utils/announcer.js';

export default function MarkList({ marks, onDelete, onPlayVoiceNote }) {
  const handleDelete = useCallback((mark) => {
    announce(`Removed mark from ${mark.segmentName}`);
    onDelete?.(mark.id);
  }, [onDelete]);

  if (!marks || marks.length === 0) {
    return (
      <div className="text-sm text-gray-400 py-4 text-center" role="status">
        No marks yet. Use exploration mode to mark segments and record voice notes.
      </div>
    );
  }

  return (
    <div role="region" aria-label={`${marks.length} marked segments`}>
      <ul className="space-y-2" aria-label="Marked segments with voice notes">
        {marks.map((mark, index) => (
          <li
            key={mark.id}
            className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 shadow-sm"
          >
            <span
              className="flex items-center justify-center w-7 h-7 rounded-full text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: '#E67E22' }}
              aria-hidden="true"
            >
              {index + 1}
            </span>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">
                {mark.segmentName}
              </p>
              {mark.audioBlob && (
                <p className="text-xs text-gray-500">
                  Voice note: {mark.audioDuration?.toFixed(1)}s
                </p>
              )}
            </div>

            {mark.audioBlob && (
              <button
                onClick={() => onPlayVoiceNote?.(mark)}
                className="px-3 py-2 text-xs font-medium rounded text-white transition-colors hover:brightness-110 focus:outline-2 focus:outline-offset-1 focus:outline-blue-500"
                style={{ backgroundColor: '#2B579A', minHeight: '44px', minWidth: '44px' }}
                aria-label={`Play voice note for ${mark.segmentName}`}
              >
                Play
              </button>
            )}

            <button
              onClick={() => handleDelete(mark)}
              className="px-3 py-2 text-xs font-medium rounded text-red-600 border border-red-200 hover:bg-red-50 transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-red-400"
              style={{ minHeight: '44px', minWidth: '44px' }}
              aria-label={`Remove mark from ${mark.segmentName}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
