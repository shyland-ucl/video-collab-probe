import { useEffect, useRef } from 'react';

const actionIcons = {
  play: '▶',
  pause: '⏸',
  seek: '⏩',
  segment: '📍',
  level: '🔍',
  edit: '✂',
  message: '💬',
  control: '🎮',
  independent: '🔓',
  default: '•',
};

function formatTimestamp(ts) {
  const date = new Date(ts);
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function WorkspaceAwareness({ activities = [] }) {
  const scrollRef = useRef(null);

  // Auto-scroll to bottom on new activity
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activities.length]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      <div
        className="px-3 py-2 text-xs font-semibold text-white uppercase tracking-wide"
        style={{ backgroundColor: '#9B59B6' }}
      >
        Activity Feed
      </div>
      <div
        ref={scrollRef}
        className="overflow-y-auto p-2 space-y-1"
        style={{ maxHeight: '200px' }}
        aria-live="polite"
        aria-label="Workspace activity feed"
      >
        {activities.length === 0 ? (
          <p className="text-gray-400 text-xs text-center py-3">No activity yet</p>
        ) : (
          activities.map((activity, i) => {
            const icon = actionIcons[activity.action] || actionIcons.default;
            return (
              <div
                key={i}
                className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-gray-50 text-xs"
              >
                <span className="shrink-0 text-sm" aria-hidden="true">{icon}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-700">{activity.actor}: </span>
                  <span className="text-gray-600">{activity.data}</span>
                </div>
                <span className="shrink-0 text-gray-400 tabular-nums">
                  {formatTimestamp(activity.timestamp)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
