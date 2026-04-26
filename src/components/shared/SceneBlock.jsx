import { useEffect, useRef } from 'react';
import { useAccessibility } from '../../contexts/AccessibilityContext.jsx';
import ttsService from '../../services/ttsService.js';
import { announce } from '../../utils/announcer.js';

function formatDuration(seconds) {
  const s = Math.round(seconds || 0);
  if (s < 60) return `${s} seconds`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m} min ${rem} sec` : `${m} min`;
}

export default function SceneBlock({
  scene,
  index,
  total,
  currentLevel,
  isExpanded,
  onExpand,
  onCollapse,
  vqaHistory = [],
  awareness,
  children,
  accentColor = '#2B579A',
}) {
  const actionsRef = useRef(null);
  const { audioEnabled, speechRate } = useAccessibility();

  const duration = (scene.end_time || 0) - (scene.start_time || 0);
  const levelKey = `level_${currentLevel}`;
  const description = scene.descriptions?.[levelKey] || '';

  // Auto-focus actions area and announce on expand.
  // Fires for both manual click and auto-follow during playback. TalkBack
  // picks up the focus change and the live-region announce — we deliberately
  // don't call ttsService.speak() here so we don't fight the screen reader.
  useEffect(() => {
    if (isExpanded && actionsRef.current) {
      actionsRef.current.focus();
      ttsService.stop();
      announce(`Opened scene ${index + 1}. ${scene.name}. Showing actions.`);
    }
    if (!isExpanded) {
      ttsService.stop();
    }
    // scene.name and index are stable for the lifecycle of this block
  }, [isExpanded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Browser back-button integration is owned by SceneBlockList — putting it
  // here caused auto-follow to break: when expandedIndex moves from N to N+1,
  // block N's cleanup calls history.back(), and the async popstate then fires
  // against block N+1's just-attached listener, collapsing it. SceneBlockList
  // does a single push/pop keyed on "is any scene expanded".

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      {/* Collapsed header — always visible */}
      <button
        onClick={() => {
          if (isExpanded) {
            onCollapse();
            return;
          }
          // The expand effect handles description read-out so the same code
          // path runs for click and auto-follow — no separate speak here.
          onExpand(index);
        }}
        aria-label={`Scene ${index + 1} of ${total}: ${scene.name}. ${formatDuration(duration)}. ${isExpanded ? 'Tap to close actions.' : 'Tap to open actions.'}`}
        aria-expanded={isExpanded}
        className={`w-full text-left px-4 py-3 hover:bg-gray-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500 transition-colors ${
          isExpanded ? 'border-b-2' : ''
        }`}
        style={isExpanded ? { borderBottomColor: accentColor, minHeight: '48px' } : { minHeight: '48px' }}
      >
        {/* Scene header row */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: scene.color || accentColor }}
              aria-hidden="true"
            />
            <span className="font-medium text-sm truncate">{scene.name}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 text-xs text-gray-500">
            {awareness?.taskSummary && (
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  awareness.helperStatus === 'working'
                    ? 'bg-amber-100 text-amber-800'
                    : awareness.helperStatus === 'done'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-600'
                }`}
                aria-label={awareness.taskSummary}
              >
                {awareness.taskSummary}
              </span>
            )}
            <span aria-hidden="true">{Math.round(duration)}s</span>
            <span aria-hidden="true" className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
          </div>
        </div>
        {/* Description always visible */}
        <p className="text-sm text-gray-600 leading-relaxed" aria-hidden="true">
          {description || 'No description available.'}
        </p>
      </button>

      {/* Expanded: inline actions below the collapsed header */}
      {isExpanded && (
        <div
          ref={actionsRef}
          tabIndex={-1}
          className="px-4 py-3"
          role="region"
          aria-label={`Actions for scene ${index + 1}`}
        >
          {/* VQA Conversation History — supports three roles:
                user    : participant's question (right-aligned, accent colour)
                ai      : AI / researcher answer (left-aligned, gray)
                system  : status message such as "AI could not answer,
                          researcher is checking" (left-aligned, amber, M7)
          */}
          {vqaHistory.length > 0 && (
            <div className="mb-3 space-y-2" role="log" aria-label="Questions and answers">
              {vqaHistory.map((msg, i) => {
                const isUser = msg.role === 'user';
                const isSystem = msg.role === 'system';
                let bubbleClasses = 'max-w-[85%] px-3 py-2 rounded-lg text-base ';
                let bubbleStyle;
                let label;
                if (isUser) {
                  bubbleClasses += 'text-white';
                  bubbleStyle = { backgroundColor: accentColor };
                  label = `Your question: ${msg.text}`;
                } else if (isSystem) {
                  bubbleClasses += 'bg-amber-50 text-amber-900 border border-amber-200';
                  label = `Status: ${msg.text}`;
                } else {
                  bubbleClasses += 'bg-gray-100 text-gray-800';
                  label = `Answer: ${msg.text}`;
                }
                return (
                <div
                  key={i}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={bubbleClasses}
                    style={bubbleStyle}
                    role={isSystem ? 'status' : undefined}
                    aria-label={label}
                  >
                    {msg.text}
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* Awareness section (Probe 2b/3) */}
          {awareness?.actionLog?.length > 0 && (
            <div className="mb-3 pb-3 border-b border-gray-100" aria-label="Activity on this scene">
              {awareness.helperActivity && (
                <p className="text-xs text-amber-700 font-medium mb-1" role="status">
                  {awareness.helperActivity}
                </p>
              )}
              <ul className="space-y-1">
                {awareness.actionLog.map((entry, i) => (
                  <li key={i} className="text-xs text-gray-500">
                    <span className="font-medium">[{entry.actor}]</span> {entry.description}
                  </li>
                ))}
              </ul>
              {awareness.taskStatus && (
                <p className="text-xs mt-1">
                  <span className="font-medium">Task: </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs ${
                      awareness.taskStatus === 'Done'
                        ? 'bg-green-100 text-green-800'
                        : awareness.taskStatus === 'In Progress'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {awareness.taskStatus}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Probe-specific actions (children) */}
          <div className="space-y-2">
            {children}
          </div>

          {/* Back button */}
          <button
            onClick={onCollapse}
            className="w-full mt-3 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium rounded border border-gray-200 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
            style={{ minHeight: '44px' }}
            aria-label="Close scene actions"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
