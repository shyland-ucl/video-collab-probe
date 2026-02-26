import { useCallback, useRef } from 'react';

export default function Timeline({ segments = [], currentTime = 0, duration = 0, onSeek }) {
  const trackRef = useRef(null);

  const percentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleClick = useCallback((e) => {
    const track = trackRef.current;
    if (!track || !duration) return;
    const rect = track.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const time = ratio * duration;
    if (onSeek) onSeek(time);
  }, [duration, onSeek]);

  const handleKeyDown = useCallback((e) => {
    if (!duration) return;
    let newTime = currentTime;
    if (e.key === 'ArrowRight') {
      newTime = Math.min(duration, currentTime + 5);
    } else if (e.key === 'ArrowLeft') {
      newTime = Math.max(0, currentTime - 5);
    } else {
      return;
    }
    e.preventDefault();
    if (onSeek) onSeek(newTime);
  }, [currentTime, duration, onSeek]);

  return (
    <div className="px-2 py-3">
      <div
        ref={trackRef}
        className="relative h-8 bg-gray-200 rounded cursor-pointer"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="slider"
        aria-label="Video timeline"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={`${Math.round(currentTime)} seconds of ${Math.round(duration)}`}
        tabIndex={0}
      >
        {/* Segment blocks */}
        {segments.map((seg) => {
          if (!duration) return null;
          const left = (seg.start_time / duration) * 100;
          const width = ((seg.end_time - seg.start_time) / duration) * 100;
          return (
            <div
              key={seg.id}
              className="absolute top-0 h-full flex items-center justify-center text-white text-xs font-medium overflow-hidden"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: seg.color,
              }}
              title={`${seg.name} (${formatTimeShort(seg.start_time)} - ${formatTimeShort(seg.end_time)})`}
            >
              <span className="truncate px-1">{seg.name}</span>
            </div>
          );
        })}

        {/* Playhead */}
        <div
          className="absolute top-0 h-full w-0.5 bg-white pointer-events-none"
          style={{ left: `${percentage}%` }}
        >
          <div
            className="absolute -top-1 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow"
            style={{ left: '50%' }}
          />
        </div>
      </div>
    </div>
  );
}

function formatTimeShort(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
