import { useEffect, useRef } from 'react';
import { announce } from '../../utils/announcer.js';

function formatTimeRange(start, end) {
  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };
  return `${fmt(start)} - ${fmt(end)}`;
}

export default function SegmentMarkerPanel({ segment }) {
  const prevSegIdRef = useRef(null);

  useEffect(() => {
    if (segment && segment.id !== prevSegIdRef.current) {
      prevSegIdRef.current = segment.id;
      announce(`New segment: ${segment.name}`);
    } else if (!segment) {
      prevSegIdRef.current = null;
    }
  }, [segment]);

  return (
    <div
      className="px-4 py-2 bg-gray-50 border border-gray-200 rounded text-sm"
      aria-live="polite"
      aria-label="Current segment information"
    >
      {segment ? (
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: segment.color }}
            aria-hidden="true"
          />
          <span className="font-semibold">{segment.name}</span>
          <span className="text-gray-500">
            {formatTimeRange(segment.start_time, segment.end_time)}
          </span>
        </div>
      ) : (
        <span className="text-gray-400">No segment selected</span>
      )}
    </div>
  );
}
