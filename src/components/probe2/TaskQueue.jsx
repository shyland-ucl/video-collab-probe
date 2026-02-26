import { useState, useCallback, useRef, useEffect } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: '#6B7280', bg: '#F3F4F6' },
  done: { label: 'Done', color: '#FFFFFF', bg: '#5CB85C' },
  needs_discussion: { label: 'Needs Discussion', color: '#FFFFFF', bg: '#F0AD4E' },
  cannot_do: { label: 'Cannot Do', color: '#FFFFFF', bg: '#D9534F' },
};

export default function TaskQueue({ tasks, onTaskComplete, onPlayVoiceNote }) {
  const { logEvent } = useEventLogger();
  const [taskStatuses, setTaskStatuses] = useState({});
  const audioRef = useRef(null);

  // Initialize statuses
  useEffect(() => {
    if (tasks?.length) {
      const initial = {};
      tasks.forEach((t) => {
        initial[t.id] = 'pending';
      });
      setTaskStatuses(initial);
    }
  }, [tasks]);

  const handleStatusChange = useCallback((task, status) => {
    setTaskStatuses((prev) => ({ ...prev, [task.id]: status }));
    const statusLabel = STATUS_CONFIG[status]?.label || status;
    announce(`${task.segmentName}: marked as ${statusLabel}`);
    logEvent(EventTypes.COMPLETE_TASK, Actors.HELPER, {
      taskId: task.id,
      segmentId: task.segmentId,
      status,
    });
    onTaskComplete?.(task.id, status);
  }, [logEvent, onTaskComplete]);

  const handlePlayVoiceNote = useCallback((task) => {
    logEvent(EventTypes.PLAY_VOICE_NOTE, Actors.HELPER, {
      taskId: task.id,
      segmentId: task.segmentId,
    });
    onPlayVoiceNote?.(task);
  }, [logEvent, onPlayVoiceNote]);

  if (!tasks || tasks.length === 0) {
    return (
      <div className="text-sm text-gray-400 py-4 text-center" role="status">
        No tasks received from creator.
      </div>
    );
  }

  const completedCount = Object.values(taskStatuses).filter((s) => s === 'done').length;

  return (
    <div role="region" aria-label="Task queue from creator">
      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>{completedCount} of {tasks.length} completed</span>
          <span>{Math.round((completedCount / tasks.length) * 100)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="h-2 rounded-full transition-all duration-300"
            style={{
              width: `${(completedCount / tasks.length) * 100}%`,
              backgroundColor: '#5CB85C',
            }}
            role="progressbar"
            aria-valuenow={completedCount}
            aria-valuemin={0}
            aria-valuemax={tasks.length}
            aria-label={`${completedCount} of ${tasks.length} tasks completed`}
          />
        </div>
      </div>

      {/* Task list */}
      <ul className="space-y-3" aria-label="Tasks to complete">
        {tasks.map((task, index) => {
          const status = taskStatuses[task.id] || 'pending';
          const config = STATUS_CONFIG[status];
          return (
            <li
              key={task.id}
              className="p-3 bg-white rounded-lg border border-gray-200 shadow-sm"
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold shrink-0"
                  style={{ backgroundColor: '#E67E22' }}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span className="text-sm font-medium text-gray-800 flex-1">
                  {task.segmentName}
                </span>
                <span
                  className="px-2 py-0.5 rounded text-xs font-semibold"
                  style={{ backgroundColor: config.bg, color: config.color }}
                >
                  {config.label}
                </span>
              </div>

              {/* Voice note playback */}
              {task.audioBlob && (
                <button
                  onClick={() => handlePlayVoiceNote(task)}
                  className="mb-2 flex items-center gap-2 text-xs font-medium px-3 py-2 rounded transition-colors hover:brightness-110 focus:outline-2 focus:outline-offset-1 focus:outline-blue-500 text-white"
                  style={{ backgroundColor: '#2B579A', minHeight: '44px' }}
                  aria-label={`Play creator's voice note for ${task.segmentName}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Play Voice Note ({task.audioDuration?.toFixed(1)}s)
                </button>
              )}

              {/* Status buttons */}
              <div className="flex gap-2" role="group" aria-label={`Status actions for ${task.segmentName}`}>
                <button
                  onClick={() => handleStatusChange(task, 'done')}
                  className={`px-3 py-2 rounded text-xs font-medium text-white transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-green-500 ${
                    status === 'done' ? 'ring-2 ring-green-700' : ''
                  }`}
                  style={{ backgroundColor: '#5CB85C', minHeight: '44px', minWidth: '44px' }}
                  aria-label={`Mark "${task.segmentName}" as done${status === 'done' ? ' (currently selected)' : ''}`}
                  aria-pressed={status === 'done'}
                >
                  Done
                </button>
                <button
                  onClick={() => handleStatusChange(task, 'needs_discussion')}
                  className={`px-3 py-2 rounded text-xs font-medium text-white transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-amber-500 ${
                    status === 'needs_discussion' ? 'ring-2 ring-amber-700' : ''
                  }`}
                  style={{ backgroundColor: '#F0AD4E', minHeight: '44px', minWidth: '44px' }}
                  aria-label={`Mark "${task.segmentName}" as needs discussion${status === 'needs_discussion' ? ' (currently selected)' : ''}`}
                  aria-pressed={status === 'needs_discussion'}
                >
                  Discuss
                </button>
                <button
                  onClick={() => handleStatusChange(task, 'cannot_do')}
                  className={`px-3 py-2 rounded text-xs font-medium text-white transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-red-500 ${
                    status === 'cannot_do' ? 'ring-2 ring-red-700' : ''
                  }`}
                  style={{ backgroundColor: '#D9534F', minHeight: '44px', minWidth: '44px' }}
                  aria-label={`Mark "${task.segmentName}" as cannot do${status === 'cannot_do' ? ' (currently selected)' : ''}`}
                  aria-pressed={status === 'cannot_do'}
                >
                  Can't Do
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
