import { useEffect, useRef, useCallback } from 'react';

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

const AWARENESS_DEBOUNCE_MS = 1500;

function formatTimestamp(ts) {
  const date = new Date(ts);
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function truncate(text, n = 120) {
  const s = String(text || '');
  return s.length > n ? s.slice(0, n) : s;
}

export default function WorkspaceAwareness({ activities = [], onAwarenessViewed }) {
  const scrollRef = useRef(null);

  // Auto-scroll to bottom on new activity
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activities.length]);

  // Per-entry debounce so a TalkBack swipe back-and-forth across the same
  // activity line produces a few well-spaced events, not a flood.
  const lastEmitRef = useRef(new Map());
  const emitAwareness = useCallback((payload) => {
    if (!onAwarenessViewed) return;
    const key = `${payload.element}:${payload.index ?? ''}:${payload.trigger}`;
    const now = Date.now();
    const prev = lastEmitRef.current.get(key) || 0;
    if (now - prev < AWARENESS_DEBOUNCE_MS) return;
    lastEmitRef.current.set(key, now);
    const { index: _omitIdx, ...forward } = payload;
    onAwarenessViewed(forward);
  }, [onAwarenessViewed]);

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
                className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-gray-50 text-xs focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
                role="article"
                tabIndex={0}
                onFocus={() => emitAwareness({
                  element: 'workspace_awareness',
                  index: i,
                  entry_actor: activity.actor,
                  entry_description: truncate(activity.data),
                  trigger: 'focus',
                })}
                onClick={() => emitAwareness({
                  element: 'workspace_awareness',
                  index: i,
                  entry_actor: activity.actor,
                  entry_description: truncate(activity.data),
                  trigger: 'tap',
                })}
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
