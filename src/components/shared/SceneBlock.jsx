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
  autoFollowed = false,
  onExpand,
  onCollapse,
  vqaHistory = [],
  awareness,
  children,
  accentColor = '#2B579A',
  // True when the participant has tapped Remove on this scene. Renders the
  // block dimmed with a "Removed" badge so they get visible confirmation
  // alongside the playback filter. The block stays interactive (so they
  // can still expand to Restore).
  isRemoved = false,
  // Forwarded from SceneBlockList so it can restore focus to this scene's
  // header on full collapse — otherwise focus falls to <body> when the
  // expanded actions region unmounts (Lan 2026-04-26).
  headerRef,
}) {
  const actionsRef = useRef(null);
  const { audioEnabled, speechRate } = useAccessibility();

  const duration = (scene.end_time || 0) - (scene.start_time || 0);
  const levelKey = `level_${currentLevel}`;
  const description = scene.descriptions?.[levelKey] || '';

  // Auto-focus on expand. Fires for both manual click and auto-follow
  // during playback. We deliberately do NOT call ttsService.speak() here
  // so we don't fight TalkBack — the announce() live region + focus
  // change is enough.
  //
  // Focus target depends on origin (per Lan's 2026-04-26 feedback):
  //   - Manual click → actions region (user is opening the menu).
  //   - Auto-follow  → the new scene's Play/Pause button (so the user
  //     stays on the button they were just using). Falls back to the
  //     actions region if the play button isn't found.
  useEffect(() => {
    if (isExpanded && actionsRef.current) {
      ttsService.stop();
      const playBtn = autoFollowed
        ? actionsRef.current.querySelector('[data-scene-play-button="true"]')
        : null;
      if (playBtn) {
        playBtn.focus();
      } else {
        actionsRef.current.focus();
      }
      // Announce only on MANUAL expand. During auto-follow (playback
      // crossing scene boundaries) we stay silent so the video audio
      // isn't talked over (Lan 2026-04-26). Assertive on manual expand
      // because Android TalkBack drops polite writes during the
      // activated button's re-read.
      if (!autoFollowed) {
        announce(`Opened scene ${index + 1}. ${scene.name}. Showing actions.`, { assertive: true });
      }
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
      {/* Collapsed header — always visible. The aria-label includes the
          description (current detail level) so a TalkBack creator can hear
          what's in each scene without having to expand it (Lan-confirmed
          override of M3 trade-off, 2026-04-26). */}
      <button
        ref={headerRef}
        onClick={() => {
          if (isExpanded) {
            onCollapse();
            return;
          }
          // The expand effect handles description read-out so the same code
          // path runs for click and auto-follow — no separate speak here.
          onExpand(index);
        }}
        aria-label={
          `Scene ${index + 1} of ${total}: ${scene.name}. ${formatDuration(duration)}. ` +
          (isRemoved ? 'Removed from edit. ' : '') +
          (description ? `${description} ` : '') +
          (isExpanded ? 'Tap to close actions.' : 'Tap to open actions.')
        }
        className={`w-full text-left px-4 py-3 hover:bg-gray-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500 transition-colors ${
          isExpanded ? 'border-b-2' : ''
        } ${isRemoved ? 'bg-gray-50 opacity-60' : ''}`}
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
            <span className={`font-medium text-sm truncate ${isRemoved ? 'line-through text-gray-500' : ''}`}>
              {scene.name}
            </span>
            {isRemoved && (
              <span
                className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 flex-shrink-0"
                aria-hidden="true"
              >
                Removed
              </span>
            )}
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
        <p className={`text-sm leading-relaxed ${isRemoved ? 'text-gray-400 line-through' : 'text-gray-600'}`} aria-hidden="true">
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
