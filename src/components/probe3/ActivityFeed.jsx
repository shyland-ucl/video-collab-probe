import { useCallback } from 'react';

export default function ActivityFeed({ items, creatorActivities, onTaskStatus, onAIReview, onAIUndo }) {
  const handleStatus = useCallback((taskId, status) => {
    onTaskStatus?.(taskId, status);
  }, [onTaskStatus]);

  return (
    <div>
      {/* Task + AI Edit items */}
      {items.length > 0 ? (
        <div className="divide-y divide-gray-100">
          {items.map((item) => (
            <div key={item.id} className="px-4 py-3">
              {item.type === 'helper_task' ? (
                /* Helper task from creator */
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-bold text-orange-600 uppercase">From Creator</span>
                  </div>
                  <p className="text-sm text-gray-800 mb-2">{item.text}</p>
                  {item.segment && (
                    <p className="text-xs text-gray-500 mb-2">Clip: {item.segment}</p>
                  )}
                  {item.status === 'pending' ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleStatus(item.id, 'done')}
                        className="flex-1 py-2 rounded-lg bg-green-500 text-white text-xs font-semibold hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-1"
                        style={{ minHeight: '48px' }}
                        aria-label={`Mark done: ${item.text}`}
                      >
                        Mark Done
                      </button>
                      <button
                        onClick={() => handleStatus(item.id, 'needs_discussion')}
                        className="flex-1 py-2 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1"
                        style={{ minHeight: '48px' }}
                        aria-label={`Needs discussion: ${item.text}`}
                      >
                        Needs Discussion
                      </button>
                      <button
                        onClick={() => handleStatus(item.id, 'cant_do')}
                        className="flex-1 py-2 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1"
                        style={{ minHeight: '48px' }}
                        aria-label={`Can't do: ${item.text}`}
                      >
                        Can't Do
                      </button>
                    </div>
                  ) : (
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                      item.status === 'done' ? 'bg-green-100 text-green-700' :
                      item.status === 'needs_discussion' ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {item.status === 'done' ? 'Done' :
                       item.status === 'needs_discussion' ? 'Needs Discussion' :
                       "Can't Do"}
                    </span>
                  )}
                </div>
              ) : (
                /* AI edit notification */
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-bold text-purple-600 uppercase">AI Edit</span>
                  </div>
                  <p className="text-sm text-gray-800 mb-1">{item.text}</p>
                  <p className="text-xs text-gray-500 mb-2">Requested by Creator</p>
                  {!item.undone && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => onAIReview?.(item)}
                        className="flex-1 py-2 rounded-lg bg-gray-100 text-xs font-semibold text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1"
                        style={{ minHeight: '48px' }}
                        aria-label={`Review AI edit: ${item.text}`}
                      >
                        Review
                      </button>
                      <button
                        onClick={() => onAIUndo?.(item)}
                        className="flex-1 py-2 rounded-lg bg-red-50 text-xs font-semibold text-red-600 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1"
                        style={{ minHeight: '48px' }}
                        aria-label={`Undo AI edit: ${item.text}`}
                      >
                        Undo
                      </button>
                    </div>
                  )}
                  {item.undone && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                      Undone
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-3">
          <p className="text-sm text-gray-400 italic">No tasks yet</p>
        </div>
      )}

      {/* Creator Activity — always at bottom */}
      <div className="px-4 py-3 bg-[#f3e8ff] border-t border-[#e9d5ff]">
        <div className="font-semibold text-[#7c3aed] text-xs uppercase tracking-wide mb-2">Creator Activity</div>
        {creatorActivities.length > 0 ? (
          <ul className="space-y-1 max-h-32 overflow-y-auto">
            {creatorActivities.slice(-10).reverse().map((a, i) => (
              <li key={i} className="text-xs text-gray-600">{a.data}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-400 italic">No activity yet</p>
        )}
      </div>
    </div>
  );
}
