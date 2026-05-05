import { useCallback, useEffect, useRef } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import Probe2bSceneActions from '../probe2/Probe2bSceneActions.jsx';

const CATEGORY_COLORS = {
  issue: { bg: 'bg-red-50', border: 'border-red-300', badge: 'bg-red-100 text-red-800' },
  structural: { bg: 'bg-orange-50', border: 'border-orange-300', badge: 'bg-orange-100 text-orange-800' },
  creative: { bg: 'bg-cyan-50', border: 'border-cyan-300', badge: 'bg-cyan-100 text-cyan-800' },
};

function SuggestionItem({ suggestion, onRouteSelf, onRouteAI, onRouteHelper, helperName, resolution }) {
  const colors = CATEGORY_COLORS[suggestion.category] || CATEGORY_COLORS.creative;
  const resolutionContainerRef = useRef(null);
  // Move focus into the resolution container as soon as routing lands.
  // Without this, the routing buttons unmount, browser focus falls back to
  // <body>, and TalkBack reads the page title instead. Skip the self route
  // because Probe3Page.handleSuggestionRoute('self') already moves focus to
  // the related scene's "Edit by Myself" button via requestAnimationFrame.
  useEffect(() => {
    if (!resolution || !resolutionContainerRef.current) return;
    if (resolution.routedTo === 'self') return;
    resolutionContainerRef.current.focus({ preventScroll: false });
  }, [resolution?.routedTo]);

  // The category badge and "Scene N" chrome are decorative — the suggestion
  // text already conveys both. Marking them aria-hidden keeps TalkBack from
  // reading "issue Scene 3" before the sentence.
  if (resolution) {
    const badgeColor = {
      ai: 'bg-purple-100 text-purple-800 border-purple-300',
      self: 'bg-blue-100 text-blue-800 border-blue-300',
      helper: 'bg-orange-100 text-orange-800 border-orange-300',
    }[resolution.routedTo] || 'bg-gray-100 text-gray-700 border-gray-300';
    const outcomeColor = {
      pending: 'text-amber-700',
      applied: 'text-green-700',
      failed: 'text-red-700',
    }[resolution.outcomeStatus] || 'text-gray-600';
    const routedLabel = {
      ai: 'Routed to AI',
      self: 'Doing it myself',
      helper: `Routed to ${helperName}`,
    }[resolution.routedTo] || 'Resolved';
    return (
      <div
        ref={resolutionContainerRef}
        tabIndex={-1}
        aria-label={`${routedLabel}: ${suggestion.text} Status: ${resolution.outcomeStatus || 'pending'}.`}
        className={`p-3 rounded-lg border-2 ${colors.bg} ${colors.border} opacity-90 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500`}
      >
        <div className="flex items-center gap-2 mb-2" aria-hidden="true">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.badge}`}>
            {suggestion.category}
          </span>
          {suggestion.relatedScene !== undefined && (
            <span className="text-xs text-gray-500">
              Scene {Array.isArray(suggestion.relatedScene)
                ? suggestion.relatedScene.map((s) => s + 1).join(' & ')
                : suggestion.relatedScene + 1}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-800 mb-2" aria-hidden="true">{suggestion.text}</p>
        <div
          className={`flex items-center gap-2 text-xs px-2 py-1 rounded border ${badgeColor}`}
          aria-hidden="true"
        >
          <span className="font-bold">{routedLabel}</span>
          <span className={`font-medium ${outcomeColor}`}>
            · {resolution.outcomeStatus === 'applied' ? 'applied'
              : resolution.outcomeStatus === 'failed' ? 'failed'
              : 'pending'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-3 rounded-lg border-2 ${colors.bg} ${colors.border}`}>
      <div className="flex items-center gap-2 mb-2" aria-hidden="true">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.badge}`}>
          {suggestion.category}
        </span>
        {suggestion.relatedScene !== undefined && (
          <span className="text-xs text-gray-500">
            Scene {Array.isArray(suggestion.relatedScene)
              ? suggestion.relatedScene.map((s) => s + 1).join(' & ')
              : suggestion.relatedScene + 1}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-800 mb-3">{suggestion.text}</p>

      {/* Three routing options — every suggestion can go to self, helper, or AI.
          Dismiss removed per user spec (every suggestion must be routed). */}
      <div className="space-y-2">
        <button
          onClick={() => onRouteSelf(suggestion)}
          className="w-full py-2 text-sm font-medium rounded bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ minHeight: '44px' }}
        >
          I'll fix it
        </button>
        <button
          onClick={() => onRouteHelper(suggestion)}
          className="w-full py-2 text-sm font-medium rounded bg-orange-100 text-orange-800 hover:bg-orange-200 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ minHeight: '44px' }}
        >
          Ask {helperName} to fix it
        </button>
        <button
          onClick={() => onRouteAI(suggestion)}
          className="w-full py-2 text-sm font-medium rounded bg-purple-100 text-purple-800 hover:bg-purple-200 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ minHeight: '44px' }}
        >
          Ask AI to fix it
        </button>
      </div>
    </div>
  );
}

export default function Probe3SceneActions({
  scene,
  index,
  suggestions = [],
  helperName = 'helper',
  onSuggestionRoute,
  onSuggestionDismiss,
  currentLevel,
  onLevelChange,
  accentColor = '#9B59B6',
  // Day 1 fix #8: { [suggestionId]: { routedTo, outcomeStatus, timestamp } }
  // map. When a suggestion appears in this map, the SuggestionItem renders
  // its resolution badge instead of the action buttons.
  suggestionResolutions = {},
  ...probe2bProps
}) {
  const { logEvent } = useEventLogger();

  // Routing handlers log the event and delegate to onSuggestionRoute. The
  // user-facing announce() is owned by the parent (Probe3Page) so it can
  // tailor the message to the actual outcome (e.g. "Edit by myself opened
  // for Scene 2.") and avoid double-readout from a generic local announce
  // followed by the parent's specific one.
  const handleRouteSelf = useCallback(
    (suggestion) => {
      logEvent(EventTypes.SUGGESTION_ROUTE_SELF, Actors.CREATOR, {
        suggestionId: suggestion.id,
        category: suggestion.category,
      });
      if (onSuggestionRoute) onSuggestionRoute(suggestion, 'self');
    },
    [logEvent, onSuggestionRoute]
  );

  const handleRouteAI = useCallback(
    (suggestion) => {
      logEvent(EventTypes.SUGGESTION_ROUTE_AI, Actors.CREATOR, {
        suggestionId: suggestion.id,
        category: suggestion.category,
      });
      if (onSuggestionRoute) onSuggestionRoute(suggestion, 'ai');
    },
    [logEvent, onSuggestionRoute]
  );

  const handleRouteHelper = useCallback(
    (suggestion) => {
      logEvent(EventTypes.SUGGESTION_ROUTE_HELPER, Actors.CREATOR, {
        suggestionId: suggestion.id,
        category: suggestion.category,
      });
      if (onSuggestionRoute) onSuggestionRoute(suggestion, 'helper');
    },
    [logEvent, onSuggestionRoute]
  );

  // Filter suggestions relevant to this scene
  const sceneSuggestions = suggestions.filter((s) => {
    const related = s.relatedScene;
    if (Array.isArray(related)) return related.includes(index);
    return related === index;
  });

  return (
    <>
      {/* Suggestions for this scene */}
      {sceneSuggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-purple-600">AI Suggestions</p>
          {sceneSuggestions.map((suggestion) => (
            <SuggestionItem
              key={suggestion.id}
              suggestion={suggestion}
              onRouteSelf={handleRouteSelf}
              onRouteAI={handleRouteAI}
              onRouteHelper={handleRouteHelper}
              helperName={helperName}
              resolution={suggestionResolutions[suggestion.id] || null}
            />
          ))}
        </div>
      )}

      {/* All Probe 2b actions */}
      <Probe2bSceneActions
        scene={scene}
        index={index}
        helperName={helperName}
        currentLevel={currentLevel}
        onLevelChange={onLevelChange}
        accentColor={accentColor}
        {...probe2bProps}
      />
    </>
  );
}
